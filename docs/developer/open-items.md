# Open Items

What is still open across the FreedomNAS repositories: work agreed and not
finished, things done but not yet tested where they matter, known limitations,
and ideas not started. Finished work is not listed here; it is in the git
history of each repository.

*Last reviewed: 2026-11-01.*

## Next up

| Item | Notes |
|------|-------|
| Installer restore on real hardware | Install from the live ISO with a data pool attached; expected result: configuration restored, modules installed in the chroot, 0 failures at first boot. Needs the dev packages with core `069047c` published for every edition first, because the target installs `freedomnas-core` from the repository. The fix that adds `samba-cifs` and `acl` to the restored features was not retested in a VM either. |
| Package publishes after the LTS kernel bump | All package workflows were started on 2026-10-31 together with a new LTS kernel build (Arch and Debian). Check that every run finished and the registries have the new kernel and core. |
| Unmodified dev image test | Boot the newest dev Debian image, unmodified, against a data pool with apps; expected: 0 failures. |
| Test box on packages again | The test box runs dev trees copied over the installed packages. The next `pacman -Syu` there needs `--overwrite '/usr/lib/freedomnas/*'`. |

## Found by the codebase check (2026-11-01)

The check found no broken references. Test suites: core 703, WebUI 535,
containers 224 and proxy 80 tests pass, and the installer dry run passes for
every edition (Artix with s6 too). Every literal profile command called from
Python exists in every edition that can reach it, with all its placeholders
passed. All profile shell commands pass `sh -n`. The WebUI pages only call API
routes that exist, and use HTML ids and handlers that are defined. Core
functions used by the WebUI and modules exist, as do CLI subcommands and
options used by scripts and profiles. Config keys are written where they are
read. Packaging declares the same dependencies and copies every core file on
all editions. shellcheck finds no errors.

Fixed the same day: snapshot schedules on the Snapshots tab (they had an API
but no page), Pi-hole's DNS address now honoured on FreeBSD too, the module
template shows `links()`, `prepare()` and `after`, and the stale descriptions
and unused names are gone.

| Item | Notes |
|------|-------|
| Pi-hole fix on existing FreeBSD installs | Reaches them with the next FreeBSD publish of `freedomnas-module-containers` followed by the app's **Update** (reinstall from the catalogue). |
| Installer tests | `freedomnas-installer/tests` has only `dryrun_smoke.py` (a script, not pytest), so `pytest` there runs nothing. |

## Restore and edition switch

| Item | Notes |
|------|-------|
| Data newer than code | The reconciler never overwrites a differing identity copy and snapshots the data pool's `.freedomnas` before applying it, but there is no format/version check of the stored configuration against the running code yet (update FreedomNAS first, or hold the sections it does not know). |
| SSH right after the restore wizard | Once, the first SSH login right after the wizard was refused and worked later. Probably a fluke; recheck on the next restore. |
| Package-manager updates without a snapshot | A raw `pacman -Syu` (not through the WebUI) takes no pre-update root snapshot, so an automatic rollback can only restore the UKI. |
| Restore source probe | The installer probe and `pool_import.find_restorable` may still offer another installation's root pool as a restore source; boot and sync already skip foreign root pools. |
| Forged or wrong CA in the copy | A CA stored in the data pool copy is restored as it is; a wrong one can only be recovered from older snapshots. Known limitation. |
| Cosmetic log lines | First edition move logs a harmless `containers.apps.vaultwarden.down` failure (compose file missing before the reinstall). When the hostname changes during a boot, Caddy's certificate copy keeps the old names until the next boot. |

## Containers module

| Item | Notes |
|------|-------|
| Release pinning on Linux | Pinned catalogue releases were verified on FreeBSD only; check on Debian with the pinned tags, including the MariaDB auto-upgrade of an existing Nextcloud. |
| FreeBSD side of the move hook | The Nextcloud move hook (`freedomnas-move.sh`) was not tested live moving an app from Linux to FreeBSD. |
| AppJail log datasets | Removing an app on FreeBSD leaves its AppJail log datasets behind. |
| Nextcloud shares | The group shares Nextcloud mounts are chosen at install; a share created later needs a reinstall on kept data. |
| Module release tags | `freedomnas-containers` and `freedomnas-proxy` have no `v0.1.0` tag yet, so `main` builds and the overlay auto-bump skip them. |
| Plugins page | Live install/remove from the Plugins page untested on Debian, Void, Gentoo and FreeBSD. Removing a module leaves `modules/<id>/__pycache__`; the banner says "FreedomNAS was updated." also after a module install. |

## Reverse proxy module

| Item | Notes |
|------|-------|
| Let's Encrypt with a real domain | Tested only with Pebble; needs a real domain and a DNS provider token. |
| Names for apps with their own HTTPS | Vaultwarden and Pi-hole have no name yet (site with an HTTPS upstream). |
| Public resolver warning | Warning in the Names card when a public resolver sits beside the Pi-hole in the DNS list (offered, not done). |
| Pi-hole DHCP | Needs the app on the LAN itself (VNET jail on the bridge, or Docker host network); broadcast never passes NAT or the proxy. |
| Home Assistant on FreeBSD | Maybe through the Linuxulator. |
| Names on Arch and Gentoo | Names and low ports not tested live there. |

