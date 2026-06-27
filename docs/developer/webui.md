# WebUI Development

## Architecture

The WebUI is a FastAPI application serving Jinja2 templates with vanilla
JavaScript. No frontend frameworks. No npm. No CDN.

```
api/
├── main.py           FastAPI app, page routes, first-run guard
├── deps.py           Engine singleton, config singleton, PAM auth
└── routes/           API route handlers (one file per domain)
websocket/
└── terminal.py       Topgrade streaming
frontend/
├── templates/        10 Jinja2 templates
└── static/
    ├── css/main.css  Complete CSS design system
    ├── js/           11 JS modules
    └── img/          logo.png, logo_cut.png
```

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
| `updates.js` | WebSocket terminal consumer, topgrade runner |
| `system.js` | Hostname save, reboot/shutdown confirm |

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

`setup.html` and `auth.html` are standalone (no sidebar needed).

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
| `{snapshot_name}` | zfs | `pre-update-20260627` |
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
