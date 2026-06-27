# OS Profiles

An OS profile is a single JSON file that maps every abstract action to an
OS-specific shell command. One file per supported OS.

## Available Profiles

| File | OS | Status |
|------|----|--------|
| `debian.json` | Debian trixie (and compatible) | Official |
| `freebsd.json` | FreeBSD 14+ | Official |
| `arch.json` | Arch Linux | Community |

## Top-Level Structure

```json
{
  "os_name":     "Debian",
  "os_family":   "linux",
  "os_version":  "12+",
  "init_system": "systemd",   ← fallback if runtime detection fails

  "users":    { ... },
  "network":  { ... },
  "packages": { ... },
  "zfs":      { ... },
  "samba":    { ... },
  "nfs":      { ... },
  "system":   { ... },
  "updates":  { ... }
}
```

!!! note
    OS profiles do **not** have a `services` key. Service management commands
    are in the separate [init profiles](init-profiles.md).

## Category Reference

### `users`

| Key | Command |
|-----|---------|
| `create` | Create OS user with explicit UID, GID, shell, groups |
| `delete` | Delete user and home directory |
| `set_password` | Set password via stdin (command for `chpasswd`) |
| `get_user_info` | Read user from `passwd` database |
| `list_users` | List all OS users |
| `add_to_group` | Add user to supplementary group |
| `remove_from_group` | Remove user from group |
| `set_samba_pass` | Set Samba-specific password |

### `network`

| Key | Command |
|-----|---------|
| `list_interfaces` | List all interfaces in JSON format |
| `list_interfaces_json` | Detailed interface info (FreeBSD: `ifconfig -j`) |
| `set_static_ip` | Configure static IPv4 address |
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

### `samba`

| Key | Value type | Description |
|-----|------------|-------------|
| `config_file` | string | Path to `smb.conf` |
| `smb_service` | string | Main Samba service name |
| `nmb_service` | string | NetBIOS name service name |
| `shares_dir` | string | Usershares directory path |
| `create_share` | command | Create a usershare |
| `delete_share` | command | Delete a usershare |
| `list_shares` | command | List current usershares |
| `set_smb_password` | command | Set Samba user password |
| `test_config` | command | Test smb.conf validity |

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
| `run_topgrade` | Run Topgrade with FreedomNAS config |
| `list_updatable` | Count pending updates |
| `check_topgrade` | Verify Topgrade is installed |

## Template Variables

All `{variable}` placeholders in command strings are substituted by the engine.
See the [full template variable reference](../developer/webui.md) for a complete list.
