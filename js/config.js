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

window.ALLOWED_USERNAMES = ALLOWED_USERNAMES;
window.USERNAME_COLORS = USERNAME_COLORS;
window.RENDER_DISTANCE_CHUNKS = RENDER_DISTANCE_CHUNKS;
