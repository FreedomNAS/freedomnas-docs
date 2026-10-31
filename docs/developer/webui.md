# WebUI Development

## Architecture

The WebUI is a FastAPI application serving Jinja2 templates with vanilla
JavaScript. No frontend frameworks. No npm. No CDN.

```
api/
├── main.py               FastAPI app, page routes, first-run guard, mounts
│                         community-module routes discovered below
├── module_discovery.py   Scans modules/*/manifest.json for a "webui" block;
│                         mounts each one's router/templates/static (2026-09-02)
├── deps.py               Engine singleton, config singleton, PAM auth
├── restart.py            Restart the WebUI after an update (Notices)
├── serve.py              uvicorn with FreedomNAS's certificate
└── routes/               API route handlers (one file per domain) — core
                          modules only, untouched by module_discovery.py
websocket/
└── terminal.py       Topgrade streaming — see WebSocket Terminal
frontend/
├── templates/        16 Jinja2 templates
└── static/
    ├── css/main.css  Complete CSS design system
    ├── js/           15 JS modules
    └── img/          logo.png, logo_cut.png
```

A community module (its own repo/`.deb`, dropped into `modules/<id>/`) can
add its own routes, page, and static assets without any file above being
edited — see [Orchestrator](../architecture/orchestrator.md) for the
`manifest.json` schema shared with `freedomnas-core`'s `module_loader.py`.
`main.py` mounts each module's `static_dir` at `/static/modules/<id>/`
before the WebUI's own `/static` (mounted the other way round, `/static`
answered first and every module file was a 404), and hands the modules'
`webui.nav` entries to every template as `community_nav`, which
`base.html` draws in the sidebar before System.

Every `/static/` answer carries `Cache-Control: no-cache`: the browser keeps
its copy but asks again each time (a 304 when the ETag still matches). Without
it, after an update a browser could pair a cached old `main.js` with a new page
script calling functions only the new `main.js` has — on 2026-10-11 the System
page's Reboot, Shut Down and Restart WebUI buttons stopped answering that way
on an updated Artix box.

`websocket/terminal.py` serves `/ws/updates/terminal`, included by `main.py`
with `app.include_router(terminal.router)` and consumed by `updates.js`. See
[WebSocket Terminal](../api/websocket.md) for its first-frame authentication
and protocol.

## CSS Design System

CSS custom properties (variables) drive the entire visual system:

```css
:root {
  --sidebar-bg: #0b1929;
  --app-bg:     #0f1f33;
  --card-bg:    #162233;
  --accent:     #3b82f6;
  --ok:         #10b981;
  --warn:       #f59e0b;
  --err:        #ef4444;
  --text:       #e2e8f0;
  --text-muted: #94a3b8;
  --border:     #1e3a5f;
}

[data-theme="light"] {
  --app-bg:   #f0f4f8;
  --card-bg:  #ffffff;
  --text:     #1e293b;
  /* ... */
}
```

Dark theme is the default. Light theme is applied via `[data-theme="light"]`
on `<html>`, stored in `localStorage`.

## JS Modules

One file per page plus `main.js`, shared by every authenticated page; what
each one does is in [Frontend JavaScript Modules](frontend.md).

## deps.py — Dependency Injection

`api/deps.py` provides the FastAPI dependencies shared by all route handlers:

```python
from api.deps import get_engine, get_config, authenticate
```

| Dependency | What it returns | Notes |
|------------|----------------|-------|
| `get_engine()` | `FreedomNASEngine` singleton | Calls `freedomnas.engine.get_engine()` |
| `get_config()` | `ConfigurationManager` singleton | Lazily created on first call, module-level cache |
| `authenticate(request)` | `str` (username) | PAM validation via the `pam` module (Debian packages it as `python3-pampy`); `401` for wrong credentials, `401` `Password expired` for a temporary password, `403` for an account outside the edition's admin group |
| `authenticate_account(request)` | `str` (username) | The same without the administrator check: only `/api/account/*` uses it |

