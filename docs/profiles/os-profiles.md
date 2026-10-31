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
| `os/os-artix.json` | Artix Linux (OpenRC, dinit, runit) | Community |
| `os/os-void.json` | Void Linux (runit) | Community |

!!! note
    All five Linux editions are reachable at runtime: the engine maps
    `/etc/os-release`'s `ID` field to a profile through `_DISTRO_IDS`, and
    lists them in `SUPPORTED_OS`. Matching per-module fragments and package
    category sections exist for each. The CI images exercise every one of
    them but Arch, which has no image. "Community" says which editions
    the project treats as official (Debian, FreeBSD), not which are built.

## Where Each Category Lives

| File | Owns |
|------|------|
| `os/os-<name>.json` | `os_name`/`os_family`/`os_version`/`init_system`, `packages`, `bootloader`, `system` |
| `storage/storage-<name>.json` | `zfs`, `media`, `directories`, `zfs_properties`, `zpool_properties` |
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
  "directories": { ... },
  "zfs_properties": { ... },
  "zpool_properties": { ... }
}
```

A fragment never reuses a category of `os/` or of another fragment: they
are merged with a plain `dict.update()`, so the later one would replace the
earlier whole (`tests/test_profile_coverage.py` in freedomnas-core checks
this).

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
| `group_create` / `group_delete` | Make or delete a group of a group share (`groupadd`/`groupdel`; FreeBSD `pw groupadd`/`pw groupdel`) |

### `network`

| Key | Command |
|-----|---------|
| `list_interfaces` | List all interfaces in JSON format |
| `list_interfaces_json` | Detailed interface info (FreeBSD: `ifconfig -j`) |
| `set_static_ip` | Static IPv4 address that survives a reboot: NetworkManager connection `fnas-{interface}` (Linux editions), `sysrc` (FreeBSD) |
| `set_dynamic_ip` | Undo it: back to DHCP |
| `list_physical` | Physical cards, one per line: `name mac driver` (Linux: those with `/sys/class/net/<name>/device`; FreeBSD: `ifconfig -l ether` minus cloned interfaces, driver from `ifconfig -v`) |
| `names_clear` / `name_persist` | Forget the FreedomNAS names, then give card `{mac}` (`{driver}` on FreeBSD) the name `{new_name}` from the next boot on: udev rule in `/etc/udev/rules.d/70-freedomnas-net.rules`, or `ifconfig_{driver}_name` in `rc.conf` |
| `rename_interface` | Rename `{old_name}` to `{new_name}` now |
| `connection_forget` | Delete what the system keeps for an interface it no longer has: the `fnas-{interface}` connection, or `ifconfig_{interface}` lines in `rc.conf` |
| `connection_rename` | Move the configuration of `{old_name}` to `{new_name}`: the `fnas-` NetworkManager connection, or the `ifconfig_` lines in `rc.conf` |
| `connection_ensure` | Create the `fnas-{interface}` NetworkManager connection if missing (FreeBSD: nothing) |
| `connection_exists` | Print `yes` when FreedomNAS already configured `{interface}` (the reconciler leaves it alone) |
| `ipv4_dhcp` / `ipv4_static` | IPv4 by DHCP, or `{ip}/{cidr}` with `{gateway}` (may be empty) |
| `ipv6_auto` / `ipv6_static` / `ipv6_disabled` | IPv6 automatic, `{ipv6}/{ipv6_prefix}` with `{ipv6_gateway}`, or off |
| `dns_set` / `dns_auto` | DNS servers `{dns}` (IPv4) and `{dns6}` (IPv6), search domains `{dns_search}`; or the ones DHCP gives |
| `mtu_set` / `mtu_auto` | MTU `{mtu}`, or the default |
| `routes_set` | Replace the static routes of `{interface}` with `{routes}`: words `destination=gateway` (a `multi_args` variable). NetworkManager `ipv4.routes`/`ipv6.routes`; FreeBSD `static_routes`/`ipv6_static_routes` entries `rt_<interface>_N` |
| `connection_activate` | Apply what the steps above wrote (NetworkManager: `nmcli --wait 45 connection up`; FreeBSD: `service netif restart {interface}`, `service routing restart`, `resolvconf -u`) |
| `bridge_create` / `bond_create` / `vlan_create` | Create `{interface}` (VLAN: on `{parent}` with ID `{vlan_id}`) so it survives a reboot |
| `bridge_stp_on` / `bridge_stp_off` | Spanning Tree on the bridge (FreeBSD: nothing) |
| `bond_mode_lacp` / `bond_mode_failover` | Bond mode: 802.3ad / active-backup (FreeBSD lagg: `lacp` / `failover`) |
| `bridge_port_add` / `bond_port_add` | Make `{port}` a port of `{interface}`, without an address of its own |
| `mac_set` | Give `{interface}` the MAC address `{mac}` of its first port (FreeBSD: `net.link.bridge.inherit_mac=1`, `if_bridge` loaded by the loader) |
| `port_activate` / `virtual_activate` | Bring a port, then the bridge/bond/VLAN, up with its configuration |
| `virtual_delete` / `port_release` | Remove `{interface}` and what keeps it across reboots; give `{port}` back to the default configuration (DHCP) |
| `wg_write` | Write the WireGuard file for `{interface}` from stdin, `0600` (one `sh -c`: commands fed on stdin never get a shell) |
| `wg_apply` / `wg_remove` / `wg_exists` | Bring it up so it survives a reboot (NetworkManager import; FreeBSD `wg-quick` + `rc.conf`, output to `/var/log/freedomnas-wireguard.log` because wg-quick leaves a route monitor holding stdout), take it away, print `yes` when it is there |
| `wg_dump` | `wg show {interface} dump` |
| `qr_svg` | QR code of stdin as SVG (`qrencode -t SVG -o -`) |
| `checkpoint_create` | Take a checkpoint that undoes itself after `{rollback_seconds}` and print its id (NetworkManager `CheckpointCreate` through `gdbus`, flags 3: destroy older ones, delete new connections on rollback; FreeBSD: copies of `rc.conf`/`resolvconf.conf` and a `daemon(8)` timer) |
| `checkpoint_destroy` / `checkpoint_rollback` | Keep the change made since `{checkpoint}`, or undo it now |
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
| `module_search` | Community modules the local package index offers: `name<TAB>version<TAB>description` per line |
| `module_installed` | Community modules installed, same format |
| `module_remove` | Remove a community module's package (`{package_name}`) |

A community module is the package `freedomnas-module-<id>` (Gentoo
`app-nas/freedomnas-module-<id>`). Each profile turns its package manager's
output into the tab-separated lines with awk, so the
[Plugins API](../api/plugins.md) reads the same format everywhere.
`module_search` reads the local index only; `update_cache` refreshes it.

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
| `pool_importable` | `zpool import` (Linux: `-d /dev/disk/by-id`) — the pools that can be imported |
| `pool_import_inspect` | Import by id read-only, unmounted, under a temporary name, `{force}` is `-f` or empty |
| `pool_import_id` | Import by id under `{pool_name}`, unmounted |
| `dataset_tree` | `zfs get -rHp` of mountpoint, canmount, encryption, encryptionroot, keyformat, keystatus, used |
| `load_key_prompt` | `zfs load-key -L prompt {dataset}`, the passphrase on stdin |
| `mount_pool_auto` | Mount a pool's datasets with `canmount=on`, a real mountpoint and not mounted yet |
| `dataset_inherit` | `zfs inherit {property} {dataset}` |
| `dataset_create_with` | `zfs create {options} {dataset}` — `options` is a `multi_args` of `-o k=v` pairs, built only from validated values |
| `dataset_rename` | `zfs rename {dataset} {new_name}` |
| `pool_destroy` | `zpool destroy {pool_name}` — never `-f` |
| `dataset_destroy_recursive` | `zfs destroy -r {dataset}` |
| `pool_member_devices` | `zpool status -LP`: every pool's leaf devices with symlinks resolved, so the Disks tab can say which pool uses a disk |
| `pool_leaf_devices`, `partition_of`, `disk_size`, `partition_offsets`, `partition_grow`, `pool_expand` | Grow the root pool into the free space after its partition at boot — see [ZFS Best Practices](../developer/zfs.md#growing-the-root-pool-on-a-flashed-image) |
| `pool_status_json` | `zpool status -j --json-int -P {pool_name}` — the pool page (needs OpenZFS 2.3 or later) |
| `pool_scrub_pause`, `pool_trim`, `pool_trim_suspend`, `pool_trim_cancel`, `pool_initialize`, `pool_initialize_cancel` | Scrub pause, TRIM and initialize, besides `pool_scrub` / `pool_scrub_stop` |
| `pool_clear`, `pool_clear_device` | `zpool clear` of the pool or one `{device}` |
| `pool_offline_temporary`, `pool_replace`, `pool_replace_in_place`, `pool_attach`, `pool_detach`, `pool_remove_cancel` | Device actions of the pool page, besides `pool_online`, `pool_offline`, `pool_expand`, `pool_remove_device` |
| `pool_add_vdevs` | `zpool add {pool_name} {devices}` — `devices` is the multi-arg built by `freedomnas.pools.vdev_spec` |
| `pool_history`, `pool_history_internal` | `zpool history -l` / `-il` |
| `pool_get_all`, `pool_set` | `zpool get -Hp -o property,value,source all` / `zpool set {property}={value}` |
| `pool_checkpoint`, `pool_checkpoint_discard`, `pool_upgrade`, `pool_reguid` | Expert-level pool operations |
| `dataset_list` | `zfs list -Hp -o name,used,avail,refer,mountpoint,type,mounted,origin` — readers use the first five columns, the WebUI the rest when present |
| `snapshot_list` | `zfs list -t snapshot -Hp -o name,creation,used,referenced,userrefs,clones` |
| `snapshot_destroy_recursive`, `snapshot_rollback_recursive`, `snapshot_rename` | `zfs destroy -r`, `zfs rollback -r`, `zfs rename {snapshot} {new_snapshot}` |
| `snapshot_holds`, `snapshot_hold`, `snapshot_release` | `zfs holds -Hp`, `zfs hold {tag}`, `zfs release {tag}` |
| `snapshot_diff`, `snapshot_diff_to` | `zfs diff -FHt {snapshot} [{target}]` |
| `bookmark_list`, `bookmark_create`, `bookmark_destroy` | Bookmarks: list, `zfs bookmark {snapshot} {bookmark}`, destroy |
| `volume_create`, `volume_create_sparse` | `zfs create [-s] -V {size} {options} {dataset}` — `options` is the same multi-arg as `dataset_create_with` |
| `dataset_promote` | `zfs promote {dataset}` |
| `replicate`, `replicate_resume`, `send_to_file`, `receive_from_file` | Local replication pipelines (shell templates): `echo $$ > {pid_file}`, then `zfs send -vP … 2> {progress_file}` piped into `zfs receive`, or `> {file}` under `set -C`, or `zfs receive … < {file}`. `send_flags`, `receive_flags` and `incremental` are `multi_args` built by `freedomnas.replication` |
| `send_estimate`, `receive_abort`, `resume_tokens`, `replication_cancel` | `zfs send -nvP`, `zfs receive -A`, `zfs get receive_resume_token`, `pkill -INT -P {pid}` |
| `allow_show`, `allow`, `unallow` | `zfs allow {dataset}`, `zfs allow|unallow {allow_scope} {allow_who} {perms} {dataset}` — the three `multi_args` are built and checked by `freedomnas.delegation` |
| `events`, `events_clear` | `zpool events -H -v`, `zpool events -c` |
| `pool_iostat` | `zpool iostat -Hpvy {pool_name} 1 1`: one second of I/O for the pool and each vdev |
| `arc_stats` | ARC counters: `cat /proc/spl/kstat/zfs/arcstats` on Linux, `sysctl -q kstat.zfs.misc.arcstats` on FreeBSD |
| `userspace`, `groupspace` | `zfs userspace|groupspace -Hp -o type,name,used,quota,objused,objquota {dataset}` |

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
| `list_devices` | Disks and partitions for the pool form, in `lsblk -P` form (`NAME`, `PKNAME`, `SIZE` in bytes, `TYPE`, `FSTYPE`, `MOUNTPOINT`, `MODEL`, `PARTTYPE`) on every edition: Linux runs `lsblk`; FreeBSD builds the same lines from `diskinfo`, `geom disk list`, `gpart show -p`, `fstyp`, `zdb -l`, `zpool status -P`, `mount -p` and `swapctl -l`, so a disk of an imported or exported pool, or one holding a mounted or swap partition, shows as in use |
| `smart_scan` | `smartctl --scan -j`: the disks the Disks tab lists, and the only ones a self-test may run on |
| `smart_info` | `smartctl -a -j -n standby {device}`: everything SMART knows about one disk, in JSON (the same format on Linux and FreeBSD); `-n standby` leaves a sleeping disk asleep. No `-d`: the scan reports SATA disks as `scsi`, and passing that on hides their ATA attributes |
| `smart_test` | `smartctl -t {test_type} {device}`: start a `short` or `long` self-test |

### `directories`

Who owns the directory a dataset mounts on (`freedomnas.datasets.give_to`):
a new dataset, or a share of one, is given to one account, mode `0700`.
Only a data pool's dataset's own mountpoint is ever handed over.

| Key | Command |
|-----|---------|
| `owner_get` | The owner's name (Linux: `stat -c %U {path}`; FreeBSD: `stat -f %Su {path}`) |
| `owner_set` | `chown {owner} {path}` |
| `mode_set` | `chmod {mode} {path}` |
| `group_set` / `group_set_recursive` | `chgrp [-R] {group} {path}` |
| `group_share_mode` | value: `2770`, the mode of a group share's directory |
| `group_share_properties` | value: the dataset properties a group share needs (Linux `{"acltype": "posixacl"}`; FreeBSD `{"aclmode": "passthrough", "aclinherit": "passthrough"}`) |
| `acl_group_set` / `acl_group_remove` | The group's inherited read-write ACL entry, on the whole tree (Linux `setfacl -R -m g:{group}:rwX,d:g:{group}:rwX,m::rwX,d:m::rwX {path}`; FreeBSD `setfacl -R -m g:{group}:full_set:fd:allow {path}`) |
| `acl_user_read` / `acl_user_write` (and `_remove`) | The same for one app's account (`{user}`, a name or a number), read-only or read-write |

A group share (`freedomnas.groupshares`) gives a dataset's directory to a
Unix group instead: root owns it, mode `2770`, and the ACL entries above make
everything created in it the group's.

### `samba`

| Key | Value type | Description |
|-----|------------|-------------|
| `config_file` | string | Path to `smb.conf` |
| `group_share_settings` | list | `[global]` lines a group share needs, appended to `smb.conf` when missing (Linux: `create mask = 0770`, `directory mask = 0770`; FreeBSD: none) |
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

`smb_service` and `nmb_service` can differ per init system on the same
edition; a `by_init` object overrides them (see
[Engine](../architecture/engine.md#values-that-depend-on-the-init-system)).
On Artix, verified against the `samba-<init>` packages: OpenRC has one `smb`
script that starts smbd and nmbd; dinit and runit have `smbd` and `nmbd`;
s6 has the longruns `smbd-srv`/`nmbd-srv` inside the bundles `smbd`/`nmbd`.

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
| `reload_exports` | command | Reload export table (`exportfs -ra`; FreeBSD has no `exportfs`: `service mountd onereload`) |
| `list_exports` | command | List current exports |
| `check_export` | command | Verify export availability |
| `default_options` | string | A share's options when none are given: `rw,sync,no_subtree_check` (Linux); empty on FreeBSD, whose exports(5) shares no option names with Linux and maps a client's root to `nobody` by default |
| `owner_options` | template | Appended to a share's options to map every client user onto its owner: `,all_squash,anonuid={uid},anongid={gid}` (Linux), `,mapall={owner}` (FreeBSD) |

FreeBSD's `export_add` writes the line exports(5) expects, checked with
`mountd` on FreeBSD 15.1: one option group (`-ro,mapall=anna`, none when
empty), a network as `-network 10.0.0.0/24`, a host as is, and no host at
all for `*` (everyone). Its `export_remove` matches the path as the first
field, since a line can be the path alone. `exportfs_reload` starts
`mountd` when it is not running: it refuses to start at boot while
`/etc/exports` does not exist. The installer (`files.nfs_exports`,
`files.rc_conf`) and the image builder start that file with a `V4: /` line
and set `nfsv4_server_enable="YES"`, so NFSv4 clients get in as well as
NFSv3 ones (checked with a Linux client mounting `vers=4.2`); the
reconciler does not count the `V4:` line as an export.

`nfs_service` can be overridden per init system with `by_init`, as for
Samba. On Artix: `nfs` under OpenRC (pulls in rpcbind and rpc.statd itself),
`nfs-server` under dinit (depends on statd and rpcbind) and runit (exits
unless `statd` and `rpcbind` are running, so all three are enabled), and the
`nfs-server` bundle under s6. On FreeBSD the service is `nfsd` (rcvar
`nfs_server_enable`, it pulls in `mountd` and `rpcbind`) and Samba is the
port's `samba_server` script, which runs nmbd and smbd.

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

### `power_button`

Only on editions whose system does nothing with the power button by itself
(Artix, Void, Gentoo). Values, not commands:

| Key | Value |
|-----|-------|
| `category` | `power-button`: the package category with acpid and its service |
| `rule_dir` | `/etc/acpi/events`: acpid's rules; when it is missing, acpid is installed |
| `rule_file` | `/etc/acpi/events/freedomnas-power` |
| `rule` | The rule's text: `event=button/power.*`, `action=/bin/sh -c poweroff` |
| `service` | `acpid` |

At every boot the reconciler installs the category's packages when
`rule_dir` is missing (an install from before the category existed), writes
the rule when it is missing or different, enables the service and starts it
(restarts it when the rule changed), unless `services.boot` turns it off.

### `updates`

| Key | Command |
|-----|---------|
| `run_topgrade` | Run Topgrade with FreedomNAS config, `--yes` and all: stdin is `/dev/null`, so a prompt is a failed update |
| `list_updatable` | Count pending updates |
| `check_topgrade` | Verify Topgrade is installed |

## Template Variables

All `{variable}` placeholders in command strings are substituted by the engine.
See the [full template variable reference](../developer/webui.md) for a complete list.
