# First-Run Setup (WebUI Wizard)

A system that has no FreedomNAS configuration yet shows a setup wizard
before anything else. That is the case after flashing an image: images ship
without a `.freedomnas` dataset on purpose, so that every appliance starts
by being made its owner's. A system installed with the installer is already
configured and skips the wizard.

## Accessing the Wizard

Open a browser and navigate to:

```
https://<hostname or IP>:8080
```

Sign in with the credentials the system came with. On an image those are:

| Username | Password |
|----------|----------|
| `admin` | `freedomnas` |

After signing in, an unconfigured system goes straight to the wizard. Until
it has been through it, the rest of the WebUI and its API answer `503`.

## Step 1 — Administrator

| Field | Description |
|-------|-------------|
| **Administrator name** | Leave it empty to keep the account you signed in with (`admin`), or give a new name to create that account |
| **Remove the current account** | Shown when a new name is given. If unchecked, the old account is kept and gets the new password too |
| **New password** | At least 8 characters, and not the password you signed in with: the shipped one cannot stay |

## Step 2 — System

| Field | Description | Example |
|-------|-------------|---------|
| **Hostname** | Short system name (letters, digits, hyphens) | `freedomnas` |
| **Timezone** | IANA timezone identifier, preselected from the browser | `Europe/Rome` |

## Step 3 — Storage

Optionally create a data pool on the other disks: name, layout (single disk,
mirror, RAIDZ1, RAIDZ2), the disks, and whether to encrypt it with a Master
Passphrase of at least 12 characters. Disks in use — the system disk among
them — cannot be selected. Pools that already exist are left as they are;
more pools can be created later from **Storage**.

## Step 4 — Configuration

The configuration (users, shares, settings) lives on the system disk, in
the root pool's `.freedomnas` dataset. Choose the pool that keeps a copy of
it. A data pool is preselected when there is one, and recommended: the copy
then survives reinstalling or reflashing the system disk — at the next boot,
`firstboot.sh` finds it on the data pool and restores the system from it
(see [Installation](installation.md)). Another FreedomNAS install that
shares the data pool (another edition on another disk of the same machine)
takes only the shares, users, pools and snapshot policies from it, never
its administrators, network or system settings.

## After a restore

When a freshly flashed system finds an existing configuration on an attached
pool, it restores it at the first boot: hostname, users, shares and
settings come back. Passwords are not part of the configuration, though,
and the image's shipped `admin` / `freedomnas` account is still there. So
the wizard still opens, as **Restored Configuration**, with two steps:

1. **Administrator** — the same fields as Step 1 above. The hint lists the
   restored administrators: type one of their names to take that account
   over with the new password, and tick **Remove the account "admin"** to
   get rid of the shipped one.
2. **Review** — the restored hostname, where the configuration lives and
   the other restored users. If the restored configuration had SSH on, a
   checkbox turns it back on; until then SSH stays off.

When it is done, the wizard lists the restored users that still need a
password: set them under **Users**.

## Step 5 — Review

A summary of the choices. **Apply** calls `POST /api/setup/initialize`
([Setup API](../api/setup.md)), which creates the pool if one was asked for,
sets the hostname and timezone, sets up the administrator, records SSH as
off, marks the system initialized, and moves the configuration onto the
chosen pool.

SSH stays off. It can be turned on under **System → SSH** at the Advanced
UI level ([System](../user-guide/system.md)).

## Done

Sign in again with the new password; you are taken to the
[Dashboard](../user-guide/dashboard.md).
