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

## Interface Names

Every physical network card gets a FreedomNAS name, the same on every
edition: `fnas_lan1`, `fnas_lan2`, … — instead of `enp3s0`, `eth0` or
`em0`, which depend on the distribution and the hardware. The name follows
the card's **MAC address**, recorded in `config.yaml`
(`network.interfaces_mapping`), so it never moves to another card:

- a new install or a freshly written image names its cards at the first
  boot, in the order the system lists them
- a card whose MAC is recorded always gets its own name back
- when a recorded card is gone — the configuration was restored onto new
  hardware, or a card was replaced — its name, and the addresses
  configured under it, go to a card that has no name yet; the boot log of
  the reconciler says which (`fnas_lan1 moved to the card … (it was on …)`)
- cards still left over get the next free numbers

The names are kept by the system itself, so they are there from the very
start of every boot: a udev rule per card in
`/etc/udev/rules.d/70-freedomnas-net.rules` on Linux,
`ifconfig_<driver>_name="fnas_lanN"` in `rc.conf` on FreeBSD. The cards
are renamed live only at boot, when a name is missing: renaming the card
you are connected through would cut the connection.

## Configuring an Interface

!!! info "Advanced level required"
    The **Configure** button is only visible at **Advanced** UI level and
    above. IPv6 and MTU are only shown at **Expert** level. The loopback
    interface has none.

1. Click **Configure** on an interface card
2. Fill in the dialog:

| Field | Description | Example |
|-------|-------------|---------|
| **IPv4** | *Automatic (DHCP)* or *Static address* | |
| **IP Address** / **Prefix** | static only | `192.168.1.50` / `24` |
| **Gateway** | static only, inside the subnet; may stay empty | `192.168.1.1` |
| **DNS Servers** | IPv4 or IPv6 addresses, separated by commas. Required with a static address; empty with DHCP means the servers DHCP gives | `1.1.1.1, 9.9.9.9` |
| **Search Domains** | domains tried for short names | `lan, home.arpa` |
| **IPv6** (Expert) | *Automatic*, *Static address* or *Disabled* | |
| **IPv6 Address** / **Prefix** / **Gateway** (Expert) | static only | `fd00::50` / `64` / `fd00::1` |
| **MTU** (Expert) | empty for the default; 9000 for jumbo frames, only if every device on the network supports them | `9000` |

3. Click **Apply**

### Confirmation and automatic rollback

A network change can cut you off from the WebUI, so it is never final
straight away:

- the system takes a checkpoint, applies the change and waits **90 seconds**
  for a confirmation; without one it **puts the previous configuration
  back by itself**
- if the address of the page you are using stays the same, a dialog shows
  the countdown with **Keep these settings** and **Undo now**
- if you gave the interface a **new static address**, the browser **moves to
  the new address by itself**: reaching it confirms the change. Log in
  again there (the browser treats a new address as a new site, and shows
  the certificate warning again)
- if you switched to **DHCP** and the address changes, the browser cannot
  know the new one: look it up on your router or on the console, and open
  the Network page there within 90 seconds — a banner offers **Keep**
- if the new settings cannot be applied at all (a cable unplugged, no DHCP
  answer), they are undone at once and the error is shown

The configuration is written to `config.yaml` only once it is confirmed.
After reflashing the system disk, or on new hardware with the same
interface names, the reconciler gives each interface its configuration
back at boot. An interface that already has its `fnas-<interface>`
connection (FreeBSD: an `ifconfig_<interface>` line in `rc.conf`) is left
alone, so a normal boot never re-applies the network.

| Edition | Where it is kept |
|---------|------------------|
| Debian, Arch, Artix, Gentoo, Void | a NetworkManager connection of its own, `fnas-<interface>`, which takes precedence over the automatic one |
| FreeBSD | `rc.conf` (`ifconfig_<interface>`, `ifconfig_<interface>_ipv6`, `defaultrouter`, `ipv6_defaultrouter`) and `resolvconf.conf`, through `sysrc` |

## Network Stack

Every Linux edition manages the network with NetworkManager; FreeBSD uses
`rc.conf`. A fresh install gets its address over DHCP from NetworkManager's
automatic wired connection, and DNS servers end up in `/etc/resolv.conf`
(through systemd-resolved on Debian and Arch, openresolv on Artix and Void).

| Edition | Services enabled by the installer |
|---------|-----------------------------------|
| Debian, Arch | `NetworkManager` (systemd) |
| Artix OpenRC, Gentoo | `NetworkManager` (starts `dbus` itself) |
| Artix dinit | `NetworkManager` (depends on `dbus`) |
| Artix runit, Void | `dbus` and `NetworkManager` |

### Systems installed with dhcpcd

Arch, Artix, Gentoo and Void installs made before NetworkManager became the
stack use dhcpcd. Move them over from the console, not over SSH:

1. Install NetworkManager (`networkmanager` + `networkmanager-<init>` on
   Artix, `NetworkManager` on Void, `net-misc/networkmanager` on Gentoo)
2. Stop and disable `dhcpcd`, then enable and start `NetworkManager`
   (and `dbus` on runit). Never run both: dhcpcd rewrites
   `/etc/resolv.conf` behind NetworkManager's back.
3. If the system had a static address, the block between
   `# freedomnas begin <interface>` and `# freedomnas end <interface>` in
   `/etc/dhcpcd.conf` is no longer read: set the address again from this
   page.

!!! warning
    Changing the IP address of the interface you're using to access the
    WebUI will disconnect you. Reconnect using the new IP address.
