// ---------------------------------------------------------------------------
// Edit this to define the exact two usernames allowed to play, and the color
// each one renders as (for their in-world avatar as seen by the other player).
// ---------------------------------------------------------------------------

const ALLOWED_USERNAMES = ['Bee', 'Monmon'];

const USERNAME_COLORS = {
  Bee: 0x3d7dd6,
  Monmon: 0xd6633d
};

// How many chunks out from the player to keep loaded (in a circle), in
// every direction. Each chunk is 16x16 blocks. Chunks outside this radius
// are unloaded (their mesh is freed) but any edits inside them are kept
// forever — they'll look exactly the same when you walk back.
// Higher = see further but heavier on load/CPU/GPU. 6-10 is a good range;
// go much higher only if your/your friend's machine can handle it.
const RENDER_DISTANCE_CHUNKS = 8;

// Tunable performance knobs. Lower these if the game runs choppy on your or
// your friend's machine (especially integrated/laptop GPUs); raise them if
// it runs smoothly and you want it to look/feel a bit better.
const PERFORMANCE = {
  antialias: false,     // smooths jagged edges; costs real GPU time for a blocky game. true = crisper edges, lower FPS.
  maxPixelRatio: 1.5,   // caps rendering resolution on high-DPI/retina screens. Try 1 for a solid boost on those displays.
  chunksPerFrame: 3      // how many newly-needed chunks to mesh per frame while streaming terrain in. Lower = smoother movement while exploring, higher = new terrain finishes loading in sooner.
};

window.ALLOWED_USERNAMES = ALLOWED_USERNAMES;
window.USERNAME_COLORS = USERNAME_COLORS;
window.RENDER_DISTANCE_CHUNKS = RENDER_DISTANCE_CHUNKS;
window.PERFORMANCE = PERFORMANCE;