PAM authentication validates against the OS user database: every account
with a valid password can sign in, and only administrators reach the
administration API — see [Security](../architecture/security.md#authentication-is-not-authorisation).
There is no FreedomNAS-specific user store for auth.

```python
# Route handler — auth + DI pattern
@router.post("/hostname")
async def set_hostname(body: dict, username: str = Depends(authenticate)):
    engine = get_engine()
    config = get_config()
    ...
```

**Never** instantiate `FreedomNASEngine` or `ConfigurationManager` directly in a
route handler — always use these functions. This ensures both objects remain
singletons within the process.

## `api()` Function

All API calls go through the shared `api()` function from `main.js`:

```javascript
async function api(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const auth = Auth.get();
    if (auth) headers['Authorization'] = `Basic ${auth}`;

    const opts = { method, headers };
    if (body !== null) opts.body = JSON.stringify(body);

    let res;
    try { res = await fetch(path, opts); }
    catch (e) { throw new Error(`Network error: ${e.message}`); }

    if (res.status === 401) {
        Auth.clear();
        location.href = `/auth/?next=${encodeURIComponent(location.pathname)}`;
        throw new Error('Unauthorized');
    }
    if (res.status === 403) {
        if (location.pathname !== '/account/') location.href = '/account/';
        throw new Error('This account is not an administrator');
    }
    if (res.status === 503) {
        location.href = '/setup/';
        throw new Error('Not initialized');
    }
    return res;
}
```

Never use `fetch()` directly in page JS. Always use `api()`.

## Template Inheritance

All authenticated pages extend `base.html`:

```html
{% extends "base.html" %}

{% block content %}
<div class="page-content">
  <!-- page HTML here -->
</div>
{% endblock %}

{% block extra_js %}
<script src="/static/js/page-name.js"></script>
{% endblock %}
```

`setup.html`, `auth.html`, `password.html` and `restoring.html` are
standalone (no sidebar needed); `index.html` only redirects to
`/dashboard/`. `base.html` keeps the menu in `{% block nav %}` and the UI
level picker in `{% block topbar_tools %}`: `account.html` replaces both, so
an account that is not an administrator sees no link it cannot open.

## Template Variable Reference

Placeholders the Debian profiles fill, with the actions that use them; the
other editions use the same names.

| Variable | Used by | Example value |
|----------|---------|---------------|
| `{username}` | `users.create`, `users.add_to_group` | `admin` |
| `{uid}`, `{gid}` | `users.create_with_uid`, `users.uid_set`, `users.gid_set` | `1000` |
| `{groups}` | `users.create` | `sudo,users` |
| `{group}` | `users.add_to_group`, `users.group_create` | `media` |
| `{interface}` | `network.ipv4_static`, `network.dns_set`, … | `fnas_lan0` |
| `{ip}`, `{cidr}`, `{gateway}` | `network.ipv4_static` | `192.168.1.50`, `24`, `192.168.1.1` |
| `{dns}` | `network.dns_set` | `1.1.1.1 8.8.8.8` |
| `{package_name}` | `packages.install` | `samba` |
| `{pool_name}` | `zfs.pool_create`, … | `tank` |
| `{dataset}` | `zfs` | `tank/documents` |
| `{snap_name}` | `zfs.snapshot_create` | `pre-update-20260627` — **not** `snapshot_name`, see [Storage API](../api/storage.md) |
| `{ashift}`, `{compression}`, `{vdev_type}`, `{devices}` | `zfs.pool_create` | `12`, `lz4`, `mirror`, `/dev/disk/by-id/ata-...` |
| `{size}` | `zfs.volume_create` | `500G` |
| `{share_name}`, `{path}`, `{comment}`, `{acl}` | `samba.create_share` | `Documents`, `/tank/documents` |
| `{path}`, `{clients}`, `{options}` | `nfs.export_add` | `/tank/backup`, `192.168.1.0/24`, `rw,sync,no_subtree_check` |
| `{hostname}` | `system.hostname_set` | `freedomnas` |
| `{timezone}` | `system.timezone_set` | `Europe/Rome` |
| `{service_name}` | `services.start`, … | `smbd` |

## Offline documentation

The WebUI serves this documentation at `/docs/`, from the copy the
`freedomnas-docs` package installs (`<install root>/docs`, next to `webui/`;
in a checkout, a built `freedomnas-docs/site` beside the WebUI repository).
`freedomnas-webui` depends on that package — see [Packaging](packaging.md). What a reader sees is
the documentation of the version running there, not the latest one online.
Without a copy, `/docs/` answers with a page saying it is not installed. The
path is not behind the API's login, like the sign-in page. FastAPI's own
Swagger UI moved from `/docs` to `/api/docs` (and ReDoc to `/api/redoc`) to
make room.

| Where | What |
|-------|------|
| Sidebar | **Documentation**, opening `/docs/` in a new tab |
| Topbar | **?**, opening the page for the current section (`DOCS_PAGES` in `main.js`) |
| Every page load | `saveDocsContext()` stores version, edition, init system and firmware from `/api/system/info` in `localStorage["fnas_docs_context"]` |

The documentation reads that key (`javascripts/freedomnas.js`, same origin):
it puts a banner at the top of each page naming the system and both
versions, turns it into a warning when the documentation belongs to another
release — the part before the `+` of `FREEDOMNAS_DOCS_VERSION`, written at
build time into a `<meta name="freedomnas-docs-version">`, against the
system's `VERSION` — and selects the tabs that match the system's init
system, firmware or edition. Two snapshots of the same release carry
different commits and are not a mismatch. On the public site there is no
such key and nothing changes.

The site is self-contained: the fonts are shipped in `docs/assets/fonts`
and `theme.font` is off, so nothing is fetched from the internet, neither
when the site is built nor when it is read.

## Development Rules

- No frontend JS frameworks (React, Vue, Angular, Svelte, Alpine)
- No CSS frameworks (Bootstrap, Tailwind)
- No npm, no CDN
- All API calls through `api()` from `main.js`
- All system calls through `engine.execute()` — never `subprocess` in routes
- Every mutation: dual write (engine + config persist)
