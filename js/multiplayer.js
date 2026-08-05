// ---------------------------------------------------------------------------
// Realtime multiplayer glue, backed by Firebase Realtime Database (free tier).
// GitHub Pages only serves static files, so a small external realtime store
// is what makes the "only one person can play as each username" rule and
// live block/position sync actually work across two different browsers.
//
// Fill in firebase-config.js with your own project's config (see README.md).
// ---------------------------------------------------------------------------

class Multiplayer {
  constructor() {
    this.db = null;
    this.username = null;
    this.color = null;
    this.ready = false;
    this.onRemoteBlock = null;     // (x,y,z,id) => void
    this.onRemotePlayer = null;    // (username, data) => void
    this.onRemotePlayerLeft = null; // (username) => void
    this._lastSent = 0;
  }

  isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' &&
      FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('YOUR_');
  }

  init() {
    if (!this.isConfigured()) return false;
    firebase.initializeApp(FIREBASE_CONFIG);
    this.db = firebase.database();
    this.ready = true;
    return true;
  }

  // Atomically claim a username; resolves {ok:true} or {ok:false, reason}
  async claimUsername(username, allowedUsers) {
    if (!allowedUsers.includes(username)) {
      return { ok: false, reason: 'That username is not recognized.' };
    }
    if (!this.ready) {
      return { ok: false, reason: 'Multiplayer backend is not configured yet. See README.md.' };
    }
    const ref = this.db.ref(`activeUsers/${username}`);
    const result = await ref.transaction((current) => {
      if (current && current.online) return; // abort - already taken
      return { online: true, claimedAt: Date.now() };
    });
    if (!result.committed) {
      return { ok: false, reason: `"${username}" is already being played by someone else right now.` };
    }
    this.username = username;
    ref.onDisconnect().remove();
    this._listenPlayers();
    this._listenBlocks();
    return { ok: true };
  }

  async getOrCreateSeed() {
    const ref = this.db.ref('meta/seed');
    const snap = await ref.get();
    if (snap.exists()) return snap.val();
    const seed = Math.floor(Math.random() * 1e9);
    const res = await ref.transaction((cur) => (cur == null ? seed : cur));
    return res.snapshot.val();
  }

  sendPosition(x, y, z, yaw) {
    if (!this.ready || !this.username) return;
    const now = performance.now();
    if (now - this._lastSent < 60) return; // throttle to ~16/s
    this._lastSent = now;
    this.db.ref(`players/${this.username}`).set({ x, y, z, yaw, color: this.color, t: Date.now() });
  }

  sendBlockChange(x, y, z, id) {
    if (!this.ready) return;
    const key = `${x}_${y}_${z}`;
    if (id === 0 || id == null) {
      this.db.ref(`blocks/${key}`).remove();
    } else {
      this.db.ref(`blocks/${key}`).set(id);
    }
  }

  _listenBlocks() {
    const ref = this.db.ref('blocks');
    ref.on('child_added', (snap) => this._emitBlock(snap));
    ref.on('child_changed', (snap) => this._emitBlock(snap));
    ref.on('child_removed', (snap) => {
      const [x, y, z] = snap.key.split('_').map(Number);
      if (this.onRemoteBlock) this.onRemoteBlock(x, y, z, 0);
    });
  }

  _emitBlock(snap) {
    const [x, y, z] = snap.key.split('_').map(Number);
    if (this.onRemoteBlock) this.onRemoteBlock(x, y, z, snap.val());
  }

  _listenPlayers() {
    const ref = this.db.ref('players');
    ref.on('child_added', (snap) => {
      if (snap.key === this.username) return;
      if (this.onRemotePlayer) this.onRemotePlayer(snap.key, snap.val());
    });
    ref.on('child_changed', (snap) => {
      if (snap.key === this.username) return;
      if (this.onRemotePlayer) this.onRemotePlayer(snap.key, snap.val());
    });
    ref.on('child_removed', (snap) => {
      if (snap.key === this.username) return;
      if (this.onRemotePlayerLeft) this.onRemotePlayerLeft(snap.key);
    });
  }

  leave() {
    if (!this.ready || !this.username) return;
    this.db.ref(`activeUsers/${this.username}`).remove();
    this.db.ref(`players/${this.username}`).remove();
  }
}

window.Multiplayer = Multiplayer;
