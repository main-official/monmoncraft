// ---------------------------------------------------------------------------
// First-person controller: gravity + AABB collision (no flying), pointer-lock
// mouse look, and raycast-based block breaking / placing (creative mode:
// instant break, unlimited blocks from the hotbar).
// ---------------------------------------------------------------------------

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.6;
const GRAVITY = 26;
const JUMP_SPEED = 8.4;
const MOVE_SPEED = 5.2;
const REACH = 6;

class PlayerController {
  constructor(camera, world, renderer, domElement) {
    this.camera = camera;
    this.world = world;
    this.renderer = renderer;
    this.dom = domElement;

    // Spawn both players at a fixed shared origin — the world is generated
    // deterministically from the shared seed, so (0,0) means the same terrain
    // for both players regardless of how far anyone wanders afterward.
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;

    const startY = world.heightAt(this.position.x, this.position.z) + 10;
    this.position.y = startY;

    this.keys = {};
    this.hotbar = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.OAK_LOG, BLOCK.OAK_LEAVES, BLOCK.PLANKS, BLOCK.JUNGLE_LOG, BLOCK.JUNGLE_LEAVES];
    this.selected = 0;

    this._bindEvents();
    this.locked = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = REACH;

    this.onBlockChange = null; // callback(x,y,z,id)
  }

  _bindEvents() {
    document.addEventListener('keydown', (e) => { this.keys[e.code] = true; this._handleHotkey(e); });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    this.dom.addEventListener('click', () => {
      if (!this.locked) { this.dom.requestPointerLock(); return; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const sens = 0.0022;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this._breakBlock();
      if (e.button === 2) this._placeBlock();
    });
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('wheel', (e) => {
      const dir = Math.sign(e.deltaY);
      this.selected = (this.selected + dir + this.hotbar.length) % this.hotbar.length;
      this._updateHotbarUI();
    });
  }

  _handleHotkey(e) {
    const n = parseInt(e.code.replace('Digit', ''));
    if (!isNaN(n) && n >= 1 && n <= this.hotbar.length) {
      this.selected = n - 1;
      this._updateHotbarUI();
    }
  }

  _updateHotbarUI() {
    document.querySelectorAll('#hotbar .slot').forEach((el, i) => {
      el.classList.toggle('active', i === this.selected);
    });
  }

  _raycastTarget() {
    this.raycaster.set(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    const meshes = [...this.renderer.chunkMeshes.values()].map(c => c.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const n = hit.face.normal.clone();
    const p = hit.point.clone().addScaledVector(n, -0.5);
    const target = new THREE.Vector3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    const placePos = target.clone().add(n);
    return { target, placePos, normal: n };
  }

  _breakBlock() {
    const r = this._raycastTarget();
    if (!r) return;
    const { x, y, z } = r.target;
    if (this.world.getBlock(r.target.x, r.target.y, r.target.z) === BLOCK.AIR) return;
    this.world.setBlock(r.target.x, r.target.y, r.target.z, BLOCK.AIR);
    this.renderer.rebuildAround(r.target.x, r.target.z);
    if (this.onBlockChange) this.onBlockChange(r.target.x, r.target.y, r.target.z, BLOCK.AIR);
  }

  _placeBlock() {
    const r = this._raycastTarget();
    if (!r) return;
    const { x, y, z } = r.placePos;
    // don't place inside the player's own bounding box
    const box = this._playerBox(this.position);
    if (this._boxIntersectsBlock(box, x, y, z)) return;
    const id = this.hotbar[this.selected];
    this.world.setBlock(x, y, z, id);
    this.renderer.rebuildAround(x, z);
    if (this.onBlockChange) this.onBlockChange(x, y, z, id);
  }

  _playerBox(pos) {
    return {
      minX: pos.x - PLAYER_RADIUS, maxX: pos.x + PLAYER_RADIUS,
      minY: pos.y, maxY: pos.y + PLAYER_HEIGHT,
      minZ: pos.z - PLAYER_RADIUS, maxZ: pos.z + PLAYER_RADIUS
    };
  }

  _boxIntersectsBlock(box, bx, by, bz) {
    return box.minX < bx + 1 && box.maxX > bx &&
           box.minY < by + 1 && box.maxY > by &&
           box.minZ < bz + 1 && box.maxZ > bz;
  }

  _collides(pos) {
    const box = this._playerBox(pos);
    const minX = Math.floor(box.minX), maxX = Math.floor(box.maxX);
    const minY = Math.floor(box.minY), maxY = Math.floor(box.maxY);
    const minZ = Math.floor(box.minZ), maxZ = Math.floor(box.maxZ);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (this.world.isSolid(x, y, z)) return true;
    return false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    // movement input relative to yaw (horizontal only, no flying)
    let mx = 0, mz = 0;
    if (this.keys['KeyW']) mz -= 1;
    if (this.keys['KeyS']) mz += 1;
    if (this.keys['KeyA']) mx -= 1;
    if (this.keys['KeyD']) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    // Camera forward (yaw=0 looks toward -Z) is (-sin(yaw), 0, -cos(yaw)) and
    // right is (cos(yaw), 0, -sin(yaw)); combine those with input to get the
    // correct world-space move direction (previous cross-term signs were flipped).
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const worldX = mx * cosY + mz * sinY;
    const worldZ = mz * cosY - mx * sinY;

    this.velocity.x = worldX * MOVE_SPEED;
    this.velocity.z = worldZ * MOVE_SPEED;

    // gravity (always on — creative mode here still has no flight)
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -50) this.velocity.y = -50;

    if (this.keys['Space'] && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }

    // move + resolve collisions per axis
    const next = this.position.clone();
    next.x += this.velocity.x * dt;
    if (this._collides(next)) next.x = this.position.x;
    next.z += this.velocity.z * dt;
    if (this._collides(next)) next.z = this.position.z;

    next.y += this.velocity.y * dt;
    if (this._collides(next)) {
      if (this.velocity.y < 0) this.onGround = true;
      this.velocity.y = 0;
      next.y = this.position.y;
    } else {
      this.onGround = false;
    }
    this.position.copy(next);

    // camera
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}

window.PlayerController = PlayerController;
window.PLAYER_HEIGHT = PLAYER_HEIGHT;
