# Services

*Advanced level.* The **Services** page is in the sidebar only at the
Advanced and Expert levels; at the Assisted level the entry is hidden, and
opening `/services/` directly only says to choose a higher level on the
[System](system.md) page.

The page lists every service of the edition's init, with whether it is
running, and what FreedomNAS uses it for (SSH, SMB, NFS). **Start**,
**Stop** and **Restart** act now and last until the next boot; stopping
asks first, since whatever depends on the service stops working — stopping
the SSH service ends SSH logins. The filter narrows the list by name or role.

*Expert level* adds **At boot**: **Enable** and **Disable** decide whether
the service starts at boot. The choice is kept in the configuration, like
the SSH setting on the System page, so a reboot or a restore keeps it.

The API behind the page is described in [Services API](../api/services.md).
