// ---------------------------------------------------------------------------
// Voxel world: block ids, biome + on-demand terrain generation (no fixed
// world-size bound — height/biome are computed per-column the first time
// they're needed and cached), lazy tree placement, and block overrides.
// ---------------------------------------------------------------------------

const BLOCK = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
  OAK_LOG: 6, OAK_LEAVES: 7, JUNGLE_LOG: 8, JUNGLE_LEAVES: 9, PLANKS: 10,
  JUNGLE_GRASS: 11
};

const BIOME = { OCEAN: 0, GRASSLAND: 1, FOREST: 2, JUNGLE: 3 };

const CHUNK = 16;            // chunk size in blocks
const SEA_LEVEL = 32;
const MAX_HEIGHT = 64;
const MIN_HEIGHT = 0;
// Scale (in blocks) of the continent-level noise. Terrain has no hard edge —
// biomes/height just keep being generated for however far a player wanders.
const TERRAIN_SCALE = 220;

class World {
  constructor(seed) {
    this.seed = seed;
    this.heightNoise = new SimplexNoise(seed);
    this.moistureNoise = new SimplexNoise(seed + 9999);
    this.detailNoise = new SimplexNoise(seed + 5555);

    // sparse overrides: "x,y,z" -> blockId (including 0 for removed/air)
    this.overrides = new Map();
    // per-column {h, b} cache, computed lazily and kept for reuse
    this._columnCache = new Map();
    // tracks which columns have already had their tree/no-tree decision made,
    // so a column near a chunk boundary isn't re-rolled by two neighboring
    // chunks (would be harmless since it's deterministic, but wasteful)
    this._treeColumnsDone = new Set();
  }

  // deterministic pseudo-random per integer column/salt, same on every client
  _rand(x, z, salt) {
    const v = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7 + this.seed) * 43758.5453;
    return v - Math.floor(v);
  }

  columnInfo(x, z) {
    const key = `${x},${z}`;
    let info = this._columnCache.get(key);
    if (info) return info;

    const nx = x / TERRAIN_SCALE, nz = z / TERRAIN_SCALE;
    const continental = this.heightNoise.fbm(nx * 1.4, nz * 1.4, 3, 2, 0.5);
    const detail = this.detailNoise.fbm(x * 0.06, z * 0.06, 4, 2, 0.5);
    let h = SEA_LEVEL + 7 + continental * 20 + detail * 6;
    h = Math.round(Math.max(MIN_HEIGHT + 2, Math.min(MAX_HEIGHT - 2, h)));

    const moisture = this.moistureNoise.fbm(x * 0.03, z * 0.03, 3, 2, 0.5);
    let b;
    if (h <= SEA_LEVEL) b = BIOME.OCEAN;
    else if (moisture > 0.28) b = BIOME.JUNGLE;
    else if (moisture > -0.05) b = BIOME.FOREST;
    else b = BIOME.GRASSLAND;

    info = { h, b };
    this._columnCache.set(key, info);
    return info;
  }

  // Generates trees for the given chunk plus a margin (tree canopies can
  // reach 2 blocks into a neighboring chunk). Safe to call multiple times —
  // each column's tree decision is only ever made once, deterministically,
  // so it doesn't matter which neighboring chunk triggers it first.
  ensureTreesNear(cx, cz) {
    const margin = 2;
    const x0 = cx * CHUNK - margin, x1 = cx * CHUNK + CHUNK + margin;
    const z0 = cz * CHUNK - margin, z1 = cz * CHUNK + CHUNK + margin;
    for (let x = x0; x < x1; x++) {
      for (let z = z0; z < z1; z++) {
        const colKey = `${x},${z}`;
        if (this._treeColumnsDone.has(colKey)) continue;
        this._treeColumnsDone.add(colKey);
        this._maybePlaceTree(x, z);
      }
    }
  }

  _maybePlaceTree(x, z) {
    const { h, b } = this.columnInfo(x, z);
    if (b !== BIOME.FOREST && b !== BIOME.JUNGLE) return;
    const density = b === BIOME.JUNGLE ? 0.055 : 0.02;
    if (this._rand(x, z, 1) > density) return;
    const isJungle = b === BIOME.JUNGLE;
    const trunkH = isJungle ? 6 + Math.floor(this._rand(x, z, 2) * 3) : 4 + Math.floor(this._rand(x, z, 2) * 2);
    const logId = isJungle ? BLOCK.JUNGLE_LOG : BLOCK.OAK_LOG;
    const leafId = isJungle ? BLOCK.JUNGLE_LEAVES : BLOCK.OAK_LEAVES;
    for (let i = 1; i <= trunkH; i++) this._setGenBlock(x, h + i, z, logId);
    const topY = h + trunkH;
    const radius = 2;
    for (let lx = -radius; lx <= radius; lx++) {
      for (let lz = -radius; lz <= radius; lz++) {
        for (let ly = -1; ly <= 2; ly++) {
          if (Math.abs(lx) === radius && Math.abs(lz) === radius && this._rand(x + lx, z + lz, 3) > 0.4) continue;
          const dist = Math.abs(lx) + Math.abs(lz) + Math.abs(ly);
          if (dist > 4) continue;
          this._setGenBlock(x + lx, topY + ly, z + lz, leafId, true);
        }
      }
    }
  }

  _setGenBlock(x, y, z, id, onlyIfAir = false) {
    if (y < MIN_HEIGHT || y >= MAX_HEIGHT) return;
    const key = `${x},${y},${z}`;
    if (onlyIfAir && this.overrides.has(key)) return;
    this.overrides.set(key, id);
  }

  surfaceBlockFor(biome) {
    if (biome === BIOME.JUNGLE) return BLOCK.JUNGLE_GRASS;
    return BLOCK.GRASS;
  }

  getBlock(x, y, z) {
    // A floor at the very bottom and a build-height cap at the top, like
    // Minecraft's bedrock/sky-limit — but no bound on x/z, ever.
    if (y < MIN_HEIGHT) return BLOCK.STONE;
    if (y >= MAX_HEIGHT) return BLOCK.AIR;

    const key = `${x},${y},${z}`;
    if (this.overrides.has(key)) return this.overrides.get(key);
    const { h, b: biome } = this.columnInfo(x, z);
    if (y > h) {
      return (y <= SEA_LEVEL) ? BLOCK.WATER : BLOCK.AIR;
    }
    if (y === h) {
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
    if (y < MIN_HEIGHT || y >= MAX_HEIGHT) return false;
    this.overrides.set(`${x},${y},${z}`, id);
    return true;
  }

  isSolid(x, y, z) {
    const b = this.getBlock(x, y, z);
    return b !== BLOCK.AIR && b !== BLOCK.WATER;
  }

  heightAt(x, z) {
    // account for player-placed towers: scan up from generated height a bit
    const fx = Math.floor(x), fz = Math.floor(z);
    let h = this.columnInfo(fx, fz).h;
    for (let y = MAX_HEIGHT - 1; y > h; y--) {
      if (this.isSolid(fx, y, fz)) { h = y; break; }
    }
    return h;
  }

  chunkCoord(x, z) { return [Math.floor(x / CHUNK), Math.floor(z / CHUNK)]; }
}

window.BLOCK = BLOCK;
window.BIOME = BIOME;
window.World = World;
window.CHUNK = CHUNK;
window.SEA_LEVEL = SEA_LEVEL;
window.MAX_HEIGHT = MAX_HEIGHT;
window.MIN_HEIGHT = MIN_HEIGHT;
