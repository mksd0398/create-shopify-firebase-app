import { Router, Request, Response } from "express";
import crypto from "crypto";
import { getConfig } from "./config";
import { db } from "./firebase";

export const webhookRouter = Router();

// ─── Verify Shopify Webhook HMAC ─────────────────────────────────────────
function verifyWebhookHmac(rawBody: string, hmacHeader: string): boolean {
  const config = getConfig();
  const hash = crypto
    .createHmac("sha256", config.apiSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// ─── Webhook Handler ─────────────────────────────────────────────────────
// All topics route to this single POST endpoint.
// Topic is identified via X-Shopify-Topic header.
// IMPORTANT: Respond 200 within 5 seconds. Do heavy work async.
webhookRouter.post("/", async (req: Request, res: Response) => {
  const hmac = req.headers["x-shopify-hmac-sha256"] as string;
  const topic = req.headers["x-shopify-topic"] as string;
  const shop = req.headers["x-shopify-shop-domain"] as string;

  // Verify HMAC
  const rawBody = (req as any).rawBody;
  if (rawBody && hmac && !verifyWebhookHmac(rawBody, hmac)) {
    console.error("Webhook HMAC verification failed");
    res.status(401).send("Unauthorized");
    return;
  }

  console.log(`Webhook: ${topic} from ${shop}`);

  switch (topic) {
    // ── App lifecycle ──────────────────────────────────────────────────
    case "app/uninstalled": {
      await db.collection("shopSessions").doc(shop).delete();
      console.log(`Session cleaned up for ${shop}`);
      break;
    }

    // ── GDPR mandatory webhooks (required for App Store) ───────────────
    case "customers/data_request": {
      // Customer requested their data. Export within 30 days if you store any.
      console.log(`Customer data request: ${shop}`);
      // TODO: implement if you store customer data
      break;
    }

    case "customers/redact": {
      // Customer requested deletion. Delete within 30 days.
      console.log(`Customer redact: ${shop}`);
      // TODO: implement if you store customer data
      break;
    }

    case "shop/redact": {
      // 48h after uninstall. Delete ALL shop data.
      console.log(`Shop redact: ${shop}`);
      // TODO: delete all data for this shop from Firestore
      break;
    }

    default:
      console.log(`Unhandled webhook: ${topic}`);
  }

  res.status(200).send("OK");
});
