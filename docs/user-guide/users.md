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
| **Password** | Initial password, at least 8 characters, entered twice | — |

3. Click **Create User**

The account is created with its password, and where Samba is installed the
same password is given to Samba (`smbpasswd`), so the account can open SMB
shares straight away. Passwords are passed via stdin — never in the command
string. Changing a password later changes both, and deleting a user removes
it from Samba too.

If any step fails — for example Samba cannot read `/etc/samba/smb.conf` —
the error is shown and the account is removed again, so you can fix the
cause and click **Create User** once more with the same name.

!!! tip
    Who may open an SMB share is decided by that share's ACL, not by a
    group: a new share gives everyone read access and its creator full
    control. The shares group the form offers where the edition has one
    (Debian's `sambashare`) is for accounts that create usershares
    themselves.

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
