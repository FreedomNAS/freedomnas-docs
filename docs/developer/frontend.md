# Frontend JavaScript Modules

The WebUI frontend is vanilla JavaScript — no frameworks, no npm, no CDN.
All JS files live in `freedomnas-webui/frontend/static/js/`.

## Module Overview

| File | Page | Responsibility |
|------|------|----------------|
| `main.js` | All authenticated pages | Shared utilities: Auth, API, Toast, Confirm, Theme, UILevel, Sidebar |
| `auth.js` | `/auth/` (login) | Login form, credential validation, redirect logic |
| `setup.js` | `/setup/` (wizard) | 3-step first-run wizard |
| `dashboard.js` | `/dashboard/` | System info cards, update badge, module health grid |
| `storage.js` | `/storage/` | Pool creation, cache/log devices, dataset properties, snapshots — tabbed view |
| `shares.js` | `/shares/` | SMB and NFS share management with tabbed view |
| `users.js` | `/users/` | User list, add/delete with modal |
| `network.js` | `/network/` | Interface list, static IP configuration modal |
| `system.js` | `/system/` | Hostname/timezone forms, reboot/shutdown buttons |
| `updates.js` | `/updates/` | Update status, WebSocket terminal for running updates |

---

## main.js — Shared Utilities

`main.js` is loaded on every authenticated page. It defines global helpers
used by all other modules.

### Auth

Stores HTTP Basic Auth credentials in `sessionStorage` — never in
`localStorage` (lost on tab close by design).

```js
Auth.set(username, password)   // encodes as btoa("user:pass")
Auth.get()                     // returns the base64 token or null
Auth.getUser()                 // returns the username
Auth.isLoggedIn()              // boolean
Auth.clear()                   // removes both sessionStorage keys
```

Storage keys: `fnas_auth` (base64 token), `fnas_user` (plain username).

### api() and apiJSON()

`api(method, path, body)` — adds `Authorization: Basic <token>` header,
redirects to `/auth/?next=<current>` on 401, redirects to `/setup/` on
503.

`apiJSON(method, path, body)` — wraps `api()`, parses JSON, throws if
`res.ok` is false (using `data.detail` as the error message).

### toast(msg, type, duration)

Appends a self-removing toast to `#toast-stack`. Types: `'ok'`,
`'err'`, `'warn'`, `'info'`. Duration defaults to 4000 ms. `msg` is shown
as text, never parsed as HTML: error messages repeat what was typed.

### confirm(title, msg, dangerLabel)

Returns a `Promise<boolean>` — resolves `true` if the user clicks the
confirm button, `false` on cancel or backdrop click.

### Theme

Persists theme choice in `localStorage` (`fnas_theme`). Applies by setting
`data-theme` on `<html>`. Toggles between `'dark'` and `'light'`.

### UILevel

Three UI levels control which elements are shown:

| Level | `data-ui` attribute | Hidden CSS class |
|-------|---------------------|------------------|
| `assisted` | `body[data-ui=assisted]` | `.advanced-only`, `.expert-only` |
| `advanced` | `body[data-ui=advanced]` | `.expert-only` |
| `expert` | `body[data-ui=expert]` | (nothing hidden) |

Persisted in `localStorage` (`fnas_ui_level`).

### Sidebar

On a desktop the menu button collapses the sidebar to icons; the state is
persisted in `localStorage` (`fnas_sidebar`) and toggles `.collapsed` on
`.sidebar` and `.sidebar-collapsed` on `.main-area`.

At 640px and below the sidebar is an off-canvas drawer instead: the button
adds `.mobile-open` and shows `#sidebar-backdrop`, and the drawer closes on
a tap on the backdrop, on Escape, or when the width goes back above the
breakpoint. The desktop preference is not touched there, so the icon-only
mode never leaks into a phone's "desktop site" view. `Sidebar.mobileQuery`
must match the `max-width` of the mobile `@media` block in `main.css`.

### Documentation links

