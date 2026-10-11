# Plugins

The **Plugins** page installs community modules: features that live outside
FreedomNAS itself, each in a repository and package of its own, such as
[Containers](containers.md). The page lists the modules this edition's
package repository offers, so it shows only what can really be installed
here, on every edition the same way.

Each module has a card with its description, its package and version, and
its state:

- **Available** — the repository offers it, it is not installed
- **Installed** — installed and running in the WebUI
- **Update available** — the repository has a newer version; the normal
  [Updates](updates.md) install it with the rest of the system
- **Restart the WebUI to use it** — installed, but the WebUI loads modules
  only when it starts
- **Removed: restart the WebUI** — removed, its page goes away at the next
  restart

**Install** is there at every level: a module installs with its defaults,
and its own page decides what each level may change. **Remove** is shown
from the Advanced level and asks first. Removing takes away the package
only: the module's settings and the datasets it made stay, so installing it
again later finds them.

Both run the edition's package manager (apt, pacman, xbps, emerge or pkg).
Its output appears under the cards while it works, and stays there if it
fails. Only one runs at a time, never during a system update, and a system
update or a WebUI restart waits for it.

When it has finished, the card and the banner at the top of every page offer
**Restart WebUI**; the page reloads by itself once the WebUI is back, and an
installed module's page is in the sidebar.

**Check for new modules** downloads the repository's package list again. The
list the page shows comes from the copy the system already has, which the
normal updates refresh, so a module published since then appears only after
this button or the next update.

Modules come only from the repositories the system already trusts for
FreedomNAS itself: there is no separate store and no download from
elsewhere. A module is a package named `freedomnas-module-<id>` (on Gentoo
`app-nas/freedomnas-module-<id>`); see [Packaging](../developer/packaging.md#community-modules).

The API behind the page is described in [Plugins API](../api/plugins.md).
