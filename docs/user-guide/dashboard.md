# Dashboard

The dashboard is the first page you see after logging in. It gives an
at-a-glance view of the system and quick access to the other pages.

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

Below the cards, one tile per FreedomNAS module: storage, network, shares,
users and updates.

!!! warning "Not a health check yet"
    The tiles show **Running** whenever the WebUI answers, and **Unknown**
    when it does not. They do not yet ask each module how it is doing: a
    degraded pool or a stopped Samba service still shows **Running** here.
    Check the **Storage** and **Shares** pages for their real state.

## Quick Actions

At the **Advanced** UI level and above, a row of shortcuts leads to
**Storage**, **Shares**, **Users** and **Updates**.

## Theme and Sidebar

- **Theme toggle** (topbar, right side): switches between dark and light mode
- **Sidebar collapse** (hamburger icon): collapses the sidebar to icon-only view
- Both states persist in `localStorage`
