# Frontend JavaScript Modules

The WebUI frontend is vanilla JavaScript — no frameworks, no npm, no CDN.
All JS files live in `freedomnas-webui/frontend/static/js/`.

## Module Overview

| File | Page | Responsibility |
|------|------|----------------|
| `main.js` | All authenticated pages | Shared utilities: Auth, API, Toast, Confirm, Theme, UILevel, Sidebar, Notices |
| `auth.js` | `/auth/` (sign in) | Sign-in form, the new password a temporary one asks for, where to go next |
| `password.js` | `/password/` | Any account changes its own password, without signing in |
| `setup.js` | `/setup/` (wizard) | Five-step first-run wizard, and the restored-system variant |
| `restoring.js` | `/restoring/` | The restore-in-progress page: steps, failure, **Continue** |
| `dashboard.js` | `/dashboard/` | System info, update count, module health, a rollback that happened |
| `storage.js` | `/storage/` | Pools, datasets, snapshots, replication, events, disks — tabbed view |
| `shares.js` | `/shares/` | SMB (owner or group shares and their members) and NFS shares |
| `users.js` | `/users/` | Accounts: add, delete, password, administrator role |
| `network.js` | `/network/` | Interfaces with automatic rollback, bridges/bonds/VLANs, WireGuard |
| `services.js` | `/services/` | The services FreedomNAS knows: state, start/stop/restart, at boot |
| `plugins.js` | `/plugins/` | Community modules: list, install, remove, as jobs |
| `system.js` | `/system/` | Hostname, timezone, certificate, SSH, automatic rollback, reboot/shutdown |
| `updates.js` | `/updates/` | Update status, WebSocket terminal for running updates |
| `account.js` | `/account/` | Every account's own page: password, its shares, the NAS's apps, the CA |

Community modules bring their own page scripts (containers, proxy), served
from their `static_dir` — see [WebUI Internals](webui.md).

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
redirects to `/auth/?next=<current>` on 401, to `/account/` on 403 (an
account that is not an administrator) and to `/setup/` on 503.

`apiJSON(method, path, body)` — wraps `api()`, parses JSON, throws if
`res.ok` is false (using `data.detail` as the error message).

### Notices, restartWebUI(), rebootSystem()

`Notices.refresh()` runs from `initShared()` and every two minutes: it reads
`GET /api/system/webui` and `GET /api/system/boot` and puts the restart and
reboot notices at the top of `.page-content` (`#global-notices`), each with
its button. `restartWebUI()` confirms (naming running replication jobs,
refusing during an update), posts `/api/system/webui/restart` and polls
`GET /api/system/webui` until `started` changes, then reloads the page.
`rebootSystem()` is the confirm + `POST /api/system/reboot` the System page
uses too.

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
edition badges (saving the documentation context), refreshes the notices,
wires theme/sidebar/logout buttons. `initShared({ limited: true })`, on the
account page, leaves out the edition badge and the notices: their endpoints
are for administrators.

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
- On form submit: calls `GET /api/system/info` (`/api/setup/whoami` while the
  system is not initialized) with the typed credentials. 200: stores them
  and goes on. 401 with `Password expired`: hides the form and asks for a new
  password twice, posts `/api/account/password` and signs in with the new
  one. Another 401: clears the password field. 403: checks
  `GET /api/account/me` and goes to `/account/`
- `redirectAfterLogin()`: checks `GET /api/setup/status` — if
  `initialized` is false, goes to `/setup/`; otherwise to `?next=` param
  or `/dashboard/`

---

## setup.js

Five steps — **Administrator**, **System**, **Storage**, **Configuration**,
**Review** — with its own `api()` (no `initShared()`: the page runs before
the configuration exists). On load it reads `GET /api/setup/status`: an
initialized system goes to `/dashboard/`; `password_chosen` (set in the
installer) skips the new administrator password; `restored` fetches
`GET /api/setup/restored` and turns the wizard into the restored variant
(take over a restored administrator, temporary passwords for the other
accounts). Storage lists disks and pools (`/api/setup/devices`,
`/api/setup/pools`); **Initialize** posts `/api/setup/initialize`. The
user-facing flow is in [First Run](../getting-started/first-run.md).

---

## restoring.js

