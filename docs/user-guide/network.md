# Network

The Network page lists the network interfaces of the system and lets you
give one a static IPv4 address.

## Interface List

One card per interface, with:

- its name as the OS knows it (`eth0`, `enp3s0`, `em0`, …) and its MAC address
- an **UP** or **DOWN** badge
- its IPv4 and IPv6 addresses with their prefix length, or
  *No IPv4 address assigned*

The list comes from the edition's `network.list_interfaces` command
(`ip -j addr show` on Linux) or, on FreeBSD, `network.list_interfaces_json`.
The refresh button in the page header reloads it.

## Editing IP Configuration

!!! info "Advanced level required"
    The **Edit IP** button is only visible at **Advanced** UI level and above.
    The loopback interface has none.

1. Click **Edit IP** on an interface card
2. Fill in the dialog:

| Field | Description | Example |
|-------|-------------|---------|
| **IP Address** | IPv4 address | `192.168.1.50` |
| **Prefix** | Subnet mask as CIDR | `24` |
| **Gateway** | Default gateway | `192.168.1.1` |
| **DNS Servers** | DNS addresses, separated by spaces or commas | `1.1.1.1 8.8.8.8` |

3. Click **Apply**

The address is set with the edition's `network.set_static_ip` and recorded
in `config.yaml`.

!!! warning "Not every edition keeps the address across a reboot"
    Debian applies it through NetworkManager (`nmcli`), which keeps it, and
    FreeBSD writes it to `rc.conf` with `sysrc`. On Arch, Artix, Gentoo and
    Void the command is `ip addr add` plus a default route: the address
    holds until the next boot, and the DNS servers are not applied. The
    reconciler does not restore interfaces either.

!!! warning
    Changing the IP address of the interface you're using to access the
    WebUI will disconnect you. Reconnect using the new IP address.
