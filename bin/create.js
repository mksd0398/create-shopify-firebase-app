#!/usr/bin/env node

/**
 * nitrogen
 *
 * Usage:
 *   npm create nitrogen my-app
 *   npm create shopify-firebase-app my-app
 *   npm create nitrogen               (interactive)
 */

import { run } from "../lib/index.js";

run(process.argv.slice(2)).catch((err) => {
  console.error("\n\x1b[31mError:\x1b[0m", err.message);
  process.exit(1);
});
