# Dashboard

The dashboard is the first page you see after logging in. It gives an
at-a-glance view of system health and quick access to common actions.

## Stat Cards

The top row shows four live stat cards:

| Card | Description |
|------|-------------|
| **Hostname** | System hostname and OS edition |
| **Uptime** | How long the system has been running |
| **Pending Updates** | Number of packages awaiting update |
| **Pool Health** | Combined ZFS pool status |

Cards refresh automatically every 30 seconds.

## Module Health Grid

Below the stat cards, the health grid shows the status of each FreedomNAS
module (checked every 30 seconds via the orchestrator's heartbeat):

| Module | What it checks |
|--------|---------------|
| Storage | ZFS pools — no pool in DEGRADED/FAULTED/UNAVAIL |
| Network | At least one non-loopback interface available |
| Shares | SMB/NFS service status for each enabled feature |
| Users | Configured users exist on the OS |
| Updates | Topgrade is configured and readable |

A green badge means the module is healthy. A red badge means the module
failed its health check. Clicking a module badge navigates to the
corresponding management page.

## Quick Actions

The dashboard provides shortcut buttons to the most common tasks:

- **Manage Storage** → `/storage/`
- **Manage Shares** → `/shares/`
- **Run Updates** → `/updates/`

## Theme and Sidebar

- **Theme toggle** (topbar, right side): switches between dark and light mode
- **Sidebar collapse** (hamburger icon): collapses the sidebar to icon-only view
- Both states persist in `localStorage`
