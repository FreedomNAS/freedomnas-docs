# FreedomNAS

**Software-Defined Storage Appliance — completely agnostic to the underlying OS and init system.**

FreedomNAS provides full NAS functionality (file sharing, ZFS storage, user management,
network configuration) while running identically on Debian, FreeBSD, Arch Linux, and any
other UNIX-like system — without code modifications.

---

## Core Principle

> **The software adapts to the system. The system never adapts to the software.**

Every OS-specific command lives in a JSON translation profile. Python code never
contains a native system command. When you run FreedomNAS on Debian, it merges
`os/os-debian.json` with each module's own `storage-debian.json`/`network-debian.json`/etc.
On FreeBSD, the same merge happens against the `-freebsd` fragments. Nothing else changes.

---

## Quick Navigation

<div class="grid cards" markdown>

-   :material-rocket-launch: **Getting Started**

    Install FreedomNAS from a pre-built image (recommended), via the parked
    TUI installer, or use the WebUI first-run wizard on an existing system.

    [Get started →](getting-started/overview.md)

-   :material-monitor-dashboard: **User Guide**

    Manage storage, shares, users, network, and updates through the WebUI.

    [User guide →](user-guide/dashboard.md)

-   :material-layers: **Architecture**

    Understand the system stack, core engine, configuration manager, and
    reconciliation engine.

    [Architecture →](architecture/system-stack.md)

-   :material-code-json: **Profile System**

    Learn how OS profiles and init profiles translate abstract actions into
    OS-specific commands.

    [Profiles →](profiles/overview.md)

-   :material-api: **API Reference**

    Full reference for all REST API endpoints and the WebSocket terminal.

    [API →](api/authentication.md)

-   :material-wrench: **Developer Guide**

    Installer flow, ZFS best practices, git conventions, and AI assistant rules.

    [Developer guide →](developer/repositories.md)

</div>

---

## Editions

| Edition | Base | Status |
|---------|------|--------|
| **Debian** | Debian trixie | Official — maximum hardware compatibility |
| **FreeBSD** | FreeBSD 14+ | Official — native ZFS, robust network stack |
| **Arch** | Arch Linux | Official — runtime-supported (`os/os-arch.json` + module fragments, in `engine.py`'s `SUPPORTED_OS`) |
| **Artix, Void** | Arch (OpenRC) / independent (runit) | Scaffolded, not yet runtime-reachable — profiles exist but `SUPPORTED_OS` doesn't list them yet |
| **Alpine, Gentoo, …** | Any | Community — via the profile system, no core changes, once a profile is written |

---

## License

- **Core software:** Mozilla Public License v2.0 (MPLv2)
- **ProMonitor:** Proprietary (paid) — proactive weekly health reports
