import { Router, Request, Response } from "express";
import fetch from "node-fetch";
import { verifySessionToken } from "./verify-token";
import { getAccessToken } from "./auth";

export const adminApiRouter = Router();

// All admin routes require session token verification
adminApiRouter.use(verifySessionToken);

// ─── Get shop info ───────────────────────────────────────────────────────
adminApiRouter.get("/shop", async (req: Request, res: Response) => {
  const shop = (req as any).shopDomain;
  const accessToken = await getAccessToken(shop);

  if (!accessToken) {
    res.status(401).json({ error: "Shop not authenticated" });
    return;
  }

  try {
    const response = await fetch(
      `https://${shop}/admin/api/2025-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: `{ shop { name email myshopifyDomain plan { displayName } } }`,
        }),
      },
    );

    const data = (await response.json()) as any;
    res.json({ shop: data.data?.shop });
  } catch (err: any) {
    console.error("Shop info error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Search products (example) ───────────────────────────────────────────
adminApiRouter.get("/products/search", async (req: Request, res: Response) => {
  const shop = (req as any).shopDomain;
  const query = (req.query.q as string) || "";
  const accessToken = await getAccessToken(shop);

  if (!accessToken) {
    res.status(401).json({ error: "Shop not authenticated" });
    return;
  }

  try {
    const response = await fetch(
      `https://${shop}/admin/api/2025-04/graphql.json`,
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

    const data = (await response.json()) as any;
    const products = (data.data?.products?.edges || []).map((edge: any) => ({
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
  } catch (err: any) {
    console.error("Product search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// Add your admin API routes below.
// All routes are protected by session token verification.
//
//   const shop = (req as any).shopDomain;
//   const accessToken = await getAccessToken(shop);
// ──────────────────────────────────────────────────────────────────────────
