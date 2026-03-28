# create-shopify-firebase-app

> Create Shopify apps powered by Firebase. One command. Zero framework. Fully serverless.

[![npm version](https://img.shields.io/npm/v/create-shopify-firebase-app.svg)](https://www.npmjs.com/package/create-shopify-firebase-app)
[![Downloads](https://img.shields.io/npm/dm/create-shopify-firebase-app.svg)](https://www.npmjs.com/package/create-shopify-firebase-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

```bash
npx create-shopify-firebase-app my-app
```

<p align="center">
  <img src="https://img.shields.io/badge/Shopify-App-7AB55C?logo=shopify&logoColor=white" />
  <img src="https://img.shields.io/badge/Firebase-Backend-FFCA28?logo=firebase&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-Functions-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-Server-000000?logo=express&logoColor=white" />
</p>

---

## What is this?

The **Firebase alternative** to `shopify app init`. Instead of Remix + Prisma + Vercel, you get:

- **Firebase Cloud Functions** (Express + TypeScript) for your backend
- **Cloud Firestore** for sessions and app data (auto-scaling, free tier)
- **Firebase Hosting** for your embedded admin dashboard (free)
- **Vanilla HTML/JS + App Bridge** for the frontend (no React, no build step)
- **Theme App Extension** for storefront UI (works on all Shopify plans)
- **Production-ready** OAuth, session tokens, webhooks, GDPR handlers — all included

One `npx` command scaffolds everything, installs dependencies, wires up Firebase, and initializes git. You're ready to `firebase deploy`.

---

## Quick Start

### Prerequisites

| Tool | Install |
|------|---------|
| Node.js 18+ | [nodejs.org](https://nodejs.org/) |
| Firebase CLI | `npm i -g firebase-tools` |
| Shopify CLI *(optional)* | `npm i -g @shopify/cli` |

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

## Why Firebase instead of Remix?

| | `shopify app init` (Remix) | `create-shopify-firebase-app` |
|---|---|---|
| **Backend** | Remix server | Firebase Cloud Functions (Express) |
| **Database** | Prisma + PostgreSQL | Cloud Firestore (NoSQL, auto-scaling) |
| **Frontend** | React + Polaris | Vanilla HTML/JS + App Bridge |
| **Hosting** | Vercel / Fly.io / Heroku | Firebase Hosting (free tier) |
| **Auth** | `@shopify/shopify-app-remix` | Manual OAuth (140 lines, you own it) |
| **Build** | Webpack / Vite | `tsc` (TypeScript compiler, no bundler) |
| **Deploy** | Varies | `firebase deploy` (one command) |
| **Cost** | $5-25/month hosting | Free tier covers most apps |
| **Framework knowledge** | Remix + React required | Express + HTML (that's it) |
| **Backend code** | ~2000+ lines (framework) | ~350 lines (you own all of it) |
| **GDPR webhooks** | Auto-handled | Included (ready for App Store) |
| **Theme extensions** | Supported | Supported (same Shopify format) |
| **Shopify Functions** | Supported | Supported (add via Shopify CLI) |

### When to use this

- Custom apps for a single merchant
- Public apps with simple admin UIs
- Teams already using Firebase / Google Cloud
- You want to understand every line of your app
- You want free/cheap serverless hosting

### When to use Remix instead

- Complex multi-page admin UIs with Polaris React components
- Large team already invested in the Remix ecosystem
- You need server-side rendering for your app pages

---

## What's Inside

```
my-app/
├── shopify.app.toml              # Shopify app config
├── firebase.json                 # Firebase Hosting + Functions + Firestore
├── firestore.rules               # Security rules (blocks direct client access)
│
├── functions/                    # ── Backend ──
│   ├── src/
│   │   ├── index.ts              # Express app + Cloud Function export
│   │   ├── auth.ts               # OAuth 2.0 (install + callback + token storage)
│   │   ├── verify-token.ts       # App Bridge JWT session token middleware
│   │   ├── admin-api.ts          # Your admin dashboard API routes
│   │   ├── proxy.ts              # Storefront-facing App Proxy routes
│   │   ├── webhooks.ts           # Webhook handlers (uninstall + GDPR)
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

```
  Shopify Admin (iframe)
  ┌─────────────────────────────────────┐
  │  Firebase Hosting (HTML/JS)         │
  │  + App Bridge (session tokens)      │
  └──────────────┬──────────────────────┘
                 │ Bearer <JWT>
                 ▼
  Firebase Cloud Functions (Express)
  ┌─────────────────────────────────────┐
  │  /auth      → OAuth 2.0 flow       │
  │  /api/*     → Admin API (JWT auth)  │
  │  /proxy/*   → App Proxy (HMAC)      │
  │  /webhooks  → Webhooks (HMAC)       │
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
firebase deploy              # Everything
firebase deploy --only functions   # Backend only
firebase deploy --only hosting     # Frontend only
```

---

## Extending Your App

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
  const order = req.body;
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

---

## Firebase Free Tier

The Spark (free) plan covers most Shopify apps:

| Resource | Free Limit |
|----------|-----------|
| Cloud Functions | 2M invocations/month |
| Firestore reads | 50K/day |
| Firestore writes | 20K/day |
| Hosting storage | 10 GB |
| Hosting transfer | 360 MB/day |

Need more? The Blaze plan (pay-as-you-go) costs most apps **under $5/month**.

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
| Functions not receiving requests | Check `firebase.json` rewrites and run `firebase functions:list` |
| Webhook failures | Must respond 200 within 5 seconds. Check `firebase functions:log` |

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
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions) — Backend runtime
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
