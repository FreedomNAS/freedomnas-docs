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
  "edition": null
}
```

After initialization:

```json
{
  "initialized": true,
  "edition": "debian"
}
```

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

`edition` is required (`debian` / `freebsd`). `hostname` defaults to
`"freedomnas"`, `timezone` to `"UTC"`.

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
6. Writes Samba usershare stanza to `smb.conf` (path from `samba.config_file` profile key):
   ```
   [global]
      usershare path = /var/lib/samba/usershares
      usershare max shares = 100
      usershare allow guests = no
   ```
7. Creates `/var/lib/samba/usershares/` directory
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
| 422 | `edition` is missing, or `pool` is invalid (missing `name`/`devices`, or `master_passphrase` shorter than 12 characters) — checked before anything is created |
| 500 | Engine, config, or keyslot operation failed partway through (`CommandExecutionError`, `CommandTranslationError`, `ConfigurationException`, `KeyManagementError`) |

!!! note
    When the system was installed via the TUI installer, it is already
    initialized (`initialized_by: "installer"`). The WebUI's `setup.js`
    checks `GET /api/setup/status` on every page load and redirects to the
    dashboard if `initialized` is `true` — so the wizard page is skipped
    entirely on installer-provisioned systems.

!!! warning "No wizard UI yet"
    `setup.js`/`wizard.html` still implement only the original 3 steps
    (hostname/timezone/edition). There is no wizard UI for the `pool` field
    yet — encrypted pool creation during setup can currently only be
    exercised by calling this endpoint directly.
