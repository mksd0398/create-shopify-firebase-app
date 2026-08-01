/**
 * Firebase Provisioning
 *
 * Checks and provisions Firebase services from the CLI:
 * - Authentication (firebase login)
 * - Project linking / creation
 * - Firestore database (with region selection)
 * - Web App registration
 * - Hosting site verification
 * - Cloud Functions billing warning
 */

import { execSync } from "node:child_process";
import prompts from "prompts";

// ─── ANSI helpers ─────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const ok   = (msg) => console.log(`  ${c.green}✔${c.reset} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);
const info = (msg) => console.log(`  ${c.cyan}ℹ${c.reset} ${msg}`);
const fail = (msg) => console.log(`  ${c.red}✘${c.reset} ${msg}`);

// ─── Firebase CLI wrappers ────────────────────────────────────────────

// All wrappers accept an optional cwd for commands that need a project dir
let _cwd = undefined;

/** Run firebase command, parse JSON output. Returns null on failure. */
function firebaseJson(args, projectId) {
  const pFlag = projectId ? ` --project=${projectId}` : "";
  try {
    const out = execSync(`firebase ${args}${pFlag} --json`, {
      encoding: "utf8",
      timeout: 60000,
      cwd: _cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out);
  } catch (e) {
    try { return JSON.parse(e.stdout || ""); } catch {}
    try { return JSON.parse(e.stderr || ""); } catch {}
    return null;
  }
}

/** Run firebase command, return raw stdout string or { error, message }. */
function firebaseRaw(args, projectId, timeout = 60000) {
  const pFlag = projectId ? ` --project=${projectId}` : "";
  try {
    return execSync(`firebase ${args}${pFlag}`, {
      encoding: "utf8",
      timeout,
      cwd: _cwd,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    return {
      error: true,
      message: (e.stderr || e.stdout || e.message || "").trim(),
    };
  }
}

/** Run firebase command silently. Returns true on success. */
function firebaseExec(args, projectId, timeout = 60000) {
  const pFlag = projectId ? ` --project=${projectId}` : "";
  try {
    execSync(`firebase ${args}${pFlag}`, { timeout, cwd: _cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Sleep — used by the retry/backoff loops below. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── gcloud CLI wrappers ──────────────────────────────────────────────

/** True when the gcloud CLI is installed and on PATH. */
function hasGcloud() {
  try {
    execSync("gcloud --version", { timeout: 30000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Run gcloud command, return raw stdout string or { error, message }. */
function gcloudRaw(args, timeout = 180000) {
  try {
    return execSync(`gcloud ${args}`, {
      encoding: "utf8",
      timeout,
      cwd: _cwd,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    return {
      error: true,
      message: (e.stderr || e.stdout || e.message || "").trim(),
    };
  }
}

// ─── Service checks ───────────────────────────────────────────────────

function checkLogin() {
  const r = firebaseJson("projects:list");
  if (r?.status === "success") {
    return { ok: true, projects: r.result || [] };
  }
  return { ok: false };
}

/**
 * Direct existence probe — a project-scoped call that only succeeds when the
 * project really exists for this account. Unlike projects:list it is not
 * served from an eventually-consistent index.
 */
function projectExistsDirect(projectId) {
  // apps:list is cheap and project-scoped: it errors on a missing project but
  // succeeds (possibly with zero apps) on one that exists.
  const r = firebaseJson("apps:list", projectId);
  if (r?.status === "success") return true;
  // Secondary probe — `firebase use` resolves the project id server-side.
  return firebaseExec(`use ${projectId}`);
}

/**
 * Confirm a project exists, tolerating the eventual consistency of
 * `firebase projects:list`. A project created seconds earlier (by index.js)
 * is often absent from that list, which used to produce a bogus
 * "Create Firebase project X?" prompt for a project that already exists.
 */
async function confirmProjectExists(projectId, listed = []) {
  if (listed.some((p) => p.projectId === projectId)) return true;
  if (projectExistsDirect(projectId)) return true;

  info("Waiting for the project to appear in Firebase...");
  for (const delay of [1500, 3000, 5000]) {
    await sleep(delay);
    const r = firebaseJson("projects:list");
    const projects = r?.status === "success" ? r.result || [] : [];
    if (projects.some((p) => p.projectId === projectId)) return true;
    if (projectExistsDirect(projectId)) return true;
  }
  return false;
}

function checkFirestore(projectId) {
  const r = firebaseJson("firestore:databases:list", projectId);
  if (r?.status === "success") {
    const dbs = r.result || [];
    return { provisioned: dbs.length > 0, databases: dbs };
  }
  return { provisioned: false };
}

function createFirestoreDb(projectId, region) {
  const out = firebaseRaw(
    `firestore:databases:create "(default)" --location=${region}`,
    projectId,
    120000,
  );
  if (typeof out === "string") return { ok: true, output: out };
  return { ok: false, error: out.message };
}

/** Google API that must be enabled before the first Firestore call. */
const FIRESTORE_API = "firestore.googleapis.com";

/**
 * True for the "API not enabled" 403. Google reports this with status
 * PERMISSION_DENIED, so it must be tested *before* the billing/permission
 * branches or it gets misdiagnosed as a billing problem.
 */
function isApiDisabledError(message = "") {
  return (
    message.includes("has not been used in project") ||
    message.includes("SERVICE_DISABLED") ||
    message.includes("accessNotConfigured") ||
    (message.includes(FIRESTORE_API) &&
      (message.includes("403") || message.includes("is disabled")))
  );
}

/**
 * Ensure the Cloud Firestore API is enabled on a (possibly brand-new) project.
 *
 * A fresh GCP project has firestore.googleapis.com disabled, so the very first
 * `firestore:databases:create` fails with 403. The firebase CLI has no command
 * to enable an API, so shell out to gcloud when it is available.
 *
 * @returns {{ enabled: boolean, reason?: string, error?: string }}
 */
function ensureFirestoreApi(projectId) {
  if (!hasGcloud()) return { enabled: false, reason: "no-gcloud" };

  const out = gcloudRaw(
    `services enable ${FIRESTORE_API} --project=${projectId}`,
  );
  if (typeof out === "string") return { enabled: true };
  return { enabled: false, reason: "failed", error: out.message };
}

/** Actionable guidance for the "API not enabled" 403 (retrying will not help). */
function printApiDisabledHelp(projectId, region) {
  warn(`The Cloud Firestore API is not enabled on project "${projectId}"`);
  info("Re-running the same create command will fail identically until it is.");
  info(
    `Enable: ${c.cyan}https://console.cloud.google.com/apis/library/${FIRESTORE_API}?project=${projectId}${c.reset}`,
  );
  info(
    `Or run: ${c.dim}gcloud services enable ${FIRESTORE_API} --project=${projectId}${c.reset}`,
  );
  info("Then (allow ~1 min for it to propagate):");
  info(
    `  firebase firestore:databases:create "(default)" --location=${region} --project=${projectId}`,
  );
}

/**
 * Set the Cloud Functions artifact cleanup policy.
 *
 * `firebase deploy` prompts for this on the first functions deploy. In a
 * non-interactive shell that prompt aborts the run *after* functions deploy
 * but *before* the hosting release, leaving Hosting UNRELEASED (site 404s).
 * Setting the policy up-front removes the prompt from the user's later deploy.
 */
function setArtifactPolicy(projectId) {
  const out = firebaseRaw(
    "functions:artifacts:setpolicy --force",
    projectId,
    120000,
  );
  if (typeof out === "string") return { ok: true, output: out };
  return { ok: false, error: out.message };
}

function fetchLocations() {
  const raw = firebaseRaw("firestore:locations");
  if (typeof raw !== "string") return null;

  const locations = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/│\s*(.+?)\s*│\s*(\S+)\s*│/);
    if (m && !m[1].includes("Display Name")) {
      locations.push({
        title: `${m[2].trim().padEnd(28)} ${c.dim}${m[1].trim()}${c.reset}`,
        value: m[2].trim(),
      });
    }
  }
  return locations.length > 0 ? locations : null;
}

function checkWebApps(projectId) {
  const r = firebaseJson("apps:list WEB", projectId);
  if (r?.status === "success") {
    const apps = r.result || [];
    return { exists: apps.length > 0, apps };
  }
  return { exists: false, apps: [] };
}

function createWebApp(projectId, name) {
  const r = firebaseJson(`apps:create WEB "${name}"`, projectId);
  if (r?.status === "success") {
    return { ok: true, appId: r.result?.appId };
  }
  return { ok: false, error: r?.error };
}

function getAppConfig(appId, projectId) {
  const r = firebaseJson(`apps:sdkconfig WEB ${appId}`, projectId);
  return r?.status === "success" ? r.result?.sdkConfig : null;
}

function checkHosting(projectId) {
  const r = firebaseJson("hosting:sites:list", projectId);
  if (r?.status === "success") {
    const sites = r.result?.sites || r.result || [];
    return { exists: Array.isArray(sites) && sites.length > 0, sites };
  }
  return { exists: false, sites: [] };
}

// ─── Main provisioning flow ──────────────────────────────────────────

/**
 * Run the Firebase provisioning flow.
 *
 * @param {object} config   - { projectId, appName, projectName }
 * @param {object} options  - { skipProvision, firestoreRegion, nonInteractive, cwd }
 */
export async function provisionFirebase(config, options = {}) {
  const { projectId, appName } = config;
  const isCI = !!options.nonInteractive;

  // Set working directory for firebase commands that need firebase.json
  _cwd = options.cwd;

  // ── 1. Login ────────────────────────────────────────────────
  const login = checkLogin();

  if (!login.ok) {
    fail("Not logged into Firebase CLI");
    if (!isCI) {
      const { doLogin } = await prompts({
        type: "confirm",
        name: "doLogin",
        message: "Open browser to log in to Firebase?",
        initial: true,
      });
      if (doLogin) {
        info("Opening browser for Firebase login...");
        try {
          execSync("firebase login", { stdio: "inherit", timeout: 120000 });
          ok("Logged in successfully");
        } catch {
          fail("Login failed — run 'firebase login' manually");
          return;
        }
      } else {
        info("Run 'firebase login' then re-run this tool");
        return;
      }
    } else {
      info("Run: firebase login");
      return;
    }
  } else {
    ok("Firebase authenticated");
  }

  // ── 2. Project ──────────────────────────────────────────────
  // projects:list is eventually consistent, so a project created moments ago
  // may be missing from it — confirm properly before offering to create one.
  const projectExists = await confirmProjectExists(projectId, login.projects);

  if (!projectExists && !isCI) {
    warn(`Project "${projectId}" not found in your Firebase account`);
    const { shouldCreate } = await prompts({
      type: "confirm",
      name: "shouldCreate",
      message: `Create Firebase project "${projectId}"?`,
      initial: false,
    });
    if (shouldCreate) {
      info("Creating project (this may take a moment)...");
      const out = firebaseRaw(
        `projects:create ${projectId}`,
        null,
        120000,
      );
      if (typeof out === "string") {
        ok("Firebase project created");
      } else if (out.message?.includes("already exists")) {
        info("GCP project exists — adding Firebase resources...");
        firebaseRaw(`projects:addfirebase ${projectId}`, null, 120000);
      } else {
        fail("Could not create project");
        info(out.message);
        return;
      }
    }
  }

  if (firebaseExec(`use ${projectId}`)) {
    ok(`Project: ${c.cyan}${projectId}${c.reset}`);
  } else {
    fail(`Could not link project "${projectId}"`);
    info("Verify the project exists at console.firebase.google.com");
    return;
  }

  if (options.skipProvision) {
    info("Skipping service provisioning (--skip-provision)");
    return;
  }

  // ── 3. Firestore ────────────────────────────────────────────
  console.log();
  info("Checking Firestore...");
  const fs = checkFirestore(projectId);

  if (fs.provisioned) {
    const db = fs.databases[0];
    ok(`Firestore: ${c.cyan}${db?.locationId || "provisioned"}${c.reset}`);
  } else {
    warn("Firestore not provisioned");

    let region = options.firestoreRegion;

    if (!region && !isCI) {
      const locations = fetchLocations();
      if (locations) {
        const defaultIdx = locations.findIndex(
          (l) => l.value === "asia-south1",
        );
        const answer = await prompts({
          type: "select",
          name: "region",
          message: "Firestore region (cannot be changed later)",
          choices: locations,
          initial: defaultIdx >= 0 ? defaultIdx : 0,
        });
        region = answer.region;
      }
    }

    if (region) {
      // A brand-new GCP project has firestore.googleapis.com disabled, which
      // makes the very first create return 403 — enable the API first.
      info("Ensuring the Cloud Firestore API is enabled...");
      const api = ensureFirestoreApi(projectId);
      if (api.enabled) {
        ok("Cloud Firestore API enabled");
      } else if (api.reason === "no-gcloud") {
        info("gcloud not found — skipping API pre-enable");
      } else {
        warn("Could not enable the Cloud Firestore API automatically");
      }

      info(`Provisioning Firestore in ${c.cyan}${region}${c.reset}...`);
      let result = createFirestoreDb(projectId, region);

      // A freshly enabled API takes a moment to go live — retry once.
      if (api.enabled && !result.ok && isApiDisabledError(result.error)) {
        info("API just enabled — waiting for it to propagate, then retrying...");
        await sleep(10000);
        result = createFirestoreDb(projectId, region);
      }

      if (result.ok) {
        ok(`Firestore: ${c.cyan}${region}${c.reset}`);
      } else if (isApiDisabledError(result.error)) {
        // Reported as PERMISSION_DENIED but it is not a billing/permission
        // problem — handle it before those branches so the advice is correct.
        fail("Firestore provisioning failed — Cloud Firestore API not enabled");
        printApiDisabledHelp(projectId, region);
      } else {
        fail("Firestore provisioning failed");
        if (
          result.error?.includes("PERMISSION_DENIED") ||
          result.error?.includes("billing") ||
          result.error?.includes("Billing")
        ) {
          warn("Billing (Blaze plan) may be required");
          info(
            `Enable: https://console.firebase.google.com/project/${projectId}/usage/details`,
          );
        } else if (result.error) {
          info(result.error.split("\n")[0]);
        }
        info(
          `Manual: firebase firestore:databases:create "(default)" --location=${region} --project=${projectId}`,
        );
      }
    } else if (!isCI) {
      info("Skipped — provision later with:");
      info(
        `firebase firestore:databases:create "(default)" --location=REGION --project=${projectId}`,
      );
    }
  }

  // ── 4. Web App ──────────────────────────────────────────────
  console.log();
  info("Checking Web App...");
  const wa = checkWebApps(projectId);

  if (wa.exists) {
    ok(
      `Web App: ${c.cyan}${wa.apps[0].displayName || wa.apps[0].appId}${c.reset}`,
    );
  } else {
    let shouldCreate = false;

    if (!isCI) {
      const answer = await prompts({
        type: "confirm",
        name: "shouldCreate",
        message: `Create Firebase Web App "${appName}"?`,
        initial: true,
      });
      shouldCreate = answer.shouldCreate;
    } else if (options.firestoreRegion) {
      // In CI with explicit flags, auto-create
      shouldCreate = true;
    }

    if (shouldCreate) {
      info("Creating Web App...");
      const result = createWebApp(projectId, appName);
      if (result.ok) {
        ok(`Web App: ${c.cyan}${appName}${c.reset}`);
        if (result.appId) {
          const cfg = getAppConfig(result.appId, projectId);
          if (cfg) {
            info(`API Key:     ${c.dim}${cfg.apiKey}${c.reset}`);
            info(`Auth Domain: ${c.dim}${cfg.authDomain}${c.reset}`);
          }
        }
      } else {
        fail("Could not create Web App");
        info(
          `Manual: firebase apps:create WEB "${appName}" --project=${projectId}`,
        );
      }
    } else if (!isCI) {
      info(
        `Create later: firebase apps:create WEB "${appName}" --project=${projectId}`,
      );
    }
  }

  // ── 5. Hosting ──────────────────────────────────────────────
  console.log();
  info("Checking Hosting...");
  const hs = checkHosting(projectId);

  if (hs.exists) {
    const url = hs.sites[0]?.defaultUrl || hs.sites[0]?.name;
    ok(`Hosting: ${c.cyan}${url}${c.reset}`);
  } else {
    info("Hosting auto-provisions on first deploy");
    info(
      `Deploy: firebase deploy --only hosting --project=${projectId}`,
    );
  }

  // ── 6. Deploy prerequisites ─────────────────────────────────
  // Do this now so the user's later plain `firebase deploy` never hits the
  // artifact cleanup-policy prompt, which aborts between the functions deploy
  // and the hosting release. Non-fatal — warn only.
  console.log();
  info("Setting Functions artifact cleanup policy...");
  const policy = setArtifactPolicy(projectId);

  if (policy.ok) {
    ok("Artifact cleanup policy set — 'firebase deploy' will not prompt");
  } else {
    warn("Could not set the artifact cleanup policy (non-fatal)");
    info("If 'firebase deploy' stops before releasing Hosting, run:");
    info(
      `  firebase functions:artifacts:setpolicy --force --project=${projectId}`,
    );
    info("  or deploy with: firebase deploy --force");
  }

  // ── 7. Cloud Functions / billing ────────────────────────────
  console.log();
  info(
    `${c.bold}Cloud Functions${c.reset} require the Blaze (pay-as-you-go) plan`,
  );
  info(
    `Upgrade: ${c.cyan}https://console.firebase.google.com/project/${projectId}/usage/details${c.reset}`,
  );
  info("Blaze free tier includes 2M function invocations/month");
}
