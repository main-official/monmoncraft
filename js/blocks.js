const BLOCKS = {
    AIR: { id: 0, name: 'air', solid: false },
    STONE: { id: 1, name: 'stone', solid: true, color: 0x808080 },
    GRASS: { id: 2, name: 'grass_block', solid: true, color: 0x3d9d3d, topColor: 0x5dd65d },
    DIRT: { id: 3, name: 'dirt', solid: true, color: 0x6b4423 },
    OAK_LOG: { id: 4, name: 'oak_log', solid: true, color: 0x5d4e37 },
    OAK_LEAVES: { id: 5, name: 'oak_leaves', solid: true, color: 0x4a8f3a, transparent: true },
    JUNGLE_LOG: { id: 6, name: 'jungle_log', solid: true, color: 0x6b5d4f },
    JUNGLE_LEAVES: { id: 7, name: 'jungle_leaves', solid: true, color: 0x3d7a2d, transparent: true },
    SAND: { id: 8, name: 'sand', solid: true, color: 0xe6d5a0 },
    WATER: { id: 9, name: 'water', solid: false, color: 0x4a90e2, transparent: true },
    GRAVEL: { id: 10, name: 'gravel', solid: true, color: 0x8b8b8b },
    OAK_PLANKS: { id: 11, name: 'oak_planks', solid: true, color: 0xa87f39 },
};

const BlockUtils = {
    getBlock(id) {
        for (let key in BLOCKS) {
            if (BLOCKS[key].id === id) {
                return BLOCKS[key];
            }
        }
        return BLOCKS.AIR;
    },
    
    isWalkable(block) {
        return block.solid && !block.transparent;
    },
    
    isSeeThrough(block) {
        return !block.solid || block.transparent;
    }
};
