/**
 * Preflight — environment doctor
 *
 * Runs FIRST, before any scaffolding, provisioning or network work, so the
 * user never discovers a missing tool six minutes into a long flow.
 *
 * Modelled on `flutter doctor`: check everything at once, report it in one
 * compact aligned block, fix what can be fixed, and be explicit about what is
 * merely degraded versus what actually blocks the run.
 *
 * Checks:
 * - Node.js       >= 20                (fatal — templates target Node 22)
 * - npm                                (fatal — installs everything else)
 * - git                                (warn  — only used for `git init`)
 * - firebase-tools                     (fatal — offers to install)
 * - @shopify/cli                       (fatal — offers to install)
 * - gcloud                             (warn  — API enablement / billing link)
 *
 * The five CLI probes are slow subprocess calls, so they run in parallel.
 */

import { execSync, spawn } from "node:child_process";
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
const section = (title) => {
  console.log();
  console.log(`  ${c.cyan}===${c.reset} ${c.bold}${title}${c.reset} ${c.cyan}===${c.reset}`);
  console.log();
};

// ─── Requirements ─────────────────────────────────────────────────────

/** Cloud Functions templates target the Node 22 runtime; the CLI needs modern ESM. */
const MIN_NODE_MAJOR = 20;

/** Width of the name column in the report — keeps every result line aligned. */
const LABEL_WIDTH = 14;

// ─── Shell helpers ────────────────────────────────────────────────────

/**
 * Run a probe command without ever throwing.
 *
 * shell:true is required on Windows, where npm/firebase/shopify are .cmd
 * shims that spawn() cannot execute directly (ENOENT).
 *
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, error?: string }>}
 */
function probe(cmd, timeout = 30000) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child = null;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child?.kill(); } catch {}
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, stdout, stderr, error: `timed out after ${Math.round(timeout / 1000)}s` }),
      timeout,
    );

    try {
      child = spawn(cmd, {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (e) {
      finish({ ok: false, stdout, stderr, error: e.message });
      return;
    }

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => finish({ ok: false, stdout, stderr, error: e.message }));
    child.on("close", (code) => finish({ ok: code === 0, stdout, stderr }));
  });
}

/**
 * Pull a version out of CLI output.
 *
 * Prefers a line that is *only* a version ("13.35.1") so update notices and
 * banners cannot win; falls back to the first version-shaped token, which is
 * what "git version 2.47.0" and "Google Cloud SDK 542.0.0" need.
 */
function parseVersion(text) {
  const lines = String(text || "").split("\n");
  for (const line of lines) {
    const bare = line.trim().match(/^v?(\d+\.\d+(?:\.\d+)?)/);
    if (bare) return bare[1];
  }
  const any = String(text || "").match(/\d+\.\d+(?:\.\d+)?/);
  return any ? any[0] : null;
}

/** Install a global npm package, showing npm's own progress. Never throws. */
function installGlobal(pkg) {
  try {
    execSync(`npm install -g ${pkg}`, { stdio: "inherit", timeout: 300000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e?.message || "").toString().trim() };
  }
}

// ─── Individual checks ────────────────────────────────────────────────
// Every check resolves to { name, ok, fatal, version, message }.
// `fatal` means "this failure blocks the run", so it is always false when
// ok === true, and false for the optional tools (git, gcloud) even when they
// are missing.

/** Node.js — read from the running process, no subprocess needed. */
function checkNode() {
  try {
    const version = process.versions?.node || String(process.version || "").replace(/^v/, "");
    const major = parseInt(String(version).split(".")[0], 10);

    if (!Number.isFinite(major)) {
      return {
        name: "Node.js",
        ok: false,
        fatal: true,
        version: null,
        message: "could not determine the running Node version",
      };
    }
    if (major < MIN_NODE_MAJOR) {
      return {
        name: "Node.js",
        ok: false,
        fatal: true,
        version,
        message: `v${version} — Node ${MIN_NODE_MAJOR}+ required (templates target the Node 22 runtime)`,
      };
    }
    return { name: "Node.js", ok: true, fatal: false, version, message: `v${version}` };
  } catch (e) {
    return { name: "Node.js", ok: false, fatal: true, version: null, message: e?.message || "check failed" };
  }
}

async function checkNpm() {
  const r = await probe("npm --version");
  const version = r.ok ? parseVersion(r.stdout) : null;
  if (r.ok) return { name: "npm", ok: true, fatal: false, version, message: version || "installed" };
  return {
    name: "npm",
    ok: false,
    fatal: true,
    version: null,
    message: "not found — npm ships with Node.js and is needed to install everything else",
  };
}

async function checkGit() {
  const r = await probe("git --version");
  const version = r.ok ? parseVersion(r.stdout) : null;
  if (r.ok) return { name: "git", ok: true, fatal: false, version, message: version || "installed" };
  return {
    name: "git",
    ok: false,
    fatal: false,
    version: null,
    message: "not found — the project will be created without 'git init' (non-blocking)",
  };
}

async function checkFirebase() {
  const r = await probe("firebase --version", 60000);
  const version = r.ok ? parseVersion(r.stdout) : null;
  if (r.ok) return { name: "Firebase CLI", ok: true, fatal: false, version, message: version || "installed" };
  return {
    name: "Firebase CLI",
    ok: false,
    fatal: true,
    version: null,
    message: "not found — required to create the project, Firestore and Hosting",
  };
}

