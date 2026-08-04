class Player {
    constructor(username, scene) {
        this.username = username;
        this.scene = scene;
        
        // Position and rotation
        this.position = new THREE.Vector3(0, 65, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.copy(this.position);
        this.scene.add(this.camera);
        
        // Player state
        this.isOnGround = false;
        this.canDoubleJump = false;
        this.isFlying = false;
        this.selectedBlockIndex = 0;
        this.inventory = [
            BLOCKS.STONE.id,
            BLOCKS.OAK_LOG.id,
            BLOCKS.OAK_LEAVES.id,
            BLOCKS.DIRT.id,
            BLOCKS.GRASS.id,
            BLOCKS.SAND.id
        ];
        
        // Input
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.setupInputListeners();
        
        // Create player mesh for other players
        this.createMesh();
    }
    
    createMesh() {
        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);
    }
    
    setupInputListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            
            // Jump
            if (e.key === ' ') {
                e.preventDefault();
                this.jump();
            }
            
            // Block selection
            const num = parseInt(e.key);
            if (num >= 1 && num <= 6) {
                this.selectedBlockIndex = num - 1;
                this.updateHotbar();
            }
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        
        window.addEventListener('mousemove', (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });
        
        // Pointer lock
        document.addEventListener('click', () => {
            document.body.requestPointerLock = document.body.requestPointerLock || document.body.mozRequestPointerLock;
            document.body.requestPointerLock();
        });
        
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                window.addEventListener('mousemove', this.onMouseMove.bind(this));
            } else {
                window.removeEventListener('mousemove', this.onMouseMove.bind(this));
            }
        });
        
        // Click to break/place blocks
        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.breakBlock();
            } else if (e.button === 2) {
                e.preventDefault();
                this.placeBlock();
            }
        });
        
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    onMouseMove(event) {
        const movementX = event.movementX || event.mozMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || 0;
        
        this.euler.setFromQuaternion(this.camera.quaternion);
        this.euler.rotateY(-movementX * CONFIG.MOUSE_SENSITIVITY);
        this.euler.rotateX(-movementY * CONFIG.MOUSE_SENSITIVITY);
        
        this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
        
        this.camera.quaternion.setFromEuler(this.euler);
    }
    
    update(terrain, deltaTime) {
        const moveDirection = new THREE.Vector3();
        
        if (this.keys['w'] || this.keys['arrowup']) {
            moveDirection.z -= 1;
        }
        if (this.keys['s'] || this.keys['arrowdown']) {
            moveDirection.z += 1;
        }
        if (this.keys['a'] || this.keys['arrowleft']) {
            moveDirection.x -= 1;
        }
        if (this.keys['d'] || this.keys['arrowright']) {
            moveDirection.x += 1;
        }
        
        // Apply camera rotation to movement
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        const flatDirection = new THREE.Vector3(cameraDirection.x, 0, cameraDirection.z).normalize();
        const rightDirection = new THREE.Vector3(-flatDirection.z, 0, flatDirection.x);
        
        const moveVector = new THREE.Vector3();
        moveVector.addScaledVector(flatDirection, moveDirection.z);
        moveVector.addScaledVector(rightDirection, moveDirection.x);
        
        if (moveVector.length() > 0) {
            moveVector.normalize().multiplyScalar(CONFIG.MOVE_SPEED);
        }
        
        this.velocity.x = moveVector.x;
        this.velocity.z = moveVector.z;
        
        // Gravity
        this.velocity.y -= 0.02;
        
        // Update position
        const newPos = new THREE.Vector3().addVectors(this.position, this.velocity);
        
        // Simple collision detection
        if (!this.isColliding(newPos, terrain)) {
            this.position.copy(newPos);
        } else {
            // Sliding collision
            const slideX = new THREE.Vector3(newPos.x, this.position.y, this.position.z);
            const slideZ = new THREE.Vector3(this.position.x, this.position.y, newPos.z);
            
            if (!this.isColliding(slideX, terrain)) {
                this.position.copy(slideX);
            } else if (!this.isColliding(slideZ, terrain)) {
                this.position.copy(slideZ);
            } else {
                this.velocity.y = 0;
            }
        }
        
        // Check if on ground
        const groundCheckPos = new THREE.Vector3(this.position.x, this.position.y - 0.1, this.position.z);
        this.isOnGround = this.isColliding(groundCheckPos, terrain);
        
        // Reset fall when on ground
        if (this.isOnGround && this.velocity.y < 0) {
            this.velocity.y = 0;
        }
        
        // Update camera position
        this.camera.position.copy(this.position);
        this.camera.position.y += 1.6; // Eye height
        
        // Update mesh for other players
        this.mesh.position.copy(this.position);
    }
    
    isColliding(position, terrain) {
        const radius = 0.3;
        const checkPoints = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(radius, 0, 0),
            new THREE.Vector3(-radius, 0, 0),
            new THREE.Vector3(0, 0, radius),
            new THREE.Vector3(0, 0, -radius),
            new THREE.Vector3(0, 1.5, 0)
        ];
        
        for (let check of checkPoints) {
            const testPos = new THREE.Vector3().addVectors(position, check);
            const blockX = Math.floor(testPos.x);
            const blockY = Math.floor(testPos.y);
            const blockZ = Math.floor(testPos.z);
            
            const blockId = terrain.getBlockAt(blockX, blockY, blockZ);
            const block = BlockUtils.getBlock(blockId);
            
            if (block.solid && !block.transparent) {
                return true;
            }
        }
        
        return false;
    }
    
    jump() {
        if (this.isOnGround) {
            this.velocity.y = CONFIG.JUMP_FORCE;
            this.isOnGround = false;
        }
    }
    
    breakBlock() {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        let hitPos = null;
        for (let i = 0.1; i < 200; i += 0.5) {
            const checkPos = new THREE.Vector3().addVectors(
                this.camera.position, 
                raycaster.ray.direction.clone().multiplyScalar(i)
            );
            const blockId = gameInstance.terrain.getBlockAt(
                Math.floor(checkPos.x), 
                Math.floor(checkPos.y), 
                Math.floor(checkPos.z)
            );
            
            if (blockId !== BLOCKS.AIR.id) {
                hitPos = checkPos;
                break;
            }
        }
        
        if (hitPos) {
            const x = Math.floor(hitPos.x);
            const y = Math.floor(hitPos.y);
            const z = Math.floor(hitPos.z);
            
            gameInstance.terrain.setBlockAt(x, y, z, BLOCKS.AIR.id);
            gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE), Math.floor(z / CONFIG.CHUNK_SIZE));
            
            // Notify adjacent chunks
            gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE) + 1, Math.floor(z / CONFIG.CHUNK_SIZE));
            gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE) - 1, Math.floor(z / CONFIG.CHUNK_SIZE));
            gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE), Math.floor(z / CONFIG.CHUNK_SIZE) + 1);
            gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE), Math.floor(z / CONFIG.CHUNK_SIZE) - 1);
            
            // Send to other player
            if (gameInstance.multiplayer) {
                gameInstance.multiplayer.sendBlockUpdate(x, y, z, BLOCKS.AIR.id);
            }
        }
    }
    
    placeBlock() {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        let hitPos = null;
        let lastValidPos = null;
        let lastSolidBlock = null;
        
        for (let i = 0.1; i < 200; i += 0.5) {
            const checkPos = new THREE.Vector3().addVectors(
                this.camera.position, 
                raycaster.ray.direction.clone().multiplyScalar(i)
            );
            const blockId = gameInstance.terrain.getBlockAt(
                Math.floor(checkPos.x), 
                Math.floor(checkPos.y), 
                Math.floor(checkPos.z)
            );
            
            if (blockId !== BLOCKS.AIR.id) {
                // Found a solid block, place on nearest air block
                if (lastValidPos) {
                    hitPos = lastValidPos;
                }
                break;
            }
            lastValidPos = checkPos;
        }
        
        if (hitPos) {
            const x = Math.floor(hitPos.x);
            const y = Math.floor(hitPos.y);
            const z = Math.floor(hitPos.z);
            
            // Don't place inside player
            const playerBounds = new THREE.Box3().setFromCenterAndSize(
                this.position,
                new THREE.Vector3(0.6, 1.8, 0.6)
            );
            
            const blockCenter = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
            if (!playerBounds.containsPoint(blockCenter)) {
                const selectedBlockId = this.inventory[this.selectedBlockIndex];
                gameInstance.terrain.setBlockAt(x, y, z, selectedBlockId);
                gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE), Math.floor(z / CONFIG.CHUNK_SIZE));
                
                // Notify adjacent chunks
                gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE) + 1, Math.floor(z / CONFIG.CHUNK_SIZE));
                gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE) - 1, Math.floor(z / CONFIG.CHUNK_SIZE));
                gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE), Math.floor(z / CONFIG.CHUNK_SIZE) + 1);
                gameInstance.updateChunkMesh(Math.floor(x / CONFIG.CHUNK_SIZE), Math.floor(z / CONFIG.CHUNK_SIZE) - 1);
                
                // Send to other player
                if (gameInstance.multiplayer) {
                    gameInstance.multiplayer.sendBlockUpdate(x, y, z, selectedBlockId);
                }
            }
        }
    }
    
    updateHotbar() {
        const hotbarItems = document.getElementById('hotbarItems');
        hotbarItems.innerHTML = '';
        
        const blockNames = {
            [BLOCKS.STONE.id]: 'Stone',
            [BLOCKS.OAK_LOG.id]: 'Log',
            [BLOCKS.OAK_LEAVES.id]: 'Leaves',
            [BLOCKS.DIRT.id]: 'Dirt',
            [BLOCKS.GRASS.id]: 'Grass',
            [BLOCKS.SAND.id]: 'Sand'
        };
        
        for (let i = 0; i < this.inventory.length; i++) {
            const item = document.createElement('div');
            item.className = 'hotbar-item';
            if (i === this.selectedBlockIndex) {
                item.classList.add('selected');
            }
            
            const blockId = this.inventory[i];
            const blockName = blockNames[blockId] || 'Unknown';
            item.textContent = (i + 1);
            item.title = blockName;
            
            hotbarItems.appendChild(item);
        }
    }
}
