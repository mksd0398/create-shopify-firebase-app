// Centralized config from environment variables.
// Firebase Functions auto-loads .env files from the functions/ directory.
// Docs: https://firebase.google.com/docs/functions/config-env

export function getConfig() {
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    apiSecret: process.env.SHOPIFY_API_SECRET || "",
    scopes: process.env.SCOPES || "read_products",
    appUrl: process.env.APP_URL || "",
  };
}
