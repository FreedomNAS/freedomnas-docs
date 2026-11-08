# Dashboard

The dashboard is the first page you see after logging in. It gives an
at-a-glance view of the system and quick access to the other pages.

## Restart and Reboot Notices

These two notices appear at the top of every page, not only the dashboard,
until you act on them:

- **FreedomNAS was updated.** The packages of FreedomNAS itself (core,
  profiles, WebUI, modules) changed since the WebUI started, through the
  Updates page or a package manager on the command line. The WebUI keeps
  running the old code until it restarts. **Restart WebUI** restarts it
  and the page reloads by itself; nothing restarts on its own, so jobs
  that are running can finish first.
- **A new kernel is installed.** The kernel the system would boot is not
  the one running: on Linux the kernel of the active boot image (UKI), on
  FreeBSD `/boot/kernel`. **Reboot now** asks for confirmation and reboots.

The pages check again every two minutes, and right after an update ends.

## Rollback Notice

After an automatic rollback (see [System](system.md#automatic-rollback)) the
dashboard says which kernel did not boot, when, why, and whether the system
files were restored from the pre-update snapshot. On FreeBSD it says which
updated copy did not finish starting and which system started instead; the
failed copy is kept until it is deleted. **Dismiss** clears the
notice; **Delete the failed system** (Advanced) also destroys the failed
root dataset that was kept. Until the notice is cleared the failed kernel is
not made the active one again.

## Stat Cards

The top row shows four cards, loaded once when the page opens:

| Card | Description |
|------|-------------|
| **Hostname** | The system hostname |
| **Uptime** | How long the system has been running |
| **Updates** | `Up to date`, or how many packages are waiting (`5 pending`) |
| **Edition** | The FreedomNAS edition, with the timezone beneath it |

The update count is the last one the system knows: counting pending updates
can take minutes on some editions, so it is refreshed in the background
(see [Updates](updates.md)).

## Module Health

Below the cards, one tile per FreedomNAS module — storage, network,
shares, users, updates, and any installed community module — with its
state and the reason for it. Each tile leads to the module's page.

| Module | Healthy when | Example of a problem |
|--------|--------------|----------------------|
| Storage | no imported pool is `DEGRADED`, `FAULTED`, `REMOVED` or `UNAVAIL` — the system's pool included | `tank is DEGRADED` |
| Network | at least one interface other than loopback is up | `no interface is up` |
| Shares | the service of every enabled share feature answers (`smbd`, `nfs-server`, …) | `smbd not running` |
| Users | every account in the configuration exists on the system | `mario missing from the system` |
| Updates | its configuration can be read | — |

**Healthy** is green and **Problem** amber: what the module looks after is
not well, and the tile turns green by itself when it is fixed. A module
that breaks — it raises an error or does not answer within 5 seconds — is
tried again after 10, 20, 30 and 60 seconds (**Retrying 1/4** … **4/4**);
when the fourth try fails too it is **Blocked**, red, with a **Restart
module** button. **Not loaded** means the module could not be loaded at all.

The checks run in the background, not in the page
([`GET /api/system/health`](../api/system.md) reads what they found); the
grid is refreshed every 15 seconds. When they are not running the grid
says so on top, with the time of the last state it shows.

## Quick Actions

At the **Advanced** UI level and above, a row of shortcuts leads to
**Storage**, **Shares**, **Users** and **Updates**.

## Theme and Sidebar

- **Theme toggle** (topbar, right side): switches between dark and light mode
- **Sidebar collapse** (hamburger icon): collapses the sidebar to icon-only view
- Both states persist in `localStorage`
