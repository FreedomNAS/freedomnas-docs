# Setup API

The setup API handles the first-run wizard. All routes here are exempt from
authentication and from the first-run guard — they are always accessible.

## GET /api/setup/status

Returns whether the system has been initialized.

**Auth required:** no

**Response:**

```json
{
  "initialized": false,
  "edition": null,
  "detected_edition": "debian"
}
```

After initialization:

```json
{
  "initialized": true,
  "edition": "debian",
  "detected_edition": "debian"
}
```

`detected_edition` is the profile the engine detected on the running system
(`engine.os_type`). The wizard preselects it.

---

## POST /api/setup/initialize

Run the first-run initialization.

**Auth required:** no

**Request body:**

```json
{
  "hostname": "freedomnas",
  "timezone": "Europe/Rome",
  "edition": "debian"
}
```

`edition` is required and must be one of `engine.SUPPORTED_OS` (`debian`,
`freebsd`, `arch`, `artix`, `void`, `gentoo`) **and** equal to the detected
edition — the engine chooses profiles by detection, so a different value
would only record a wrong label. `hostname` defaults to `"freedomnas"`,
`timezone` to `"UTC"`.

### Optional: creating an encrypted pool during setup

The body accepts an optional `pool` field. When present, the wizard also
creates a ZFS-native-encrypted pool as part of first-run initialization, via
`freedomnas.keymgmt.PoolProvisioner` (see
[Encrypted Pool Keyslots](../architecture/security.md#encrypted-pool-keyslots)
for the underlying keyslot design):

```json
{
  "hostname": "mynas",
  "timezone": "Europe/Rome",
  "edition": "debian",
  "pool": {
    "name": "datapool",
    "vdev_type": "mirror",
    "devices": ["/dev/disk/by-id/ata-DISK1", "/dev/disk/by-id/ata-DISK2"],
    "master_passphrase": "correct horse battery staple",
    "usb_devices": ["/dev/sdb1"]
  }
}
```

| `pool` field | Required | Notes |
|--------------|----------|-------|
| `name` | yes | Pool name |
| `vdev_type` | no | e.g. `mirror`, `raidz1`; empty string means a single-disk vdev |
| `devices` | yes | Non-empty list of block device paths |
| `master_passphrase` | yes | At least 12 characters — becomes the `passphrase` keyslot, used for the TTY unlock prompt at boot |
| `usb_devices` | no | Block device paths of already-mounted-and-writable USB sticks to write `freedomnas.key` onto — becomes the `usb` keyslot, used for zero-touch unlock at boot |

A random raw ZFS key is generated once and never stored in the clear. It is
wrapped independently for each factor (scrypt KDF + AES-256-GCM) into
`/etc/freedomnas/keyslots/<pool>.json`. The passphrase and the USB key bytes
themselves are never persisted anywhere — only their wrapped keyslots. The
API never returns a pool's passphrase; it is accepted only at creation time.

**Behaviour:**

1. Returns `409` immediately if `config.is_initialized()` is already `true`
2. `engine.execute("system", "hostname_set", hostname=...)`
3. `config.set_hostname(hostname)`
4. `engine.execute("system", "timezone_set", timezone=...)`
5. `config.set("system.timezone", timezone)`
6. Appends the Samba usershare stanza to `smb.conf` (`samba.config_file`) —
   **only if** the file has no `usershare path` yet, which is the case when
   the installer wrote a complete `smb.conf` (Arch, Artix, Gentoo):
   ```
   [global]
      usershare path = <samba.usershare_path>
      usershare max shares = 100
      usershare allow guests = no
   ```
7. Creates the usershare directory through the profile:
   `samba.usershare_prepare` with `{path}` = `samba.usershare_path`
   (`/var/lib/samba/usershares`, `/var/db/samba4/usershares` on FreeBSD)
8. If `pool` was given: `PoolProvisioner.create_encrypted_pool(...)` creates
   the pool and provisions both keyslots, writing `freedomnas.key` to each
   `usb_devices` entry, then `config.add_pool({"name", "vdev_type",
   "encrypted": true, "usb_keyslot_devices": <count>})` — only that
   non-secret metadata is recorded in `config.yaml`
9. `config.mark_initialized(edition=edition, initialized_by="webui")`

**Response:**

```json
{
  "detail": "System initialized",
  "hostname": "freedomnas",
  "edition": "debian"
}
```

**Errors:**

| Code | Detail |
|------|--------|
| 409 | System already initialized |
| 422 | `edition` is missing, unknown, or differs from the detected edition; or `pool` is invalid (missing `name`/`devices`, `master_passphrase` shorter than 12 characters, a device that is not a `/dev/...` path, or a `vdev_type` other than `""`/`mirror`/`raidz1-3`) — checked before anything is created |
| 500 | Engine, config, or keyslot operation failed partway through (`CommandExecutionError`, `CommandTranslationError`, `ConfigurationException`, `KeyManagementError`) |

!!! note
    When the system was installed via the TUI installer, it is already
    initialized (`initialized_by: "installer"`). The WebUI's `setup.js`
    checks `GET /api/setup/status` on every page load and redirects to the
    dashboard if `initialized` is `true` — so the wizard page is skipped
    entirely on installer-provisioned systems.

!!! warning "No wizard UI for `pool`"
    `setup.js`/`setup.html` implement only the 3 steps
    (hostname/timezone/edition). The `pool` field can only be exercised by
    calling this endpoint directly. After setup, pools are created from the
    Storage page through [`POST /api/storage/pools`](storage.md).
