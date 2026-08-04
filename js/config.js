const CONFIG = {
    // MODIFY THIS: Set your two allowed usernames
    ALLOWED_USERNAMES: ['Player1', 'Player2'],
    
    // Game settings
    RENDER_DISTANCE: 8,
    CHUNK_SIZE: 16,
    TERRAIN_HEIGHT: 64,
    
    // Block settings
    BLOCK_SIZE: 1,
    
    // Biome settings
    BIOME_SCALE: 50,
    BIOME_TYPES: {
        GRASSLAND: 'grassland',
        FOREST: 'forest',
        JUNGLE: 'jungle',
        OCEAN: 'ocean'
    },
    
    // Player settings
    MOVE_SPEED: 0.15,
    MOUSE_SENSITIVITY: 0.003,
    JUMP_FORCE: 0.5,
    
    // WebRTC settings
    SIGNALING_SERVER: 'wss://your-signaling-server.com', // Optional for P2P
    USE_LOCAL_MULTIPLAYER: true // Set to true for same-browser multiplayer
};
