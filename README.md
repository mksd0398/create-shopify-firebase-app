# create-shopify-firebase-app

> Build and run Shopify apps for free. Pay nothing until you have real traffic. One command. Zero framework. Fully serverless.

[![npm version](https://img.shields.io/npm/v/create-shopify-firebase-app.svg)](https://www.npmjs.com/package/create-shopify-firebase-app)
[![Downloads](https://img.shields.io/npm/dm/create-shopify-firebase-app.svg)](https://www.npmjs.com/package/create-shopify-firebase-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

```bash
npx create-shopify-firebase-app my-app
```

<p align="center">
  <img src="https://img.shields.io/badge/Shopify-2026--01-7AB55C?logo=shopify&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-v2%20Functions-FFCA28?logo=firebase&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-Functions-3178C6?logo=typescript&logoColor=white" />
</p>

---

## What is this?

The **Firebase alternative** to `shopify app init`. Instead of Remix + Prisma + Vercel, you get:

- **Firebase v2 Cloud Functions** (gen 2) — 4 independent, auto-scaling TypeScript functions
- **Cloud Firestore** for sessions and app data (auto-scaling, free tier)
- **Firebase Hosting** for your embedded admin dashboard (free)
- **Vanilla HTML/JS + App Bridge** for the frontend (no React, no build step)
- **Theme App Extension** for storefront UI (works on all Shopify plans)
- **Shopify API 2026-01** (latest) — OAuth, session tokens, webhooks, GDPR handlers
- **Production-ready** — deploy with one command, scale to millions

One `npx` command scaffolds everything, installs dependencies, wires up Firebase, and initializes git. You're ready to `firebase deploy`.

---

## Quick Start

### Prerequisites

| Tool | Install | Auto-installed? |
|------|---------|----------------|
| Node.js 18+ | [nodejs.org](https://nodejs.org/) | Required |
| Firebase CLI | `npm i -g firebase-tools` | Yes, installed automatically if missing |
| Shopify CLI | `npm i -g @shopify/cli` | Yes, installed automatically if missing |

### 1. Create your Shopify app

Go to [partners.shopify.com](https://partners.shopify.com/) → **Apps** → **Create app** → **Create app manually**.
Copy the **Client ID** (API Key) and **Client Secret** (API Secret).

### 2. Create your Firebase project

Go to [console.firebase.google.com](https://console.firebase.google.com/) → **Add project**.
Enable **Cloud Firestore** (production mode). Note the **Project ID**.

### 3. Run the scaffold

```bash
npx create-shopify-firebase-app my-app
```

The interactive CLI asks for your credentials and does the rest:

```
  SHOPIFY + FIREBASE   Create a new Shopify app

  ✔ Project directory name: my-app
  ✔ App name: My App
  ✔ Shopify API Key: abc123...
  ✔ Shopify API Secret: ********
  ✔ API Scopes: read_products
  ✔ Firebase Project ID: my-app-12345

  [1/6] Scaffolding project...
  ✔ Created 27 files in my-app/

  [2/6] Installing dependencies...
  ✔ Dependencies installed

  [3/6] Building TypeScript...
  ✔ TypeScript compiled successfully

  [4/6] Setting up Firebase...
  ✔ Firebase project linked: my-app-12345

  [5/6] Checking Shopify CLI...
  ✔ Shopify CLI detected

  [6/6] Initializing git...
  ✔ Git repository initialized with first commit

  SUCCESS   Your Shopify + Firebase app is ready!

  Next steps:

    cd my-app
    firebase deploy
```

### 4. Deploy & Install

```bash
cd my-app
firebase deploy
```

Then install on your dev store by visiting:
```
https://my-app-12345.web.app/auth?shop=YOUR-STORE.myshopify.com
```

Or use Shopify CLI for local development:
```bash
shopify app dev
```

---

## Why Firebase?

**$0/month to run your Shopify app. No credit card. No server. No bill until you're big.**

Most Shopify app developers pay for hosting before they even have users. With Firebase, you deploy for free and only start paying when your app serves thousands of stores daily. Even at 50,000 installed stores, you're looking at ~$5/month. Try getting that from Vercel or Heroku.

| | `shopify app init` (Remix) | `create-shopify-firebase-app` |
|---|---|---|
| **Backend** | Remix server (monolith) | Firebase v2 Cloud Functions (4 independent functions) |
| **Database** | Prisma + PostgreSQL | Cloud Firestore (NoSQL, auto-scaling) |
| **Frontend** | React + Polaris | Vanilla HTML/JS + App Bridge |
| **Hosting** | Vercel / Fly.io / Heroku | Firebase Hosting (free tier) |
| **Auth** | `@shopify/shopify-app-remix` | Manual OAuth (140 lines, you own it) |
| **Build** | Webpack / Vite | `tsc` (TypeScript compiler, no bundler) |
| **Deploy** | Varies | `firebase deploy` (one command) |
| **Cost** | $5-25/month from day one | **$0/month** — free until you scale |
| **Framework knowledge** | Remix + React required | Express + HTML (that's it) |
| **Scaling** | Single server | Per-function auto-scaling (Cloud Run) |
| **GDPR webhooks** | Auto-handled | Included (ready for App Store) |
| **Theme extensions** | Supported | Supported (same Shopify format) |
| **Shopify Functions** | Supported | Supported (add via Shopify CLI) |

### When to use this

- You want to **launch for free** and only pay when your app takes off
- Custom apps for a single merchant
- Public apps with simple admin UIs
- Teams already using Firebase / Google Cloud
- You want to understand every line of your app

### When to use Remix instead

- Complex multi-page admin UIs with Polaris React components
- Large team already invested in the Remix ecosystem
- You need server-side rendering for your app pages

---

## What's Inside

```
my-app/
├── shopify.app.toml              # Shopify app config (API 2026-01)
├── firebase.json                 # Firebase Hosting + Functions + Firestore
├── firestore.rules               # Security rules (blocks direct client access)
│
├── functions/                    # ── Backend (4 Cloud Functions) ──
│   ├── src/
│   │   ├── index.ts              # Function exports (auth, api, webhooks, proxy)
│   │   ├── auth.ts               # OAuth 2.0 (standalone — no Express)
│   │   ├── verify-token.ts       # App Bridge JWT session token middleware
│   │   ├── admin-api.ts          # Admin dashboard API routes (Express)
│   │   ├── proxy.ts              # Storefront App Proxy routes (Express)
│   │   ├── webhooks.ts           # Webhook handlers (standalone — no Express)
│   │   ├── firebase.ts           # Firebase Admin SDK init
│   │   └── config.ts             # Environment config
│   └── .env                      # Your secrets (auto-generated, git-ignored)
│
├── web/                          # ── Frontend ──
│   ├── index.html                # Embedded admin dashboard
│   ├── js/bridge.js              # App Bridge helper (auth, fetch, navigate)
│   └── css/app.css               # Shopify-like styles
│
└── extensions/                   # ── Storefront ──
    └── theme-block/
        ├── blocks/app-block.liquid
        ├── assets/app-block.{js,css}
        └── locales/en.default.json
```

---

## Architecture

Each function scales independently on Cloud Run (Firebase v2 / gen 2):

```
  Shopify Admin (iframe)
  ┌─────────────────────────────────────┐
  │  Firebase Hosting (HTML/JS)         │
  │  + App Bridge (session tokens)      │
  └──────────────┬──────────────────────┘
                 │ Bearer <JWT>
                 ▼
  Firebase v2 Cloud Functions (independent scaling)
  ┌─────────────────────────────────────┐
  │  auth()      → OAuth 2.0 flow      │  (standalone, no Express)
  │  api()       → Admin API (JWT)      │  (Express + middleware)
  │  webhooks()  → Webhooks (HMAC)      │  (standalone, no Express)
  │  proxy()     → App Proxy (HMAC)     │  (Express)
  └──────────────┬──────────────────────┘
                 │
                 ▼
  Cloud Firestore
  ┌─────────────────────────────────────┐
  │  shopSessions  → OAuth tokens       │
  │  authNonces    → CSRF protection    │
  │  (your data)   → App-specific       │
  └─────────────────────────────────────┘
```

### Why split functions?

| Benefit | How |
|---------|-----|
| **Faster webhooks** | `webhooks()` has no Express overhead — responds in milliseconds |
| **Independent scaling** | Each function auto-scales based on its own traffic |
| **Targeted deploys** | `firebase deploy --only functions:api` deploys just one function |
| **Separate configs** | Each function gets its own memory, timeout, and concurrency |
| **Lower cold starts** | Smaller functions = faster cold starts |

### Three Security Layers

| Layer | Protects | How |
|-------|----------|-----|
| **OAuth 2.0** | App install | HMAC-verified code exchange → Firestore |
| **Session Token** | Admin API | App Bridge JWT (HS256) verified on every request |
| **HMAC Signature** | Proxy + Webhooks | SHA-256 timing-safe comparison |

---

## CLI Usage

```bash
# Interactive (recommended)
npx create-shopify-firebase-app

# With project name
npx create-shopify-firebase-app my-app

# Non-interactive (CI/CD)
npx create-shopify-firebase-app my-app \
  --api-key=abc123 \
  --api-secret=secret \
  --project-id=my-firebase-project \
  --scopes=read_products,write_products

# Help
npx create-shopify-firebase-app --help
```

---

## Development

### Local with Firebase Emulators

```bash
cd functions
npm run serve
# Functions → http://localhost:5001
# Firestore → http://localhost:8080
```

### Local with Shopify CLI

```bash
shopify app dev
# Creates tunnel + hot reload
```

### Deploy

```bash
firebase deploy                        # Everything
firebase deploy --only functions       # All functions
firebase deploy --only functions:auth  # Just auth function
firebase deploy --only functions:api   # Just API function
firebase deploy --only hosting         # Frontend only
```

---

## Extending Your App

### Add a new Cloud Function

This is the most common extension pattern. Create a new file, export a handler, and wire it up:

**1. Create `functions/src/my-feature.ts`:**

```typescript
import type { Request, Response } from "firebase-functions/v2/https";
import { db } from "./firebase";

export async function myFeatureHandler(req: Request, res: Response) {
  // Your logic here
  res.json({ success: true });
}
```

**2. Export it in `functions/src/index.ts`:**

```typescript
import { myFeatureHandler } from "./my-feature";

export const myFeature = onRequest(
  { memory: "256MiB", timeoutSeconds: 60 },
  myFeatureHandler,
);
```

**3. Add a rewrite in `firebase.json`:**

```json
{ "source": "/my-feature/**", "function": "myFeature" }
```

**4. Deploy just your function:**

```bash
firebase deploy --only functions:myFeature
```

### Add admin API routes

Edit `functions/src/admin-api.ts`:

```typescript
adminApiRouter.post("/my-endpoint", async (req, res) => {
  const shop = (req as any).shopDomain;
  const token = await getAccessToken(shop);
  // Call Shopify Admin API, write to Firestore, etc.
  res.json({ success: true });
});
```

### Add storefront routes (App Proxy)

Edit `functions/src/proxy.ts` and enable `[app_proxy]` in `shopify.app.toml`:

```typescript
proxyRouter.get("/my-route", (req, res) => {
  if (!verifyProxySignature(req.query)) return res.status(403).json({ error: "Invalid" });
  res.json({ hello: "storefront" });
});
```

### Add webhook handlers

Edit `functions/src/webhooks.ts` and register in `shopify.app.toml`:

```typescript
case "orders/create": {
  const order = body;
  // Your logic
  break;
}
```

### Add Firestore collections

```typescript
import { db } from "./firebase";
await db.collection("myData").doc("id").set({ key: "value" });
```

### Add frontend pages

Create `web/settings.html`, use the same pattern, navigate with `App.navigate("/settings.html")`.

### Add Shopify billing

Use the `appSubscriptionCreate` GraphQL mutation in your admin API routes.

### Add a scheduled function (cron)

```typescript
// functions/src/cleanup.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "./firebase";

export const dailyCleanup = onSchedule("every 24 hours", async () => {
  // Clean up expired nonces, old data, etc.
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const old = await db.collection("authNonces")
    .where("createdAt", "<", cutoff.toISOString()).get();
  for (const doc of old.docs) await doc.ref.delete();
});
```

Export it in `index.ts`:
```typescript
export { dailyCleanup } from "./cleanup";
```

---

## How Many Stores Can You Run for Free?

Firebase's free tier is generous. Here's what it actually means for a Shopify app:

### Per-store usage (typical Shopify app)

| Action | Function calls | Firestore reads | Firestore writes |
|--------|---------------|-----------------|------------------|
| Merchant opens admin dashboard | 5 | 5 | 0 |
| Webhooks (orders, inventory) | 5 | 5 | 2 |
| **Total per active store/day** | **~10** | **~10** | **~2** |

### Free tier capacity

| Firebase Resource | Free Limit | Stores Supported |
|-------------------|-----------|-----------------|
| Cloud Functions | 2M invocations/month (~66K/day) | **~6,600 daily active stores** |
| Firestore reads | 50K/day | **~5,000 daily active stores** |
| Firestore writes | 20K/day | **~10,000 daily active stores** |
| Hosting bandwidth | 360 MB/day | **~7,000 page loads/day** (CDN-cached after first load) |

**Bottleneck: Firestore reads at ~5,000 daily active stores.**

Not every installed merchant opens your app daily. With a typical 20% daily active rate:

> **Free tier supports ~25,000 installed stores** with normal usage patterns. That's $0/month.

### When you outgrow free (Blaze pay-as-you-go)

| Installed Stores | Daily Active | Monthly Cost |
|-----------------|-------------|-------------|
| 1 - 25,000 | up to 5,000 | **$0 (free)** |
| 50,000 | ~10,000 | **~$5/month** |
| 100,000 | ~20,000 | **~$15/month** |
| 500,000 | ~100,000 | **~$80/month** |

Compare that to Vercel/Heroku at **$25-100/month from day one**, before you even have your first user.

No credit card required to start. No server to manage. No bill until you're successful.

---

## GDPR Compliance

All three mandatory GDPR webhooks are included and handled:

| Webhook | Purpose | Status |
|---------|---------|--------|
| `customers/data_request` | Export customer data | Handler included (add your logic) |
| `customers/redact` | Delete customer data | Handler included (add your logic) |
| `shop/redact` | Delete all shop data | Handler included (add your logic) |

These are **required** for Shopify App Store listing.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Missing shop parameter" | Set **App URL** in Partner Dashboard to `https://PROJECT_ID.web.app` |
| "HMAC verification failed" | Check `SHOPIFY_API_SECRET` in `functions/.env` |
| "Invalid session token" | Verify `data-api-key` in `web/index.html` matches your API key |
| Functions not receiving requests | Check `firebase.json` rewrites match function export names in `index.ts` |
| Webhook failures | Must respond 200 within 5 seconds. Check `firebase functions:log` |
| Individual function not deploying | Ensure export name in `index.ts` matches function name in `firebase.json` rewrite |

---

## Contributing

Contributions welcome! Please open an issue or PR.

```bash
git clone https://github.com/mksd0398/create-shopify-firebase-app.git
cd create-shopify-firebase-app
npm install
npm link  # Test locally: create-shopify-firebase-app test-app
```

---

## Related

- [Shopify App Development](https://shopify.dev/docs/apps) — Official docs
- [Firebase v2 Cloud Functions](https://firebase.google.com/docs/functions) — Backend runtime (gen 2)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge) — Embedded app SDK
- [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql) — Store data API
- [Theme App Extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions) — Storefront blocks

---

## License

MIT

---

<p align="center">
  <strong>Build Shopify apps with Firebase — serverless, lightweight, and fully yours.</strong><br/>
  <sub>An alternative to the official Remix template for developers who want simplicity and control.</sub>
</p>
