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
└── routes/               API route handlers (one file per domain) — core
                          modules only, untouched by module_discovery.py
websocket/
└── terminal.py       Topgrade streaming — see WebSocket Terminal
frontend/
├── templates/        11 Jinja2 templates
└── static/
    ├── css/main.css  Complete CSS design system
    ├── js/           10 JS modules
    └── img/          logo.png, logo_cut.png
```

A community module (its own repo/`.deb`, dropped into `modules/<id>/`) can
add its own routes, page, and static assets without any file above being
edited — see [Orchestrator](../architecture/orchestrator.md) for the
`manifest.json` schema shared with `freedomnas-core`'s `module_loader.py`.

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

| File | Purpose |
|------|---------|
| `main.js` | Shared: `api()`, `Auth`, `toast()`, `confirm()`, `Theme`, `UILevel`, `Sidebar`, `initShared()` |
| `auth.js` | Login form, credential check, post-login redirect |
| `setup.js` | 3-step wizard state machine |
| `dashboard.js` | System info polling, module health cards |
| `storage.js` | Pool/dataset/snapshot CRUD, tab switching |
| `shares.js` | SMB/NFS CRUD, inline delete confirm |
| `network.js` | Interface list, edit IP modal |
| `users.js` | User table, create/delete |
| `updates.js` | Topgrade runner, status polling |
| `system.js` | Hostname save, reboot/shutdown confirm |

## deps.py — Dependency Injection

`api/deps.py` provides three FastAPI dependencies shared by all route handlers:

```python
from api.deps import get_engine, get_config, authenticate
```

| Dependency | What it returns | Notes |
|------------|----------------|-------|
| `get_engine()` | `FreedomNASEngine` singleton | Calls `freedomnas.engine.get_engine()` |
| `get_config()` | `ConfigurationManager` singleton | Lazily created on first call, module-level cache |
| `authenticate(credentials)` | `str` (username) | PAM validation via the `pam` module (Debian packages it as `python3-pampy`); raises `HTTP 401` on failure |

PAM authentication validates against the OS user database. Any OS user with a valid
password can log in. There is no FreedomNAS-specific user store for auth.

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

`setup.html` and `auth.html` are standalone (no sidebar needed);
`index.html` only redirects to `/dashboard/`.

## Template Variable Reference

| Variable | Category | Example value |
|----------|---------|---------------|
| `{username}` | users | `admin` |
| `{uid}` | users.create | `1000` |
| `{gid}` | users.create | `1000` |
| `{shell}` | users.create | `/bin/bash` |
| `{groups}` | users.create | `sudo,samba` |
| `{group}` | users.add_to_group | `samba` |
| `{interface}` | network | `fnas_lan` |
| `{ip}` | network.set_static_ip | `192.168.1.50` |
| `{cidr}` | network.set_static_ip | `24` |
| `{gateway}` | network.set_static_ip | `192.168.1.1` |
| `{dns}` | network.set_static_ip | `1.1.1.1 8.8.8.8` |
| `{packages}` | packages.install | `samba samba-common-bin` |
| `{pool_name}` | zfs | `datapool` |
| `{dataset}` | zfs | `datapool/documents` |
| `{snap_name}` | zfs.snapshot_create | `pre-update-20260627` — **not** `snapshot_name`, see [Storage API](../api/storage.md) |
| `{ashift}` | zfs.create_pool | `12` |
| `{disks}` | zfs.create_pool | `/dev/disk/by-id/ata-...` |
| `{algorithm}` | zfs.set_compression | `lz4` |
| `{share_name}` | samba | `Documents` |
| `{path}` | samba, nfs | `/mnt/datapool/documents` |
| `{guest_ok}` | samba.create_share | `n` |
| `{allowed_hosts}` | nfs.add_export | `192.168.1.0/24` |
| `{options}` | nfs.add_export | `rw,sync,no_subtree_check` |
| `{hostname}` | system | `freedomnas` |
| `{timezone}` | system | `Europe/Rome` |
| `{service_name}` | services | `smbd` |
| `{size}` | zfs.set_quota | `500G` |

## Development Rules

- No frontend JS frameworks (React, Vue, Angular, Svelte, Alpine)
- No CSS frameworks (Bootstrap, Tailwind)
- No npm, no CDN
- All API calls through `api()` from `main.js`
- All system calls through `engine.execute()` — never `subprocess` in routes
- Every mutation: dual write (engine + config persist)
