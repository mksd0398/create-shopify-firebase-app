import crypto from "crypto";
import { getConfig } from "./config";
import { db } from "./firebase";
import { Timestamp } from "firebase-admin/firestore";
import type { Request } from "firebase-functions/v2/https";

// ─── Shop domain validation ──────────────────────────────────────────────
// The shop param is attacker-controlled and ends up in a redirect Location
// and in outbound API URLs. Shopify shop domains are always
// "<store-handle>.myshopify.com" — reject anything else outright.
const SHOP_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

function isValidShopDomain(shop: unknown): shop is string {
  return typeof shop === "string" && SHOP_DOMAIN_PATTERN.test(shop);
}

// OAuth state nonces are single-use and short-lived.
const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Standalone OAuth handler — no Express, no middleware overhead.
 *
 * Routes:
 *   GET /auth           → Start OAuth (redirect to Shopify consent screen)
 *   GET /auth/callback  → Handle callback (exchange code, store session)
 */
export async function authHandler(req: Request, res: any): Promise<void> {
  const urlPath = req.path;

  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  if (urlPath === "/auth/callback") {
    await handleCallback(req, res);
  } else {
    await handleStart(req, res);
  }
}

// ─── Step 1: Start OAuth ─────────────────────────────────────────────────
// Merchant clicks "Install" → redirect to Shopify consent screen.
async function handleStart(req: Request, res: any): Promise<void> {
  const { shop } = req.query;
  if (!isValidShopDomain(shop)) {
    res.status(400).send("Invalid or missing shop parameter");
    return;
  }

  const config = getConfig();
  const nonce = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${config.appUrl}/auth/callback`;

  // Store nonce for CSRF protection. This MUST be awaited — the function
  // instance can be frozen the moment we respond, so a pending write may
  // never land and the callback would have nothing to verify against.
  // expiresAt is a Timestamp so you can attach a Firestore TTL policy to
  // this collection and have stale nonces purged automatically.
  await db
    .collection("authNonces")
    .doc(nonce)
    .set({
      shop,
      createdAt: new Date().toISOString(),
      expiresAt: Timestamp.fromMillis(Date.now() + NONCE_TTL_MS),
    });

  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${config.apiKey}` +
    `&scope=${config.scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`;

  res.redirect(authUrl);
}

// ─── Step 2: OAuth Callback ──────────────────────────────────────────────
// Shopify redirects back with code + HMAC. Verify, exchange, store session.
async function handleCallback(req: Request, res: any): Promise<void> {
  const { shop, code, hmac, state } = req.query;

  if (!isValidShopDomain(shop)) {
    res.status(400).send("Invalid or missing shop parameter");
    return;
  }

  if (!code || !hmac) {
    res.status(400).send("Missing required parameters");
    return;
  }

  const config = getConfig();

  // Verify HMAC (timing-safe comparison)
  const queryParams = { ...req.query };
  delete queryParams.hmac;
  delete queryParams.signature;
  const message = Object.keys(queryParams)
    .sort()
    .map((key) => `${key}=${queryParams[key]}`)
    .join("&");
  const generatedHmac = crypto
    .createHmac("sha256", config.apiSecret)
    .update(message)
    .digest("hex");

  const hmacBuffer = Buffer.from(hmac as string);
  const generatedBuffer = Buffer.from(generatedHmac);
  if (
    hmacBuffer.length !== generatedBuffer.length ||
    !crypto.timingSafeEqual(generatedBuffer, hmacBuffer)
  ) {
    res.status(403).send("HMAC verification failed");
    return;
  }

  // ─── Verify state nonce (CSRF) ─────────────────────────────────────────
  // A callback we did not initiate has no matching nonce, so an absent or
  // unknown state must be rejected — not merely skipped.
  if (!state || typeof state !== "string") {
    res.status(403).send("Missing state parameter");
    return;
  }

  const nonceRef = db.collection("authNonces").doc(state);
  const nonceDoc = await nonceRef.get();
  if (!nonceDoc.exists) {
    res.status(403).send("Invalid state parameter");
    return;
  }

  // Burn the nonce before validating it so it can never be replayed,
  // whatever the outcome below.
  await nonceRef.delete();

  const nonceData = nonceDoc.data() ?? {};
  const expiresAt = nonceData.expiresAt as Timestamp | undefined;

  // The nonce must still be fresh AND belong to the shop calling back,
  // otherwise a nonce issued for one store could authorize another.
  if (!expiresAt || expiresAt.toMillis() < Date.now()) {
    res.status(403).send("Expired state parameter");
    return;
  }
  if (nonceData.shop !== shop) {
    res.status(403).send("State parameter does not match shop");
    return;
  }

  // Exchange code for access token
  try {
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: config.apiKey,
          client_secret: config.apiSecret,
          code,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange failed:", errorText);
      res.status(500).send("Token exchange failed");
      return;
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      scope: string;
    };

    // Store session in Firestore
    await db
      .collection("shopSessions")
      .doc(shop)
      .set({
        shop,
        accessToken: tokenData.access_token,
        scope: tokenData.scope,
        installedAt: new Date().toISOString(),
      });

    console.log(`App installed for shop: ${shop}`);
    res.redirect(`https://${shop}/admin/apps/${config.apiKey}`);
  } catch (err: any) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth error");
  }
}

// Helper: get stored access token for a shop
export async function getAccessToken(shop: string): Promise<string | null> {
  const doc = await db.collection("shopSessions").doc(shop).get();
  if (!doc.exists) return null;
  return doc.data()?.accessToken || null;
}
