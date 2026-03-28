/**
 * create-shopify-firebase-app — CLI core (v2)
 *
 * Full-stack scaffolding for Shopify + Firebase apps.
 *
 * Flow:
 * 1. App type selection (extension-only vs full-stack Firebase)
 * 2. Language selection (TypeScript / JavaScript)
 * 3. Project name + app name
 * 4. Scaffold files (multi-page frontend + backend)
 * 5. Firebase setup (login, create/select project, provision)
 * 6. Shopify app creation (login, create/link app via CLI)
 * 7. Configure URLs + credentials
 * 8. Install dependencies + build
 * 9. Git init
 * 10. Ready to deploy!
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
const fail = (msg) => console.log(`  ${c.red}✘${c.reset} ${msg}`);
const section = (title) => {
  console.log();
  console.log(`  ${c.cyan}===${c.reset} ${c.bold}${title}${c.reset} ${c.cyan}===${c.reset}`);
  console.log();
};

const onCancel = () => {
  console.log("\n  Cancelled.\n");
  process.exit(0);
};

// ─── Shell helpers ───────────────────────────────────────────────────────

function hasCommand(cmd) {
  try {
    execSync(`${cmd} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function exec(cmd, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed: ${cmd}\n${stderr}`));
    });
  });
}

function execInteractive(cmd, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd, shell: true, stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}`));
    });
  });
}

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

function parseTomlField(tomlPath, field) {
  try {
    const content = fs.readFileSync(tomlPath, "utf8");
    const match = content.match(new RegExp(`${field}\\s*=\\s*"([^"]+)"`));
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

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

async function createFirebaseProject(projectId, displayName) {
  try {
    await exec(`firebase projects:create "${projectId}" --display-name "${displayName}"`);
    return true;
  } catch {
    return false;
  }
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
      for (const ch of arg.slice(1)) args[ch] = true;
    } else if (!projectName) {
      projectName = arg;
    }
  }

  return { projectName, ...args };
}

// ─── File helpers ────────────────────────────────────────────────────────
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
    else count++;
  }
  return count;
}

function substituteVars(filePath, vars) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, val] of Object.entries(vars)) {
    content = content.replaceAll(key, val);
  }
  fs.writeFileSync(filePath, content);
}

// ─── Scaffold ────────────────────────────────────────────────────────────
function scaffold(outputDir, config) {
  // 1. Copy shared files (firebase.json, firestore, gitignore, extensions)
  copyDirSync(path.join(TEMPLATES_DIR, "shared"), outputDir);

  // 2. Copy web frontend (multi-page with App Bridge + Polaris)
  copyDirSync(path.join(TEMPLATES_DIR, "web"), path.join(outputDir, "web"));

  // 3. Copy functions backend (TS or JS based on language choice)
  const lang = config.language === "javascript" ? "js" : "ts";
  copyDirSync(
    path.join(TEMPLATES_DIR, lang, "functions"),
    path.join(outputDir, "functions"),
  );

  // 4. Copy shopify.app.toml
  fs.copyFileSync(
    path.join(TEMPLATES_DIR, "shopify.app.toml"),
    path.join(outputDir, "shopify.app.toml"),
  );

  // 5. Rename dotfiles (npm strips leading dots on publish)
  const renames = [
    ["gitignore", ".gitignore"],
    ["env.example", ".env.example"],
  ];
  for (const [from, to] of renames) {
    const src = path.join(outputDir, from);
    const dest = path.join(outputDir, to);
    if (fs.existsSync(src)) fs.renameSync(src, dest);
  }

  // 6. Variable substitution
  const vars = {
    "{{APP_NAME}}": config.appName,
    "{{API_KEY}}": config.apiKey || "",
    "{{API_SECRET}}": config.apiSecret || "",
    "{{SCOPES}}": config.scopes,
    "{{PROJECT_ID}}": config.projectId || "",
    "{{APP_URL}}": config.appUrl || "",
  };

  const templateFiles = [
    "shopify.app.toml",
    "web/index.html",
    "web/products.html",
    "web/settings.html",
    "web/polaris.html",
  ];

  for (const relPath of templateFiles) {
    substituteVars(path.join(outputDir, relPath), vars);
  }

  // 7. Generate functions/.env
  const envContent = [
    `SHOPIFY_API_KEY=${config.apiKey || ""}`,
    `SHOPIFY_API_SECRET=${config.apiSecret || ""}`,
    `SCOPES=${config.scopes}`,
    `APP_URL=${config.appUrl || ""}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outputDir, "functions", ".env"), envContent);

  // 8. Generate .firebaserc
  if (config.projectId) {
    const firebaserc = JSON.stringify(
      { projects: { default: config.projectId } },
      null,
      2,
    );
    fs.writeFileSync(path.join(outputDir, ".firebaserc"), firebaserc + "\n");
  }

  // 9. Generate root package.json
  const rootPkg = JSON.stringify(
    { name: config.projectName, private: true },
    null,
    2,
  );
  fs.writeFileSync(path.join(outputDir, "package.json"), rootPkg + "\n");

  return countFiles(outputDir);
}

// ─── Update credentials after Shopify app creation ───────────────────────
function updateCredentials(outputDir, config) {
  const vars = {
    "{{API_KEY}}": config.apiKey || "",
    "{{API_SECRET}}": config.apiSecret || "",
    "{{APP_URL}}": config.appUrl || "",
  };

  // Update shopify.app.toml
  substituteVars(path.join(outputDir, "shopify.app.toml"), vars);

  // Update functions/.env
  const envContent = [
    `SHOPIFY_API_KEY=${config.apiKey || ""}`,
    `SHOPIFY_API_SECRET=${config.apiSecret || ""}`,
    `SCOPES=${config.scopes}`,
    `APP_URL=${config.appUrl || ""}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(outputDir, "functions", ".env"), envContent);
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── MAIN FLOW ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

export async function run(argv) {
  const args = parseArgs(argv);

  // ── Handle flags ──────────────────────────────────────────────────
  if (args.help || args.h) { printHelp(); return; }
  if (args.version || args.v) {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    console.log(pkg.version);
    return;
  }

  // ── Handle --distribute ───────────────────────────────────────────
  if (args.distribute) {
    await distributeFlow();
    return;
  }

  // ── CI / non-interactive mode ─────────────────────────────────────
  const isCI = args["api-key"] && args["api-secret"] && args["project-id"];
  if (isCI) {
    await runCI(args);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ── Interactive flow — guided project wizard ────
  // ═══════════════════════════════════════════════════════════════════

  // ── Banner ────────────────────────────────────────────────────────
  console.log();
  console.log(`  ${c.green}${c.bold}🛍️  +  🔥${c.reset}  ${c.bold}create-shopify-firebase-app${c.reset}`);
  console.log(`  ${c.dim}Build Shopify apps for free — serverless, zero-framework${c.reset}`);

  // ═══════════════════════════════════════════════════════════════════
  section("Choose Your Template");

  const { appTemplate } = await prompts({
    type: "select",
    name: "appTemplate",
    message: "What would you like to create?",
    choices: [
      {
        title: `${c.bold}Shopify + Firebase app${c.reset} ${c.dim}(full-stack serverless)${c.reset}`,
        description: "Dashboard, product search, settings, Polaris components — ready to deploy",
        value: "firebase",
      },
      {
        title: `Extension-only app ${c.dim}(Shopify CLI)${c.reset}`,
        description: "Theme extensions, checkout extensions — no backend needed",
        value: "extension",
      },
    ],
  }, { onCancel });

  // ── Extension-only: delegate to Shopify CLI ───────────────────────
  if (appTemplate === "extension") {
    console.log();
    if (!hasCommand("shopify")) {
      info("Installing Shopify CLI...");
      try {
        await exec("npm install -g @shopify/cli");
        ok("Shopify CLI installed");
      } catch {
        fail("Could not install Shopify CLI");
        info("Install manually: npm i -g @shopify/cli");
        info("Then run: shopify app init");
        return;
      }
    }
    info("Launching Shopify CLI...");
    console.log();
    try {
      await execInteractive("shopify app init");
    } catch {
      warn("Shopify CLI exited");
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  section("Project Setup");

  // ── Language ──────────────────────────────────────────────────────
  const { language } = await prompts({
    type: "select",
    name: "language",
    message: "Language for Cloud Functions",
    choices: [
      { title: `TypeScript ${c.dim}(recommended)${c.reset}`, value: "typescript" },
      { title: "JavaScript", value: "javascript" },
    ],
  }, { onCancel });

  // ── Project name ──────────────────────────────────────────────────
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

  // ── App name ──────────────────────────────────────────────────────
  const { appName } = await prompts({
    type: "text",
    name: "appName",
    message: "App name (shown in Shopify admin)",
    initial: projectName.replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }, { onCancel });

  // ── API scopes ────────────────────────────────────────────────────
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

  // ── Check for directory conflict ──────────────────────────────────
  const outputDir = path.resolve(process.cwd(), projectName);
  if (fs.existsSync(outputDir)) {
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: `Directory "${projectName}" already exists. Overwrite?`,
      initial: false,
    }, { onCancel });
    if (!overwrite) { console.log("\n  Cancelled.\n"); process.exit(0); }
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  // ═══════════════════════════════════════════════════════════════════
  section("Scaffolding");

  // Build initial config (credentials filled in later after Shopify app creation)
  const config = {
    projectName,
    appName,
    language,
    scopes,
    apiKey: "",
    apiSecret: "",
    projectId: "",
    appUrl: "",
  };

  info("Creating project files...");
  const fileCount = scaffold(outputDir, config);
  ok(`Created ${fileCount} files in ${c.cyan}${projectName}/${c.reset}`);

  if (language === "typescript") {
    info(`${c.dim}Backend: TypeScript (functions/src/*.ts)${c.reset}`);
  } else {
    info(`${c.dim}Backend: JavaScript (functions/src/*.js)${c.reset}`);
  }
  info(`${c.dim}Frontend: 4 pages — Dashboard, Products, Settings, Components${c.reset}`);

  // ═══════════════════════════════════════════════════════════════════
  section("Firebase Setup");

  // ── Ensure Firebase CLI ───────────────────────────────────────────
  if (!hasCommand("firebase")) {
    info("Firebase CLI not found — installing...");
    try {
      await exec("npm install -g firebase-tools");
      ok("Firebase CLI installed");
    } catch {
      warn("Could not install Firebase CLI automatically");
      info("Install manually: npm i -g firebase-tools");
    }
  }

  if (hasCommand("firebase")) {
    // ── Firebase login ──────────────────────────────────────────────
    info("Checking Firebase authentication...");
    const projects = listFirebaseProjects();
    if (projects.length > 0) {
      ok("Firebase authenticated");
    } else {
      info("Opening browser for Firebase login...");
      try {
        await execInteractive("firebase login");
        ok("Logged into Firebase");
      } catch {
        warn("Firebase login failed — run 'firebase login' manually later");
      }
    }

    // ── Project selection ───────────────────────────────────────────
    const freshProjects = listFirebaseProjects();
    const fbChoices = [
      { title: `${c.cyan}[create a new project]${c.reset}`, value: "__create__" },
    ];

    if (freshProjects.length > 0) {
      for (const p of freshProjects) {
        fbChoices.push({
          title: `${p.displayName} ${c.dim}(${p.projectId})${c.reset}`,
          value: p.projectId,
        });
      }
    }
    fbChoices.push({ title: `${c.dim}[enter project ID manually]${c.reset}`, value: "__manual__" });

    const { firebaseChoice } = await prompts({
      type: "select",
      name: "firebaseChoice",
      message: "Select a Firebase project",
      choices: fbChoices,
    }, { onCancel });

    if (firebaseChoice === "__create__") {
      const { newProjectId } = await prompts({
        type: "text",
        name: "newProjectId",
        message: "New project ID",
        initial: projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 30),
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
        config.projectId = newProjectId;
      } else {
        warn("Could not create project automatically");
        const { manualId } = await prompts({
          type: "text",
          name: "manualId",
          message: "Firebase Project ID",
          validate: (v) => (v.trim() ? true : "Required"),
        }, { onCancel });
        config.projectId = manualId;
      }
    } else if (firebaseChoice === "__manual__") {
      const { manualId } = await prompts({
        type: "text",
        name: "manualId",
        message: "Firebase Project ID",
        validate: (v) => (v.trim() ? true : "Required"),
      }, { onCancel });
      config.projectId = manualId;
    } else {
      config.projectId = firebaseChoice;
      ok(`Using project: ${c.cyan}${config.projectId}${c.reset}`);
    }

    config.appUrl = `https://${config.projectId}.web.app`;

    // ── Write .firebaserc now that we have projectId ────────────────
    const firebaserc = JSON.stringify({ projects: { default: config.projectId } }, null, 2);
    fs.writeFileSync(path.join(outputDir, ".firebaserc"), firebaserc + "\n");

    // ── Provision Firebase services ─────────────────────────────────
    await provisionFirebase(config, {
      skipProvision: !!args["skip-provision"],
      firestoreRegion: args["firestore-region"],
      nonInteractive: false,
      cwd: outputDir,
    });
  } else {
    // No Firebase CLI available
    const { manualId } = await prompts({
      type: "text",
      name: "manualId",
      message: "Firebase Project ID (create at console.firebase.google.com)",
      validate: (v) => (v.trim() ? true : "Required"),
    }, { onCancel });
    config.projectId = manualId;
    config.appUrl = `https://${config.projectId}.web.app`;

    const firebaserc = JSON.stringify({ projects: { default: config.projectId } }, null, 2);
    fs.writeFileSync(path.join(outputDir, ".firebaserc"), firebaserc + "\n");
  }

  // ═══════════════════════════════════════════════════════════════════
  section("Shopify App Setup");

  // ── Ensure Shopify CLI ────────────────────────────────────────────
  if (!hasCommand("shopify")) {
    info("Shopify CLI not found — installing...");
    try {
      await exec("npm install -g @shopify/cli");
      ok("Shopify CLI installed");
    } catch {
      warn("Could not install Shopify CLI");
    }
  }

  if (hasCommand("shopify")) {
    const { shopifyAction } = await prompts({
      type: "select",
      name: "shopifyAction",
      message: "Shopify app setup",
      choices: [
        { title: "Create a new app + link it (recommended)", value: "create" },
        { title: "Link an existing app", value: "link" },
        { title: "Skip — I'll configure manually later", value: "skip" },
      ],
    }, { onCancel });

    if (shopifyAction !== "skip") {
      // ── Login ──────────────────────────────────────────────────
      console.log();
      info("Logging into Shopify...");
      info("A browser window will open — sign in to your Partner account.");
      console.log();
      try {
        await execInteractive("shopify auth login");
        ok("Logged into Shopify");
      } catch {
        warn("Shopify login failed — continuing with manual setup");
      }

      // ── Create / Link app via Shopify CLI ──────────────────────
      // Must `cd` into project dir — Shopify CLI uses process.cwd(),
      // not spawn's cwd option, for TOML generation.
      console.log();
      if (shopifyAction === "create") {
        info(`Creating a new Shopify app: ${c.cyan}${appName}${c.reset}`);
        info(`Select ${c.bold}"Create a new app"${c.reset} when prompted by the CLI.`);
      } else {
        info("Select your existing app from the list.");
      }
      console.log();

      // Use `cd` to ensure Shopify CLI writes files in the project directory
      const cdCmd = process.platform === "win32"
        ? `cd /d "${outputDir}" && shopify app config link`
        : `cd "${outputDir}" && shopify app config link`;

      try {
        await execInteractive(cdCmd);
      } catch {
        // Shopify CLI may exit non-zero even after creating/linking the app
        // (e.g. "directory doesn't have a package.json" warning)
        warn("Shopify CLI exited with a warning");
      }

      // ── Parse client_id from any TOML (runs regardless of exit code) ──
      // Check project dir first, then parent dir (Shopify CLI fallback location)
      const dirsToCheck = [outputDir, path.dirname(outputDir)];
      for (const dir of dirsToCheck) {
        if (config.apiKey) break;
        try {
          const tomlFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".toml"));
          for (const f of tomlFiles) {
            const filePath = path.join(dir, f);
            const clientId = parseTomlField(filePath, "client_id");
            if (clientId && clientId !== "{{API_KEY}}" && clientId.length > 5) {
              config.apiKey = clientId;
              ok(`Client ID: ${c.cyan}${config.apiKey}${c.reset}`);

              // If TOML was in parent dir (Shopify CLI bug), move it to project dir
              if (dir !== outputDir) {
                const destPath = path.join(outputDir, f);
                try {
                  // Don't overwrite our template — just read the client_id
                  if (!fs.existsSync(destPath)) {
                    fs.renameSync(filePath, destPath);
                  } else {
                    // Clean up the stray TOML from parent dir
                    fs.unlinkSync(filePath);
                  }
                  info(`${c.dim}Picked up credentials from Shopify CLI${c.reset}`);
                } catch {}
              }
              break;
            }
          }
        } catch {}
      }

      if (!config.apiKey) {
        console.log();
        info("Could not read Client ID from Shopify CLI output.");
        const res = await prompts({
          type: "text",
          name: "apiKey",
          message: "Paste your Client ID (from Partner Dashboard → Apps)",
          validate: (v) => (v.trim() ? true : "Required"),
        }, { onCancel });
        config.apiKey = res.apiKey;
      }
    }

    // ── Get API Secret (never in TOML) ──────────────────────────────
    if (!config.apiKey) {
      console.log();
      info(`Find credentials at: ${c.cyan}https://partners.shopify.com${c.reset} → Apps → Client credentials`);
      const res = await prompts({
        type: "text",
        name: "apiKey",
        message: `Client ID ${c.dim}(API Key)${c.reset}`,
        validate: (v) => (v.trim() ? true : "Required"),
      }, { onCancel });
      config.apiKey = res.apiKey;
    }

    console.log();
    info("The API Secret is not stored in config files for security.");
    info(`Find it at: ${c.cyan}https://partners.shopify.com${c.reset} → your app → Client credentials`);
    console.log();
    const { apiSecret } = await prompts({
      type: "password",
      name: "apiSecret",
      message: "Client Secret (API Secret)",
      validate: (v) => (v.trim() ? true : "Required"),
    }, { onCancel });
    config.apiSecret = apiSecret;

  } else {
    // No Shopify CLI — full manual entry
    info(`Enter your Shopify app credentials (from ${c.cyan}partners.shopify.com${c.reset})`);
    const creds = await prompts([
      {
        type: "text",
        name: "apiKey",
        message: `Client ID ${c.dim}(API Key)${c.reset}`,
        validate: (v) => (v.trim() ? true : "Required"),
      },
      {
        type: "password",
        name: "apiSecret",
        message: "Client Secret (API Secret)",
        validate: (v) => (v.trim() ? true : "Required"),
      },
    ], { onCancel });
    config.apiKey = creds.apiKey;
    config.apiSecret = creds.apiSecret;
  }

  // ── Write final credentials to files ──────────────────────────────
  updateCredentials(outputDir, config);

  // ═══════════════════════════════════════════════════════════════════
  section("Installing & Building");

  // ── npm install ───────────────────────────────────────────────────
  info("Installing dependencies...");
  const functionsDir = path.join(outputDir, "functions");
  try {
    await exec("npm install", functionsDir);
    ok("Dependencies installed");
  } catch {
    warn(`npm install failed — run manually: cd ${projectName}/functions && npm install`);
  }

  // ── TypeScript build ──────────────────────────────────────────────
  if (language === "typescript") {
    info("Building TypeScript...");
    try {
      await exec("npm run build", functionsDir);
      ok("TypeScript compiled successfully");
    } catch {
      warn("Build failed — run manually: cd functions && npm run build");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  section("Finishing Up");

  // ── Git init ──────────────────────────────────────────────────────
  info("Initializing git...");
  if (hasCommand("git")) {
    try {
      await exec("git init", outputDir);
      await exec("git add -A", outputDir);
      await exec('git commit -m "Initial scaffold from create-shopify-firebase-app"', outputDir);
      ok("Git repository initialized");
    } catch {
      warn("Git init failed — initialize manually if needed");
    }
  } else {
    warn("Git not found — skipping");
  }

  // ═══════════════════════════════════════════════════════════════════
  printSuccess(config);
}

// ─── CI / non-interactive mode ──────────────────────────────────────────
async function runCI(args) {
  const config = {
    projectName: args.projectName || "my-shopify-app",
    appName: args["app-name"] || args.projectName || "My Shopify App",
    language: args.language === "javascript" ? "javascript" : "typescript",
    apiKey: args["api-key"],
    apiSecret: args["api-secret"],
    scopes: args.scopes || "read_products",
    projectId: args["project-id"],
    appUrl: `https://${args["project-id"]}.web.app`,
  };

  const outputDir = path.resolve(process.cwd(), config.projectName);

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  section("Setting Up");

  info("Scaffolding project...");
  const fileCount = scaffold(outputDir, config);
  ok(`Created ${fileCount} files in ${c.cyan}${config.projectName}/${c.reset}`);

  info("Installing dependencies...");
  const functionsDir = path.join(outputDir, "functions");
  try {
    await exec("npm install", functionsDir);
    ok("Dependencies installed");
  } catch {
    warn("npm install failed");
  }

  if (config.language === "typescript") {
    info("Building TypeScript...");
    try {
      await exec("npm run build", functionsDir);
      ok("TypeScript compiled");
    } catch {
      warn("Build failed");
    }
  }

  if (hasCommand("firebase") && !args["skip-provision"]) {
    info("Setting up Firebase...");
    await provisionFirebase(config, {
      skipProvision: !!args["skip-provision"],
      firestoreRegion: args["firestore-region"],
      nonInteractive: true,
      cwd: outputDir,
    });
  }

  if (hasCommand("git")) {
    info("Initializing git...");
    try {
      await exec("git init", outputDir);
      await exec("git add -A", outputDir);
      await exec('git commit -m "Initial scaffold from create-shopify-firebase-app"', outputDir);
      ok("Git initialized");
    } catch {}
  }

  printSuccess(config);
}

// ─── Distribution flow ──────────────────────────────────────────────────
async function distributeFlow() {
  console.log();
  console.log(`  ${c.green}${c.bold}🛍️  +  🔥${c.reset}  ${c.bold}App Distribution${c.reset}`);

  const tomlPath = path.resolve(process.cwd(), "shopify.app.toml");

  if (!fs.existsSync(tomlPath)) {
    // No app configured — offer to set one up
    console.log();
    fail("No shopify.app.toml found in the current directory.");
    info("Run this command from your app's root directory.");
    console.log();

    if (hasCommand("shopify")) {
      const { shouldLink } = await prompts({
        type: "confirm",
        name: "shouldLink",
        message: "Would you like to link a Shopify app now?",
        initial: true,
      }, { onCancel });

      if (shouldLink) {
        try {
          await execInteractive("shopify auth login");
          await execInteractive("shopify app config link");
          ok("App linked successfully");
        } catch {
          fail("Could not link app");
          return;
        }
      } else {
        return;
      }
    } else {
      info("Install Shopify CLI: npm i -g @shopify/cli");
      return;
    }
  }

  const clientId = parseTomlField(tomlPath, "client_id");
  const appName = parseTomlField(tomlPath, "name");

  section("Distribution Checklist");

  console.log(`  ${c.bold}App: ${c.cyan}${appName || "Unknown"}${c.reset}`);
  if (clientId) console.log(`  ${c.bold}Client ID: ${c.dim}${clientId}${c.reset}`);
  console.log();

  console.log(`  ${c.bold}Before submitting to the App Store:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}1.${c.reset} Deploy your app: ${c.cyan}firebase deploy${c.reset}`);
  console.log(`    ${c.cyan}2.${c.reset} Test on a development store`);
  console.log(`    ${c.cyan}3.${c.reset} Add your privacy policy URL`);
  console.log(`    ${c.cyan}4.${c.reset} Add your app listing details (description, screenshots)`);
  console.log(`    ${c.cyan}5.${c.reset} Submit for review`);
  console.log();

  if (clientId) {
    info("Opening Partner Dashboard → Distribution...");
    openBrowser(`https://partners.shopify.com/apps/${clientId}/distribution`);
  } else {
    info(`Open: ${c.cyan}https://partners.shopify.com${c.reset} → Apps → your app → Distribution`);
  }

  console.log();
  console.log(`  ${c.dim}Docs: https://shopify.dev/docs/apps/launch${c.reset}`);
  console.log();
}

// ─── Success output ──────────────────────────────────────────────────────
function printSuccess(config) {
  console.log();
  console.log(`  ${c.green}${c.bold}✔  All done!${c.reset} Your Shopify + Firebase app is ready.`);
  console.log();
  console.log(`  ${c.bold}Your app includes:${c.reset}`);
  console.log(`    ${c.green}✔${c.reset} Dashboard — store info + quick stats`);
  console.log(`    ${c.green}✔${c.reset} Products — search + detail view`);
  console.log(`    ${c.green}✔${c.reset} Settings — form with Firestore persistence`);
  console.log(`    ${c.green}✔${c.reset} Components — Polaris reference with copy-paste code`);
  console.log(`    ${c.green}✔${c.reset} App Bridge — navigation, toasts, modals, resource picker`);
  console.log(`    ${c.green}✔${c.reset} 4 Cloud Functions — auth, api, webhooks, proxy`);
  console.log();
  console.log(`  ${c.bold}Deploy:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}cd ${config.projectName}${c.reset}`);
  console.log(`    ${c.cyan}firebase deploy${c.reset}`);
  console.log();
  console.log(`  ${c.bold}Install on your dev store:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}${config.appUrl}/auth?shop=YOUR-STORE.myshopify.com${c.reset}`);
  console.log();
  console.log(`  ${c.bold}Go live:${c.reset}`);
  console.log();
  console.log(`    ${c.cyan}npx create-shopify-firebase-app --distribute${c.reset}`);
  console.log();
  console.log(`  ${c.dim}─────────────────────────────────────────${c.reset}`);
  console.log(`  ${c.dim}Language:      ${config.language}${c.reset}`);
  console.log(`  ${c.dim}App URL:       ${config.appUrl}${c.reset}`);
  console.log(`  ${c.dim}Firebase:      ${config.projectId}${c.reset}`);
  console.log(`  ${c.dim}Scopes:        ${config.scopes}${c.reset}`);
  console.log();
}

// ─── Help output ─────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
  ${c.bold}create-shopify-firebase-app${c.reset}

  Build Shopify apps for free. Serverless, zero-framework.
  The easiest way to build Shopify apps on Firebase.

  ${c.bold}Usage:${c.reset}

    ${c.cyan}npx create-shopify-firebase-app${c.reset} [project-name] [options]

  ${c.bold}Options:${c.reset}

    --help, -h               Show this help
    --version, -v            Show version
    --distribute             Open distribution dashboard for your app

  ${c.bold}CI / non-interactive:${c.reset}

    --api-key=KEY            Shopify API Key (client_id)
    --api-secret=SECRET      Shopify API Secret
    --project-id=ID          Firebase Project ID
    --scopes=SCOPES          API scopes (default: read_products)
    --language=LANG          typescript or javascript (default: typescript)
    --app-name=NAME          App name shown in Shopify admin
    --skip-provision         Skip Firebase service provisioning
    --firestore-region=LOC   Firestore region (e.g. us-central1)

  ${c.bold}Examples:${c.reset}

    ${c.dim}# Interactive — guided wizard${c.reset}
    npx create-shopify-firebase-app

    ${c.dim}# With project name${c.reset}
    npx create-shopify-firebase-app my-app

    ${c.dim}# CI / non-interactive${c.reset}
    npx create-shopify-firebase-app my-app \\
      --api-key=abc123 --api-secret=secret \\
      --project-id=my-firebase-project

    ${c.dim}# Go live — open distribution page${c.reset}
    npx create-shopify-firebase-app --distribute

  ${c.bold}What you get:${c.reset}

    ✔ 4 pages — Dashboard, Products, Settings, Polaris Components
    ✔ App Bridge — embedded admin with navigation, toasts, modals
    ✔ Firebase v2 Cloud Functions — 4 independent, auto-scaling
    ✔ Shopify API 2026-01 — OAuth, webhooks, GDPR
    ✔ Firestore — sessions, settings, app data
    ✔ TypeScript or JavaScript — your choice
    ✔ Firebase Hosting — $0/month for up to 25K installed stores
    ✔ Auto-installs Firebase CLI + Shopify CLI
    ✔ Distribution helper — go live in minutes
`);
}
