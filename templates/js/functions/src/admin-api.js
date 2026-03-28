const { Router } = require("express");
const { verifySessionToken } = require("./verify-token");
const { getAccessToken } = require("./auth");
const { db } = require("./firebase");

const adminApiRouter = Router();

// All admin routes require session token verification
adminApiRouter.use(verifySessionToken);

// Shopify API version — update when Shopify releases new versions
// Docs: https://shopify.dev/docs/api/usage/versioning
const API_VERSION = "2026-01";

// Default app settings — returned when no settings are saved yet
const DEFAULT_SETTINGS = {
  greeting: "Welcome to our app!",
  theme: "auto",
  notifications: true,
  customCss: "",
};

// ─── Get shop info ───────────────────────────────────────────────────────
adminApiRouter.get("/shop", async (req, res) => {
  const shop = req.shopDomain;
  const accessToken = await getAccessToken(shop);

  if (!accessToken) {
    res.status(401).json({ error: "Shop not authenticated" });
    return;
  }

  try {
    const response = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: `{
            shop {
              name
              email
              myshopifyDomain
              url
              primaryDomain { url host }
              plan { displayName partnerDevelopment shopifyPlus }
              currencyCode
              ianaTimezone
              billingAddress { country countryCodeV2 }
              productCount: productsCount { count }
            }
          }`,
        }),
      },
    );

    const data = await response.json();
    res.json({ shop: data.data?.shop });
  } catch (err) {
    console.error("Shop info error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Search products ────────────────────────────────────────────────────
// NOTE: This route MUST be defined before /products/:id so Express
// doesn't match "search" as a product ID.
adminApiRouter.get("/products/search", async (req, res) => {
  const shop = req.shopDomain;
  const query = req.query.q || "";
  const accessToken = await getAccessToken(shop);

  if (!accessToken) {
    res.status(401).json({ error: "Shop not authenticated" });
    return;
  }

  try {
    const response = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: `
            query SearchProducts($query: String!) {
              products(first: 10, query: $query) {
                edges {
                  node {
                    id
                    title
                    handle
                    status
                    featuredImage { url }
                    variants(first: 1) {
                      edges { node { id price } }
                    }
                    priceRangeV2 {
                      minVariantPrice { amount currencyCode }
                    }
                  }
                }
              }
            }
          `,
          variables: { query },
        }),
      },
    );

    const data = await response.json();
    const products = (data.data?.products?.edges || []).map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      status: edge.node.status,
      image: edge.node.featuredImage?.url || null,
      variantId: edge.node.variants.edges[0]?.node.id || null,
      price: edge.node.priceRangeV2?.minVariantPrice?.amount,
      currency: edge.node.priceRangeV2?.minVariantPrice?.currencyCode,
    }));

    res.json({ products });
  } catch (err) {
    console.error("Product search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get product detail ─────────────────────────────────────────────────
adminApiRouter.get("/products/:id", async (req, res) => {
  const shop = req.shopDomain;
  const accessToken = await getAccessToken(shop);

  if (!accessToken) {
    res.status(401).json({ error: "Shop not authenticated" });
    return;
  }

  const productId = req.params.id;
  // Support both raw numeric IDs and full GID format
  const gid = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  try {
    const response = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: `
            query GetProduct($id: ID!) {
              product(id: $id) {
                id
                title
                handle
                description
                status
                vendor
                productType
                tags
                totalInventory
                priceRangeV2 {
                  maxVariantPrice { amount currencyCode }
                  minVariantPrice { amount currencyCode }
                }
                featuredImage { url altText }
                images(first: 5) {
                  edges { node { url altText } }
                }
                variants(first: 20) {
                  edges {
                    node {
                      id
                      title
                      price
                      sku
                      inventoryQuantity
                      selectedOptions { name value }
                    }
                  }
                }
              }
            }
          `,
          variables: { id: gid },
        }),
      },
    );

    const data = await response.json();
    const product = data.data?.product;

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json({ product });
  } catch (err) {
    console.error("Product detail error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get app settings ───────────────────────────────────────────────────
adminApiRouter.get("/settings", async (req, res) => {
  const shop = req.shopDomain;

  try {
    const doc = await db.collection("appSettings").doc(shop).get();

    if (!doc.exists) {
      res.json({ settings: { ...DEFAULT_SETTINGS } });
      return;
    }

    // Merge with defaults so new keys are always present
    res.json({ settings: { ...DEFAULT_SETTINGS, ...doc.data() } });
  } catch (err) {
    console.error("Get settings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Save app settings ──────────────────────────────────────────────────
adminApiRouter.post("/settings", async (req, res) => {
  const shop = req.shopDomain;
  const body = req.body;

  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  // Only allow known setting keys
  const allowedKeys = Object.keys(DEFAULT_SETTINGS);
  const settings = {};

  for (const key of allowedKeys) {
    if (key in body) {
      settings[key] = body[key];
    }
  }

  if (Object.keys(settings).length === 0) {
    res.status(400).json({
      error: "No valid settings provided",
      allowedKeys,
    });
    return;
  }

  try {
    await db.collection("appSettings").doc(shop).set(settings, { merge: true });

    // Return the full merged settings
    const doc = await db.collection("appSettings").doc(shop).get();
    res.json({ settings: { ...DEFAULT_SETTINGS, ...doc.data() } });
  } catch (err) {
    console.error("Save settings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// HOW TO ADD A NEW ADMIN API ROUTE:
//
//   adminApiRouter.post("/my-endpoint", async (req, res) => {
//     const shop = req.shopDomain;
//     const accessToken = await getAccessToken(shop);
//     // Call Shopify Admin API, write to Firestore, etc.
//     res.json({ success: true });
//   });
//
// All routes are automatically protected by JWT session token verification.
// Deploy: firebase deploy --only functions:api
// ──────────────────────────────────────────────────────────────────────────

module.exports = { adminApiRouter };
