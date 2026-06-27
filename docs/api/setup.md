# Setup API

The setup API handles the first-run wizard. These routes are exempt from
authentication and from the first-run guard (they are always accessible).

## GET /api/setup/status

Returns the current initialization state.

**Auth required:** no

**Response (not initialized):**

```json
{
  "initialized": false,
  "edition": null,
  "hostname": null
}
```

**Response (initialized):**

```json
{
  "initialized": true,
  "edition": "debian",
  "hostname": "freedomnas",
  "initialized_at": "2026-01-15T10:30:00",
  "initialized_by": "installer"
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

**Behaviour:**

1. `engine.execute("system", "hostname_set", hostname="freedomnas")`
2. `engine.execute("system", "timezone_set", timezone="Europe/Rome")`
3. `config.set_hostname("freedomnas")`
4. `config.set_timezone("Europe/Rome")`
5. `config.mark_initialized(edition="debian", initialized_by="webui")`
6. `config.save()`

**Response:** `{ "ok": true }`

**Errors:**

| Code | Reason |
|------|--------|
| 409 | System already initialized |
| 400 | Invalid edition, hostname, or timezone |
| 500 | Engine command failed |

!!! note
    If the system was installed via the TUI installer, `initialized_by` is
    `"installer"` and this endpoint will return 409. The WebUI setup wizard
    detects this and skips to the login page.
