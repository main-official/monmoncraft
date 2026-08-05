// ---------------------------------------------------------------------------
// Realtime multiplayer glue, backed by Firebase Realtime Database (free tier).
// GitHub Pages only serves static files, so a small external realtime store
// is what makes the "only one person can play as each username" rule and
// live block/position sync actually work across two different browsers[cite: 10].
//
// Fill in firebase-config.js with your own project's config (see README.md)[cite: 10].
// ---------------------------------------------------------------------------

class Multiplayer {
  constructor() {
    this.db = null;
    this.username = null;
    this.color = null;
    this.ready = false;
    this._onRemoteBlock = null;     // (x,y,z,id) => void[cite: 10]
    this._onRemotePlayer = null;    // (username, data) => void[cite: 10]
    this.onRemotePlayerLeft = null; // (username) => void[cite: 10]
    this._lastSent = 0;
    this._blockCache = new Map();  // Caches blocks received before world is ready
    this._playerCache = new Map(); // Caches players received before scene is ready
  }

  // Getter/Setter for onRemoteBlock to flush cached blocks when assigned
  get onRemoteBlock() {
    return this._onRemoteBlock;
  }

  set onRemoteBlock(callback) {
    this._onRemoteBlock = callback;
    if (callback && this._blockCache.size > 0) {
      for (const [key, id] of this._blockCache.entries()) {
        const [x, y, z] = key.split('_').map(Number);
        callback(x, y, z, id);
      }
    }
  }

  // Getter/Setter for onRemotePlayer to flush cached players when assigned
  get onRemotePlayer() {
    return this._onRemotePlayer;
  }

  set onRemotePlayer(callback) {
    this._onRemotePlayer = callback;
    if (callback && this._playerCache.size > 0) {
      for (const [uname, data] of this._playerCache.entries()) {
        callback(uname, data);
      }
    }
  }

  isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' &&
      FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('YOUR_'); //[cite: 10]
  }

  init() {
    if (!this.isConfigured()) return false;
    firebase.initializeApp(FIREBASE_CONFIG); //[cite: 10]
    this.db = firebase.database(); //[cite: 10]
    this.ready = true;
    return true;
  }

  // Atomically claim a username; allows reconnecting if previous session is stale (>15s old)
  async claimUsername(username, allowedUsers) {
    if (!allowedUsers.includes(username)) {
      return { ok: false, reason: 'That username is not recognized.' }; //[cite: 10]
    }
    if (!this.ready) {
      return { ok: false, reason: 'Multiplayer backend is not configured yet. See README.md.' }; //[cite: 10]
    }
    const ref = this.db.ref(`activeUsers/${username}`); //[cite: 10]
    const result = await ref.transaction((current) => {
      // If user is marked online but hasn't sent a heartbeat in over 15 seconds, consider it disconnected
      if (current && current.online && current.claimedAt && (Date.now() - current.claimedAt < 15000)) {
        return; // abort - user is genuinely actively playing
      }
      return { online: true, claimedAt: Date.now() };
    });
    if (!result.committed) {
      return { ok: false, reason: `"${username}" is already being played by someone else right now.` }; //[cite: 10]
    }
    this.username = username;
    ref.onDisconnect().remove(); //[cite: 10]
    this._listenPlayers();
    this._listenBlocks();
    return { ok: true };
  }

  async getOrCreateSeed() {
    const ref = this.db.ref('meta/seed'); //[cite: 10]
    const snap = await ref.get(); //[cite: 10]
    if (snap.exists()) return snap.val(); //[cite: 10]
    const seed = Math.floor(Math.random() * 1e9); //[cite: 10]
    const res = await ref.transaction((cur) => (cur == null ? seed : cur)); //[cite: 10]
    return res.snapshot.val(); //[cite: 10]
  }

  sendPosition(x, y, z, yaw) {
    if (!this.ready || !this.username) return; //[cite: 10]
    const now = performance.now(); //[cite: 10]
    if (now - this._lastSent < 60) return; // throttle to ~16/s[cite: 10]
    this._lastSent = now; //[cite: 10]
    
    const timestamp = Date.now();
    this.db.ref(`players/${this.username}`).set({ x, y, z, yaw, color: this.color, t: timestamp }); //[cite: 10]
    
    // Refresh connection heartbeat so stale sessions expire after closing the tab
    this.db.ref(`activeUsers/${this.username}`).update({ claimedAt: timestamp });
  }

  sendBlockChange(x, y, z, id) {
    if (!this.ready) return; //[cite: 10]
    const key = `${x}_${y}_${z}`; //[cite: 10]
    if (id === 0 || id == null) {
      this.db.ref(`blocks/${key}`).remove(); //[cite: 10]
    } else {
      this.db.ref(`blocks/${key}`).set(id); //[cite: 10]
    }
  }

  _listenBlocks() {
    const ref = this.db.ref('blocks'); //[cite: 10]
    ref.on('child_added', (snap) => this._emitBlock(snap)); //[cite: 10]
    ref.on('child_changed', (snap) => this._emitBlock(snap)); //[cite: 10]
    ref.on('child_removed', (snap) => {
      const [x, y, z] = snap.key.split('_').map(Number); //[cite: 10]
      this._blockCache.delete(snap.key);
      if (this._onRemoteBlock) this._onRemoteBlock(x, y, z, 0);
    });
  }

  _emitBlock(snap) {
    const [x, y, z] = snap.key.split('_').map(Number); //[cite: 10]
    const id = snap.val(); //[cite: 10]
    this._blockCache.set(snap.key, id);
    if (this._onRemoteBlock) this._onRemoteBlock(x, y, z, id);
  }

  _listenPlayers() {
    const ref = this.db.ref('players'); //[cite: 10]
    ref.on('child_added', (snap) => {
      if (snap.key === this.username) return; //[cite: 10]
      this._playerCache.set(snap.key, snap.val());
      if (this._onRemotePlayer) this._onRemotePlayer(snap.key, snap.val());
    });
    ref.on('child_changed', (snap) => {
      if (snap.key === this.username) return; //[cite: 10]
      this._playerCache.set(snap.key, snap.val());
      if (this._onRemotePlayer) this._onRemotePlayer(snap.key, snap.val());
    });
    ref.on('child_removed', (snap) => {
      if (snap.key === this.username) return; //[cite: 10]
      this._playerCache.delete(snap.key);
      if (this.onRemotePlayerLeft) this.onRemotePlayerLeft(snap.key); //[cite: 10]
    });
  }

  leave() {
    if (!this.ready || !this.username) return; //[cite: 10]
    this.db.ref(`activeUsers/${this.username}`).remove(); //[cite: 10]
    this.db.ref(`players/${this.username}`).remove(); //[cite: 10]
  }
}

window.Multiplayer = Multiplayer; //[cite: 10]
