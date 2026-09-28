# Network API

## GET /api/network/interfaces

List all network interfaces detected on the system.

**Auth required:** yes

**Response (Linux — `ip -j addr show` output, wrapped):**

```json
{
  "interfaces": [
    {
      "ifindex": 1,
      "ifname": "lo",
      "flags": ["LOOPBACK", "UP", "LOWER_UP"],
      "operstate": "UNKNOWN",
      "address": "00:00:00:00:00:00",
      "addr_info": [{"family": "inet", "local": "127.0.0.1", "prefixlen": 8}]
    },
    {
      "ifindex": 2,
      "ifname": "eth0",
      "flags": ["BROADCAST", "MULTICAST", "UP", "LOWER_UP"],
      "operstate": "UP",
      "address": "00:1a:2b:3c:4d:5e",
      "addr_info": [{"family": "inet", "local": "192.168.1.50", "prefixlen": 24}]
    }
  ]
}
```

The response is the direct JSON output of the OS-profile command
(`network.list_interfaces` on Linux, `network.list_interfaces_json` on
FreeBSD). The exact field names depend on the OS.

The WebUI normalises these fields client-side in `network.js`:

| JS field read | Fallback chain |
|---------------|----------------|
| Interface name | `i.name` → `i.ifname` → `i.interface` |
| IP addresses | `i.addr_info` → `i.inet` |
| MAC address | `i.address` → `i.mac` |
| State | `i.operstate` → `i.flags` (contains "up") |

---

## POST /api/network/interfaces/{name}/ip

Set a static IPv4 address on an interface.

**Auth required:** yes

**Path parameter:** `name` — logical interface name (e.g. `eth0`, `fnas_lan`)

**Request body:**

```json
{
  "ip": "192.168.1.50",
  "cidr": 24,
  "gateway": "192.168.1.1",
  "dns": ["1.1.1.1", "8.8.8.8"]
}
```

All four fields are required. `dns` may be a list or a space-separated string.

**Behaviour (dual write):**

1. `engine.execute("network", "set_static_ip", interface=name, ip=..., cidr=..., gateway=..., dns=...)`
   — a configuration that survives a reboot: a NetworkManager connection
   `fnas-<interface>` on Debian, a block in `/etc/dhcpcd.conf` on Arch,
   Artix, Gentoo and Void, `rc.conf` on FreeBSD; see
   [Network](../user-guide/network.md)
2. Update or create interface record in `config.yaml` with `method: static`

**Response:**

```json
{ "detail": "Static IP set on eth0" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | One or more required fields missing |
| 500 | Network command failed |

!!! warning
    Changing the IP of the interface you are using to access the WebUI will
    immediately disconnect your session. Reconnect at the new address.
