// ---------------------------------------------------------------------------
// Builds THREE materials from the generated pixel textures, and turns chunks
// of voxel data into merged, face-culled BufferGeometry meshes. Chunks are
// streamed in/out around the player so the world can feel unbounded without
// needing to build (or keep in memory/GPU) every chunk at once.
// ---------------------------------------------------------------------------

class WorldRenderer {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.chunkMeshes = new Map(); // "cx,cz" -> {mesh}
    this._buildMaterials();
  }

  _buildMaterials() {
    const T = TextureFactory;
    const tex = (canvas) => T.toTexture(canvas, THREE);
    const mat = (canvas, opts = {}) => new THREE.MeshLambertMaterial({ map: tex(canvas), ...opts });

    this.materials = {
      grassTop: mat(T.grassTop()),
      grassSide: mat(T.grassSide()),
      jungleGrassTop: mat(T.grassTop(-25)),
      jungleGrassSide: mat(T.grassSide(-25)),
      dirt: mat(T.dirt()),
      stone: mat(T.stone()),
      sand: mat(T.sand()),
      water: mat(T.water(), { transparent: true, opacity: 0.72, depthWrite: false }),
      oakLog: mat(T.log()),
      oakLogTop: mat(T.logTop()),
      oakLeaves: mat(T.leaves([58, 122, 46])),
      jungleLog: mat(T.log([69, 48, 30], [92, 68, 44])),
      jungleLogTop: mat(T.logTop([92, 68, 44])),
      jungleLeaves: mat(T.leaves([33, 110, 44])),
      planks: mat(T.planks())
    };

    // materials array (indexed) + name->index map, used for geometry groups
    this.matList = Object.values(this.materials);
    this.matIndex = {};
    Object.keys(this.materials).forEach((k, i) => { this.matIndex[k] = i; });
  }

  // returns {top, bottom, side} material index for a block id
  _faceMats(id) {
    const M = this.matIndex, B = BLOCK;
    switch (id) {
      case B.GRASS: return { top: M.grassTop, bottom: M.dirt, side: M.grassSide };
      case B.JUNGLE_GRASS: return { top: M.jungleGrassTop, bottom: M.dirt, side: M.jungleGrassSide };
      case B.DIRT: return { top: M.dirt, bottom: M.dirt, side: M.dirt };
      case B.STONE: return { top: M.stone, bottom: M.stone, side: M.stone };
      case B.SAND: return { top: M.sand, bottom: M.sand, side: M.sand };
      case B.WATER: return { top: M.water, bottom: M.water, side: M.water };
      case B.OAK_LOG: return { top: M.oakLogTop, bottom: M.oakLogTop, side: M.oakLog };
      case B.OAK_LEAVES: return { top: M.oakLeaves, bottom: M.oakLeaves, side: M.oakLeaves };
      case B.JUNGLE_LOG: return { top: M.jungleLogTop, bottom: M.jungleLogTop, side: M.jungleLog };
      case B.JUNGLE_LEAVES: return { top: M.jungleLeaves, bottom: M.jungleLeaves, side: M.jungleLeaves };
      case B.PLANKS: return { top: M.planks, bottom: M.planks, side: M.planks };
      default: return { top: M.stone, bottom: M.stone, side: M.stone };
    }
  }

  // --- Streaming: load/unload chunks around a world position -------------

  updateStreaming(px, pz, renderDistanceChunks) {
    const [pcx, pcz] = this.world.chunkCoord(px, pz);
    const wanted = new Set();
    for (let dx = -renderDistanceChunks; dx <= renderDistanceChunks; dx++) {
      for (let dz = -renderDistanceChunks; dz <= renderDistanceChunks; dz++) {
        if (dx * dx + dz * dz > renderDistanceChunks * renderDistanceChunks) continue; // circular, not square
        wanted.add(`${pcx + dx},${pcz + dz}`);
      }
    }
    // load anything wanted but not yet loaded
    for (const key of wanted) {
      if (this.chunkMeshes.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      this.loadChunk(cx, cz);
    }
    // unload anything loaded but no longer wanted (with a little hysteresis
    // margin so chunks right at the edge don't thrash in/out every frame)
    const margin = renderDistanceChunks + 2;
    for (const key of [...this.chunkMeshes.keys()]) {
      if (wanted.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      const dx = cx - pcx, dz = cz - pcz;
      if (dx * dx + dz * dz > margin * margin) this.unloadChunk(cx, cz);
    }
    return [pcx, pcz];
  }

  loadChunk(cx, cz) {
    this.world.ensureTreesNear(cx, cz);
    this._buildChunkMesh(cx, cz);
  }

  unloadChunk(cx, cz) {
    const key = `${cx},${cz}`;
    const existing = this.chunkMeshes.get(key);
    if (!existing) return;
    this.scene.remove(existing.mesh);
    existing.mesh.geometry.dispose();
    this.chunkMeshes.delete(key);
    // Note: world.overrides is NOT touched here — block edits persist in
    // memory (and in Firebase) regardless of whether the chunk is currently
    // rendered, so unloaded chunks come back exactly as they were left.
  }

  // Rebuilds an already-loaded chunk's mesh (used after a block edit).
  // Chunks that aren't currently streamed in are intentionally skipped —
  // their override is already saved and will apply next time they load.
  rebuildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (!this.chunkMeshes.has(key)) return;
    this._buildChunkMesh(cx, cz);
  }

  _buildChunkMesh(cx, cz) {
    const key = `${cx},${cz}`;
    const old = this.chunkMeshes.get(key);
    if (old) { this.scene.remove(old.mesh); old.mesh.geometry.dispose(); }

    const groups = new Map(); // matIndex -> {pos:[], norm:[], uv:[], idx:[]}
    const getGroup = (mi) => {
      if (!groups.has(mi)) groups.set(mi, { pos: [], norm: [], uv: [], idx: [], count: 0 });
      return groups.get(mi);
    };

    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const world = this.world;

    // --- Fetch every block this chunk could need exactly once -------------
    // A chunk build needs the chunk's own CHUNK x CHUNK x (MAX_HEIGHT-MIN_
    // HEIGHT) blocks, plus a 1-block margin on every side for face-culling
    // neighbor checks. Instead of calling world.getBlock() (a string-keyed
    // Map lookup) up to 7x per voxel during the main loop below, we pull
    // everything into a flat local Uint8Array once here, then do all the
    // neighbor lookups against that array. That turns a chunk build from
    // up to ~70k+ Map lookups into a fixed ~20.7k array reads/writes, which
    // keeps even several chunks built in one frame cheap and stutter-free.
    const SX = CHUNK + 2, SY = (MAX_HEIGHT - MIN_HEIGHT) + 2, SZ = CHUNK + 2;
    const strideX = SY * SZ, strideY = SZ;
    const blocks = new Uint8Array(SX * SY * SZ);
    for (let lx = 0; lx < SX; lx++) {
      const x = x0 - 1 + lx;
      const xBase = lx * strideX;
      for (let lz = 0; lz < SZ; lz++) {
        const z = z0 - 1 + lz;
        const base = xBase + lz;
        for (let ly = 0; ly < SY; ly++) {
          const y = MIN_HEIGHT - 1 + ly;
          blocks[base + ly * strideY] = world.getBlock(x, y, z);
        }
      }
    }
    // local-array id lookup: lx/ly/lz are already offset by the +1 margin
    const localId = (lx, ly, lz) => blocks[lx * strideX + lz + ly * strideY];

    const addFace = (mi, verts, normal, x, y, z) => {
      const g = getGroup(mi);
      const base = g.count;
      for (const v of verts) g.pos.push(v[0] + x, v[1] + y, v[2] + z);
      for (let i = 0; i < 4; i++) g.norm.push(normal[0], normal[1], normal[2]);
      g.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      // Reversed winding (0,2,1 / 0,3,2) so each quad is CCW as seen from
      // outside along its normal — matches THREE's default front-face (CCW)
      // so outward faces render instead of being backface-culled.
      g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      g.count += 4;
    };

    const FACES = {
      px: { n: [1, 0, 0], v: [[1,0,0],[1,0,1],[1,1,1],[1,1,0]] },
      nx: { n: [-1, 0, 0], v: [[0,0,1],[0,0,0],[0,1,0],[0,1,1]] },
      py: { n: [0, 1, 0], v: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]] },
      ny: { n: [0, -1, 0], v: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]] },
      pz: { n: [0, 0, 1], v: [[1,0,1],[0,0,1],[0,1,1],[1,1,1]] },
      nz: { n: [0, 0, -1], v: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]] }
    };

    for (let lx = 0; lx < CHUNK; lx++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        const x = x0 + lx, z = z0 + lz;
        // +1 to account for the margin column added to the local array
        const alx = lx + 1, alz = lz + 1;
        for (let y = MIN_HEIGHT; y < MAX_HEIGHT; y++) {
          const aly = y - MIN_HEIGHT + 1;
          const id = localId(alx, aly, alz);
          if (id === BLOCK.AIR) continue;
          const isWater = id === BLOCK.WATER;
          const fm = this._faceMats(id);
          const neighbors = {
            px: localId(alx + 1, aly, alz), nx: localId(alx - 1, aly, alz),
            py: localId(alx, aly + 1, alz), ny: localId(alx, aly - 1, alz),
            pz: localId(alx, aly, alz + 1), nz: localId(alx, aly, alz - 1)
          };
          for (const dir of Object.keys(FACES)) {
            const nb = neighbors[dir];
            const nbSolidOrSameWater = isWater ? (nb !== BLOCK.AIR) : (nb !== BLOCK.AIR && nb !== BLOCK.WATER);
            if (nbSolidOrSameWater) continue; // face hidden
            const mi = dir === 'py' ? fm.top : (dir === 'ny' ? fm.bottom : fm.side);
            addFace(mi, FACES[dir].v, FACES[dir].n, x, y, z);
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    const allPos = [], allNorm = [], allUv = [], allIdx = [];
    let vertOffset = 0;
    const matArray = [];
    let g = 0;
    let indexStart = 0;
    for (const [mi, group] of groups.entries()) {
      if (group.count === 0) continue;
      allPos.push(...group.pos);
      allNorm.push(...group.norm);
      allUv.push(...group.uv);
      for (const ix of group.idx) allIdx.push(ix + vertOffset);
      geo.addGroup(indexStart, group.idx.length, g);
      matArray.push(this.matList[mi]);
      indexStart += group.idx.length;
      vertOffset += group.count; // total vertices added by this group
      g++;
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(allNorm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(allUv, 2));
    geo.setIndex(allIdx);

    const mesh = new THREE.Mesh(geo, matArray);
    mesh.name = `chunk_${key}`;
    this.scene.add(mesh);
    this.chunkMeshes.set(key, { mesh });
  }

  rebuildAround(x, z) {
    const [cx, cz] = this.world.chunkCoord(x, z);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.rebuildChunk(cx + dx, cz + dz);
      }
    }
  }
}

window.WorldRenderer = WorldRenderer;
