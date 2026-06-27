# Network

The Network page lists all network interfaces detected on the system and
allows changing IP configuration.

## Interface List

Each interface shows:

| Column | Description |
|--------|-------------|
| **Logical Name** | FreedomNAS stable name (e.g. `fnas_lan`) |
| **Physical Name** | OS interface name (e.g. `eth0`, `em0`) |
| **MAC Address** | Hardware address |
| **IP Address** | Current IPv4 address and prefix |
| **Status** | `UP` or `DOWN` |

### Interface Naming

FreedomNAS assigns stable logical names based on MAC address:

- `fnas_lan` — main LAN interface
- `fnas_wan` — WAN interface (if present)

These names survive OS reinstallation and hardware moves because MAC
addresses are tied to the physical NIC.

## Editing IP Configuration

!!! info "Advanced level required"
    The **Edit IP** button is only visible at **Advanced** UI level and above.

1. Click **Edit IP** next to an interface
2. Fill in the modal:

| Field | Description | Example |
|-------|-------------|---------|
| **IP Address** | IPv4 address | `192.168.1.50` |
| **Prefix Length** | Subnet mask as CIDR | `24` |
| **Gateway** | Default gateway | `192.168.1.1` |
| **DNS Servers** | Space-separated DNS IPs | `1.1.1.1 8.8.8.8` |

3. Click **Apply**

The change is applied via `nmcli` (or the equivalent profile command for
the active OS) and persisted to `config.yaml`.

!!! warning
    Changing the IP address of the interface you're using to access the
    WebUI will disconnect you. Reconnect using the new IP address.

## FreeBSD Note

On FreeBSD, interface information is read via `ifconfig -j` (JSON output)
using the `network.list_interfaces_json` profile key. The WebUI detects
`os_family == "bsd"` and dispatches to the appropriate API call automatically.
