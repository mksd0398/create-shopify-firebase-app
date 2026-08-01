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
import { preflight } from "./preflight.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

// Shopify rejects any app name containing "Shopify", and the app name is
// derived from the project name — so the default must derive to a valid one.
const DEFAULT_PROJECT_NAME = "my-store-app";

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

// ─── Shopify credential helpers ──────────────────────────────────────────

function matchValue(text, re) {
  const m = String(text || "").match(re);
  return m ? m[1].replace(/^["']|["']$/g, "") : null;
}

/**
 * Read Client ID + Client Secret from the linked Shopify app.
 * `shopify app env show` runs non-interactively and prints both, so the user
 * never has to paste the secret by hand.
 */
function readShopifyEnv(outputDir) {
  let output = "";
  try {
    output = execSync(`shopify app env show --path "${outputDir}"`, {
      encoding: "utf8",
      cwd: outputDir,
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    // The CLI can exit non-zero while still having printed the values
    output = `${e.stdout || ""}\n${e.stderr || ""}`;
  }
  return {
    apiKey: matchValue(output, /SHOPIFY_API_KEY=(\S+)/),
    apiSecret: matchValue(output, /SHOPIFY_API_SECRET=(\S+)/),
  };
}

/** Never echo a full secret — show the prefix and the length only. */
function maskSecret(secret) {
  const s = String(secret || "");
  const shown = s.slice(0, 8);
  return `${shown}${"*".repeat(Math.max(0, s.length - shown.length))} (${s.length} chars)`;
}

// ─── App name helpers ────────────────────────────────────────────────────
// Shopify rejects app names containing "Shopify" (case-insensitive) with:
//   App name cannot contain "Shopify"

/** Strip the reserved word and tidy whitespace. Never returns an empty name. */
function sanitizeAppName(name) {
  const cleaned = String(name || "")
    .replace(/shopify/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-_.]+|[\s\-_.]+$/g, "")
    .trim();
  return cleaned || "My Store App";
}

/** Turn "my-store-app" into a valid Shopify app name: "My Store App". */
function deriveAppName(projectName) {
  const titled = String(projectName || "")
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  return sanitizeAppName(titled);
}

/** Inline validation for the app name prompt. */
function validateAppName(v) {
  const name = String(v || "").trim();
  if (!name) return "Required";
  if (/shopify/i.test(name)) {
    return 'Shopify rejects app names containing "Shopify" — try "My Store App"';
  }
  return true;
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

/**
 * Signed-in Google accounts, newest-first as firebase-tools reports them.
 * Only emails are read — the raw payload also carries OAuth tokens.
 */
function listFirebaseAccounts() {
  try {
    const output = execSync("firebase login:list --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const data = JSON.parse(output);
    if (data.status === "success" && Array.isArray(data.result)) {
      return data.result
        .map((a) => a?.user?.email)
        .filter((email) => typeof email === "string" && email.length > 0);
    }
  } catch {}
  return [];
}

async function useFirebaseAccount(email) {
  try {
    execSync(`firebase login:use ${email}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch (e) {
    // Picking the account that is already active exits non-zero and reports it
    // on stdout, not stderr — that is a no-op, not a failure
    const out = `${e?.stdout || ""}${e?.stderr || ""}`;
    return /already using account/i.test(out);
  }
}

/** Attach Firebase resources to a project that already exists in Google Cloud. */
async function addFirebaseToProject(projectId) {
  try {
    await exec(`firebase projects:addfirebase ${projectId}`);
    return true;
  } catch {
    return false;
  }
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
      const raw = arg.slice(2);
      const eq = raw.indexOf("=");
      if (eq >= 0) {
        args[raw.slice(0, eq)] = raw.slice(eq + 1);
      } else {
        args[raw] = true;
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      for (const ch of arg.slice(1)) args[ch] = true;
    } else if (!projectName) {
      projectName = arg;
    }
  }

  return { projectName, ...args };
}

// ─── File helpers ────────────────────────────────────────────────────────

// Build artifacts and local state that must never leak from templates/ into a
// scaffolded project — a stray node_modules/ here would be copied verbatim.
const COPY_EXCLUDE = new Set([
  "node_modules",
  "lib",
  "package-lock.json",
  ".env",
  ".firebase",
  ".DS_Store",
]);

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (COPY_EXCLUDE.has(entry.name)) continue;
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

// ─── Template rendering ──────────────────────────────────────────────────

/**
 * Render shopify.app.toml from the pristine template.
 *
 * Always rendered from templates/ — never re-substituted in place. The
 * placeholders are consumed by the first write, so a second pass over the
 * generated file would silently leave the earlier (empty) values behind.
 */
function renderAppToml(outputDir, config) {
  const tomlPath = path.join(outputDir, "shopify.app.toml");

  // Keep the identity fields the Shopify CLI writes when an app is linked
  const preserved = [];
  for (const field of ["handle", "organization_id"]) {
    const val = parseTomlField(tomlPath, field);
    if (val) preserved.push(`${field} = "${val}"`);
  }

  const vars = {
    "{{APP_NAME}}": config.appName,
    "{{API_KEY}}": config.apiKey || "",
    "{{SCOPES}}": config.scopes,
    "{{APP_URL}}": config.appUrl || "",
  };

  let content = fs.readFileSync(
    path.join(TEMPLATES_DIR, "shopify.app.toml"),
    "utf8",
  );
  for (const [key, val] of Object.entries(vars)) {
    content = content.replaceAll(key, val);
  }
  if (preserved.length > 0) {
    content = content.replace(/^client_id = .*$/m, (line) =>
      [line, ...preserved].join("\n"),
    );
  }

  fs.writeFileSync(tomlPath, content);
}

/** Write functions/.env — regenerated whenever credentials change. */
function writeFunctionsEnv(outputDir, config) {
  const envContent = [
    `SHOPIFY_API_KEY=${config.apiKey || ""}`,
    `SHOPIFY_API_SECRET=${config.apiSecret || ""}`,
    `SCOPES=${config.scopes}`,
    `APP_URL=${config.appUrl || ""}`,
    "",
  ].join("\n");
  fs.mkdirSync(path.join(outputDir, "functions"), { recursive: true });
  fs.writeFileSync(path.join(outputDir, "functions", ".env"), envContent);
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

  // 4. Render shopify.app.toml (re-rendered later once credentials are known)
  renderAppToml(outputDir, config);

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

  // 6. Variable substitution — frontend pages only use {{APP_NAME}}, which is
  //    known up front (credential placeholders live in the TOML alone)
  const vars = {
    "{{APP_NAME}}": config.appName,
    "{{API_KEY}}": config.apiKey || "",
    "{{API_SECRET}}": config.apiSecret || "",
    "{{SCOPES}}": config.scopes,
    "{{PROJECT_ID}}": config.projectId || "",
    "{{APP_URL}}": config.appUrl || "",
  };

  const templateFiles = [
    "web/index.html",
    "web/products.html",
    "web/settings.html",
    "web/polaris.html",
  ];

  for (const relPath of templateFiles) {
    substituteVars(path.join(outputDir, relPath), vars);
  }

  // 7. Generate functions/.env
  writeFunctionsEnv(outputDir, config);

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
// The wizard scaffolds before the Firebase project and the Shopify app exist,
// so shopify.app.toml is first written with empty values — and its
// placeholders are gone by then. Re-render from the pristine template rather
// than substituting placeholders that no longer exist. This write is
// authoritative: it is the final word on client_id and every URL.
function updateCredentials(outputDir, config) {
  renderAppToml(outputDir, config);
  writeFunctionsEnv(outputDir, config);

  // Verify — an empty client_id or a relative URL means the generated app
  // config is non-functional in the Partner Dashboard
  const tomlPath = path.join(outputDir, "shopify.app.toml");
  const clientId = parseTomlField(tomlPath, "client_id");
  const appUrl = parseTomlField(tomlPath, "application_url");
  const absolute = !!appUrl && appUrl.startsWith("https://");

  if (clientId && absolute) {
    ok(`App config written — ${c.dim}${appUrl}${c.reset}`);
  } else {
    if (!clientId) warn("shopify.app.toml has no client_id — set it manually");
    if (!absolute) warn("shopify.app.toml has no absolute application_url — set it manually");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── MAIN FLOW ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ─── Shopify steps ───────────────────────────────────────────────────────

/** Sign in to Shopify. Uses the CLI's device-code flow — no token pasting. */
async function shopifyLogin() {
  info("Signing in to Shopify...");
  info(`${c.dim}A browser window opens — approve the code shown below.${c.reset}`);
  console.log();
  try {
    await execInteractive("shopify auth login");
    ok("Signed in to Shopify");
    return true;
  } catch {
    warn("Shopify sign-in did not complete");
    return false;
  }
}

/**
 * Create (or link) the Shopify app and read its credentials back.
 * Runs before Firebase so the Client ID and Secret exist by the time any
 * config file is written — the ordering is what makes this hands-free.
 */
async function linkShopifyApp(outputDir, config) {
  try {
    await execInteractive(`shopify app config link --path "${outputDir}"`, outputDir);
  } catch {
    // The CLI can exit non-zero even after the app was created successfully
    warn("Shopify CLI exited with a warning");
  }

  // The CLI occasionally writes the TOML to the parent directory instead
  for (const dir of [outputDir, path.dirname(outputDir)]) {
    if (config.apiKey) break;
    try {
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".toml"))) {
        const filePath = path.join(dir, f);
        const clientId = parseTomlField(filePath, "client_id");
        if (clientId && clientId !== "{{API_KEY}}" && clientId.length > 5) {
          config.apiKey = clientId;
          if (dir !== outputDir) {
            try {
              if (!fs.existsSync(path.join(outputDir, f))) {
                fs.renameSync(filePath, path.join(outputDir, f));
              } else {
                fs.unlinkSync(filePath);
              }
            } catch {}
          }
          break;
        }
      }
    } catch {}
  }

  // `shopify app env show` is non-interactive and returns BOTH values, so the
  // Client Secret never has to be pasted by hand.
  const env = readShopifyEnv(outputDir);
  if (!config.apiKey && env.apiKey) config.apiKey = env.apiKey;
  if (env.apiSecret) config.apiSecret = env.apiSecret;

  if (config.apiKey) ok(`Client ID:     ${c.cyan}${config.apiKey}${c.reset}`);
  if (config.apiSecret) ok(`Client Secret: ${c.dim}${maskSecret(config.apiSecret)}${c.reset}`);
}

// ─── Deploy steps ────────────────────────────────────────────────────────

/** `--force` — a fresh project otherwise stalls on the artifact-policy prompt. */
async function deployFirebase(outputDir, projectId) {
  info("Deploying hosting, functions and Firestore rules...");
  info(`${c.dim}First deploy builds four containers — this takes a few minutes.${c.reset}`);
  try {
    await execInteractive(
      `firebase deploy --project=${projectId} --force`,
      outputDir,
    );
    ok("Deployed to Firebase");
    return true;
  } catch {
    warn("Firebase deploy failed");
    info(`Retry with: ${c.cyan}cd ${path.basename(outputDir)} && firebase deploy --force${c.reset}`);
    return false;
  }
}

/** Push the live URLs to Shopify so the app is installable. */
async function deployShopifyApp(outputDir) {
  info("Registering the live URLs with Shopify...");
  try {
    await execInteractive(
      `shopify app deploy --path "${outputDir}" --allow-updates ` +
        `--message "Deployed to Firebase"`,
      outputDir,
    );
    ok("Shopify app updated");
    return true;
  } catch {
    warn("Could not update the Shopify app");
    info("If that said you are not a member of the organization, the app was");
    info(`created under a different Shopify account — run ${c.cyan}shopify auth login${c.reset}`);
    info(`Retry with: ${c.cyan}cd ${path.basename(outputDir)} && shopify app deploy${c.reset}`);
    return false;
  }
}

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
  // Step 0 — check the toolchain before anything slow or stateful runs,
  // so nothing fails six minutes in because a CLI was missing.
  // (preflight prints its own section header)
  const health = await preflight({ autoInstall: !!args.yes });
  if (!health.ok) {
    console.log();
    fail("Cannot continue until the problems above are resolved.");
    console.log();
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 1 — Shopify sign-in comes first: every later step needs it.
  if (!args["skip-shopify"]) {
    section("Sign In to Shopify");
    await shopifyLogin();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 2 — which kind of app
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

  // ── Extension-only: hand straight over to the Shopify CLI ─────────
  if (appTemplate === "extension") {
    console.log();
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
      initial: DEFAULT_PROJECT_NAME,
      validate: (v) => {
        if (!v.trim()) return "Required";
        if (/[^a-zA-Z0-9._-]/.test(v)) return "Use only letters, numbers, dots, hyphens, underscores";
        return true;
      },
    }, { onCancel });
    projectName = res.projectName;
  }

  // ── App name ──────────────────────────────────────────────────────
  // Derived from the project name, minus the reserved word "Shopify"
  const { appName } = await prompts({
    type: "text",
    name: "appName",
    message: "App name (shown in Shopify admin)",
    initial: deriveAppName(projectName),
    validate: validateAppName,
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
  // Step 4 — register the Shopify app FIRST. Creating it here is what mints
  // the Client ID and Secret, so every file written later already has them.
  section("Create Your Shopify App");

  if (!args["skip-shopify"]) {
    info("The Shopify CLI will ask which organization to use,");
    info(`and let you ${c.bold}create a new app${c.reset} or pick an existing one.`);
    console.log();
    await linkShopifyApp(outputDir, config);
  }

  // ── Fallbacks — only ask for whatever could not be read ───────────
  if (!config.apiKey) {
    console.log();
    info(`Find it at: ${c.cyan}https://partners.shopify.com${c.reset} → Apps → Client credentials`);
    const res = await prompts({
      type: "text",
      name: "apiKey",
      message: `Client ID ${c.dim}(API Key)${c.reset}`,
      validate: (v) => (v.trim() ? true : "Required"),
    }, { onCancel });
    config.apiKey = res.apiKey;
  }

  if (!config.apiSecret) {
    console.log();
    info("The Client Secret could not be read automatically.");
    info(`Find it at: ${c.cyan}https://partners.shopify.com${c.reset} → your app → Client credentials`);
    console.log();
    const { apiSecret } = await prompts({
      type: "password",
      name: "apiSecret",
      message: "Client Secret (API Secret)",
      validate: (v) => (v.trim() ? true : "Required"),
    }, { onCancel });
    config.apiSecret = apiSecret;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Step 5 — Firebase, now that the credentials already exist
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
    // Ask the account store directly. Inferring auth from an empty project
    // list is wrong: a signed-in account with no projects yet looks identical
    // to being signed out.
    info("Checking Firebase authentication...");
    let accounts = listFirebaseAccounts();

    if (accounts.length === 0) {
      info("Opening browser for Firebase login...");
      try {
        await execInteractive("firebase login");
      } catch {
        warn("Firebase login failed — run 'firebase login' manually later");
      }
      accounts = listFirebaseAccounts();
    }

    if (accounts.length === 0) {
      warn("Not signed in to Firebase");
    } else if (accounts.length === 1) {
      ok(`Firebase account: ${c.cyan}${accounts[0]}${c.reset}`);
    } else {
      // Several accounts are signed in — mirror `firebase login:use`
      const { account } = await prompts({
        type: "select",
        name: "account",
        message: "Which Google account should own this project?",
        choices: accounts.map((email) => ({ title: email, value: email })),
      }, { onCancel });

      if (account && (await useFirebaseAccount(account))) {
        ok(`Firebase account: ${c.cyan}${account}${c.reset}`);
      } else if (account) {
        warn(`Could not switch account — continuing as ${accounts[0]}`);
      }
    }

    // ── Project selection ───────────────────────────────────────────
    // Same shape as `firebase init`: create, pick an existing one, adopt a
    // plain Google Cloud project, or type an ID.
    const freshProjects = listFirebaseProjects();
    const fbChoices = [
      { title: `${c.cyan}[create a new project]${c.reset}`, value: "__create__" },
    ];

    for (const p of freshProjects.sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    )) {
      fbChoices.push({
        title: `${p.displayName} ${c.dim}(${p.projectId})${c.reset}`,
        value: p.projectId,
      });
    }

    fbChoices.push({
      title: `${c.dim}[add Firebase to an existing Google Cloud project]${c.reset}`,
      value: "__addfirebase__",
    });
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
    } else if (firebaseChoice === "__addfirebase__") {
      const { gcpId } = await prompts({
        type: "text",
        name: "gcpId",
        message: "Google Cloud project ID",
        validate: (v) => (v.trim() ? true : "Required"),
      }, { onCancel });

      info(`Adding Firebase to ${c.cyan}${gcpId}${c.reset}...`);
      if (await addFirebaseToProject(gcpId)) {
        ok(`Firebase enabled on ${c.cyan}${gcpId}${c.reset}`);
      } else {
        warn("Could not add Firebase automatically — continuing with this ID");
        info(`Manual: firebase projects:addfirebase ${gcpId}`);
      }
      config.projectId = gcpId;
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
  // Steps 6 and 7 — put it live, then tell Shopify where "live" is.
  // Doing both here is the difference between a scaffold and a working app.
  if (config.projectId && !args["no-deploy"]) {
    section("Going Live");

    const deployed = await deployFirebase(outputDir, config.projectId);
    config.deployed = deployed;

    if (deployed && config.apiKey) {
      console.log();
      await deployShopifyApp(outputDir);
    } else if (!deployed) {
      info(`${c.dim}Skipping the Shopify update until the deploy succeeds.${c.reset}`);
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
  const projectName = args.projectName || DEFAULT_PROJECT_NAME;
  const config = {
    projectName,
    // Shopify rejects app names containing "Shopify" — sanitise before use
    appName: sanitizeAppName(args["app-name"] || deriveAppName(projectName)),
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

  // ── Firebase project — provisioning never prompts in CI, so a missing
  //    project has to be created here or 'firebase use' fails ────────────
  if (hasCommand("firebase")) {
    const existing = listFirebaseProjects();
    const projectExists = existing.some((p) => p.projectId === config.projectId);

    if (!projectExists && args["create-project"]) {
      info(`Creating Firebase project: ${c.cyan}${config.projectId}${c.reset}...`);
      const created = await createFirebaseProject(config.projectId, config.appName);
      if (created) {
        ok(`Project created: ${c.cyan}${config.projectId}${c.reset}`);
      } else {
        fail(`Could not create Firebase project "${config.projectId}"`);
        info(`Manual: firebase projects:create "${config.projectId}"`);
      }
    } else if (!projectExists) {
      warn(`Firebase project "${config.projectId}" not found in your account`);
      info("Pass --create-project to create it automatically");
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
  console.log(`    ${c.cyan}1.${c.reset} Deploy your app: ${c.cyan}firebase deploy --force${c.reset}`);
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
  if (config.deployed) {
    console.log(`  ${c.green}${c.bold}Your app is live.${c.reset} Install it on a dev store:`);
    console.log();
    console.log(`    ${c.cyan}${config.appUrl}/auth?shop=YOUR-STORE.myshopify.com${c.reset}`);
    console.log();
    console.log(`  ${c.dim}Replace YOUR-STORE with your development store's domain.${c.reset}`);
  } else {
    console.log(`  ${c.bold}Deploy when ready:${c.reset}`);
    console.log();
    console.log(`    ${c.cyan}cd ${config.projectName}${c.reset}`);
    // --force is required on a fresh project: a bare deploy exits 1 and leaves
    // Hosting unreleased when there is nothing to compare against
    console.log(`    ${c.cyan}firebase deploy --force${c.reset}`);
    console.log(`    ${c.cyan}shopify app deploy${c.reset}`);
    console.log();
    console.log(`  ${c.bold}Then install on your dev store:${c.reset}`);
    console.log();
    console.log(`    ${c.cyan}${config.appUrl}/auth?shop=YOUR-STORE.myshopify.com${c.reset}`);
  }
  console.log();
  console.log(`  ${c.bold}Make changes:${c.reset} edit ${c.cyan}web/${c.reset} or ${c.cyan}functions/src/${c.reset}, then ${c.cyan}firebase deploy --force${c.reset}`);
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
    --yes                    Auto-install any missing CLI tools
    --skip-shopify           Don't create/link a Shopify app
    --no-deploy              Scaffold only — skip the two deploy steps

  ${c.bold}CI / non-interactive:${c.reset}

    --api-key=KEY            Shopify API Key (client_id)
    --api-secret=SECRET      Shopify API Secret
    --project-id=ID          Firebase Project ID
    --scopes=SCOPES          API scopes (default: read_products)
    --language=LANG          typescript or javascript (default: typescript)
    --app-name=NAME          App name shown in Shopify admin
    --create-project         Create the Firebase project if it doesn't exist
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

    ${c.dim}# CI — create the Firebase project too${c.reset}
    npx create-shopify-firebase-app my-app \\
      --api-key=abc123 --api-secret=secret \\
      --project-id=my-new-project --create-project \\
      --firestore-region=us-central1

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