Polls `GET /api/restore/progress` and draws each step of the restore with
its state; when the lock is gone it waits for the WebUI to restart and goes
to the normal pages. A failed step shows its error and **Continue**
(`POST /api/restore/continue`). See [Restore in progress](../api/setup.md#restore-in-progress).

---

## dashboard.js

Loads in parallel on `DOMContentLoaded`:

1. `GET /api/system/info` → hostname, edition, uptime, timezone cards
2. `GET /api/updates/status` → update-count badge
3. `GET /api/system/health` → one card per module, with its state and
   detail line, every 15 s; a notice when the checks are not running, and
   **Restart module** on a blocked one (`POST /api/system/modules/{id}/restart`)
4. `GET /api/system/boot` → a notice when the system fell back to the
   previous kernel or snapshot, dismissed with `POST /api/system/boot/forget`

---

## storage.js

The largest module: six tabs, **Pools**, **Datasets**, **Snapshots**,
**Replication**, **Events**, **Disks**, each loaded when shown. Pools: create
(free devices, cache/log), import (inspect, unlock, users it needs), the
pool detail with its vdevs and their actions, properties, history, export
and removal. Datasets: create, volume, move, rename, destroy (with the shares
on them), mountpoint, properties, quotas, user properties, delegation.
Snapshots, bookmarks, holds and diffs; replication jobs; ZFS events; disks
with SMART and self-tests. What each tab shows at which UI level is in the
[Storage guide](../user-guide/storage.md), the endpoints in the
[Storage API](../api/storage.md).

---

## shares.js

Tab-based view: **SMB / CIFS** and **NFS**.

- **Add Share** pre-configures the modal for the active tab; an SMB share
  belongs to one owner or to a group, whose members are picked from
  `GET /api/users/` and changed later with **Members**
  (`PUT /api/shares/smb/{name}/members`)
- Delete buttons call `confirm()` before `DELETE /api/shares/{type}/{name}`

---

## users.js

- Username validated client-side: `/^[a-z_][a-z0-9_-]{0,31}$/`
- Current user (`Auth.getUser()`) shown with a "you" badge; their delete
  button is hidden
- **Password** (`POST /api/users/{name}/password`), **Make administrator** /
  **Remove administrator** (`POST /api/users/{name}/admin`, `advanced-only`),
  delete; a restored account waiting for its owner's own password carries a
  badge

---

## network.js

- Interfaces from `GET /api/network/interfaces`; a change goes through
  `PUT /api/network/interfaces/{name}` and the automatic rollback: the page
  follows `GET /api/network/pending` and confirms, or reverts, also from the
  new address (`/api/network/confirm-token`)
- Bridges, bonds and VLANs (`/api/network/virtual`), interfaces that are
  gone (forget), WireGuard with its peers, their configuration file and QR
  code (`/api/network/wireguard`)

---

## services.js

`GET /api/services/` and `POST /api/services/{name}/{action}`; what is
shown depends on the UI level.

---

## plugins.js

`GET /api/plugins/`, install and remove as a job followed with
`GET /api/plugins/job?since=N`, `POST /api/plugins/refresh` for the
catalogue.

---

## system.js

- Hostname (`POST /api/system/hostname`) and timezone
  (`POST /api/system/timezone`, a `<select>` filled by `fillTimezones()`)
- Certificate (`GET /api/system/certificate`, the CA download), SSH
  (`/api/system/ssh`), automatic rollback (`/api/system/boot/autorollback`)
- Reboot/shutdown: both gated behind `confirm()` modal with explicit label

---

## account.js

`initShared({ limited: true })`, then `GET /api/account/me`: the account,
its groups, its shares with the address to open them from this browser's
host, one button per web page of the NAS (`url`, or `scheme` and `port` on
`location.hostname`, plus `path`) and the CA fingerprint. Changing the
password posts `/api/account/password` and stores the new credentials
(`Auth.set`). See [My Account](../user-guide/account.md).

---

## updates.js

- `GET /api/updates/status` → shows pending update count and configure modal
- **Run Updates** button opens a WebSocket to `ws[s]://<host>/ws/updates/terminal`
- WebSocket message protocol:
    - `{"line": "...", "stream": "stdout"|"stderr"}` — append line to terminal
    - `{"restart_needed": …, "reboot_needed": …}` — says so in the terminal and
      refreshes the notices (`Notices.refresh()` in main.js)
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
