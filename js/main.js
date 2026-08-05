// ---------------------------------------------------------------------------
// Bootstraps the Three.js scene, wires up the login screen, hotbar, remote
// player avatars, and drives the render/update loop.
// ---------------------------------------------------------------------------

(function () {
  let scene, camera, renderer3d, clock;
  let world, worldRenderer, controller;
  let multiplayer;
  let remoteAvatars = new Map(); // username -> {group, target:{x,y,z,yaw}}

  function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fc6ff);
    scene.fog = new THREE.Fog(0x8fc6ff, 60, 140);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);

    renderer3d = new THREE.WebGLRenderer({ antialias: true });
    renderer3d.setSize(window.innerWidth, window.innerHeight);
    renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('game-container').appendChild(renderer3d.domElement);

    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(60, 100, 40);
    scene.add(sun);
    const ambient = new THREE.AmbientLight(0xbfd9ff, 0.55);
    scene.add(ambient);

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer3d.setSize(window.innerWidth, window.innerHeight);
    });

    clock = new THREE.Clock();
  }

  function buildHotbarUI(controller) {
    const bar = document.getElementById('hotbar');
    bar.innerHTML = '';
    const names = {
      [BLOCK.GRASS]: 'Grass', [BLOCK.DIRT]: 'Dirt', [BLOCK.STONE]: 'Stone',
      [BLOCK.SAND]: 'Sand', [BLOCK.OAK_LOG]: 'Oak Log', [BLOCK.OAK_LEAVES]: 'Oak Leaves',
      [BLOCK.PLANKS]: 'Planks', [BLOCK.JUNGLE_LOG]: 'Jungle Log', [BLOCK.JUNGLE_LEAVES]: 'Jungle Leaves'
    };
    const swatchCanvas = (id) => {
      const T = TextureFactory;
      let c;
      switch (id) {
        case BLOCK.GRASS: c = T.grassTop(); break;
        case BLOCK.DIRT: c = T.dirt(); break;
        case BLOCK.STONE: c = T.stone(); break;
        case BLOCK.SAND: c = T.sand(); break;
        case BLOCK.OAK_LOG: c = T.logTop(); break;
        case BLOCK.OAK_LEAVES: c = T.leaves([58, 122, 46]); break;
        case BLOCK.PLANKS: c = T.planks(); break;
        case BLOCK.JUNGLE_LOG: c = T.logTop([92, 68, 44]); break;
        case BLOCK.JUNGLE_LEAVES: c = T.leaves([33, 110, 44]); break;
        default: c = T.stone();
      }
      return c;
    };
    controller.hotbar.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === controller.selected ? ' active' : '');
      const img = swatchCanvas(id);
      img.style.width = '100%'; img.style.height = '100%';
      img.style.imageRendering = 'pixelated';
      slot.appendChild(img);
      const label = document.createElement('span');
      label.className = 'key-label';
      label.textContent = i + 1;
      slot.appendChild(label);
      slot.title = names[id] || '';
      slot.addEventListener('click', () => { controller.selected = i; controller._updateHotbarUI(); });
      bar.appendChild(slot);
    });
  }

  function makeAvatar(username) {
    const color = USERNAME_COLORS[username] || 0xffffff;
    const group = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    head.position.y = 1.55;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), skin);
    body.position.y = 1.05;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), new THREE.MeshLambertMaterial({ color: 0x2b2b6b }));
    legL.position.set(-0.14, 0.375, 0);
    const legR = legL.clone(); legR.position.x = 0.14;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), skin);
    armL.position.set(-0.34, 1.05, 0);
    const armR = armL.clone(); armR.position.x = 0.34;
    group.add(head, body, legL, legR, armL, armR);

    const label = document.createElement('div');
    label.className = 'nametag';
    label.textContent = username;

    scene.add(group);
    return { group, labelEl: label };
  }

  function updateRemoteAvatars(dt) {
    for (const [username, av] of remoteAvatars.entries()) {
      if (!av.target) continue;
      av.group.position.lerp(new THREE.Vector3(av.target.x, av.target.y, av.target.z), Math.min(1, dt * 12));
      av.group.rotation.y = av.target.yaw || 0;
    }
  }

  function updateNametags() {
    const container = document.getElementById('nametags');
    for (const av of remoteAvatars.values()) {
      const pos = av.group.position.clone();
      pos.y += 2.0;
      pos.project(camera);
      const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
      const behind = pos.z > 1;
      av.labelEl.style.display = behind ? 'none' : 'block';
      av.labelEl.style.transform = `translate(${x}px, ${y}px)`;
      if (!av.labelEl.parentElement) container.appendChild(av.labelEl);
    }
  }

  function startGame(username) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('crosshair').classList.remove('hidden');

    init3D();

    const seedPromise = multiplayer.ready ? multiplayer.getOrCreateSeed() : Promise.resolve(Math.floor(Math.random() * 1e9));
    seedPromise.then((seed) => {
      world = new World(seed);
      worldRenderer = new WorldRenderer(scene, world);
      worldRenderer.buildAllChunks();

      controller = new PlayerController(camera, world, worldRenderer, renderer3d.domElement);
      controller.onBlockChange = (x, y, z, id) => multiplayer.sendBlockChange(x, y, z, id);
      buildHotbarUI(controller);

      multiplayer.color = USERNAME_COLORS[username];
      multiplayer.onRemoteBlock = (x, y, z, id) => {
        world.setBlock(x, y, z, id == null ? BLOCK.AIR : id);
        worldRenderer.rebuildAround(x, z);
      };
      multiplayer.onRemotePlayer = (uname, data) => {
        if (!remoteAvatars.has(uname)) remoteAvatars.set(uname, makeAvatar(uname));
        remoteAvatars.get(uname).target = data;
      };
      multiplayer.onRemotePlayerLeft = (uname) => {
        const av = remoteAvatars.get(uname);
        if (av) { scene.remove(av.group); av.labelEl.remove(); remoteAvatars.delete(uname); }
      };

      document.getElementById('loading-screen').classList.add('hidden');
      animate();
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    controller.update(dt);
    updateRemoteAvatars(dt);
    updateNametags();
    multiplayer.sendPosition(controller.position.x, controller.position.y, controller.position.z, controller.yaw);
    renderer3d.render(scene, camera);
  }

  function showLoginError(msg) {
    const el = document.getElementById('login-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function wireLogin() {
    multiplayer = new Multiplayer();
    const configured = multiplayer.init();
    if (!configured) {
      showLoginError('Multiplayer backend not configured yet — see README.md to add your Firebase config. You can still play solo for testing.');
    }

    const form = document.getElementById('login-form');
    const input = document.getElementById('username-input');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = input.value.trim();
      if (!username) return;
      const btn = form.querySelector('button');
      btn.disabled = true;
      document.getElementById('login-error').classList.add('hidden');

      if (!multiplayer.ready) {
        // solo/test fallback so the game is still playable before Firebase is wired up
        if (!ALLOWED_USERNAMES.includes(username)) {
          showLoginError('That username is not recognized.');
          btn.disabled = false;
          return;
        }
        document.getElementById('loading-screen').classList.remove('hidden');
        startGame(username);
        return;
      }

      const result = await multiplayer.claimUsername(username, ALLOWED_USERNAMES);
      if (!result.ok) {
        showLoginError(result.reason);
        btn.disabled = false;
        return;
      }
      document.getElementById('loading-screen').classList.remove('hidden');
      startGame(username);
    });

    window.addEventListener('beforeunload', () => { if (multiplayer) multiplayer.leave(); });
  }

  document.addEventListener('DOMContentLoaded', wireLogin);
})();
