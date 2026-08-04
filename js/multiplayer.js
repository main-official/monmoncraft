class MultiplayerManager {
    constructor(localPlayer) {
        this.localPlayer = localPlayer;
        this.remotePlayer = null;
        this.isConnected = false;
        this.otherUsername = Auth.getOtherUsername();
        
        // Use localStorage for same-browser multiplayer
        this.setupLocalMultiplayer();
        this.updateStatusUI();
    }
    
    setupLocalMultiplayer() {
        // Listen for messages from other tab/window
        window.addEventListener('storage', (e) => {
            if (e.key === `player_${this.otherUsername}`) {
                const data = JSON.parse(e.newValue);
                this.processRemoteUpdate(data);
            }
        });
        
        // Send position updates periodically
        setInterval(() => {
            this.sendPlayerUpdate();
        }, 50); // 20 updates per second
    }
    
    sendPlayerUpdate() {
        const data = {
            username: this.localPlayer.username,
            position: {
                x: this.localPlayer.position.x,
                y: this.localPlayer.position.y,
                z: this.localPlayer.position.z
            },
            rotation: {
                x: this.localPlayer.camera.rotation.x,
                y: this.localPlayer.camera.rotation.y
            },
            timestamp: Date.now()
        };
        
        localStorage.setItem(`player_${this.localPlayer.username}`, JSON.stringify(data));
    }
    
    sendBlockUpdate(x, y, z, blockId) {
        const data = {
            type: 'block_update',
            username: this.localPlayer.username,
            x, y, z, blockId,
            timestamp: Date.now()
        };
        
        localStorage.setItem(`block_update_${this.localPlayer.username}_${Date.now()}`, JSON.stringify(data));
    }
    
    processRemoteUpdate(data) {
        if (!this.remotePlayer) {
            this.createRemotePlayer(data.username);
        }
        
        if (this.remotePlayer) {
            this.remotePlayer.position.set(data.position.x, data.position.y, data.position.z);
            this.remotePlayer.mesh.position.copy(this.remotePlayer.position);
            this.isConnected = true;
            this.updateStatusUI();
        }
    }
    
    createRemotePlayer(username) {
        // Create a simple visual representation
        if (!this.remotePlayer) {
            this.remotePlayer = {
                username: username,
                position: new THREE.Vector3(0, 65, 0),
                mesh: null
            };
            
            const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
            const material = new THREE.MeshStandardMaterial({ color: 0x4a90e2 });
            this.remotePlayer.mesh = new THREE.Mesh(geometry, material);
            gameInstance.scene.add(this.remotePlayer.mesh);
        }
    }
    
    updateStatusUI() {
        const statusElement = document.getElementById('otherPlayerStatus');
        if (this.isConnected && this.remotePlayer) {
            statusElement.textContent = `${this.remotePlayer.username} is online`;
            statusElement.className = 'status-connected';
        } else {
            statusElement.textContent = `Waiting for ${this.otherUsername}...`;
            statusElement.className = 'status-waiting';
        }
    }
    
    checkOtherPlayerConnection() {
        const data = localStorage.getItem(`player_${this.otherUsername}`);
        if (data) {
            try {
                const parsed = JSON.parse(data);
                // Check if data is recent (within 2 seconds)
                if (Date.now() - parsed.timestamp < 2000) {
                    this.isConnected = true;
                    return true;
                }
            } catch (e) {
                // Invalid data
            }
        }
        this.isConnected = false;
        return false;
    }
}
