const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize Firebase Admin SDK once.
// Credentials are auto-detected on Firebase infrastructure.
// For local dev, use `firebase emulators:start`.
// firebase-admin v14 is modular-only — the old `admin.*` namespace was removed.
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

module.exports = { db };
