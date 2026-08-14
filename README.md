# MonMonCraft — 2-Player Voxel World

A browser-based, Minecraft-inspired voxel game for exactly two players, built to run
as a static site on GitHub Pages:

- Procedurally generated terrain (Simplex-noise heightmap) with **jungle, forest,
  grassland, and ocean biomes**, plus trees.
- Pixel-art block textures generated on the fly (grass, dirt, stone, sand, water,
  oak/jungle logs & leaves, planks) to mimic Minecraft's look without needing any
  copyrighted texture files.
- **Creative mode, no flying**: unlimited block placing/breaking, instant break,
  but normal gravity and jumping only.
- First-person controls: WASD move, mouse look (pointer lock), left-click break,
  right-click place, 1–9 or scroll to pick a block.
- **Exactly two allowed usernames**, each locked to one active player at a time;
  closing the tab immediately frees the username back up.
- Live sync between the two players (block edits + positions/avatars).

Because GitHub Pages only serves static files, the "one player per username" lock
and the live multiplayer sync need a small realtime backend. This project uses
**Firebase Realtime Database**, which has a free tier that's more than enough for
a 2-player game and needs no server code of your own.

---

## 1. Set your two usernames

Open `js/config.js` and edit:

```js
const ALLOWED_USERNAMES = ['Steve', 'Alex'];

const USERNAME_COLORS = {
  Steve: 0x3d7dd6,
  Alex: 0xd6633d
};
```

Replace `'Steve'` and `'Alex'` with whatever two usernames you want (keep the
color mapping keys matching whatever names you choose — that color is used for
each person's in-world avatar as seen by the other player).

---

## 2. Create a free Firebase project (~5 minutes)

This powers username locking and live sync.

1. Go to <https://console.firebase.google.com/> and click **Add project**
   (the free "Spark" plan is enough — no credit card required).
2. Once created, click the **`</>`  (Web)** icon on the project overview page to
   register a web app. You can skip Firebase Hosting — you're using GitHub Pages.
3. Firebase will show you a `firebaseConfig` object. Copy those values into
   `js/firebase-config.js` in this project, replacing the placeholders:

   ```js
   const FIREBASE_CONFIG = {
     apiKey: 'AIza...',
     authDomain: 'your-project.firebaseapp.com',
     databaseURL: 'https://your-project-default-rtdb.firebaseio.com',
     projectId: 'your-project',
     storageBucket: 'your-project.appspot.com',
     messagingSenderId: '...',
     appId: '...'
   };
   ```

   These values are meant to be public in client-side code — they identify your
   project, they don't grant access by themselves. Access is controlled by the
   database rules in the next step.

4. In the Firebase console, go to **Build → Realtime Database → Create Database**.
   Choose any region, and start in **locked mode**.
5. Go to the **Rules** tab of the Realtime Database and paste this:

   ```json
   {
     "rules": {
       "activeUsers": {
         "$username": {
           ".read": true,
           ".write": true
         }
       },
       "players": {
         ".read": true,
         "$username": {
           ".write": true
         }
       },
       "blocks": {
         ".read": true,
         ".write": true
       },
       "meta": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```

   This is intentionally open (no login system) so the two of you can just type
   your username and play — it keeps things simple for a small private game
   between two people. Don't store anything sensitive in it, and treat the
   database URL as something you only share with your co-player, since anyone
   with it could technically read/write the game state (they still can't use a
   third username, since that check happens both in the game and can be
   tightened further in these rules if you want).

6. Click **Publish**.

That's it — no server, no npm install, no build step.

---

## 3. Run it locally (optional, to test before publishing)

Because this uses `fetch`-like module loading patterns and pointer lock, serve it
over HTTP rather than opening `index.html` directly as a `file://` URL:

```bash
cd mc-clone
python3 -m http.server 8080
# then open http://localhost:8080
```

Open it in two different browsers (or one normal + one incognito window) and log
in as each of your two usernames to test the multiplayer lock and sync.

---

## 4. Deploy to GitHub Pages

1. Create a new GitHub repository and push the contents of this folder to it
   (the repo root should contain `index.html`, `css/`, and `js/`).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Pick your default branch (e.g. `main`) and `/ (root)` folder, then **Save**.
5. GitHub will give you a URL like `https://your-username.github.io/your-repo/`.
   Give that link to your co-player.

Changes you push to the branch will redeploy automatically within a minute or two.

---

## How the pieces fit together

| File | Purpose |
|---|---|
| `index.html` | Page shell, loads Three.js + Firebase + game scripts |
| `css/style.css` | Minecraft-inspired UI styling (login, hotbar, crosshair, nametags) |
| `js/config.js` | The two allowed usernames + avatar colors |
| `js/firebase-config.js` | Your Firebase project credentials |
| `js/noise.js` | Seeded Simplex noise for terrain generation |
| `js/textures.js` | Generates pixel-art block textures on `<canvas>` |
| `js/world.js` | Biome + heightmap terrain generation, block get/set |
| `js/renderer.js` | Builds Minecraft-style materials and culled chunk meshes |
| `js/player.js` | First-person movement, gravity/collision, block break/place |
| `js/multiplayer.js` | Firebase-backed username locking + live state sync |
| `js/main.js` | Wires everything together, login flow, render loop |

### Why terrain doesn't need to be transmitted over the network

Both players' browsers generate the exact same terrain locally from a shared
random seed (fetched once from Firebase when the world is first created), using
the same deterministic noise functions. Only **changes** — blocks placed or
broken, and player positions — are sent over the network, which keeps the game
lightweight and fast on the free Firebase tier.

### Notes & limitations

- This is a heightmap-based world (like classic Minecraft's overworld surface)
  — there are no underground caves, but you can freely dig down, build up, and
  tunnel sideways since every block is individually edit-able. There's no
  block-breaking animation, tool durability, or crafting — this focuses on the
  terrain/building/multiplayer core.
- "Creative mode, no flying" is implemented as: unlimited blocks, instant break,
  full gravity/collision, jumping enabled, no double-jump-to-fly.
- If you'd like this extended (e.g. more block types, day/night cycle, chat,
  sound), the modular file layout above should make that easy to build on.
