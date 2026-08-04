class SimplexNoise {
    constructor(seed = 0) {
        this.seed = seed;
        this.permutation = this.buildPermutationTable(seed);
        this.p = [...this.permutation, ...this.permutation];
    }
    
    buildPermutationTable(seed) {
        const p = [];
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }
        // Shuffle with seed
        for (let i = 255; i > 0; i--) {
            const j = Math.floor((Math.sin(seed + i) * 10000) % (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        return p;
    }
    
    noise(x, y) {
        const xi = Math.floor(x) & 255;
        const yi = Math.floor(y) & 255;
        
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        
        const u = this.fade(xf);
        const v = this.fade(yf);
        
        const aa = this.p[this.p[xi] + yi];
        const ab = this.p[this.p[xi] + yi + 1];
        const ba = this.p[this.p[xi + 1] + yi];
        const bb = this.p[this.p[xi + 1] + yi + 1];
        
        const x1 = this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
        const x2 = this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
        
        return this.lerp(x1, x2, v);
    }
    
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    
    lerp(t, a, b) {
        return a + t * (b - a);
    }
    
    grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 8 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
}

class TerrainGenerator {
    constructor(seed = 12345) {
        this.seed = seed;
        this.noiseGenerator = new SimplexNoise(seed);
        this.chunks = new Map();
    }
    
    getChunkKey(chunkX, chunkZ) {
        return `${chunkX},${chunkZ}`;
    }
    
    generateChunk(chunkX, chunkZ) {
        const key = this.getChunkKey(chunkX, chunkZ);
        if (this.chunks.has(key)) {
            return this.chunks.get(key);
        }
        
        const chunk = [];
        const chunkWorldX = chunkX * CONFIG.CHUNK_SIZE;
        const chunkWorldZ = chunkZ * CONFIG.CHUNK_SIZE;
        
        for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
            for (let z = 0; z < CONFIG.CHUNK_SIZE; z++) {
                for (let y = 0; y < CONFIG.TERRAIN_HEIGHT; y++) {
                    const worldX = chunkWorldX + x;
                    const worldZ = chunkWorldZ + z;
                    
                    const block = this.generateBlock(worldX, y, worldZ);
                    const idx = x + z * CONFIG.CHUNK_SIZE + y * CONFIG.CHUNK_SIZE * CONFIG.CHUNK_SIZE;
                    chunk[idx] = block;
                }
            }
        }
        
        this.chunks.set(key, chunk);
        return chunk;
    }
    
    generateBlock(x, y, z) {
        // Get biome
        const biome = this.getBiome(x, z);
        
        // Get base height
        const heightNoise = (this.noiseGenerator.noise(x / 40, z / 40) + 1) / 2;
        const mountainNoise = (this.noiseGenerator.noise(x / 100, z / 100) + 1) / 2;
        const baseHeight = 32 + heightNoise * 20 + mountainNoise * 10;
        
        // Biome-specific adjustments
        let height = baseHeight;
        let block = BLOCKS.AIR;
        
        if (biome === CONFIG.BIOME_TYPES.OCEAN) {
            height = 24 + (this.noiseGenerator.noise(x / 50, z / 50) + 1) / 2 * 5;
        } else if (biome === CONFIG.BIOME_TYPES.JUNGLE) {
            height = baseHeight + 5;
        } else if (biome === CONFIG.BIOME_TYPES.FOREST) {
            height = baseHeight;
        } else {
            height = baseHeight - 2;
        }
        
        // Generate blocks
        if (y < 10) {
            block = BLOCKS.STONE;
        } else if (y < height - 3) {
            block = BLOCKS.DIRT;
        } else if (y < height) {
            block = BLOCKS.GRASS;
        } else if (y === Math.floor(height) && biome === CONFIG.BIOME_TYPES.OCEAN) {
            block = BLOCKS.WATER;
        } else if (y < 26 && biome === CONFIG.BIOME_TYPES.OCEAN) {
            block = BLOCKS.WATER;
        } else {
            block = BLOCKS.AIR;
        }
        
        return block.id;
    }
    
    getBiome(x, z) {
        const biomeNoise = this.noiseGenerator.noise(x / CONFIG.BIOME_SCALE, z / CONFIG.BIOME_SCALE);
        const moistureNoise = this.noiseGenerator.noise(x / CONFIG.BIOME_SCALE + 100, z / CONFIG.BIOME_SCALE + 100);
        
        if (biomeNoise < -0.4) {
            return CONFIG.BIOME_TYPES.OCEAN;
        } else if (moistureNoise > 0.4) {
            return CONFIG.BIOME_TYPES.JUNGLE;
        } else if (moistureNoise > 0.1) {
            return CONFIG.BIOME_TYPES.FOREST;
        } else {
            return CONFIG.BIOME_TYPES.GRASSLAND;
        }
    }
    
    getBlockAt(x, y, z) {
        if (y < 0 || y >= CONFIG.TERRAIN_HEIGHT) {
            return BLOCKS.AIR.id;
        }
        
        const chunkX = Math.floor(x / CONFIG.CHUNK_SIZE);
        const chunkZ = Math.floor(z / CONFIG.CHUNK_SIZE);
        const localX = ((x % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        const localZ = ((z % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        
        const chunk = this.generateChunk(chunkX, chunkZ);
        const idx = localX + localZ * CONFIG.CHUNK_SIZE + y * CONFIG.CHUNK_SIZE * CONFIG.CHUNK_SIZE;
        return chunk[idx] || BLOCKS.AIR.id;
    }
    
    setBlockAt(x, y, z, blockId) {
        if (y < 0 || y >= CONFIG.TERRAIN_HEIGHT) return;
        
        const chunkX = Math.floor(x / CONFIG.CHUNK_SIZE);
        const chunkZ = Math.floor(z / CONFIG.CHUNK_SIZE);
        const localX = ((x % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        const localZ = ((z % CONFIG.CHUNK_SIZE) + CONFIG.CHUNK_SIZE) % CONFIG.CHUNK_SIZE;
        
        const chunk = this.generateChunk(chunkX, chunkZ);
        const idx = localX + localZ * CONFIG.CHUNK_SIZE + y * CONFIG.CHUNK_SIZE * CONFIG.CHUNK_SIZE;
        chunk[idx] = blockId;
    }
}
