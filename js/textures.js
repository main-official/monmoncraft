// Generates 16x16 pixel-art style textures on <canvas>, upscaled and used as
// THREE.CanvasTexture with nearest-neighbor filtering, to mimic Minecraft's look
// without needing any external image assets (keeps this a pure static site).

const TextureFactory = (() => {
  const SIZE = 16; // native Minecraft texture resolution

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    return c;
  }

  function seededRand(seed) {
    let s = seed >>> 0;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }

  function noisyFill(ctx, baseColor, variance, seed, opts = {}) {
    const rand = seededRand(seed);
    const [r, g, b] = baseColor;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const n = (rand() - 0.5) * variance;
        let rr = Math.min(255, Math.max(0, r + n));
        let gg = Math.min(255, Math.max(0, g + n));
        let bb = Math.min(255, Math.max(0, b + n));
        if (opts.speckle && rand() < opts.speckle) {
          const sp = opts.speckleColor || [0, 0, 0];
          rr = sp[0]; gg = sp[1]; bb = sp[2];
        }
        ctx.fillStyle = `rgb(${rr | 0},${gg | 0},${bb | 0})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function grassTop(hueShift = 0) {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, [86 + hueShift, 152, 62], 26, 11);
    return c;
  }

  function grassSide(hueShift = 0) {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, [134, 96, 67], 20, 22); // dirt base
    const rand = seededRand(33);
    // green fringe on top ~5px like Minecraft grass block sides
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (y === 4 && rand() < 0.55) continue; // jagged edge
        const n = (rand() - 0.5) * 24;
        const r = 86 + hueShift + n, g = 152 + n, b = 62 + n;
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  function dirt() {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, [134, 96, 67], 22, 44);
    return c;
  }

  function stone() {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, [125, 125, 125], 16, 55, { speckle: 0.04, speckleColor: [100, 100, 100] });
    return c;
  }

  function sand() {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, [219, 205, 150], 14, 66);
    return c;
  }

  function water() {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, [60, 100, 220], 20, 77);
    return c;
  }

  function log(barkColor = [84, 62, 41], ringColor = [110, 84, 56]) {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, barkColor, 12, 88);
    ctx.fillStyle = `rgb(${ringColor[0]},${ringColor[1]},${ringColor[2]})`;
    for (let i = 0; i < SIZE; i++) { ctx.fillRect(0, i, 1, 1); ctx.fillRect(SIZE - 1, i, 1, 1); }
    return c;
  }

  function logTop(ringColor = [110, 84, 56]) {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, ringColor, 10, 99);
    ctx.strokeStyle = `rgb(84,62,41)`;
    ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
    return c;
  }

  function leaves(color = [58, 122, 46]) {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, color, 34, 111, { speckle: 0.12, speckleColor: [30, 70, 25] });
    return c;
  }

  function planks(base = [163, 126, 74]) {
    const c = makeCanvas(); const ctx = c.getContext('2d');
    noisyFill(ctx, base, 10, 133);
    ctx.strokeStyle = `rgba(90,64,34,0.5)`;
    for (let x = 0; x < SIZE; x += 4) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, SIZE); ctx.stroke(); }
    ctx.strokeRect(0.5, 3.5, SIZE - 1, 0.5);
    ctx.strokeRect(0.5, 11.5, SIZE - 1, 0.5);
    return c;
  }

  function toTexture(canvas, THREE) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  return { grassTop, grassSide, dirt, stone, sand, water, log, logTop, leaves, planks, toTexture };
})();

window.TextureFactory = TextureFactory;
