# Store Readiness & Security Hardening — Design

**Date:** 2026-07-10
**Status:** Approved (autonomous session; user directive: "make it super legit, pass Google's review, account for user/data security")

## Goal

Make Toddler Mode pass Chrome Web Store review cleanly and harden the extension's
security posture around the API key and the content↔background message surface.
No new user-facing features; the select → 🧸 → bubble flow is unchanged.

## Problems being solved

1. **`host_permissions: ['<all_urls>']`** is the single most common CWS rejection
   reason ("requesting broader permissions than necessary"). The background only
   ever fetches the user's configured AI endpoint.
2. **No privacy policy or permission justifications** — CWS requires a privacy
   policy URL and per-permission justifications for any extension that handles
   user data (selected page text and an API key both count).
3. **Trust-boundary gaps** (defense in depth, none currently exploitable):
   - The background trusts the port message shape and length; only the content
     script enforces the 3–8000 char selection limits.
   - A custom endpoint may be plain `http://` to any host, and the fetch follows
     redirects — an `x-api-key`-style header would travel to the redirect target.
   - The endpoint URL is never validated anywhere.

## Design

### 1. Scoped host permissions (`wxt.config.ts`)

- `host_permissions`: `https://api.openai.com/*`, `https://api.anthropic.com/*`
  (the two provider defaults — granted at install, no prompt friction for the
  common case).
- `optional_host_permissions`: `https://*/*`, `http://localhost/*`,
  `http://127.0.0.1/*` — custom endpoints request their specific origin at
  save-time.
- `homepage_url`: `https://github.com/will24m/toddler-mode`.
- Content script keeps `<all_urls>` matches — that IS the single purpose
  (summarize a selection on any page) and is justified in the listing doc.

### 2. `utils/endpoint.ts` — pure, unit-tested

- `validateEndpoint(url: string): string | null` — returns a human-readable
  error or `null` if OK. Rules: must parse as a URL; scheme must be `https:`,
  or `http:` only for `localhost` / `127.0.0.1` / `[::1]` (local LLMs like
  Ollama); no embedded credentials (`user:pass@host`).
- `endpointOriginPattern(url: string): string | null` — the match pattern for
  the endpoint's origin (e.g. `https://api.example.com/*`), used with the
  `browser.permissions` API. `null` if the URL doesn't parse.

### 3. Shared selection limits + strict request parsing (`utils/messaging.ts`)

- Move `MIN_SELECTION_LENGTH = 3` / `MAX_SELECTION_LENGTH = 8000` here from
  `entrypoints/content/index.ts`; the content script imports them.
- `parseSummarizeText(msg: unknown): string | null` — accepts only
  `{ type: 'summarize', text: string }` with trimmed length in bounds; returns
  the text (sliced to the max) or `null`. Unit-tested. The background uses this
  instead of trusting the message.

### 4. Background hardening (`entrypoints/background.ts`)

- Parse port messages with `parseSummarizeText`; silently ignore malformed ones.
- Before fetching: re-run `validateEndpoint` (defense in depth — storage is
  writable by the options page only, but validate anyway) and check
  `browser.permissions.contains` for the endpoint origin. Missing permission →
  `error` response telling the user to re-save their settings.
- `redirect: 'error'` on the fetch so `Authorization` / `x-api-key` headers can
  never follow a redirect to a different origin.

### 5. Options page permission flow (`entrypoints/options/main.ts`)

On Save (a user gesture, so `permissions.request` is allowed):

1. `validateEndpoint` — invalid → show the error, don't save.
2. If the endpoint origin isn't already granted (`permissions.contains`),
   call `permissions.request({ origins: [pattern] })`. Denied → still save, but
   show a warning that the cloud fallback can't reach that endpoint until
   permission is granted.

### 6. Store paperwork

- `PRIVACY.md` (repo root; the GitHub URL doubles as the CWS privacy-policy
  link): developer collects nothing; selected text goes only to the
  user-configured provider and only when the user clicks the bear; on-device
  path sends nothing anywhere; key in `chrome.storage.local`, read only by the
  service worker and the options page; no analytics, no remote code.
- `docs/store-listing.md`: single-purpose statement, per-permission
  justifications (`storage`, content `<all_urls>`, the two host permissions,
  the optional host permissions), CWS data-usage form answers, remote-code
  declaration (none).
- README: short "Privacy & security" section linking both.

## Out of scope

- No `activeTab`-style redesign (the icon must appear on selection without a
  toolbar click — content script on `<all_urls>` is inherent to the product).
- No key encryption at rest (Chrome offers no extension keychain; storage.local
  is the platform-standard place — documented honestly instead).
- No store screenshots/promo images (needs a human with a browser).

## Testing

- `utils/endpoint.test.ts` — valid https, http-localhost allowance, http-remote
  rejection, credentials rejection, garbage rejection, origin patterns.
- `utils/messaging.test.ts` — parseSummarizeText accepts/rejects shapes, trims,
  enforces min/max, slices overlong text.
- Existing 32 tests keep passing; `npm run check` and `npm run build` green;
  built manifest inspected for the scoped permissions.
