const admin = require("firebase-admin");

// Initialize Firebase Admin SDK once.
// Credentials are auto-detected on Firebase infrastructure.
// For local dev, use `firebase emulators:start`.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

module.exports = { db };
