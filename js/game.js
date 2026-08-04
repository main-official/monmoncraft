let gameInstance;

class MinecraftGame {
    constructor() {
        // Validate user
        const username = Auth.getCurrentUser();
        if (!username) {
            window.location.href = 'index.html';
            return;
        }
        
        this.username = username;
        this.terrain = new TerrainGenerator(42); // Fixed seed for consistent terrain
        this.chunkMeshes = new Map();
        this.selectedChunks = new Set();
        this.loadedChunks = new Set();
        this.blockCache = new Map(); // Cache for block modifications
        
        // Three.js setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        this.scene.fog = new THREE.Fog(0x87ceeb, 300, 500);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('gameContainer').appendChild(this.renderer.domElement);
        
        // Lighting
        this.setupLighting();
        
        // Create player
        this.player = new Player(username, this.scene);
        
        // Multiplayer
        this.multiplayer = new MultiplayerManager(this.player);
        this.setupMultiplayerListeners();
        
        // Create crosshair
        this.createCrosshair();
        
        // Update HUD
        this.updateHUD();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Handle chat
        this.setupChat();
        
        // Handle block placement/breaking
        this.setupBlockInteraction();
        
        // Load initial chunks
        this.loadChunksAroundPlayer();
        
        // Main loop
        this.lastTime = performance.now();
        this.chunkLoadInterval = setInterval(() => this.loadChunksAroundPlayer(), 1000);
        this.animate();
    }
    
    setupLighting() {
        // Ambient light for overall brightness
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        
        // Directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(200, 200, 200);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 4096;
        sunLight.shadow.mapSize.height = 4096;
        sunLight.shadow.camera.far = 1000;
        sunLight.shadow.camera.left = -500;
        sunLight.shadow.camera.right = 500;
        sunLight.shadow.camera.top = 500;
        sunLight.shadow.camera.bottom = -500;
        sunLight.shadow.bias = -0.0001;
        this.scene.add(sunLight);
        this.sunLight = sunLight;
    }
    
    createCrosshair() {
        const crosshair = document.createElement('div');
        crosshair.className = 'crosshair';
        crosshair.style.position = 'fixed';
        crosshair.style.top = '50%';
        crosshair.style.left = '50%';
        crosshair.style.transform = 'translate(-50%, -50%)';
        crosshair.style.width = '20px';
        crosshair.style.height = '20px';
        crosshair.style.border = '2px solid rgba(255, 255, 255, 0.8)';
        crosshair.style.borderRadius = '50%';
        crosshair.style.pointerEvents = 'none';
        crosshair.style.zIndex = '1000';
        document.body.appendChild(crosshair);
    }
    
