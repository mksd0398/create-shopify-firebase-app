/**
 * Cloud Function exports — each function scales independently.
 *
 * Firebase v2 (gen 2) functions run on Cloud Run with per-function
 * concurrency, memory, timeout, and min-instance settings.
 *
 * Architecture:
 *   auth      — OAuth 2.0 install + callback (standalone, no Express)
 *   api       — Admin dashboard API routes (Express + JWT middleware)
 *   webhooks  — Webhook handlers (standalone, no Express — fast cold starts)
 *   proxy     — Storefront App Proxy routes (Express + HMAC verification)
 *
 * Adding a new function:
 *   1. Create a new file in src/ (e.g. src/cron.js)
 *   2. Export a handler from it
 *   3. Import and re-export here with desired options
 *   4. Add a rewrite in firebase.json if it needs an HTTP endpoint
 *   5. Run: firebase deploy --only functions:yourFunction
 *
 * Docs: https://firebase.google.com/docs/functions/http-events?gen=2nd
 */

require("./firebase"); // Initialize Firebase Admin SDK — must be first

const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const { authHandler } = require("./auth");
const { adminApiRouter } = require("./admin-api");
const { proxyRouter } = require("./proxy");
const { webhookHandler } = require("./webhooks");

// ─── auth: OAuth 2.0 install + callback ──────────────────────────────────
// Standalone handler (no Express overhead). Handles:
//   GET /auth         -> redirect to Shopify consent screen
//   GET /auth/callback -> exchange code for access token
exports.auth = onRequest(
  { memory: "256MiB", timeoutSeconds: 30, invoker: "public" },
  authHandler,
);

// ─── api: Admin dashboard API ────────────────────────────────────────────
// Express app with JWT session token middleware on all routes.
// Add routes in src/admin-api.js.
const apiApp = express();
apiApp.use(cors({ origin: true }));
apiApp.use(express.json());
apiApp.use("/api", adminApiRouter);

exports.api = onRequest(
  { memory: "256MiB", timeoutSeconds: 60, invoker: "public" },
  apiApp,
);

// ─── webhooks: Shopify webhook handlers ──────────────────────────────────
// Standalone handler for maximum speed. Must respond 200 within 5 seconds.
// No Express, no CORS, no JSON parsing — just raw body HMAC verification.
exports.webhooks = onRequest(
  { memory: "256MiB", timeoutSeconds: 10, invoker: "public" },
  webhookHandler,
);

// ─── proxy: Storefront App Proxy routes ──────────────────────────────────
// Express app for storefront-facing endpoints.
// Add routes in src/proxy.js. Enable App Proxy in shopify.app.toml.
const proxyApp = express();
proxyApp.use(cors({ origin: true }));
proxyApp.use(express.json());
proxyApp.use("/proxy", proxyRouter);

exports.proxy = onRequest(
  { memory: "256MiB", timeoutSeconds: 30, invoker: "public" },
  proxyApp,
);

// ──────────────────────────────────────────────────────────────────────────
// HOW TO ADD A NEW FUNCTION:
//
//   // 1. Create src/my-feature.js with your handler
//   const { myFeatureHandler } = require("./my-feature");
//
//   // 2. Export it here with desired options
//   exports.myFeature = onRequest(
//     { memory: "256MiB", timeoutSeconds: 60, invoker: "public" },
//     myFeatureHandler,
//   );
//
//   // 3. Add rewrite in firebase.json:
//   //    { "source": "/my-feature/**", "run": { "serviceId": "myFeature", "region": "us-central1" } }
//
//   // 4. Deploy only your function:
//   //    firebase deploy --only functions:myFeature
// ──────────────────────────────────────────────────────────────────────────
