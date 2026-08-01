import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin SDK once.
// Credentials are auto-detected on Firebase infrastructure.
// For local dev, use `firebase emulators:start`.
//
// firebase-admin v14 removed the legacy `admin.*` namespace — use the
// modular entry points (firebase-admin/app, firebase-admin/firestore).
if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();