    setupChat() {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const message = chatInput.value;
                    if (message.trim()) {
                        this.sendChatMessage(message);
                        chatInput.value = '';
                        chatInput.blur();
                    }
                } else if (e.key === 'Escape') {
                    chatInput.blur();
                }
            });
        }
    }
    
    sendChatMessage(message) {
        const messagesDiv = document.getElementById('messages');
        const msgElement = document.createElement('div');
        msgElement.className = 'chat-message chat-message-local';
        msgElement.textContent = `${this.username}: ${message}`;
        if (messagesDiv) {
            messagesDiv.appendChild(msgElement);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        // Send to multiplayer
        if (this.multiplayer) {
            this.multiplayer.sendChatMessage(this.username, message);
        }
    }
    
    receiveChatMessage(username, message) {
        const messagesDiv = document.getElementById('messages');
        if (messagesDiv) {
            const msgElement = document.createElement('div');
            msgElement.className = 'chat-message chat-message-remote';
            msgElement.textContent = `${username}: ${message}`;
            messagesDiv.appendChild(msgElement);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }
    
    setupMultiplayerListeners() {
        if (this.multiplayer) {
            this.multiplayer.on('playerMoved', (data) => {
                // Handle other player position updates
            });
            
            this.multiplayer.on('chatMessage', (data) => {
                if (data.username !== this.username) {
                    this.receiveChatMessage(data.username, data.message);
                }
            });
            
            this.multiplayer.on('blockPlaced', (data) => {
                if (data.username !== this.username) {
                    this.applyBlockChange(data.x, data.y, data.z, data.blockId);
                }
            });
        }
    }
    
    setupBlockInteraction() {
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click - break block
                this.breakBlock();
            } else if (e.button === 2) { // Right click - place block
                this.placeBlock();
            }
        });
        
        // Prevent context menu on right click
        document.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Handle scroll wheel for block selection
        document.addEventListener('wheel', (e) => {
            if (!document.activeElement.matches('input, textarea')) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    this.player.selectPreviousBlock();
                } else {
                    this.player.selectNextBlock();
                }
                this.updateHotbarDisplay();
            }
        });
    }
    
    placeBlock() {
        const raycaster = new THREE.Raycaster();
        const camera = this.player.camera;
        
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        if (intersects.length > 0) {
            const intersection = intersects[0];
            const point = intersection.point;
            const normal = intersection.face.normal;
            
            // Calculate where to place the block
            const placeX = Math.floor(point.x + normal.x * 0.5);
            const placeY = Math.floor(point.y + normal.y * 0.5);
            const placeZ = Math.floor(point.z + normal.z * 0.5);
            
            // Don't place block where player is
            const playerPos = this.player.getPosition();
            if (Math.abs(placeX - playerPos.x) < 1 && Math.abs(placeZ - playerPos.z) < 1) {
                return;
            }
            
            // Get selected block from hotbar
            const selectedBlock = this.player.getSelectedBlock();
            if (selectedBlock && selectedBlock.id !== BLOCKS.AIR.id) {
                this.updateBlockInWorld(placeX, placeY, placeZ, selectedBlock.id, true);
            }
        }
    }
    
    breakBlock() {
        const raycaster = new THREE.Raycaster();
        const camera = this.player.camera;
        
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        if (intersects.length > 0) {
            const intersection = intersects[0];
            const point = intersection.point;
            
            const breakX = Math.floor(point.x);
            const breakY = Math.floor(point.y);
            const breakZ = Math.floor(point.z);
            
            this.updateBlockInWorld(breakX, breakY, breakZ, BLOCKS.AIR.id, true);
        }
    }
    
    updateBlockInWorld(x, y, z, blockId, isPlayerAction = false) {
        // Clamp Y to valid range
        if (y < 0 || y >= CONFIG.TERRAIN_HEIGHT) return;
        
        const cacheKey = `${x},${y},${z}`;
        this.blockCache.set(cacheKey, blockId);
        
        // Calculate which chunk this block belongs to
        const chunkX = Math.floor(x / CONFIG.CHUNK_SIZE);
        const chunkZ = Math.floor(z / CONFIG.CHUNK_SIZE);
        
        // Update affected chunks
        const affectedChunks = new Set([
            `${chunkX},${chunkZ}`,
            `${chunkX - 1},${chunkZ}`,
            `${chunkX + 1},${chunkZ}`,
            `${chunkX},${chunkZ - 1}`,
            `${chunkX},${chunkZ + 1}`
        ]);
        
        for (const key of affectedChunks) {
            const [cx, cz] = key.split(',').map(Number);
            if (this.loadedChunks.has(key)) {
                this.updateChunkMesh(cx, cz);
            }
        }
        
        // Broadcast to multiplayer
        if (isPlayerAction && this.multiplayer) {
            this.multiplayer.sendBlockUpdate(x, y, z, blockId);
        }
    }
    
    applyBlockChange(x, y, z, blockId) {
        const cacheKey = `${x},${y},${z}`;
        this.blockCache.set(cacheKey, blockId);
        
        const chunkX = Math.floor(x / CONFIG.CHUNK_SIZE);
        const chunkZ = Math.floor(z / CONFIG.CHUNK_SIZE);
        
        const affectedChunks = new Set([
            `${chunkX},${chunkZ}`,
            `${chunkX - 1},${chunkZ}`,
            `${chunkX + 1},${chunkZ}`,
            `${chunkX},${chunkZ - 1}`,
            `${chunkX},${chunkZ + 1}`
        ]);
        
        for (const key of affectedChunks) {
            const [cx, cz] = key.split(',').map(Number);
            if (this.loadedChunks.has(key)) {
                this.updateChunkMesh(cx, cz);
            }
        }
    }
    
    loadChunksAroundPlayer() {
        const playerPos = this.player.getPosition();
        const playerChunkX = Math.floor(playerPos.x / CONFIG.CHUNK_SIZE);
        const playerChunkZ = Math.floor(playerPos.z / CONFIG.CHUNK_SIZE);
        
        const renderDistance = CONFIG.RENDER_DISTANCE || 3;
        
        // Load chunks around player
        for (let dx = -renderDistance; dx <= renderDistance; dx++) {
            for (let dz = -renderDistance; dz <= renderDistance; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                
                if (!this.loadedChunks.has(key)) {
                    this.loadedChunks.add(key);
                    this.updateChunkMesh(chunkX, chunkZ);
                }
            }
        }
        
        // Unload distant chunks
        for (const key of this.loadedChunks) {
            const [chunkX, chunkZ] = key.split(',').map(Number);
            const dist = Math.max(
                Math.abs(chunkX - playerChunkX),
                Math.abs(chunkZ - playerChunkZ)
            );
            
            if (dist > renderDistance + 1) {
                this.unloadChunk(chunkX, chunkZ);
            }
        }
    }
    
    unloadChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.chunkMeshes.has(key)) {
            const mesh = this.chunkMeshes.get(key);
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            this.chunkMeshes.delete(key);
        }
        this.loadedChunks.delete(key);
    }
    
    updateChunkMesh(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        
        // Remove old mesh
        if (this.chunkMeshes.has(key)) {
            const oldMesh = this.chunkMeshes.get(key);
            this.scene.remove(oldMesh);
            oldMesh.geometry.dispose();
            oldMesh.material.dispose();
        }
        
        // Generate chunk data
        const chunk = this.terrain.generateChunk(chunkX, chunkZ);
        
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];
        const indices = [];
        let vertexIndex = 0;
        
        const chunkWorldX = chunkX * CONFIG.CHUNK_SIZE;
        const chunkWorldZ = chunkZ * CONFIG.CHUNK_SIZE;
        
        // Helper function to get block at position, considering cache
        const getBlock = (x, y, z) => {
            const cacheKey = `${x},${y},${z}`;
            if (this.blockCache.has(cacheKey)) {
                return BlockUtils.getBlock(this.blockCache.get(cacheKey));
            }
            
            if (y < 0 || y >= CONFIG.TERRAIN_HEIGHT) {
                return BLOCKS.AIR;
            }
            
            const localX = x - chunkWorldX;
            const localZ = z - chunkWorldZ;
            
            if (localX < 0 || localX >= CONFIG.CHUNK_SIZE || localZ < 0 || localZ >= CONFIG.CHUNK_SIZE) {
                // Block is in a neighboring chunk
                const neighborChunkX = Math.floor(x / CONFIG.CHUNK_SIZE);
                const neighborChunkZ = Math.floor(z / CONFIG.CHUNK_SIZE);
                const neighborChunk = this.terrain.generateChunk(neighborChunkX, neighborChunkZ);
                const nLocalX = x - neighborChunkX * CONFIG.CHUNK_SIZE;
                const nLocalZ = z - neighborChunkZ * CONFIG.CHUNK_SIZE;
                const blockId = neighborChunk[nLocalX + nLocalZ * CONFIG.CHUNK_SIZE + y * CONFIG.CHUNK_SIZE * CONFIG.CHUNK_SIZE];
                return BlockUtils.getBlock(blockId);
            }
            
            const blockId = chunk[localX + localZ * CONFIG.CHUNK_SIZE + y * CONFIG.CHUNK_SIZE * CONFIG.CHUNK_SIZE];
            return BlockUtils.getBlock(blockId);
        };
        
        // Build mesh for each block in chunk
        for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
            for (let z = 0; z < CONFIG.CHUNK_SIZE; z++) {
                for (let y = 0; y < CONFIG.TERRAIN_HEIGHT; y++) {
                    const worldX = chunkWorldX + x;
                    const worldY = y;
                    const worldZ = chunkWorldZ + z;
                    
                    const block = getBlock(worldX, worldY, worldZ);
                    
                    if (block.id === BLOCKS.AIR.id) continue;
                    
                    // Check each face of the block
                    const faces = [
                        { dir: [1, 0, 0], corners: [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]], normal: [1,0,0] }, // Right
                        { dir: [-1, 0, 0], corners: [[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]], normal: [-1,0,0] }, // Left
                        { dir: [0, 1, 0], corners: [[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]], normal: [0,1,0] }, // Top
                        { dir: [0, -1, 0], corners: [[-1,-1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1]], normal: [0,-1,0] }, // Bottom
                        { dir: [0, 0, 1], corners: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]], normal: [0,0,1] }, // Front
                        { dir: [0, 0, -1], corners: [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]], normal: [0,0,-1] } // Back
                    ];
                    
                    for (const face of faces) {
                        const neighborX = worldX + face.dir[0];
                        const neighborY = worldY + face.dir[1];
                        const neighborZ = worldZ + face.dir[2];
                        
                        const neighbor = getBlock(neighborX, neighborY, neighborZ);
                        
                        // Only render face if neighbor is air or transparent
                        if (neighbor.id === BLOCKS.AIR.id) {
                            const baseColor = block.color || 0x888888;
                            const r = ((baseColor >> 16) & 255) / 255;
                            const g = ((baseColor >> 8) & 255) / 255;
                            const b = (baseColor & 255) / 255;
                            
                            // Add slight shading based on face direction
                            const shade = 0.7 + (0.3 * (0.5 + face.normal[0] * 0.3 + face.normal[1] * 0.5 + face.normal[2] * 0.3));
                            
                            for (const corner of face.corners) {
                                vertices.push(
                                    worldX + corner[0] * 0.5,
                                    worldY + corner[1] * 0.5,
                                    worldZ + corner[2] * 0.5
                                );
                                
                                colors.push(r * shade, g * shade, b * shade);
                            }
                            
                            // Add indices for the face (two triangles)
                            const i = vertexIndex;
                            indices.push(i, i + 1, i + 2);
                            indices.push(i, i + 2, i + 3);
                            vertexIndex += 4;
                        }
                    }
                }
            }
        }
        
        if (vertices.length === 0) {
            // Empty chunk, don't create mesh
            return;
        }
        
        // Set geometry data
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        geometry.computeVertexNormals();
        
        // Create material and mesh
        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            flatShading: false,
            shininess: 0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        this.scene.add(mesh);
        this.chunkMeshes.set(key, mesh);
    }
    
    updateHUD() {
        const playerNameElement = document.getElementById('playerName');
        if (playerNameElement) {
            playerNameElement.textContent = this.username;
        }
        this.updateHotbarDisplay();
    }
    
    updateHotbarDisplay() {
        const hotbarElement = document.getElementById('hotbar');
        if (!hotbarElement) return;
        
        hotbarElement.innerHTML = '';
        
        const hotbarBlocks = this.player.getHotbar();
        const selectedIndex = this.player.getSelectedBlockIndex();
        
        hotbarBlocks.forEach((block, index) => {
            const slot = document.createElement('div');
            slot.className = 'hotbar-slot';
            if (index === selectedIndex) {
                slot.classList.add('selected');
            }
            
            slot.textContent = block ? block.name : 'Empty';
            slot.style.backgroundColor = block ? `#${block.color.toString(16)}` : '#333';
            
            hotbarElement.appendChild(slot);
        });
    }
    
    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.renderer.setSize(width, height);
        this.player.camera.aspect = width / height;
        this.player.camera.updateProjectionMatrix();
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        // Update player
        this.player.update(deltaTime);
        
        // Update multiplayer
        if (this.multiplayer) {
            this.multiplayer.updatePlayerPosition(this.player.getPosition());
        }
        
        // Render
        this.renderer.render(this.scene, this.player.camera);
    }
}

// Initialize game when page loads
window.addEventListener('load', () => {
    gameInstance = new MinecraftGame();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (gameInstance && gameInstance.multiplayer) {
        gameInstance.multiplayer.disconnect();
    }
    Auth.logout();
});