`setHelpLink()` points the topbar **?** at the page of the documentation for
the current section (`DOCS_PAGES`), and `saveDocsContext()` stores what the
offline documentation reads — see
[WebUI Internals](webui.md#offline-documentation).

### initShared()

Called as the first statement of every page's `DOMContentLoaded` handler.
Redirects to login if not authenticated; otherwise applies Theme, UILevel,
Sidebar, marks the active nav item, sets the help link, loads user and
edition badges (saving the documentation context), wires theme/sidebar/logout
buttons.

Returns `true` on success, `false` after redirect.

### openModal / closeModal / bindModalClose

```js
openModal('modal-user')      // adds .open class
closeModal('modal-user')     // removes .open class
bindModalClose('modal-user') // wires [data-close] buttons + backdrop click
```

### setLoading(btn, loading, label)

Saves the button's original HTML to `btn._origHTML`, replaces it with a
spinner while loading, restores on done.

---

## auth.js

- Applies theme from `localStorage` before anything renders (prevents flash)
- If `sessionStorage.fnas_auth` already exists, calls `redirectAfterLogin()`
  immediately (skips login form)
- On form submit: calls `GET /api/system/info` with the typed credentials.
  If 200, stores them; if 401, clears password field
- `redirectAfterLogin()`: checks `GET /api/setup/status` — if
  `initialized` is false, goes to `/setup/`; otherwise to `?next=` param
  or `/dashboard/`

---

## setup.js

Three-step wizard. No `initShared()` — runs unauthenticated.

- **Step 1**: hostname (validated: letters/digits/hyphens) + timezone, a
  `<select>` filled by `fillTimezones()` from `Intl.supportedValuesOf('timeZone')`
  and preselected with the browser's own zone. Not a `<datalist>`: it filters
  by what the field already holds, so a field starting at `UTC` offered nothing
  else
- **Step 2**: edition selector (`debian`/`freebsd`/`arch`/`gentoo`/`artix`/`void`),
  preselected from `detected_edition`; the hint under it shows `Detected: <edition>.`
- **Step 3**: summary display → **Initialize** button calls
  `POST /api/setup/initialize` (no auth header) → shows success panel with
  link to `/auth/`

On load: checks `GET /api/setup/status`; if already initialized, redirects
to `/dashboard/`, otherwise preselects `detected_edition`. The review step
shows the edition's label, not its id.

---

## dashboard.js

Loads three data sources in parallel on `DOMContentLoaded`:

1. `GET /api/system/info` → fills hostname, edition, uptime, timezone cards
2. `GET /api/updates/status` → fills update-count badge (green/orange)
3. Health grid: renders hardcoded module names (`storage`, `network`,
   `shares`, `users`, `updates`) all as `running` state (no dedicated
   health endpoint yet — uses `/api/system/info` success as proxy)

---

## storage.js

Tab-based view with three panels: **Pools**, **Datasets**, **Snapshots**.

- Switching tabs calls the appropriate `load*()` function
- **Pools panel**: renders pool cards with health badge and usage bar
  (colour: green <70%, orange <85%, red ≥85%)
- **Datasets panel**: table with name, used, avail, refer, mountpoint
- **Snapshots panel**: table with name, creation, used
- The **Snapshots** tab and its **Create Snapshot** button are
  `advanced-only`: modal with dataset datalist (pre-filled from loaded
  pools) and snapshot name input, sent as `snap_name`
- **Create Pool** button → `openPoolForm()`: loads `GET /api/storage/devices`,
  greys out devices that are `in_use`, fills the cache/log selects with free
  devices; the log select is `advanced-only`. `submitPool()` asks a final
  `confirm()` listing the devices, then `POST /api/storage/pools`; a cache or
  log device that failed to attach comes back as a warning toast
- Pool cards (`advanced-only` block): attached cache/log devices with a
  detach **×** (`DELETE /api/storage/pools/{pool}/devices?device=…`) and
  **Add cache or log device** (`POST /api/storage/pools/{pool}/devices`)
- Datasets panel **Properties** button (`advanced-only`) → modal built from
  `GET /api/storage/properties` + the dataset's current values; each property
  is gated by its `level`, `create_only` ones are left out

---

## shares.js

Tab-based view: **SMB** and **NFS**.

- **Add Share** button pre-configures the modal for the active tab type
- SMB-specific fields (`#f-share-ro`) hidden for NFS and vice versa
- Delete buttons call `confirm()` before `DELETE /api/shares/{type}/{name}`

---

## users.js

- Username validated client-side: `/^[a-z_][a-z0-9_-]{0,31}$/`
- Group selection: checkboxes with class `.f-group`
- Current user (`Auth.getUser()`) shown with a "you" badge; their delete
  button is hidden
- Delete column hidden in `assisted` UI level (`advanced-only` CSS class)

---

## network.js

- Handles both Linux (`ip -j link` JSON array) and FreeBSD (`ifconfig -j`)
  output formats with a fallback chain for field names
- **Edit IP** button (hidden in `assisted` level): opens modal pre-filled
  with current address and prefix length
- DNS field accepts comma- or space-separated values, split client-side
  before sending to API

---

## system.js

!!! warning "Timezone form bug"
    The timezone form's submit handler currently calls `POST /api/system/hostname`
    instead of a timezone endpoint (which doesn't exist yet). The toast says
    "Timezone change requires engine support — saved to config." This is a
    known placeholder.

- Hostname form: `POST /api/system/hostname`
- Reboot/shutdown: both gated behind `confirm()` modal with explicit label

---

## updates.js

- `GET /api/updates/status` → shows pending update count and configure modal
- **Run Updates** button opens a WebSocket to `ws[s]://<host>/ws/updates/terminal`
- WebSocket message protocol:
    - `{"line": "...", "stream": "stdout"|"stderr"}` — append line to terminal
    - `{"exit_code": 0}` — update finished; re-poll status if success
- Lines are classified by content (`error`/`fail` → red, `warn` → orange,
  `✓`/`success`/`done` → green, `==>` → info)
- On open, sends `{"auth": Auth.get()}` as the first frame — a WebSocket
  carries no `Authorization` header. The server closes with `4401` (bad or
  missing credentials) or `4403` (not an administrator); see
  [WebSocket Terminal](../api/websocket.md)

---

## Code Conventions

- No `import` statements — all modules share a single global scope
- `esc(s)` is defined locally in most page modules (not in `main.js`) to
  HTML-escape user content before injecting into `innerHTML`; it escapes
  `& < > " '`, so its output is safe in text and in quoted attributes
- **No values in inline handlers.** `onclick="deleteSmb('${esc(name)}')"`
  is not safe whatever `esc` does: the HTML parser decodes `&#39;` back to
  `'` before JavaScript reads the string. Put the value in a `data-*`
  attribute and read it from a listener on the container
  (`btn.dataset.share`). `tests/test_pages.py` fails on any `on…="…${`
- All `fetch` calls go through `apiJSON()` so auth and redirect handling
  is centralised
- Modal IDs follow the pattern `modal-<name>`, form IDs `form-<name>`,
  submit button IDs `btn-<action>-submit`
