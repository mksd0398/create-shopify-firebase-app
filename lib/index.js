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
const step = (n, total, msg) =>
  console.log(
    `\n  ${c.dim}[${n}/${total}]${c.reset} ${c.bold}${msg}${c.reset}`,
  );

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

  console.log();
  console.log(
    `  ${c.bgGreen}${c.white}${c.bold} SHOPIFY + FIREBASE ${c.reset}  Create a new Shopify app`,
  );
  console.log();

  const questions = [];

  if (!args.projectName) {
    questions.push({
      type: "text",
      name: "projectName",
      message: "Project directory name",
      initial: "my-shopify-app",
      validate: (v) => {
        if (!v.trim()) return "Required";
        if (/[^a-zA-Z0-9._-]/.test(v)) return "Use only letters, numbers, dots, hyphens, underscores";
        return true;
      },
    });
  }

  questions.push(
    {
      type: "text",
      name: "appName",
      message: "App name (shown in Shopify admin)",
      initial: args.projectName || "My Shopify App",
    },
    {
      type: "text",
      name: "apiKey",
      message: `Shopify API Key ${c.dim}(Partner Dashboard → App → Client ID)${c.reset}`,
      validate: (v) => (v.trim() ? true : "Required — get it from partners.shopify.com"),
    },
    {
      type: "password",
      name: "apiSecret",
      message: "Shopify API Secret",
      validate: (v) => (v.trim() ? true : "Required"),
    },
    {
      type: "text",
      name: "scopes",
      message: "API Scopes",
      initial: "read_products",
    },
    {
      type: "text",
      name: "projectId",
      message: `Firebase Project ID ${c.dim}(Firebase Console → Project Settings)${c.reset}`,
      validate: (v) => (v.trim() ? true : "Required — create one at console.firebase.google.com"),
    },
  );

  const onCancel = () => {
    console.log("\n  Cancelled.\n");
    process.exit(0);
  };

  const answers = await prompts(questions, { onCancel });

  const projectName = args.projectName || answers.projectName;
  const projectId = answers.projectId;

  return {
    projectName,
    appName: answers.appName || projectName,
    apiKey: answers.apiKey,
    apiSecret: answers.apiSecret,
    scopes: answers.scopes || "read_products",
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

  const totalSteps = 6;

  // ── Step 1: Scaffold ──────────────────────────────────────────────
  step(1, totalSteps, "Scaffolding project...");
  const fileCount = scaffold(outputDir, config);
  ok(`Created ${fileCount} files in ${c.cyan}${config.projectName}/${c.reset}`);

  // ── Step 2: Install dependencies ──────────────────────────────────
  step(2, totalSteps, "Installing dependencies...");
  const functionsDir = path.join(outputDir, "functions");
  try {
    await exec("npm install", functionsDir);
    ok("Dependencies installed");
  } catch (e) {
    warn(`npm install failed — run manually: cd ${config.projectName}/functions && npm install`);
  }

  // ── Step 3: Build TypeScript ──────────────────────────────────────
  step(3, totalSteps, "Building TypeScript...");
  try {
    await exec("npm run build", functionsDir);
    ok("TypeScript compiled successfully");
  } catch (e) {
    warn("Build failed — run manually: cd functions && npm run build");
  }

  // ── Step 4: Firebase provisioning ───────────────────────────────────
  step(4, totalSteps, "Setting up Firebase...");
  if (hasCommand("firebase")) {
    const isCI = args["api-key"] && args["api-secret"] && args["project-id"];
    await provisionFirebase(config, {
      skipProvision: !!args["skip-provision"],
      firestoreRegion: args["firestore-region"],
      nonInteractive: isCI,
      cwd: outputDir,
    });
  } else {
    warn("Firebase CLI not found. Install: npm i -g firebase-tools");
    info(`Then run: cd ${config.projectName} && firebase use ${config.projectId}`);
    info("After installing, re-run with --skip-provision to skip provisioning");
  }

  // ── Step 5: Shopify CLI check ─────────────────────────────────────
  step(5, totalSteps, "Checking Shopify CLI...");
  if (hasCommand("shopify")) {
    ok("Shopify CLI detected — you can use `shopify app dev` for local development");
  } else {
    warn("Shopify CLI not found. Install: npm i -g @shopify/cli");
    info("Optional — you can also develop with Firebase emulators");
  }

  // ── Step 6: Initialize git ────────────────────────────────────────
  step(6, totalSteps, "Initializing git...");
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
    warn("Git not found — skipping repository initialization");
  }

  // ── Done! ─────────────────────────────────────────────────────────
  printSuccess(config);
}

// ─── Success output ──────────────────────────────────────────────────────
function printSuccess(config) {
  console.log();
  console.log(
    `  ${c.bgGreen}${c.white}${c.bold} SUCCESS ${c.reset}  Your Shopify + Firebase app is ready!`,
  );
  console.log();
  console.log(`  ${c.bold}Next steps:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}cd ${config.projectName}${c.reset}`);
  console.log(`    ${c.cyan}firebase deploy${c.reset}`);
  console.log();
  console.log(`  ${c.bold}Then install on your dev store:${c.reset}`);
  console.log();
  console.log(
    `    ${c.cyan}${config.appUrl}/auth?shop=YOUR-STORE.myshopify.com${c.reset}`,
  );
  console.log();
  console.log(`  ${c.bold}Or use Shopify CLI for local development:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}shopify app dev${c.reset}`);
  console.log();
  console.log(`  ${c.dim}─────────────────────────────────────────${c.reset}`);
  console.log();
  console.log(`  ${c.dim}App URL:       ${config.appUrl}${c.reset}`);
  console.log(`  ${c.dim}Firebase:      ${config.projectId}${c.reset}`);
  console.log(`  ${c.dim}Scopes:        ${config.scopes}${c.reset}`);
  console.log();
  console.log(`  ${c.dim}Docs: https://github.com/mksd0398/create-shopify-firebase-app${c.reset}`);
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

    ✔ Express + TypeScript Cloud Functions (OAuth, webhooks, GDPR)
    ✔ Firestore for sessions and app data
    ✔ App Bridge embedded admin dashboard (vanilla HTML/JS)
    ✔ Theme App Extension for storefront UI
    ✔ Firebase Hosting (free tier covers most apps)
    ✔ Auto-provisioning: Firestore, Web App, Hosting (interactive)
`);
}
