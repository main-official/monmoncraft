// ---------------------------------------------------------------------------
// Replace with YOUR OWN Firebase project's web config (see README.md for the
// 5-minute setup). This is what powers the "only one person per username"
// lock and the live sync of block edits + player positions between the two
// players' browsers, since GitHub Pages itself only serves static files.
//
// Firebase's client config values (apiKey, etc.) are not secret — they're
// meant to be public in client-side code. Access is controlled by the
// Realtime Database security rules you set in the Firebase console
// (see README.md for the exact rules to paste in).
// ---------------------------------------------------------------------------

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBEE29i-ms9vwuFGeeZ1BgO49n_CbVyp-U",
  authDomain: "moncraft-f82b2.firebaseapp.com",
  projectId: "moncraft-f82b2",
  storageBucket: "moncraft-f82b2.firebasestorage.app",
  messagingSenderId: "757773488373",
  appId: "1:757773488373:web:77a097c67d9fb317a035bc",
  measurementId: "G-PMT08MLZED"
};

window.FIREBASE_CONFIG = FIREBASE_CONFIG;
