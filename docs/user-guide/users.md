# Users

The Users page manages system user accounts. FreedomNAS users are OS-level
users — they authenticate via PAM and can be granted Samba access.

## User List

The table shows all configured users with their UID, primary group, shell,
and group memberships.

## Creating a User

1. Click **+ Add User**
2. Fill in the form:

| Field | Description | Example |
|-------|-------------|---------|
| **Username** | Login name (lowercase, no spaces) | `sarah` |
| **UID** | User ID (leave blank to auto-assign) | `1001` |
| **Shell** | Login shell | `/bin/bash` |
| **Groups** | Checkbox list of supplementary groups | `sudo`, `samba` |
| **Password** | Initial password | — |
| **Samba Password** | Set Samba-specific password | — |

3. Click **Create User**

Both the OS user (`useradd`) and the Samba password (`smbpasswd`) are
created in a single operation. Passwords are passed via stdin — never
in the command string.

!!! tip
    Add users to the `samba` group to allow them to access SMB shares.
    Users without the `samba` group cannot connect via SMB even if they
    have OS credentials.

## Changing a Password

Click **Password** on the user's row, enter the new password twice (at least
8 characters) and click **Set Password**. The button is visible at every UI
level. The password reaches the OS through stdin, never the command line.

## Deleting a User

!!! info "Advanced level required"
    The **Remove** button is only visible at **Advanced** UI level and above.
    Your own account has no Remove button.

Click **Remove**. A confirmation dialog appears. The user is deleted
with `userdel -r` (removes home directory) and removed from `config.yaml`.

!!! warning
    Deleting a user permanently removes their home directory. Ensure any
    important data has been moved to a shared dataset first.

## UID/GID Consistency

FreedomNAS always explicitly sets UID and GID when creating users. This is
critical for cross-OS migration:

- Debian defaults to UID 1000 for the first user
- FreeBSD defaults to UID 1001 for the first user

By pinning UIDs in `config.yaml`, ZFS dataset permissions are consistent
when migrating between editions — files retain the correct ownership because
the numeric UID matches.
