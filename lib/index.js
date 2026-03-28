/**
 * create-shopify-firebase-app — CLI core
 *
 * Orchestrates the entire scaffolding flow:
 * 1. Collect project config (interactive prompts or CLI args)
 * 2. Scaffold files from templates
 * 3. Install dependencies
 * 4. Wire up Firebase + Shopify
 * 5. Initialize git
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawn } from "node:child_process";
import prompts from "prompts";
import { provisionFirebase } from "./provision.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

// ─── ANSI helpers (no chalk dependency) ──────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgCyan: "\x1b[46m",
};

const ok = (msg) => console.log(`  ${c.green}✔${c.reset} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);
const info = (msg) => console.log(`  ${c.cyan}ℹ${c.reset} ${msg}`);
const section = (title) => {
  console.log();
  console.log(`  ${c.cyan}===${c.reset} ${c.bold}${title}${c.reset} ${c.cyan}===${c.reset}`);
  console.log();
};

// ─── Check if a CLI tool is available ────────────────────────────────────
function hasCommand(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ─── Run a command with live output ──────────────────────────────────────
function exec(cmd, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stdout?.on("data", () => {}); // consume but don't print
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed: ${cmd}\n${stderr}`));
    });
  });
}

// ─── Parse CLI arguments ─────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  let projectName = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      args[key] = val ?? true;
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Single-dash flags: -h, -v
      for (const ch of arg.slice(1)) {
        args[ch] = true;
      }
    } else if (!projectName) {
      projectName = arg;
    }
  }

  return { projectName, ...args };
}

// ─── Open URL in browser (cross-platform) ───────────────────────────────
function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === "win32") execSync(`start "" "${url}"`, { stdio: "ignore" });
    else if (platform === "darwin") execSync(`open "${url}"`, { stdio: "ignore" });
    else execSync(`xdg-open "${url}"`, { stdio: "ignore" });
  } catch {
    info(`Open this URL in your browser: ${url}`);
  }
}

// ─── List Firebase projects ──────────────────────────────────────────────
function listFirebaseProjects() {
  try {
    const output = execSync("firebase projects:list --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const data = JSON.parse(output);
    if (data.status === "success" && Array.isArray(data.result)) {
      return data.result
        .filter((p) => p.projectId)
        .map((p) => ({
          projectId: p.projectId,
          displayName: p.displayName || p.projectId,
        }));
    }
  } catch {}
  return [];
}

// ─── Create Firebase project ─────────────────────────────────────────────
async function createFirebaseProject(projectId, displayName) {
  try {
    await exec(`firebase projects:create "${projectId}" --display-name "${displayName}"`);
    return true;
  } catch {
    return false;
  }
}

// ─── Interactive prompts ─────────────────────────────────────────────────
async function getConfig(args) {
  // Check if running non-interactively
  const isCI =
    args["api-key"] && args["api-secret"] && args["project-id"];

  if (isCI) {
    return {
      projectName: args.projectName || "my-shopify-app",
      appName: args["app-name"] || args.projectName || "My Shopify App",
      apiKey: args["api-key"],
      apiSecret: args["api-secret"],
      scopes: args.scopes || "read_products",
      projectId: args["project-id"],
      appUrl: `https://${args["project-id"]}.web.app`,
    };
  }

  const onCancel = () => {
    console.log("\n  Cancelled.\n");
    process.exit(0);
  };

  // ── Banner ────────────────────────────────────────────────────────
  console.log();
  console.log(`  ${c.green}${c.bold}🛍️  +  🔥${c.reset}  ${c.bold}create-shopify-firebase-app${c.reset}`);
  console.log(`  ${c.dim}Serverless Shopify apps — free until you scale${c.reset}`);

  // ═══════════════════════════════════════════════════════════════════
  section("App Configuration");

  let projectName = args.projectName;
  if (!projectName) {
    const res = await prompts({
      type: "text",
      name: "projectName",
      message: "Project directory name",
      initial: "my-shopify-app",
      validate: (v) => {
        if (!v.trim()) return "Required";
        if (/[^a-zA-Z0-9._-]/.test(v)) return "Use only letters, numbers, dots, hyphens, underscores";
        return true;
      },
    }, { onCancel });
    projectName = res.projectName;
  }

  const { appName } = await prompts({
    type: "text",
    name: "appName",
    message: "App name (shown in Shopify admin)",
    initial: projectName || "My Shopify App",
  }, { onCancel });

  const { appType } = await prompts({
    type: "select",
    name: "appType",
    message: "What kind of app are you building?",
    choices: [
      { title: "Public app — list on the Shopify App Store", value: "public" },
      { title: "Custom app — built for a single store", value: "custom" },
    ],
  }, { onCancel });

  // ═══════════════════════════════════════════════════════════════════
  section("Shopify Setup");

  const { shopifySetup } = await prompts({
    type: "select",
    name: "shopifySetup",
    message: "How would you like to connect your Shopify app?",
    choices: [
      { title: "Create a new app — we'll guide you through it", value: "create" },
      { title: "I already have an app — enter my credentials", value: "existing" },
    ],
  }, { onCancel });

  let apiKey, apiSecret;

  if (shopifySetup === "create") {
    console.log();
    info("Opening Shopify Partner Dashboard...");
    console.log();
    console.log(`  ${c.dim}Follow these steps:${c.reset}`);
    console.log();
    console.log(`    ${c.cyan}1.${c.reset} Sign in to your Partner account`);
    console.log(`    ${c.cyan}2.${c.reset} Go to ${c.bold}Apps${c.reset} → ${c.bold}Create app${c.reset} → ${c.bold}Create app manually${c.reset}`);
    console.log(`    ${c.cyan}3.${c.reset} Enter app name: ${c.cyan}${appName}${c.reset}`);
    console.log(`    ${c.cyan}4.${c.reset} Copy the ${c.bold}Client ID${c.reset} and ${c.bold}Client Secret${c.reset}`);
    console.log();
    openBrowser("https://partners.shopify.com");

    const creds = await prompts([
      {
        type: "text",
        name: "apiKey",
        message: `Paste your Client ID (API Key)`,
        validate: (v) => (v.trim() ? true : "Required — copy from the app you just created"),
      },
      {
        type: "password",
        name: "apiSecret",
        message: "Paste your Client Secret (API Secret)",
        validate: (v) => (v.trim() ? true : "Required"),
      },
    ], { onCancel });
    apiKey = creds.apiKey;
    apiSecret = creds.apiSecret;
  } else {
    const creds = await prompts([
      {
        type: "text",
        name: "apiKey",
        message: `Shopify API Key ${c.dim}(Client ID)${c.reset}`,
        validate: (v) => (v.trim() ? true : "Required"),
      },
      {
        type: "password",
        name: "apiSecret",
        message: "Shopify API Secret",
        validate: (v) => (v.trim() ? true : "Required"),
      },
    ], { onCancel });
    apiKey = creds.apiKey;
    apiSecret = creds.apiSecret;
  }

  // Scope presets (like Shopify CLI template selection)
  const { scopeChoice } = await prompts({
    type: "select",
    name: "scopeChoice",
    message: "What API access does your app need?",
    choices: [
      { title: `Read products            ${c.dim}read_products${c.reset}`, value: "read_products" },
      { title: `Read + write products    ${c.dim}read_products,write_products${c.reset}`, value: "read_products,write_products" },
      { title: `Orders + products        ${c.dim}read_products,write_products,read_orders,write_orders${c.reset}`, value: "read_products,write_products,read_orders,write_orders" },
      { title: "Custom scopes — enter manually", value: "__custom__" },
    ],
  }, { onCancel });

  let scopes;
  if (scopeChoice === "__custom__") {
    const res = await prompts({
      type: "text",
      name: "scopes",
      message: "Enter scopes (comma-separated)",
      initial: "read_products",
      validate: (v) => (v.trim() ? true : "At least one scope is required"),
    }, { onCancel });
    scopes = res.scopes;
  } else {
    scopes = scopeChoice;
  }

  // ═══════════════════════════════════════════════════════════════════
  section("Firebase Setup");

  let projectId;
  const hasFirebase = hasCommand("firebase");

  if (hasFirebase) {
    info("Fetching your Firebase projects...");

    const choices = [
      { title: `${c.cyan}[create a new project]${c.reset}`, value: "__create__" },
    ];
    const projects = listFirebaseProjects();
    if (projects.length > 0) {
      for (const p of projects) {
        choices.push({
          title: `${p.displayName} ${c.dim}(${p.projectId})${c.reset}`,
          value: p.projectId,
        });
      }
    }
    choices.push({ title: `${c.dim}[enter project ID manually]${c.reset}`, value: "__manual__" });

    const { firebaseChoice } = await prompts({
      type: "select",
      name: "firebaseChoice",
      message: "Select a Firebase project",
      choices,
    }, { onCancel });

    if (firebaseChoice === "__create__") {
      const { newProjectId } = await prompts({
        type: "text",
        name: "newProjectId",
        message: "New project ID",
        initial: projectName,
        validate: (v) => {
          if (!v.trim()) return "Required";
          if (!/^[a-z0-9][a-z0-9-]*$/.test(v)) return "Only lowercase letters, numbers, and hyphens";
          if (v.length < 6 || v.length > 30) return "Must be 6-30 characters";
          return true;
        },
      }, { onCancel });

      info(`Creating Firebase project: ${c.cyan}${newProjectId}${c.reset}...`);
      const created = await createFirebaseProject(newProjectId, appName);
      if (created) {
        ok(`Project created: ${c.cyan}${newProjectId}${c.reset}`);
        projectId = newProjectId;
      } else {
        warn("Could not create project automatically");
        info("Create one at https://console.firebase.google.com");
        const { manualId } = await prompts({
          type: "text",
          name: "manualId",
          message: "Firebase Project ID",
          validate: (v) => (v.trim() ? true : "Required"),
        }, { onCancel });
        projectId = manualId;
      }
    } else if (firebaseChoice === "__manual__") {
      const { manualId } = await prompts({
        type: "text",
        name: "manualId",
        message: "Firebase Project ID",
        validate: (v) => (v.trim() ? true : "Required"),
      }, { onCancel });
      projectId = manualId;
    } else {
      projectId = firebaseChoice;
      ok(`Using project: ${c.cyan}${projectId}${c.reset}`);
    }
  } else {
    // No Firebase CLI — manual setup
    const { firebaseSetup } = await prompts({
      type: "select",
      name: "firebaseSetup",
      message: "How would you like to set up Firebase?",
      choices: [
        { title: "Create a new project — opens Firebase Console", value: "create" },
        { title: "Enter project ID manually", value: "manual" },
      ],
    }, { onCancel });

    if (firebaseSetup === "create") {
      console.log();
      info("Opening Firebase Console...");
      info("Create a new project and note the Project ID");
      console.log();
      openBrowser("https://console.firebase.google.com");
    }

    const { manualId } = await prompts({
      type: "text",
      name: "manualId",
      message: "Firebase Project ID",
      validate: (v) => (v.trim() ? true : "Required"),
    }, { onCancel });
    projectId = manualId;
  }

  return {
    projectName,
    appName: appName || projectName,
    appType,
    apiKey,
    apiSecret,
    scopes: scopes || "read_products",
    projectId,
    appUrl: `https://${projectId}.web.app`,
  };
}

// ─── Scaffold files from templates ───────────────────────────────────────
function scaffold(outputDir, config) {
  // Recursively copy templates directory
  copyDirSync(TEMPLATES_DIR, outputDir);

  // Rename dotfiles (npm strips leading dots on publish)
  const renames = [
    ["gitignore", ".gitignore"],
    ["env.example", ".env.example"],
  ];
  for (const [from, to] of renames) {
    const src = path.join(outputDir, from);
    const dest = path.join(outputDir, to);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
    }
  }

  // Variable substitution map
  const vars = {
    "{{APP_NAME}}": config.appName,
    "{{API_KEY}}": config.apiKey,
    "{{API_SECRET}}": config.apiSecret,
    "{{SCOPES}}": config.scopes,
    "{{PROJECT_ID}}": config.projectId,
    "{{APP_URL}}": config.appUrl,
  };

  // Files that need variable substitution
  const templateFiles = [
    "shopify.app.toml",
    "web/index.html",
  ];

  for (const relPath of templateFiles) {
    const filePath = path.join(outputDir, relPath);
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, "utf8");
    for (const [key, val] of Object.entries(vars)) {
      content = content.replaceAll(key, val);
    }
    fs.writeFileSync(filePath, content);
  }

  // Generate functions/.env (secrets — not a template to avoid leaks)
  const envContent = [
    `SHOPIFY_API_KEY=${config.apiKey}`,
    `SHOPIFY_API_SECRET=${config.apiSecret}`,
    `SCOPES=${config.scopes}`,
    `APP_URL=${config.appUrl}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outputDir, "functions", ".env"), envContent);

  // Generate .firebaserc
  const firebaserc = JSON.stringify(
    { projects: { default: config.projectId } },
    null,
    2,
  );
  fs.writeFileSync(path.join(outputDir, ".firebaserc"), firebaserc + "\n");

  // Generate root package.json (required by Shopify CLI for `shopify app deploy`)
  const rootPkg = JSON.stringify(
    { name: config.name, private: true },
    null,
    2,
  );
  fs.writeFileSync(path.join(outputDir, "package.json"), rootPkg + "\n");

  // Count files
  let count = 0;
  countFiles(outputDir, () => count++);
  return count;
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function countFiles(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      countFiles(path.join(dir, entry.name), cb);
    } else {
      cb();
    }
  }
}

// ─── Main flow ───────────────────────────────────────────────────────────
export async function run(argv) {
  const args = parseArgs(argv);

  // Show help
  if (args.help || args.h) {
    printHelp();
    return;
  }

  // Show version
  if (args.version || args.v) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    );
    console.log(pkg.version);
    return;
  }

  // Collect config
  const config = await getConfig(args);
  const outputDir = path.resolve(process.cwd(), config.projectName);

  // Check if directory exists
  if (fs.existsSync(outputDir)) {
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: `Directory "${config.projectName}" already exists. Overwrite?`,
      initial: false,
    });
    if (!overwrite) {
      console.log("\n  Cancelled.\n");
      process.exit(0);
    }
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  // ═══════════════════════════════════════════════════════════════════
  section("Setting Up");

  info("Scaffolding project...");
  const fileCount = scaffold(outputDir, config);
  ok(`Created ${fileCount} files in ${c.cyan}${config.projectName}/${c.reset}`);

  info("Installing dependencies...");
  const functionsDir = path.join(outputDir, "functions");
  try {
    await exec("npm install", functionsDir);
    ok("Dependencies installed");
  } catch (e) {
    warn(`npm install failed — run manually: cd ${config.projectName}/functions && npm install`);
  }

  info("Building TypeScript...");
  try {
    await exec("npm run build", functionsDir);
    ok("TypeScript compiled successfully");
  } catch (e) {
    warn("Build failed — run manually: cd functions && npm run build");
  }

  info("Setting up Firebase...");
  if (!hasCommand("firebase")) {
    info("Firebase CLI not found — installing globally...");
    try {
      await exec("npm install -g firebase-tools");
      ok("Firebase CLI installed");
    } catch (e) {
      warn("Could not install Firebase CLI automatically");
      info("Install manually: npm i -g firebase-tools");
      info(`Then run: cd ${config.projectName} && firebase use ${config.projectId}`);
    }
  }
  if (hasCommand("firebase")) {
    const isCI = args["api-key"] && args["api-secret"] && args["project-id"];
    await provisionFirebase(config, {
      skipProvision: !!args["skip-provision"],
      firestoreRegion: args["firestore-region"],
      nonInteractive: isCI,
      cwd: outputDir,
    });
  }

  info("Checking Shopify CLI...");
  if (hasCommand("shopify")) {
    ok("Shopify CLI detected");
  } else {
    info("Shopify CLI not found — installing globally...");
    try {
      await exec("npm install -g @shopify/cli");
      ok("Shopify CLI installed");
    } catch (e) {
      warn("Could not install Shopify CLI automatically");
      info("Install manually: npm i -g @shopify/cli");
    }
  }

  info("Initializing git...");
  if (hasCommand("git")) {
    try {
      await exec("git init", outputDir);
      await exec("git add -A", outputDir);
      await exec('git commit -m "Initial scaffold from create-shopify-firebase-app"', outputDir);
      ok("Git repository initialized with first commit");
    } catch {
      warn("Git init failed — initialize manually if needed");
    }
  } else {
    warn("Git not found — skipping");
  }

  printSuccess(config);
}

// ─── Success output ──────────────────────────────────────────────────────
function printSuccess(config) {
  console.log();
  console.log(`  ${c.green}${c.bold}✔  All done!${c.reset} Your Shopify + Firebase app is ready.`);
  console.log();
  console.log(`  ${c.bold}Next steps:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}cd ${config.projectName}${c.reset}`);
  console.log(`    ${c.cyan}firebase deploy${c.reset}`);
  console.log();
  console.log(`  ${c.bold}Install on your dev store:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}${config.appUrl}/auth?shop=YOUR-STORE.myshopify.com${c.reset}`);
  console.log();
  console.log(`  ${c.bold}Or develop locally:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}shopify app dev${c.reset}`);
  console.log();
  console.log(`  ${c.dim}─────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.dim}App URL:       ${config.appUrl}${c.reset}`);
  console.log(`  ${c.dim}Firebase:      ${config.projectId}${c.reset}`);
  console.log(`  ${c.dim}Scopes:        ${config.scopes}${c.reset}`);
  console.log();
}

// ─── Help output ─────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
  ${c.bold}create-shopify-firebase-app${c.reset}

  Create Shopify apps powered by Firebase.
  Serverless, lightweight, zero-framework.

  ${c.bold}Usage:${c.reset}

    ${c.cyan}npx create-shopify-firebase-app${c.reset} [project-name] [options]

  ${c.bold}Options:${c.reset}

    --api-key=KEY            Shopify API Key (client_id)
    --api-secret=SECRET      Shopify API Secret
    --project-id=ID          Firebase Project ID
    --scopes=SCOPES          API scopes (default: read_products)
    --app-name=NAME          App name shown in Shopify admin
    --help, -h               Show this help
    --version, -v            Show version

  ${c.bold}Firebase provisioning:${c.reset}

    --skip-provision         Skip Firebase service provisioning
    --firestore-region=LOC   Firestore region (e.g. asia-south1, us-central1)

  ${c.bold}Examples:${c.reset}

    ${c.dim}# Interactive mode (prompts for config + provisions Firebase)${c.reset}
    npx create-shopify-firebase-app

    ${c.dim}# With project name${c.reset}
    npx create-shopify-firebase-app my-app

    ${c.dim}# Non-interactive (CI/CD)${c.reset}
    npx create-shopify-firebase-app my-app \\
      --api-key=abc123 \\
      --api-secret=secret \\
      --project-id=my-firebase-project

    ${c.dim}# With Firebase provisioning in CI${c.reset}
    npx create-shopify-firebase-app my-app \\
      --api-key=abc123 \\
      --api-secret=secret \\
      --project-id=my-firebase-project \\
      --firestore-region=asia-south1

  ${c.bold}What you get:${c.reset}

    ✔ Firebase v2 Cloud Functions (4 independent, auto-scaling functions)
    ✔ Shopify API 2026-01 (latest) + OAuth, webhooks, GDPR
    ✔ Firestore for sessions and app data
    ✔ App Bridge embedded admin dashboard (vanilla HTML/JS)
    ✔ Theme App Extension for storefront UI
    ✔ Firebase Hosting ($0/month — free for up to 25K installed stores)
    ✔ Auto-installs Firebase CLI + Shopify CLI if missing
    ✔ Auto-provisioning: Firestore, Web App, Hosting (interactive)
`);
}
