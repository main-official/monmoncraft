// Lightweight seeded 2D Simplex noise implementation.
// Based on the standard public-domain simplex noise algorithm (Gustavson-style),
// reimplemented here with a seedable PRNG so each world can look different.

class SimplexNoise {
  constructor(seed = 1337) {
    this.grad3 = [
      [1,1],[-1,1],[1,-1],[-1,-1],
      [1,0],[-1,0],[1,0],[-1,0],
      [0,1],[0,-1],[0,1],[0,-1]
    ];
    this.p = new Uint8Array(256);
    let s = seed >>> 0 || 1;
    const rand = () => {
      // xorshift32 PRNG, deterministic from seed
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
    this.F2 = 0.5 * (Math.sqrt(3) - 1);
    this.G2 = (3 - Math.sqrt(3)) / 6;
  }

  dot(g, x, y) { return g[0] * x + g[1] * y; }

  noise2D(xin, yin) {
    const { F2, G2, grad3, permMod12, perm } = this;
    let n0, n1, n2;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = xin - X0, y0 = yin - Y0;
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 < 0) n0 = 0; else {
      t0 *= t0;
      const gi0 = permMod12[ii + perm[jj]];
      n0 = t0 * t0 * this.dot(grad3[gi0], x0, y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 < 0) n1 = 0; else {
      t1 *= t1;
      const gi1 = permMod12[ii + i1 + perm[jj + j1]];
      n1 = t1 * t1 * this.dot(grad3[gi1], x1, y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 < 0) n2 = 0; else {
      t2 *= t2;
      const gi2 = permMod12[ii + 1 + perm[jj + 1]];
      n2 = t2 * t2 * this.dot(grad3[gi2], x2, y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  // Fractal Brownian Motion - layered noise for natural-looking terrain
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

window.SimplexNoise = SimplexNoise;
