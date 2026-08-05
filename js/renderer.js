// ---------------------------------------------------------------------------
// Builds THREE materials from the generated pixel textures, and turns chunks
// of voxel data into merged, face-culled BufferGeometry meshes.
// ---------------------------------------------------------------------------

class WorldRenderer {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.chunkMeshes = new Map(); // "cx,cz" -> {solid: THREE.Mesh, water: THREE.Mesh}
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

  buildAllChunks() {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
        this.rebuildChunk(cx, cz);
      }
    }
  }

  rebuildChunk(cx, cz) {
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

    const addFace = (mi, verts, normal, x, y, z) => {
      const g = getGroup(mi);
      const base = g.count;
      for (const v of verts) g.pos.push(v[0] + x, v[1] + y, v[2] + z);
      for (let i = 0; i < 4; i++) g.norm.push(normal[0], normal[1], normal[2]);
      g.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
        if (!world.inBounds(x, z)) continue;
        for (let y = MIN_HEIGHT; y < MAX_HEIGHT; y++) {
          const id = world.getBlock(x, y, z);
          if (id === BLOCK.AIR) continue;
          const isWater = id === BLOCK.WATER;
          const fm = this._faceMats(id);
          const neighbors = {
            px: world.getBlock(x + 1, y, z), nx: world.getBlock(x - 1, y, z),
            py: world.getBlock(x, y + 1, z), ny: world.getBlock(x, y - 1, z),
            pz: world.getBlock(x, y, z + 1), nz: world.getBlock(x, y, z - 1)
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
    const touched = new Set();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ncx = cx + dx, ncz = cz + dz;
        if (ncx < 0 || ncz < 0 || ncx >= CHUNKS_PER_SIDE || ncz >= CHUNKS_PER_SIDE) continue;
        touched.add(`${ncx},${ncz}`);
      }
    }
    for (const key of touched) {
      const [ccx, ccz] = key.split(',').map(Number);
      this.rebuildChunk(ccx, ccz);
    }
  }
}

window.WorldRenderer = WorldRenderer;
