const crypto = require("crypto");
const { getConfig } = require("./config");
const { db } = require("./firebase");

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
    handleStart(req, res);
  }
}

// ─── Step 1: Start OAuth ─────────────────────────────────────────────────
// Merchant clicks "Install" -> redirect to Shopify consent screen.
function handleStart(req, res) {
  const { shop } = req.query;
  if (!shop || typeof shop !== "string") {
    res.status(400).send("Missing shop parameter");
    return;
  }

  const config = getConfig();
  const nonce = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${config.appUrl}/auth/callback`;

  // Store nonce for CSRF protection
  db.collection("authNonces").doc(nonce).set({
    shop,
    createdAt: new Date().toISOString(),
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
async function handleCallback(req, res) {
  const { shop, code, hmac, state } = req.query;

  if (!shop || !code || !hmac) {
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

  const hmacBuffer = Buffer.from(hmac);
  const generatedBuffer = Buffer.from(generatedHmac);
  if (
    hmacBuffer.length !== generatedBuffer.length ||
    !crypto.timingSafeEqual(generatedBuffer, hmacBuffer)
  ) {
    res.status(403).send("HMAC verification failed");
    return;
  }

  // Clean up nonce
  if (state) {
    const nonceDoc = await db.collection("authNonces").doc(state).get();
    if (nonceDoc.exists) await nonceDoc.ref.delete();
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

    const tokenData = await tokenResponse.json();

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
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth error");
  }
}

// Helper: get stored access token for a shop
async function getAccessToken(shop) {
  const doc = await db.collection("shopSessions").doc(shop).get();
  if (!doc.exists) return null;
  return doc.data()?.accessToken || null;
}

module.exports = { authHandler, getAccessToken };
