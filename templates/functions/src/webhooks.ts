import crypto from "crypto";
import { getConfig } from "./config";
import { db } from "./firebase";
import type { Request } from "firebase-functions/v2/https";

// ─── Verify Shopify Webhook HMAC ─────────────────────────────────────────
function verifyWebhookHmac(rawBody: Buffer, hmacHeader: string): boolean {
  const config = getConfig();
  const hash = crypto
    .createHmac("sha256", config.apiSecret)
    .update(rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

/**
 * Standalone webhook handler — no Express, no middleware.
 *
 * Why standalone? Webhooks must respond 200 within 5 seconds.
 * Skipping Express middleware means faster cold starts and less overhead.
 * Uses req.rawBody (provided natively by Firebase v2) for HMAC verification.
 */
export async function webhookHandler(req: Request, res: any): Promise<void> {
  // Only accept POST
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const hmac = req.headers["x-shopify-hmac-sha256"] as string;
  const topic = req.headers["x-shopify-topic"] as string;
  const shop = req.headers["x-shopify-shop-domain"] as string;

  // Verify HMAC using rawBody (Buffer, provided by Firebase v2)
  if (req.rawBody && hmac && !verifyWebhookHmac(req.rawBody, hmac)) {
    console.error("Webhook HMAC verification failed");
    res.status(401).send("Unauthorized");
    return;
  }

  console.log(`Webhook: ${topic} from ${shop}`);

  // Parse body
  let body: any = {};
  try {
    body = JSON.parse(req.rawBody?.toString("utf8") || "{}");
  } catch {
    // Non-JSON webhook payloads are rare but valid
  }

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

  // Always respond 200 quickly — do heavy work asynchronously
  res.status(200).send("OK");
}

// ──────────────────────────────────────────────────────────────────────────
// HOW TO ADD A NEW WEBHOOK HANDLER:
//
//   1. Register the topic in shopify.app.toml:
//      [[webhooks.subscriptions]]
//      topics = [ "orders/create" ]
//      uri = "{{APP_URL}}/webhooks"
//
//   2. Add a case to the switch above:
//      case "orders/create": {
//        const order = body;
//        // Your logic here
//        break;
//      }
//
//   3. Deploy: firebase deploy --only functions:webhooks
// ──────────────────────────────────────────────────────────────────────────
