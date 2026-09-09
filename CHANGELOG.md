# Changelog

## 3.0.0

### Changed

- Renamed to **nitrogen**. The package is now `create-nitrogen` and the command
  is `npm create nitrogen my-app` (or `npx create-nitrogen my-app`). The old
  name described the stack rather than naming the tool, and sat closer to
  Shopify's trademark than a third-party scaffolder should. Nitrogen follows
  Shopify's own element naming - Hydrogen, Oxygen - and reads as the inert
  layer everything else runs inside, which is what a zero-framework scaffolder
  is.
- No functional changes. Every flag, prompt and generated file is identical to
  2.2.1; only the package name, binary name and branding differ.

### Migrating

`create-shopify-firebase-app` is deprecated. Nothing to change in a generated
project - only the command you scaffold with.

## 2.2.1

### Fixed

- Pause for the Blaze upgrade instead of failing on it. Cloud Functions cannot
  deploy without billing, and the run used to print a one-line note, continue,
  and die minutes later inside the container build. It now stops before the
  deploy, offers to open the upgrade page, waits for confirmation, and then
  carries on with the deploy and the Shopify update in the same run.
- Skip the deploy entirely when the user declines the upgrade, rather than
  spending minutes reaching a known failure. The summary then leads with the
  upgrade link instead of claiming the app is ready.
- A deploy that fails on a Spark project no longer suggests raising
  `FUNCTIONS_DISCOVERY_TIMEOUT`, which cannot help a billing rejection.
- Never offer to create a Firebase project that was just created. The scaffold
  creates it, then provisioning re-derived existence from `projects:list`,
  which is eventually consistent. On a slow index that came back empty and
  prompted "Create Firebase project X?" for a project that already existed -
  and the second `projects:create` then died on "already exists", aborting the
  run with nothing provisioned.
- Stop misreading firebase-tools failures. The captured stderr is often just an
  ora spinner frame ("- Creating Google Cloud Platform project"), so the
  "already exists" match missed and a recoverable state became a hard failure.
  Existence is now probed directly, and reported errors skip spinner noise.
- Always offer a Firestore region. `firestore:locations` needs the Firestore
  API, which a brand-new project does not have enabled yet, so it failed
  exactly when first needed - silently skipping the prompt and leaving the
  project with no database. It now falls back to a built-in region list.
- Don't print "Firebase authenticated" twice.

## 2.2.0

Fixes from real-world feedback on 2.1.0 — the scaffolded project now ends up in
the state a Shopify app is supposed to be in, and the deploy stops failing on
Windows.

### One `shopify.app.toml`, not two

`shopify app config link` writes its own `shopify.app.<name>.toml`, so every
scaffolded project ended up with two configs — and the CLI's was the active one.
That file carries the *remote* app's defaults: empty `access_scopes`, an
`application_url` of `https://shopify.dev/apps/default-app-home`, and matching
redirect URLs. The correct values written by this tool sat in `shopify.app.toml`
where nothing read them, so `shopify app deploy` would have pushed placeholders
to Shopify.

Linking now harvests the Client ID, handle, organization id and app name from
whatever the CLI wrote — in the project directory or, as it sometimes does, the
parent — reads the Client Secret while that file is still on disk, then removes
it. Projects ship a single `shopify.app.toml`, the layout every Shopify template
uses. The CLI's file is only deleted once the Client ID is safely captured, so a
failed link leaves it in place.

`[build] include_config_on_deploy = true` was added to the template so
`shopify app deploy` actually uploads the URLs and scopes in that file.

### The app name is asked once

Both this wizard and the Shopify CLI asked for it. The Shopify CLI's answer is
the one the Partner Dashboard shows, so it wins: the name is read back from the
linked config and flows into the Firebase web app name, the page titles and the
app config. The prompt now only appears under `--skip-shopify`, where nothing
else would ask.

### `--distribute` opens the right page

The old URL — `partners.shopify.com/apps/<clientId>/distribution` — is not a
real route. The dashboard addresses apps by numeric organization and app ids,
and neither appears in `shopify.app.toml`. The ids are now scraped from a
dashboard link the Shopify CLI prints (`shopify app versions list`) and used to
build `https://partners.shopify.com/org/<org>/org_apps/<app>/distribution`,
falling back to the organization's app list and then to the Partners home.

The URL is printed as its own block before the browser opens, and when the exact
link cannot be resolved that is stated rather than silently opening the wrong
page. `--distribute` also recognises the Shopify CLI's named config files, so it
works in projects that were not scaffolded here.

### Firebase deploy no longer times out on the first run

`firebase deploy` boots the functions codebase and polls it for a manifest,
giving up after 10 seconds. A first load on Windows — cold `node_modules`,
antivirus reading every file — routinely takes longer and failed the whole
deploy with `User code failed to load. Cannot determine backend specification.`
The deploy step now runs with `FUNCTIONS_DISCOVERY_TIMEOUT=120`, and the failure
message explains how to set it by hand.

### Also

- `--app-name` still works for CI; the help text says when it is needed.
- Corrected a stale `Shopify API 2026-01` line in `--help` (the template ships
  2026-07).
