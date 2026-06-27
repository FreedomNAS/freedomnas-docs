# System API

## GET /api/system/status

Health check. Returns 200 if the WebUI is running. Does not require auth.

**Response:**

```json
{
  "status": "ok",
  "initialized": true
}
```

---

## GET /api/system/info

Returns OS information and system details.

**Auth required:** yes

**Response:**

```json
{
  "hostname": "freedomnas",
  "os_name": "Debian GNU/Linux",
  "os_version": "12",
  "os_family": "linux",
  "init_system": "systemd",
  "edition": "debian",
  "uptime": "up 3 days, 14 hours",
  "update_count": 5
}
```

---

## POST /api/system/hostname

Set the system hostname.

**Auth required:** yes

**Request body:**

```json
{ "hostname": "nas-server" }
```

**Behaviour (dual write):**

1. `engine.execute("system", "hostname_set", hostname="nas-server")`
2. `config.set_hostname("nas-server")` + `config.save()`

**Response:** `{ "ok": true }`

---

## POST /api/system/reboot

Reboot the system immediately.

**Auth required:** yes

**Response:** `{ "ok": true }` (sent before the reboot command)

---

## POST /api/system/shutdown

Power off the system immediately.

**Auth required:** yes

**Response:** `{ "ok": true }` (sent before the shutdown command)
