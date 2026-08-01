const crypto = require("crypto");
const { getConfig } = require("./config");
const { db } = require("./firebase");

// Shop domains are always <handle>.myshopify.com. Anything else is rejected —
// the value ends up in a redirect Location header and in Firestore doc IDs,
// so an unvalidated `shop` is an open redirect.
const SHOP_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

// The state nonce is 16 random bytes hex-encoded (see handleStart).
const NONCE_PATTERN = /^[a-f0-9]{32}$/;

function isValidShopDomain(shop) {
  return typeof shop === "string" && SHOP_DOMAIN_PATTERN.test(shop);
}

/**
 * Standalone OAuth handler — no Express, no middleware overhead.
 *
 * Routes:
 *   GET /auth           -> Start OAuth (redirect to Shopify consent screen)
 *   GET /auth/callback  -> Handle callback (exchange code, store session)
 */
async function authHandler(req, res) {
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
// Merchant clicks "Install" -> redirect to Shopify consent screen.
async function handleStart(req, res) {
  const { shop } = req.query;
  if (!isValidShopDomain(shop)) {
    res.status(400).send("Invalid shop parameter");
    return;
  }

  const config = getConfig();
  const nonce = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${config.appUrl}/auth/callback`;

  // Store nonce for CSRF protection. Must be awaited — Cloud Functions may
  // freeze the instance once the response is sent, dropping in-flight writes.
  try {
    await db.collection("authNonces").doc(nonce).set({
      shop,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to store auth nonce:", err);
    res.status(500).send("Failed to start OAuth");
    return;
  }

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
async function handleCallback(req, res) {
  const { shop, code, hmac, state } = req.query;

  if (!shop || !code || !hmac) {
    res.status(400).send("Missing required parameters");
    return;
  }

  if (!isValidShopDomain(shop)) {
    res.status(400).send("Invalid shop parameter");
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

  const hmacBuffer = Buffer.from(hmac);
  const generatedBuffer = Buffer.from(generatedHmac);
  if (
    hmacBuffer.length !== generatedBuffer.length ||
    !crypto.timingSafeEqual(generatedBuffer, hmacBuffer)
  ) {
    res.status(403).send("HMAC verification failed");
    return;
  }

  // Verify and consume the CSRF nonce. A missing or unknown state means this
  // callback did not come from a flow we started, so it must be rejected.
  if (typeof state !== "string" || !NONCE_PATTERN.test(state)) {
    res.status(403).send("Missing or malformed state parameter");
    return;
  }

  const nonceDoc = await db.collection("authNonces").doc(state).get();
  if (!nonceDoc.exists || nonceDoc.data()?.shop !== shop) {
    res.status(403).send("Invalid state parameter");
    return;
  }
  await nonceDoc.ref.delete();

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

    const tokenData = await tokenResponse.json();

    // Offline tokens (shpat_) do not expire; online ones (expires_in set) do.
    // Record the expiry so a stale token is treated as "not installed" and the
    // merchant is sent back through OAuth, instead of hitting confusing 401s
    // from the Admin API.
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    if (expiresAt) {
      console.warn(
        `Received an online access token for ${shop} (expires ${expiresAt}). ` +
          "Offline tokens are expected for background work.",
      );
    }

    // Store session in Firestore
    await db
      .collection("shopSessions")
      .doc(shop)
      .set({
        shop,
        accessToken: tokenData.access_token,
        scope: tokenData.scope,
        expiresAt,
        isOnline: !!tokenData.associated_user,
        installedAt: new Date().toISOString(),
      });

    console.log(`App installed for shop: ${shop}`);
    res.redirect(`https://${shop}/admin/apps/${config.apiKey}`);
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth error");
  }
}

// Helper: get stored access token for a shop
async function getAccessToken(shop) {
  const doc = await db.collection("shopSessions").doc(shop).get();
  if (!doc.exists) return null;

  const data = doc.data();

  // An expired online token is worse than no token: it produces 401s from
  // Shopify rather than a clean "reinstall me" signal.
  if (data?.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()) {
    console.warn(`Access token for ${shop} expired at ${data.expiresAt}`);
    return null;
  }

  return data?.accessToken || null;
}

module.exports = { authHandler, getAccessToken };
