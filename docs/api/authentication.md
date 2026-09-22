# Authentication

## Method

FreedomNAS uses **HTTP Basic Auth** via PAM. Credentials are validated against
the OS user database — no separate user store.

## Sending Credentials

Include an `Authorization` header on every API request:

```
Authorization: Basic <base64(username:password)>
```

JavaScript example (from `main.js`):

```javascript
const headers = { 'Content-Type': 'application/json' };
const auth = sessionStorage.getItem('fnas_auth');  // stored as btoa("user:pass")
if (auth) headers['Authorization'] = `Basic ${auth}`;

const res = await fetch('/api/users/', { method: 'GET', headers });
```

## Exempt Routes

These routes do not require authentication:

| Route | Reason |
|-------|--------|
| `GET /api/system/status` | Health check (monitoring tools) |
| `GET /api/setup/status` | First-run wizard must check state before login |
| `POST /api/setup/initialize` | First-run wizard runs before any user exists |

## Response Codes

| Code | Meaning |
|------|---------|
| `401 Unauthorized` | Missing or invalid credentials |
| `503 Service Unavailable` | System not initialized — complete `/setup/` first |

The WebUI handles these automatically: 401 redirects to `/auth/`, 503 redirects to `/setup/`.

### The 401 challenge is `FreedomNAS`, not `Basic`

Every 401 carries `WWW-Authenticate: FreedomNAS`. The credentials are still
Basic, as above; only the challenge differs. A browser that sees
`WWW-Authenticate: Basic` opens its own login dialog in front of the sign-in
page, keeps the page's request waiting until the dialog is closed (so the page
never shows its error), and then sends whatever was typed there on every
request by itself, cross-site ones included. No browser acts on an unknown
scheme, so the sign-in page stays the only place credentials are entered.

API clients are unaffected: `curl -u` and most HTTP libraries send the
`Authorization` header up front and never read the challenge. A client that
waits for a `Basic` challenge before sending credentials has to be told to send
them preemptively.

## First-Run Guard

Before the system is initialized (`config.is_initialized() == False`), all
authenticated API routes return 503. Page routes are always served (the
browser loads the HTML, JavaScript handles the redirect to `/setup/`).

## Session Storage

Credentials are stored in `sessionStorage` (browser session only, cleared
on tab close) — not in `localStorage` or cookies.
