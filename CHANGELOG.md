# Changelog

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
