import * as functions from "firebase-functions";
import "./firebase"; // Initialize Firebase first — must be before other imports
import express from "express";
import cors from "cors";
import { authRouter } from "./auth";
import { adminApiRouter } from "./admin-api";
import { proxyRouter } from "./proxy";
import { webhookRouter } from "./webhooks";

const expressApp = express();
expressApp.use(cors({ origin: true }));

// Capture raw body for webhook HMAC verification.
// Shopify signs the raw request body — we need it before JSON parsing.
expressApp.use(
  express.json({
    limit: "2mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  }),
);
expressApp.use(express.urlencoded({ extended: true }));

// ─── Routes ────────────────────────────────────────────────────────────────
expressApp.use("/auth", authRouter);       // OAuth install + callback
expressApp.use("/api", adminApiRouter);     // Admin dashboard API (JWT auth)
expressApp.use("/proxy", proxyRouter);      // App Proxy routes (HMAC auth)
expressApp.use("/webhooks", webhookRouter); // Webhook handlers

// Health check
expressApp.get("/", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Export as a single Cloud Function.
// Firebase Hosting rewrites (firebase.json) forward requests here.
export const app = functions
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onRequest(expressApp);
