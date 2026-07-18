# System API

## GET /api/system/status

Health check — always accessible, no auth required.

**Response:**

```json
{ "status": "ok" }
```

---

## GET /api/system/info

Returns OS and system identity information.

**Auth required:** yes

**Response:**

```json
{
  "hostname": "freedomnas",
  "edition": "debian",
  "timezone": "Europe/Rome",
  "uptime_since": "up 3 days, 14:22",
  "initialized": true
}
```

- `timezone` — live read via `system.timezone_get` profile command
- `uptime_since` — live read via `system.uptime` profile command
- `edition` — read from `config.yaml`
- `initialized` — `config.is_initialized()`

---

## POST /api/system/hostname

Set the system hostname (spec §7.5 dual write).

**Auth required:** yes

**Request body:**

```json
{ "hostname": "nas-server" }
```

**Behaviour:**

1. `engine.execute("system", "hostname_set", hostname="nas-server")`
2. `config.set_hostname("nas-server")`

**Response:**

```json
{ "hostname": "nas-server" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `hostname` is missing or empty |
| 500 | Engine command failed |

---

## POST /api/system/reboot

Reboot the system.

**Auth required:** yes

Calls `engine.execute("system", "reboot", check=False)`.
The response is sent before the command executes.

**Response:**

```json
{ "detail": "Rebooting" }
```

---

## POST /api/system/shutdown

Power off the system.

**Auth required:** yes

Calls `engine.execute("system", "shutdown", check=False)`.
The response is sent before the command executes.

**Response:**

```json
{ "detail": "Shutting down" }
```
