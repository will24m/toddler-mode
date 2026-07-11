# Chrome-Extension Best-Practices Alignment — Design

**Date:** 2026-07-11
**Status:** Approved (autonomous session; user directive: "align to industry best practices for chrome extensions")

## Gaps being closed

The extension already follows the big MV3 rules (scoped permissions, no remote
code, background-owned secrets, privacy policy). What's missing is the
engineering and store-behavior baseline expected of a serious extension:

1. **No CI.** Tests/typecheck/build only run when someone remembers to.
2. **No lint/format tooling.** TypeScript strict is the only style gate.
3. **Toolbar icon does nothing.** An `action` with no popup and no `onClicked`
   handler is a dead button — users click it and assume the extension is broken.
4. **No onboarding.** After install, nothing tells the user the extension is
   ready or how to configure the cloud fallback.
5. **No `minimum_chrome_version`.** The store should not offer the extension
   to browsers it was never tested on.
6. **No LICENSE** despite the store listing describing the project as open
   source.
7. **No automated dependency updates** for security patches.

## Design

### 1. CI — `.github/workflows/ci.yml`

GitHub Actions on push/PR to `main` (and pushes to any branch): checkout,
setup-node LTS with npm cache, `npm ci`, `npm test`, `npm run check`,
`npm run lint`, `npm run build`. One job; the matrix isn't needed.

### 2. Lint + format — Biome

(Originally planned as ESLint + Prettier, but typescript-eslint's peer range
caps at TypeScript <6.1 and this repo uses TypeScript 7. Biome parses TS
natively with no peer dependency and covers linting *and* formatting.)

- `biome.json`: recommended lint rules, 100-column single-quote formatting to
  match the existing style, git-ignore integration so `.wxt/`/`.output/` are
  skipped.
- Scripts: `lint` (`biome check .`), `format` (`biome check --write .`).
- Fix whatever the first run flags.

### 3. Manifest & background behavior

- `minimum_chrome_version: '116'` — the floor actually tested; MV3 service
  worker + promise-based extension APIs are long stable there. The on-device
  path additionally wants Chrome 138 and is already feature-detected.
- `browser.action.onClicked` → `openOptionsPage()` — the toolbar button
  becomes the settings entry point (standard for popupless actions).
- `browser.runtime.onInstalled` (reason `install` only) → `openOptionsPage()`
  — one-time onboarding; the options page already explains on-device status
  and cloud setup. No update-time tab spam.

### 4. Repo hygiene

- `LICENSE`: MIT (matches the "open source" store description; flagged to the
  user for review since license choice is ultimately theirs).
- `.github/dependabot.yml`: weekly npm updates, grouped minor/patch.
- README: add CI badge-free "Quality gates" note in Develop section; mention
  the toolbar-click behavior in Use.
- Store-listing doc: no changes needed (no new permissions).

## Explicitly skipped (with reasons)

- **i18n / `_locales`** — single-language product today; CWS doesn't require it.
- **Action popup UI** — the options page covers configuration; a popup would
  duplicate it.
- **Explicit `content_security_policy`** — MV3's default
  (`script-src 'self'`) is already the strict policy; restating it adds noise.
- **Uninstall URL / any telemetry** — contradicts the no-data-collection brand.

## Testing

Existing 52 tests keep passing; `npm run lint` green after fixes; CI file
validated by running the same commands locally; built manifest shows
`minimum_chrome_version`; `onInstalled`/`onClicked` handlers visible in the
built background bundle.
