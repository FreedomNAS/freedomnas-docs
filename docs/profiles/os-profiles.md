# OS Profiles

**A profile is no longer one file per OS** (split per module, 2026-09-02).
It's assembled at engine startup from a shared base fragment
(`os/os-<name>.json`) plus one fragment per module — see
[Overview](overview.md) for the merge algorithm and
[Architecture → Orchestrator](../architecture/orchestrator.md) for how
modules themselves are discovered. This page covers every category
regardless of which file it physically lives in.

## Available Base Fragments

| File | OS | Status |
|------|----|--------|
| `os/os-debian.json` | Debian trixie (and compatible) | Official |
| `os/os-freebsd.json` | FreeBSD 14+ | Official |
| `os/os-arch.json` | Arch Linux | Community |
| `os/os-gentoo.json` | Gentoo (OpenRC) | Community |
| `os/os-artix.json` | Artix Linux (OpenRC) | Community |
| `os/os-void.json` | Void Linux (runit) | Community |

!!! note
    All five Linux editions are reachable at runtime: the engine maps
    `/etc/os-release`'s `ID` field to a profile through `_DISTRO_IDS`, and
    lists them in `SUPPORTED_OS`. Matching per-module fragments and package
    category sections exist for each. "Community" means the profile is not
    exercised by the project's own CI images, not that it is inert.

## Where Each Category Lives

| File | Owns |
|------|------|
| `os/os-<name>.json` | `os_name`/`os_family`/`os_version`/`init_system`, `packages`, `bootloader`, `system` |
| `storage/storage-<name>.json` | `zfs`, `media`, `zfs_properties` |
| `network/network-<name>.json` | `network` |
| `shares/shares-<name>.json` | `samba`, `nfs` |
| `users/users-<name>.json` | `users` |
| `updates/` | *(no dedicated fragment — `UpdatesModule` reads the shared `packages` category from `os/` directly)* |
| `init/init-<init_system>.json` | `services` — **never** in any of the files above, see [Init Profiles](init-profiles.md) |

A community module follows the same convention: `profiles/<id>/<id>-<name>.json`,
usually shipped in the module's own repo/`.deb` rather than this one.

## Shared Base Fragment Structure (`os/os-<name>.json`)

```json
{
  "os_name":     "Debian",
  "os_family":   "linux",
  "os_version":  "12+",
  "init_system": "systemd",   ← fallback if runtime detection fails

  "packages":   { ... },
  "bootloader": { ... },
  "system":     { ... }
}
```

## Per-Module Fragment Structure (example: `storage/storage-<name>.json`)

```json
{
  "zfs":   { ... },
  "media": { ... },
  "zfs_properties": { ... }
}
```

!!! note
    No file above has a `services` key. Service management commands are in
    the separate [init profiles](init-profiles.md), merged in last by the engine.

## Category Reference

### `users`