async function checkShopify() {
  // `shopify version` is slow the first time it runs — give it room.
  const r = await probe("shopify version", 90000);
  const version = r.ok ? parseVersion(r.stdout) : null;
  if (r.ok) return { name: "Shopify CLI", ok: true, fatal: false, version, message: version || "installed" };
  return {
    name: "Shopify CLI",
    ok: false,
    fatal: true,
    version: null,
    message: "not found — required to create and link the Shopify app",
  };
}

async function checkGcloud() {
  const r = await probe("gcloud --version", 60000);
  const version = r.ok ? parseVersion(r.stdout) : null;
  if (r.ok) return { name: "gcloud", ok: true, fatal: false, version, message: version || "installed" };
  return {
    name: "gcloud",
    ok: false,
    fatal: false,
    version: null,
    message: "not found — billing and API enablement will need manual steps",
  };
}

// ─── The two CLIs preflight can install for you ───────────────────────
const INSTALLABLE = [
  { name: "Firebase CLI", pkg: "firebase-tools", recheck: checkFirebase },
  { name: "Shopify CLI",  pkg: "@shopify/cli",   recheck: checkShopify },
];

// ─── Reporting ────────────────────────────────────────────────────────

/** One compact aligned line: `✔ Node.js        v22.20.0`. */
function line(check) {
  const label = String(check.name).padEnd(LABEL_WIDTH);
  const detail = check.ok
    ? `${c.cyan}${check.message}${c.reset}`
    : check.message;
  return `${label} ${detail}`;
}

function print(check) {
  if (check.ok) ok(line(check));
  else if (check.fatal) fail(line(check));
  else warn(line(check));
}

// ─── Main ─────────────────────────────────────────────────────────────

/**
 * Verify the local toolchain before anything else runs.
 *
 * @param {object} options
 * @param {boolean} [options.autoInstall]     Install missing firebase/shopify CLIs without asking.
 * @param {boolean} [options.nonInteractive]  Never prompt — report only.
 * @returns {Promise<{ ok: boolean, checks: Array<{ name: string, ok: boolean, fatal: boolean, version: string|null, message: string }> }>}
 */
export async function preflight(options = {}) {
  const isCI = !!options.nonInteractive;
  let checks = [];

  try {
    section("Environment Check");

    // ── 1. Probe everything at once ─────────────────────────────
    // These are slow subprocess calls (the Shopify CLI alone can take
    // seconds), so they must not run one after another.
    const node = checkNode();
    const [npm, git, firebase, shopify, gcloud] = await Promise.all([
      checkNpm(),
      checkGit(),
      checkFirebase(),
      checkShopify(),
      checkGcloud(),
    ]);

    checks = [node, npm, git, firebase, shopify, gcloud];
    for (const check of checks) print(check);

    // ── 2. Fix what can be fixed ────────────────────────────────
    for (const spec of INSTALLABLE) {
      const idx = checks.findIndex((ch) => ch.name === spec.name);
      if (idx < 0 || checks[idx].ok) continue;

      console.log();

      let shouldInstall = false;
      if (isCI) {
        info(`Install it with: ${c.dim}npm install -g ${spec.pkg}${c.reset}`);
      } else if (options.autoInstall) {
        shouldInstall = true;
      } else {
        const answer = await prompts({
          type: "confirm",
          name: "shouldInstall",
          message: `Install ${spec.name} now (npm install -g ${spec.pkg})?`,
          initial: true,
        });
        shouldInstall = !!answer.shouldInstall;
      }

      if (!shouldInstall) {
        if (!isCI) info(`Skipped — install later: ${c.dim}npm install -g ${spec.pkg}${c.reset}`);
        continue;
      }

      info(`Installing ${spec.name}...`);
      const result = installGlobal(spec.pkg);

      if (result.ok) {
        checks[idx] = await spec.recheck();
        print(checks[idx]);
      } else {
        warn(`Could not install ${spec.pkg} automatically`);
        info(`Install manually: ${c.dim}npm install -g ${spec.pkg}${c.reset}`);
        if (result.error) info(`${c.dim}${result.error.split("\n")[0]}${c.reset}`);
      }
    }

    // ── 3. Verdict ──────────────────────────────────────────────
    const blockers = checks.filter((ch) => !ch.ok && ch.fatal);
    const degraded = checks.filter((ch) => !ch.ok && !ch.fatal);

    console.log();
    if (blockers.length === 0) {
      if (degraded.length > 0) {
        ok(`Environment ready ${c.dim}(${degraded.length} optional tool${degraded.length > 1 ? "s" : ""} missing)${c.reset}`);
      } else {
        ok("Environment ready");
      }
    } else {
      fail(`Cannot continue — ${blockers.length} required tool${blockers.length > 1 ? "s" : ""} missing or out of date`);
      for (const b of blockers) info(`${b.name}: ${b.message}`);
      if (blockers.some((b) => b.name === "Node.js")) {
        info(`Upgrade Node: ${c.cyan}https://nodejs.org${c.reset}`);
      }
    }

    return { ok: blockers.length === 0, checks };
  } catch (e) {
    // Preflight must never be the thing that crashes the CLI.
    fail(`Environment check failed: ${e?.message || e}`);
    checks.push({
      name: "preflight",
      ok: false,
      fatal: true,
      version: null,
      message: e?.message || "unexpected error during the environment check",
    });
    return { ok: false, checks };
  }
}
