# First-Run Setup (WebUI Wizard)

When FreedomNAS starts for the first time (or is reset), it shows a 3-step
setup wizard before granting access to the dashboard.

## Accessing the Wizard

Open a browser and navigate to:

```
https://<hostname or IP>:8080
```

If the system is not yet initialized, the root URL automatically redirects
to the setup wizard.

## Step 1 — Identity

Configure the system's hostname and timezone.

| Field | Description | Example |
|-------|-------------|---------|
| **Hostname** | Short system name (letters, digits, hyphens) | `freedomnas` |
| **Timezone** | IANA timezone identifier | `Europe/Rome` |

Click **Continue** to proceed.

## Step 2 — Edition

Confirm the operating system edition. The wizard preselects the edition the
engine detected on this machine (`detected_edition` from
`GET /api/setup/status`) and shows it under the selector.

| Edition | Running |
|---------|---------|
| **Debian** | Debian trixie, or Ubuntu |
| **FreeBSD** | FreeBSD 14+ |
| **Arch Linux** | Arch Linux |
| **Gentoo** | Gentoo |
| **Artix Linux** | Artix Linux |
| **Void Linux** | Void Linux |

!!! note
    The selection does **not** choose which JSON profile is loaded — the
    engine detects the running OS by itself. The edition is recorded in
    `config.yaml`, so it must match: `POST /api/setup/initialize` returns
    `422` for an unknown edition or one that differs from the detected OS.
    It cannot be changed without re-running setup.

## Step 3 — Review

A summary table shows your choices. Review them, then click
**Initialize System**.

The wizard calls `POST /api/setup/initialize`, which:

1. Sets the hostname via `engine.execute("system", "hostname_set")`
2. Sets the timezone via `engine.execute("system", "timezone_set")`
3. Marks the system as initialized in `config.yaml`
4. Saves the configuration to the `.freedomnas` ZFS dataset

!!! note "Creating a data pool"
    The wizard has no pool step. After setup, create pools from
    **Storage → Create Pool** — see [Storage](../user-guide/storage.md#creating-a-pool).
    `POST /api/setup/initialize` also accepts an optional `pool` field that
    creates an encrypted pool during setup (name, devices, a ≥12-character
    Master Passphrase, and optionally USB devices to write a zero-touch
    unlock key onto) — see [Encrypted Data Pools](../developer/zfs.md#encrypted-pools).
    That field is API-only: `setup.html`/`setup.js` do not expose it.

## Done

After initialization you'll see a confirmation screen. Click **Sign In**
to go to the login page.

## Login

Use the `admin` credentials configured during installation (or your OS
user credentials — FreedomNAS uses PAM authentication).

After logging in you'll be redirected to the **Dashboard**.

[Dashboard guide →](../user-guide/dashboard.md)
