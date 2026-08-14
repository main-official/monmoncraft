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
    this._onRemoteBlock = null;     // (x,y,z,id) => void
    this._onRemotePlayer = null;    // (username, data) => void
    this.onRemotePlayerLeft = null; // (username) => void
    this._lastSent = 0;
    this._heartbeatTimer = null;
    this._blockCache = new Map();  // Caches blocks received before world is ready
    this._playerCache = new Map(); // Caches players received before scene is ready
  }

  // Getter/Setter for onRemoteBlock
  get onRemoteBlock() {
    return this._onRemoteBlock;
  }

  set onRemoteBlock(callback) {
    this._onRemoteBlock = callback;
    if (callback && this._blockCache.size > 0) {
      // Defer execution slightly so main.js setup finishes first
      setTimeout(() => {
        for (const [key, id] of this._blockCache.entries()) {
          const [x, y, z] = key.split('_').map(Number);
          try { callback(x, y, z, id); } catch (e) { console.warn(e); }
        }
      }, 0);
    }
  }

  // Getter/Setter for onRemotePlayer
  get onRemotePlayer() {
    return this._onRemotePlayer;
  }

  set onRemotePlayer(callback) {
    this._onRemotePlayer = callback;
    if (callback && this._playerCache.size > 0) {
      // Defer execution slightly so 3D player manager finishes initializing
      setTimeout(() => {
        for (const [uname, data] of this._playerCache.entries()) {
          try { callback(uname, data); } catch (e) { console.warn(e); }
        }
      }, 0);
    }
  }

  isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' &&
      FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('YOUR_');
  }

  init() {
    if (!this.isConfigured()) return false;
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      this.db = firebase.database();
      this.ready = true;
      return true;
    } catch (e) {
      console.error('Firebase init failed:', e);
      return false;
    }
  }

  // Atomically claim a username
  async claimUsername(username, allowedUsers) {
    if (!allowedUsers.includes(username)) {
      return { ok: false, reason: 'That username is not recognized.' };
    }
    if (!this.ready) {
      return { ok: false, reason: 'Multiplayer backend is not configured yet. See README.md.' };
    }
    const ref = this.db.ref(`activeUsers/${username}`);
    const result = await ref.transaction((current) => {
      // Safely handle missing claimedAt timestamps from legacy data
      if (current && current.online) {
        const lastSeen = current.claimedAt || 0;
        if (Date.now() - lastSeen < 10000) {
          return; // Abort - user is actively playing
        }
      }
      return { online: true, claimedAt: Date.now() };
    });

    if (!result.committed) {
      return { ok: false, reason: `"${username}" is already being played by someone else right now.` };
    }

    this.username = username;
    ref.onDisconnect().remove();

    this._startHeartbeat();
    this._listenPlayers();
    this._listenBlocks();
    return { ok: true };
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this.ready && this.username && this.db) {
        this.db.ref(`activeUsers/${this.username}`).update({ claimedAt: Date.now() }).catch(() => {});
      }
    }, 3000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
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
    // Always write the value, including AIR (0) for broken/removed blocks.
    // Removing the DB key instead of storing 0 would make a deleted block
    // fall back to the procedurally generated terrain on the next load,
    // since child_added would never fire for that coordinate again — i.e.
    // deletions would silently "undo" themselves on reload.
    if (id == null) {
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
      this._blockCache.delete(snap.key);
      if (this._onRemoteBlock) this._onRemoteBlock(x, y, z, 0);
    });
  }

  _emitBlock(snap) {
    const [x, y, z] = snap.key.split('_').map(Number);
    const id = snap.val();
    this._blockCache.set(snap.key, id);
    if (this._onRemoteBlock) this._onRemoteBlock(x, y, z, id);
  }

  _listenPlayers() {
    const ref = this.db.ref('players');
    ref.on('child_added', (snap) => {
      if (snap.key === this.username) return;
      this._playerCache.set(snap.key, snap.val());
      if (this._onRemotePlayer) this._onRemotePlayer(snap.key, snap.val());
    });
    ref.on('child_changed', (snap) => {
      if (snap.key === this.username) return;
      this._playerCache.set(snap.key, snap.val());
      if (this._onRemotePlayer) this._onRemotePlayer(snap.key, snap.val());
    });
    ref.on('child_removed', (snap) => {
      if (snap.key === this.username) return;
      this._playerCache.delete(snap.key);
      if (this.onRemotePlayerLeft) this.onRemotePlayerLeft(snap.key);
    });
  }

  leave() {
    if (!this.ready || !this.username) return;
    this._stopHeartbeat();
    this.db.ref(`activeUsers/${this.username}`).remove();
    this.db.ref(`players/${this.username}`).remove();
  }
}

window.Multiplayer = Multiplayer;
