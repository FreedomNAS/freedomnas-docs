# Network API

## GET /api/network/interfaces

List all network interfaces detected on the system.

**Auth required:** yes

**Response:**

```json
[
  {
    "logical_name": "fnas_lan",
    "physical_name": "eth0",
    "mac": "00:1a:2b:3c:4d:5e",
    "ip": "192.168.1.50",
    "cidr": 24,
    "state": "UP"
  }
]
```

The `logical_name` is the stable FreedomNAS name derived from the MAC address mapping
stored in `config.yaml`. It survives reboots and OS reinstallation.

---

## POST /api/network/interfaces/{name}/ip

Set a static IPv4 address on an interface.

**Auth required:** yes

**Path parameter:** `name` — the logical interface name (e.g. `fnas_lan`)

**Request body:**

```json
{
  "ip": "192.168.1.50",
  "cidr": 24,
  "gateway": "192.168.1.1",
  "dns": ["1.1.1.1", "8.8.8.8"]
}
```

**Behaviour (dual write):**

1. `engine.execute("network", "set_static_ip", interface="fnas_lan", ip="192.168.1.50", ...)`
2. `engine.execute("network", "apply_config", interface="fnas_lan")`
3. `config.get_interface("fnas_lan")` → update ip/cidr/gateway/dns → `config.save()`

**Response:** `{ "ok": true }`

**Errors:**

| Code | Reason |
|------|--------|
| 404 | Interface not found |
| 400 | Invalid IP address or CIDR |
| 500 | Network configuration failed |

!!! warning
    Changing the IP address of the interface you're using to reach the WebUI
    will disconnect your browser session. Reconnect at the new IP.
