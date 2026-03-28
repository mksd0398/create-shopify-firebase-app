const { Router } = require("express");
const crypto = require("crypto");
const { getConfig } = require("./config");

const proxyRouter = Router();

// ─── Verify Shopify App Proxy Signature ──────────────────────────────────
// Docs: https://shopify.dev/docs/apps/build/online-store/app-proxies
function verifyProxySignature(query) {
  const config = getConfig();
  const signature = query.signature;
  if (!signature) return false;

  const params = { ...query };
  delete params.signature;

  // App proxy concatenates without & (different from OAuth HMAC)
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("");

  const generated = crypto
    .createHmac("sha256", config.apiSecret)
    .update(message)
    .digest("hex");

  const sigBuffer = Buffer.from(signature);
  const genBuffer = Buffer.from(generated);
  if (sigBuffer.length !== genBuffer.length) return false;
  return crypto.timingSafeEqual(genBuffer, sigBuffer);
}

// ─── Example storefront endpoint ─────────────────────────────────────────
// Accessible at: https://your-store.myshopify.com/apps/{subpath}/hello
proxyRouter.get("/hello", (req, res) => {
  if (!verifyProxySignature(req.query)) {
    res.status(403).json({ error: "Invalid signature" });
    return;
  }

  const shop = req.query.shop;
  res.json({ message: `Hello from the app proxy! Shop: ${shop}` });
});

// ──────────────────────────────────────────────────────────────────────────
// HOW TO ADD A NEW PROXY ROUTE:
//
//   proxyRouter.get("/my-route", (req, res) => {
//     if (!verifyProxySignature(req.query)) {
//       return res.status(403).json({ error: "Invalid signature" });
//     }
//     res.json({ hello: "storefront" });
//   });
//
// Enable App Proxy in shopify.app.toml (uncomment the [app_proxy] section).
// Deploy: firebase deploy --only functions:proxy
// ──────────────────────────────────────────────────────────────────────────

module.exports = { proxyRouter };