## Pi-hole on FreeBSD

| Item | Notes |
|------|-------|
| New port versions | Check that `pihole-ftl 6.8_3` and `pihole 6.5_4` reached `15-dev` with the next FreeBSD publish. |
| Next FTL release | Patches for upstream's development branch are kept in `freedomnas-freebsd` `ports/dns/*/next/` (refresh with `bin/update-pihole.sh ftl|core next`). No upstream pull request for now. |

## Packaging, CI and docs build

| Item | Notes |
|------|-------|
| `follow-lts` series change | The nightly runs work (2026-10-31: overlay auto-bump of topgrade-bin, arch-install-scripts and Zensical; `follow-lts` moved the kernel to 6.18.60 with OpenZFS 2.4.4). The path that moves to a new LTS series has never run. |
| Zensical everywhere | The overlay builds the docs with Zensical; deb, Arch, Void, FreeBSD and the image builder still use MkDocs. Deferred to 2027 (Material for MkDocs is supported until then). |
| Notify workflows | Actions are disabled on core, WebUI and profiles, so `notify-*` workflows never run: enable them (with secrets) or drop them. |
| Debian sudoers on existing installs | The `DEBIAN_FRONTEND` `env_keep` line reaches only new installs; existing ones keep the debconf warnings. |
| Debian repository package | The installer could install `freedomnas-repository` instead of writing the APT source itself. |
| Kernel in `main` | The Debian kernel and zfsutils were last published to `trixie dev`; check that `main` gets them for release installs. |
| Leftovers in the image builder | `common/zfs-layout.sh`, `partition.sh` and `freebsd/guest/build-in-guest.sh` are unused and still say `rpool`. |
| Arch/Artix dracut hook | The stock `90-dracut-install.hook` also builds an initramfs for every kernel (harmless error for kernels without ZFS); maybe mask it. |
| Installer smoke test | `tests/dryrun_smoke.py` needs `PYTHONPATH` pointing at a directory with `freedomnas` → `freedomnas-core`. |
| ZFS and Linux licensing | Decision on distributing images with ZFS and Linux together. |

## Networking

| Item | Notes |
|------|-------|
| Untested live | FreeBSD `lagg`; WireGuard on Debian and Arch. |
| VPN to LAN | Reaching the LAN through the WireGuard VPN is not offered. |
| Existing installs | `wireguard-tools` and `qrencode` must be installed by hand on installs older than the networking work (overlay and Arch packages not updated). |

## Storage and boot

| Item | Notes |
|------|-------|
| FreeBSD ZFS views | `zpool status -j`, ARC statistics, `zfs allow`, events and live I/O unverified on FreeBSD. |
| FreeBSD kernel check | `bootloader.kernel_installed` (reboot notice) not tested live. |
| FreeBSD updates on the box | Updates into a boot environment (trial start, rollback after a panic, Previous systems) were verified in a FreeBSD 15.1 VM on 2026-11-01; not yet on the real box. Existing installs drop the fixed `vfs.root.mountfrom` from `loader.conf` at the first boot with the new core. |
| pkgbase on FreeBSD | Install and update the FreeBSD base system as `pkg` packages (pkgbase) instead of the distribution sets and `freebsd-update`: one `pkg -c <copy> upgrade` would update base and packages together. Needs the installer and the image builder to install base from pkg, the `updates.be_update` commands in `os-freebsd.json`, and a way to convert existing installs (`pkgbasify`, to check). Check first how supported pkgbase is in 15.x. |
| Init coverage | `list_all` / `is_running` untested on real s6 and systemd systems. |
| Two FreeBSD disks | The GPT label `efiboot` used in `fstab` would clash with a second FreeBSD disk. |
| ESP on another disk | Installer choice of the bootloader target, for boards that cannot boot NVMe on PCIe. |
| Wipe disk | "Wipe disk" in pool creation, Advanced level only. |
| SMART alerts | `smartd` alerts (the Disks tab exists). |
| Remote replication | Replication over SSH to another NAS (only local replication exists). |
| Ideas | Initramfs importing the root pool by GUID instead of by name; installer proposing `<edition>pool` as the default pool name; `vfs.mountroot.timeout` for slow USB on FreeBSD. |

## Not started (roadmap ideas)

- Virtualization module: libvirt on Linux, vm-bhyve on FreeBSD.
- Active Directory / LDAP.
- Cloud sync and remote encrypted backups.
- Profile packages split per distribution and init system.
- ARM64 editions (Debian and FreeBSD only).
- Template repository for community-run editions.
- Fedora / Rocky / Alma through the installer's rootfs-tarball method.
