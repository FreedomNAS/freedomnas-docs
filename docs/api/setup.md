# Setup API

The setup API handles the first-run wizard. All routes here are exempt from
authentication and from the first-run guard — they are always accessible.

## GET /api/setup/status

Returns whether the system has been initialized.

**Auth required:** no

**Response:**

```json
{
  "initialized": false,
  "edition": null
}
```

After initialization:

```json
{
  "initialized": true,
  "edition": "debian"
}
```

---

## POST /api/setup/initialize

Run the first-run initialization.

**Auth required:** no

**Request body:**

```json
{
  "hostname": "freedomnas",
  "timezone": "Europe/Rome",
  "edition": "debian"
}
```

`edition` is required (`debian` / `freebsd`). `hostname` defaults to
`"freedomnas"`, `timezone` to `"UTC"`.

**Behaviour:**

1. Returns `409` immediately if `config.is_initialized()` is already `true`
2. `engine.execute("system", "hostname_set", hostname=...)`
3. `config.set_hostname(hostname)`
4. `engine.execute("system", "timezone_set", timezone=...)`
5. `config.set("system.timezone", timezone)`
6. Writes Samba usershare stanza to `smb.conf` (path from `samba.config_file` profile key):
   ```
   [global]
      usershare path = /var/lib/samba/usershares
      usershare max shares = 100
      usershare allow guests = no
   ```
7. Creates `/var/lib/samba/usershares/` directory
8. `config.mark_initialized(edition=edition, initialized_by="webui")`

**Response:**

```json
{
  "detail": "System initialized",
  "hostname": "freedomnas",
  "edition": "debian"
}
```

**Errors:**

| Code | Detail |
|------|--------|
| 409 | System already initialized |
| 422 | `edition` is missing |
| 500 | Engine command or file write failed |

!!! note
    When the system was installed via the TUI installer, it is already
    initialized (`initialized_by: "installer"`). The WebUI's `setup.js`
    checks `GET /api/setup/status` on every page load and redirects to the
    dashboard if `initialized` is `true` — so the wizard page is skipped
    entirely on installer-provisioned systems.
