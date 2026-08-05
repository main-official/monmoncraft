// ---------------------------------------------------------------------------
// Voxel world: block ids, biome + heightmap terrain generation, tree placement,
// and per-chunk mesh construction with face culling (only exposed faces drawn)[cite: 11].
// ---------------------------------------------------------------------------

const BLOCK = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
  OAK_LOG: 6, OAK_LEAVES: 7, JUNGLE_LOG: 8, JUNGLE_LEAVES: 9, PLANKS: 10,
  JUNGLE_GRASS: 11
};

const BIOME = { OCEAN: 0, GRASSLAND: 1, FOREST: 2, JUNGLE: 3 };

const WORLD_SIZE = 128;      // blocks along X and Z[cite: 11]
const CHUNK = 16;            // chunk size in blocks[cite: 11]
const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK;
const SEA_LEVEL = 32;
const MAX_HEIGHT = 64;
const MIN_HEIGHT = 0;

class World {
  constructor(seed) {
    this.seed = seed;
    this.heightNoise = new SimplexNoise(seed);
    this.moistureNoise = new SimplexNoise(seed + 9999);
    this.detailNoise = new SimplexNoise(seed + 5555);
    this.treeNoise = new SimplexNoise(seed + 2222);

    this.height = new Int16Array(WORLD_SIZE * WORLD_SIZE);
    this.biome = new Uint8Array(WORLD_SIZE * WORLD_SIZE);
    // sparse overrides: "x,y,z" -> blockId (including 0 for removed/air)[cite: 11]
    this.overrides = new Map();
    // per-column tree top blocks precomputed at gen time, baked as overrides[cite: 11]
    this._generateHeightAndBiomes();
    this._generateTrees();
  }

  idx(x, z) { return x * WORLD_SIZE + z; }

  inBounds(x, z) { return x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE; }

  _generateHeightAndBiomes() {
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const nx = x / WORLD_SIZE - 0.5, nz = z / WORLD_SIZE - 0.5;
        // continent-scale shaping so the world has real ocean + inland areas[cite: 11]
        const continental = this.heightNoise.fbm(nx * 1.4, nz * 1.4, 3, 2, 0.5);
        const detail = this.detailNoise.fbm(x * 0.06, z * 0.06, 4, 2, 0.5);
        let h = SEA_LEVEL + 7 + continental * 20 + detail * 6;
        h = Math.round(Math.max(MIN_HEIGHT + 2, Math.min(MAX_HEIGHT - 2, h)));
        this.height[this.idx(x, z)] = h;

        const moisture = this.moistureNoise.fbm(x * 0.03, z * 0.03, 3, 2, 0.5);
        let b;
        if (h <= SEA_LEVEL) b = BIOME.OCEAN;
        else if (moisture > 0.28) b = BIOME.JUNGLE;
        else if (moisture > -0.05) b = BIOME.FOREST;
        else b = BIOME.GRASSLAND;
        this.biome[this.idx(x, z)] = b;
      }
    }
  }

  _generateTrees() {
    const rand = (x, z, salt) => {
      // deterministic pseudo-random per column so all clients agree[cite: 11]
      const v = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7 + this.seed) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let x = 2; x < WORLD_SIZE - 2; x++) {
      for (let z = 2; z < WORLD_SIZE - 2; z++) {
        const b = this.biome[this.idx(x, z)];
        if (b !== BIOME.FOREST && b !== BIOME.JUNGLE) continue;
        const density = b === BIOME.JUNGLE ? 0.055 : 0.02;
        if (rand(x, z, 1) > density) continue;
        const h = this.height[this.idx(x, z)];
        const isJungle = b === BIOME.JUNGLE;
        const trunkH = isJungle ? 6 + Math.floor(rand(x, z, 2) * 3) : 4 + Math.floor(rand(x, z, 2) * 2);
        const logId = isJungle ? BLOCK.JUNGLE_LOG : BLOCK.OAK_LOG;
        const leafId = isJungle ? BLOCK.JUNGLE_LEAVES : BLOCK.OAK_LEAVES;
        for (let i = 1; i <= trunkH; i++) this._setGenBlock(x, h + i, z, logId);
        const topY = h + trunkH;
        const radius = isJungle ? 2 : 2;
        for (let lx = -radius; lx <= radius; lx++) {
          for (let lz = -radius; lz <= radius; lz++) {
            for (let ly = -1; ly <= 2; ly++) {
              if (Math.abs(lx) === radius && Math.abs(lz) === radius && rand(x + lx, z + lz, 3) > 0.4) continue;
              const dist = Math.abs(lx) + Math.abs(lz) + Math.abs(ly);
              if (dist > 4) continue;
              this._setGenBlock(x + lx, topY + ly, z + lz, leafId, true);
            }
          }
        }
      }
    }
  }

  _setGenBlock(x, y, z, id, onlyIfAir = false) {
    if (!this.inBounds(x, z) || y < MIN_HEIGHT || y >= MAX_HEIGHT) return;
    const key = `${x},${y},${z}`;
    if (onlyIfAir && this.overrides.has(key)) return;
    this.overrides.set(key, id);
  }

  surfaceBlockFor(biome) {
    if (biome === BIOME.JUNGLE) return BLOCK.JUNGLE_GRASS;
    return BLOCK.GRASS;
  }

  getBlock(x, y, z) {
    // Return solid blocks for out-of-bounds to prevent walking/jumping off world edges or under the map
    if (!this.inBounds(x, z) || y < MIN_HEIGHT) return BLOCK.STONE;
    if (y >= MAX_HEIGHT) return BLOCK.AIR;

    const key = `${x},${y},${z}`;
    if (this.overrides.has(key)) return this.overrides.get(key);
    const h = this.height[this.idx(x, z)];
    if (y > h) {
      return (y <= SEA_LEVEL) ? BLOCK.WATER : BLOCK.AIR;
    }
    if (y === h) {
      const biome = this.biome[this.idx(x, z)];
      if (h <= SEA_LEVEL + 1) return BLOCK.SAND;
      return this.surfaceBlockFor(biome);
    }
    if (y >= h - 3) {
      if (h <= SEA_LEVEL + 1) return BLOCK.SAND;
      return BLOCK.DIRT;
    }
    return BLOCK.STONE;
  }

  setBlock(x, y, z, id) {
    if (y < MIN_HEIGHT || y >= MAX_HEIGHT || !this.inBounds(x, z)) return false;
    this.overrides.set(`${x},${y},${z}`, id);
    return true;
  }

  isSolid(x, y, z) {
    const b = this.getBlock(x, y, z);
    return b !== BLOCK.AIR && b !== BLOCK.WATER;
  }

  heightAt(x, z) {
    if (!this.inBounds(x, z)) return SEA_LEVEL;
    // account for player-placed towers: scan up from generated height a bit[cite: 11]
    let h = this.height[this.idx(Math.floor(x), Math.floor(z))];
    for (let y = MAX_HEIGHT - 1; y > h; y--) {
      if (this.isSolid(Math.floor(x), y, Math.floor(z))) { h = y; break; }
    }
    return h;
  }

  chunkCoord(x, z) { return [Math.floor(x / CHUNK), Math.floor(z / CHUNK)]; }
}

window.BLOCK = BLOCK;
window.BIOME = BIOME;
window.World = World;
window.WORLD_SIZE = WORLD_SIZE;
window.CHUNK = CHUNK;
window.CHUNKS_PER_SIDE = CHUNKS_PER_SIDE;
window.SEA_LEVEL = SEA_LEVEL;
window.MAX_HEIGHT = MAX_HEIGHT;
window.MIN_HEIGHT = MIN_HEIGHT;
