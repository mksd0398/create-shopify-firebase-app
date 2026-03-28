#!/usr/bin/env node

/**
 * create-shopify-firebase-app
 *
 * Usage:
 *   npx create-shopify-firebase-app my-app
 *   npm create shopify-firebase-app my-app
 *   npx create-shopify-firebase-app          (interactive)
 */

import { run } from "../lib/index.js";

run(process.argv.slice(2)).catch((err) => {
  console.error("\n\x1b[31mError:\x1b[0m", err.message);
  process.exit(1);
});
