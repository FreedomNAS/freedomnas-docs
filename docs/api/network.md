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
   `fnas-<interface>` on every Linux edition, `rc.conf` on FreeBSD; see
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

---

## Interface configuration with automatic rollback

The Network page uses these routes. A change is applied under a
**checkpoint**: unless it is confirmed within 90 seconds
(`ROLLBACK_SECONDS`), the system puts the previous configuration back by
itself, so a wrong address cannot lock the administrator out. On Linux the
checkpoint is NetworkManager's own (`CheckpointCreate` over D-Bus with
`gdbus`, rollback timeout 90 s); on FreeBSD a copy of `rc.conf` and
`resolvconf.conf` plus a `daemon(8)` timer that restores them. Only one
change can wait for confirmation at a time. `config.yaml` is written only
when the change is confirmed.

### GET /api/network/config

**Auth required:** yes

```json
{
  "interfaces": {
    "eth0": {"method": "static", "ip": "192.168.1.50", "cidr": 24, "gateway": "192.168.1.1",
             "dns": ["1.1.1.1"], "dns_search": ["lan"], "ipv6_method": "auto", "mtu": null}
  },
  "rollback_seconds": 90,
  "pending": {"pending": false}
}
```

### PUT /api/network/interfaces/{name}

**Auth required:** yes

| Field | Values | Notes |
|-------|--------|-------|
| `method` | `dhcp` (default) or `static` | IPv4 |
| `ip`, `cidr`, `gateway` | IPv4 address, 1–32, IPv4 address or empty | `static` only; the gateway must be inside the subnet |
| `dns` | list, or a string separated by spaces/commas | IPv4 and IPv6 servers; at least one with `static`; empty with DHCP = the servers DHCP gives |
| `dns_search` | list or string | search domains |
| `ipv6_method` | `auto` (default), `static`, `disabled` | |
| `ipv6`, `ipv6_prefix`, `ipv6_gateway` | IPv6 address, 1–128 (default 64), IPv6 address or empty | `static` only |
| `mtu` | 576–9216, or empty for the interface default | |

**Response 202:** the pending change, plus a one-time `token`:

```json
{"pending": true, "interface": "eth0", "state": "applying", "seconds_left": 89,
 "config": {...}, "error": null, "token": "…"}
```

The steps run in the background: `network.connection_ensure`, then
`ipv4_dhcp` or `ipv4_static`, `ipv6_auto`/`ipv6_static`/`ipv6_disabled`,
`dns_set` or `dns_auto`, `mtu_set` or `mtu_auto`, `connection_activate`.
If one fails the checkpoint is rolled back at once and the pending change
shows `state: "failed"` with the error.

| Code | Detail |
|------|--------|
| 409 | Another change is waiting for confirmation |
| 422 | A value is not valid (the message says which) |
| 500 | The checkpoint could not be created: nothing was applied |

### GET /api/network/pending

**Auth required:** yes. `{"pending": false}` (with `"expired": true` when
the last change was undone because nobody confirmed it), or the pending
change with `state` = `applying`, `waiting` or `failed` and `seconds_left`.

### POST /api/network/confirm

**Auth required:** yes. Keeps the change (destroys the checkpoint) and
saves the configuration into `config.yaml` under
`network.interfaces[].config`. 409 when nothing is waiting or it is too
late.

### POST /api/network/confirm-token

**Auth required:** no — `{"token": "…"}`, the token `PUT` returned. When
the address changes, the browser moves to the new address and calls this
route from there: reaching it is the proof that the new settings work. The
token is single use and only valid for the change that is waiting.

### POST /api/network/revert

**Auth required:** yes. Undoes the pending change at once.
