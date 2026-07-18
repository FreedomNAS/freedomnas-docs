# Backup Manager

`backup_manager.py` handles configuration backups and disaster recovery
at the category level. It is separate from ZFS snapshots — it backs up
config files (e.g. `smb.conf`, `/etc/exports`) rather than filesystem
state.

## Class Overview

```python
class BackupManager:
    def __init__(backup_dir=None, system_root="/")
```

| Parameter | Default | Notes |
|-----------|---------|-------|
| `backup_dir` | `/var/backups/freedomnas/` | Where tarballs are stored |
| `system_root` | `/` | Override for testing; all paths are rooted here |

## packages.yaml

`BackupManager` owns the `packages.yaml` file at
`/etc/freedomnas/packages.yaml`. This file tracks which optional feature
categories have been installed (separate from `config.yaml`).

```python
bm.save_packages_config({
    "version": "4.0.0",
    "edition": "debian",
    "installed_categories": [
        {"id": "core",       "status": "installed"},
        {"id": "samba-cifs", "status": "installed"},
    ]
})

config = bm.load_packages_config()  # returns dict or None
```

The file is written as JSON with a header comment. `load_packages_config()`
strips comment lines before parsing.

## Category Backups

Each optional feature category can have its config files backed up as a
`.tar.gz` archive.

```python
# Backup smb.conf and related files
bm.backup_category_config(
    category_id="samba-cifs",
    config_paths=["/etc/samba/smb.conf", "/etc/samba/lmhosts"],
)
# → /var/backups/freedomnas/samba-cifs-2026-07-18_10-30-00.tar.gz
```

Files are archived with their original absolute paths (minus the
`system_root` prefix) so they restore to the same location.

```python
# Restore
restored = bm.restore_category_config(Path("/var/backups/freedomnas/samba-cifs-2026-07-18_10-30-00.tar.gz"))
# returns list of restored paths: ["/etc/samba/smb.conf", ...]
```

## Full System Backup

```python
bm.create_full_backup(
    packages_config={...},
    category_configs={
        "samba-cifs": ["/etc/samba/smb.conf"],
        "nfs":        ["/etc/exports"],
    },
    backup_name="freedomnas-backup-2026-07-18",
)
# → /var/backups/freedomnas/freedomnas-backup-2026-07-18/
#     packages.yaml
#     samba-cifs-freedomnas-backup-2026-07-18.tar.gz
#     nfs-freedomnas-backup-2026-07-18.tar.gz
```

## Full System Restore

```python
results = bm.restore_from_backup(
    backup_dir=Path("/var/backups/freedomnas/freedomnas-backup-2026-07-18"),
    selected_categories=["samba-cifs"],  # None = restore all
)
# results = {"restored_categories": [...], "restored_files": [...], "errors": [...]}
```

## Backup Rotation

```python
deleted = bm.cleanup_old_backups("samba-cifs", keep_count=5)
```

Keeps the 5 most recent backups (sorted newest first) and deletes the rest.

## Relationship to ZFS Snapshots

| Mechanism | What it backs up | When used |
|-----------|-----------------|-----------|
| `BackupManager` | Config files (`smb.conf`, `/etc/exports`, …) | Feature install/uninstall, migration |
| ZFS snapshots (`config.yaml`) | System identity (hostname, users, shares) | Disaster recovery, OS reinstall |
| `zz-dracut-uki` ZFS snapshot | Entire OS filesystem (`rpool/ROOT/debian`) | Kernel rollback |

These three mechanisms are complementary. For a full disaster recovery, use
all three: ZFS pool import → `ReconciliationEngine` → `BackupManager.restore_from_backup`.
