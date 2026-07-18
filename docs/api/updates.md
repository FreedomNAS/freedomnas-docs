# Updates API

## GET /api/updates/status

Returns the current update status.

**Auth required:** yes

**Response:**

```json
{
  "pending_updates": 5,
  "topgrade_configured": true,
  "auto_snapshot": true
}
```

`pending_updates` is queried from the package manager using the profile
key `packages.list_updatable` — the command varies by OS.

---

## POST /api/updates/configure

Write a new Topgrade configuration.

**Auth required:** yes

**Request body:**

```json
{
  "auto_snapshot": true,
  "enabled_steps": ["system", "containers", "firmware"]
}
```

**Behaviour:**

1. Writes `/etc/freedomnas/topgrade.toml` with the provided settings
2. `config.configure_topgrade(steps=["system", "containers", "firmware"])` + `config.save()`

**Generated `topgrade.toml`:**

```toml
[misc]
assume_yes = false
disable_tmux = true
no_retry = true

[unstable]
only = ["system", "containers", "firmware"]

[notifications]
enable = false
```

**Response:**

```json
{"detail": "Topgrade configured", "enabled_steps": ["system", "containers", "firmware"]}
```

---

## WebSocket /ws/updates/terminal

Streams Topgrade output in real time. See [WebSocket Terminal](websocket.md).
