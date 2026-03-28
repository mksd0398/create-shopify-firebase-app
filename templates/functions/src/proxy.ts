import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getConfig } from "./config";

export const proxyRouter = Router();

// ─── Verify Shopify App Proxy Signature ──────────────────────────────────
// Docs: https://shopify.dev/docs/apps/build/online-store/app-proxies
function verifyProxySignature(query: Record<string, any>): boolean {
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
proxyRouter.get("/hello", (req: Request, res: Response) => {
  if (!verifyProxySignature(req.query as Record<string, any>)) {
    res.status(403).json({ error: "Invalid signature" });
    return;
  }

  const shop = req.query.shop as string;
  res.json({ message: `Hello from the app proxy! Shop: ${shop}` });
});

// ──────────────────────────────────────────────────────────────────────────
// Add storefront-facing routes below.
// Always verify the proxy signature first.
// Enable App Proxy in shopify.app.toml.
// ──────────────────────────────────────────────────────────────────────────