| Key | Command |
|-----|---------|
| `create` | Create OS user with explicit UID, GID, shell, groups |
| `delete` | Delete user and home directory (the WebUI's **Remove**) |
| `delete_keep_home` | Delete user, keep the home directory (the reconciler) |
| `set_password_stdin` | Set password via stdin (command for `chpasswd`), payload shaped by `password_stdin_format` |
| `get_user_info` | Read user from `passwd` database |
| `list` | The regular accounts as `passwd` lines (UIDs 1000–65533; 1001– on FreeBSD) — what the reconciler observes |
| `add_to_group` | Add user to supplementary group. Takes `{group}`, one group — the same name the reconciler and the installer pass |
| `remove_from_group` | Remove user from group |

### `network`

| Key | Command |
|-----|---------|
| `list_interfaces` | List all interfaces in JSON format |
| `list_interfaces_json` | Detailed interface info (FreeBSD: `ifconfig -j`) |
| `set_static_ip` | Static IPv4 address that survives a reboot: NetworkManager connection `fnas-{interface}` (Debian), a marked block in `/etc/dhcpcd.conf` + `dhcpcd -n` (Arch, Artix, Gentoo, Void), `sysrc` (FreeBSD) |
| `set_dynamic_ip` | Undo it: back to DHCP |
| `apply_config` | Apply pending network configuration |
| `get_interface_details` | Read details of one interface |

### `packages`

| Key | Command |
|-----|---------|
| `update` | Refresh package index |
| `install` | Install packages (space-separated `{packages}`) |
| `remove` | Remove packages |
| `list_installed` | List installed packages |
| `list_updatable` | List packages with available updates |
| `check_installed` | Check if a specific package is installed |

### `zfs`

| Key | Command |
|-----|---------|
| `list_pools` | List all pools with health/size columns |
| `list_datasets` | List all datasets |
| `list_snapshots` | List all snapshots |
| `create_snapshot` | Create a snapshot |
| `destroy_snapshot` | Destroy a snapshot |
| `rollback_snapshot` | Roll back a dataset to a snapshot |
| `get_pool_status` | Verbose pool status |
| `create_pool_raidz1` | Create RAIDZ1 pool |
| `create_pool_raidz2` | Create RAIDZ2 pool |
| `create_pool_mirror` | Create mirror pool |
| `create_pool_single` | Create single-disk pool |
| `set_compression` | Set dataset compression algorithm |
| `create_dataset` | Create a new dataset |
| `set_quota` | Set dataset quota |
| `pool_create_encrypted` | Create a pool with ZFS native encryption (`-O encryption=aes-256-gcm -O keyformat=raw -O keylocation=file://{keyfile_path}`) |
| `pool_keystatus` | Read a pool's `keystatus` property (`available`/`unavailable`/`-`) |
| `load_key_file` | Load a raw key from a file into the pool (`zfs load-key -L file://{keyfile_path} {pool_name}`) |
| `unload_key` | Unload a pool's encryption key |
| `mount_all` | `zfs mount -a` — mount all datasets whose keys are loaded |
| `pool_leaf_devices`, `partition_of`, `disk_size`, `partition_offsets`, `partition_grow`, `pool_expand` | Grow the root pool into the free space after its partition at boot — see [ZFS Best Practices](../developer/zfs.md#growing-the-root-pool-on-a-flashed-image) |

The `pool_create_encrypted`/`pool_keystatus`/`load_key_file`/`unload_key`/
`mount_all` actions back the ZFS pool encryption feature: independent
USB and Master Passphrase unlock factors managed by
`freedomnas.keymgmt` (`KeyslotStore`, `PoolUnlocker`, `PoolProvisioner`).
The raw ZFS key is always unwrapped in Python first — it is never handed
to `zfs load-key` as a passphrase directly.

### `media`

Removable-media handling for the USB zero-touch unlock path
(`freedomnas.keymgmt.PoolUnlocker`/`PoolProvisioner`). Enumeration and
mount/unmount are OS-specific: Debian/Arch use `lsblk`+`mount`, FreeBSD uses
`camcontrol devlist -v`+`mount -t msdosfs` (untested on real FreeBSD
hardware, since FreeBSD's `mount` does not autodetect filesystem type).
Deciding which device might hold a `freedomnas.key` file, trying each in
turn, and mounting/unmounting are all handled in Python — never branched on
inside the profile.

| Key | Command |
|-----|---------|
| `list_removable` | List removable devices (Debian/Arch: `lsblk -rno NAME,RM,TYPE`; FreeBSD: `camcontrol devlist -v`) |
| `mount_ro` | Mount a device read-only (`noexec,nosuid,nodev` where supported) |
| `mount_rw` | Mount a device writable — used only when provisioning a new `freedomnas.key` |
| `unmount` | `umount {mountpoint}` |

### `samba`

| Key | Value type | Description |
|-----|------------|-------------|
| `config_file` | string | Path to `smb.conf` |
| `testparm` | command | `{config_file}` — check `smb.conf` |
| `check_installed` | command | Succeeds only where Samba is installed (`testparm -V`); decides whether accounts get a Samba password |
| `set_user_password` | command | `smbpasswd -a -s {username}`: adds the account to Samba's database or changes its password, read from stdin |
| `password_stdin_format` | string | What `set_user_password` reads: `{password}\n{password}\n` |
| `delete_user` | command | `smbpasswd -x {username}` |
| `smb_service` | string | Main Samba service name |
| `nmb_service` | string | NetBIOS name service name |
| `reload_config` | command | Make `smbd` reread its configuration |
| `usershare_path` | string | Where usershares live; written into `smb.conf` by the setup wizard when missing |
| `usershare_prepare` | command | `{path}` — creates that directory (`install -d -m 1770`) |
| `create_share` | command | `{share_name} {path} {comment} {acl}` — create a usershare |
| `delete_share` | command | Delete a usershare |
| `list_shares` | command | List current usershares |

Samba keeps its own password database: an account with no entry there cannot
open a share, whatever its system password. Every place that sets a password
— the Users page, the password change, the setup wizard and the installer —
sets the Samba one too wherever `check_installed` succeeds, and deleting an
account removes it from Samba first.

### `nfs`

| Key | Value type | Description |
|-----|------------|-------------|
| `config_file` | string | Path to `/etc/exports` |
| `nfs_service` | string | NFS server service name |
| `add_export` | command | Append entry to `/etc/exports` |
| `remove_export` | command | Remove entry from `/etc/exports` |
| `reload_exports` | command | Reload export table (`exportfs -ra`) |
| `list_exports` | command | List current exports |
| `check_export` | command | Verify export availability |

### `system`

| Key | Command |
|-----|---------|
| `hostname_get` | Read current hostname |
| `hostname_set` | Set hostname |
| `ssh_service` | Not a command: the name of the SSH service (`ssh` on Debian, `sshd` elsewhere), which the installer disables and `/api/system/ssh` turns on and off |
| `timezone_get` | Read current timezone |
| `timezone_set` | Set timezone |
| `timezone_list` | List available timezones |
| `reboot` | Reboot the system |
| `shutdown` | Power off the system |
| `get_uptime` | Read uptime |
| `get_os_info` | Read OS identification |

### `updates`

| Key | Command |
|-----|---------|
| `run_topgrade` | Run Topgrade with FreedomNAS config, `--yes` and all: stdin is `/dev/null`, so a prompt is a failed update |
| `list_updatable` | Count pending updates |
| `check_topgrade` | Verify Topgrade is installed |

## Template Variables

All `{variable}` placeholders in command strings are substituted by the engine.
See the [full template variable reference](../developer/webui.md) for a complete list.
