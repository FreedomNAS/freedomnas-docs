# Shares API

## SMB Shares

### GET /api/shares/smb

List all SMB usershares.

**Auth required:** yes

**Response:**

```json
[
  {
    "name": "Documents",
    "path": "/mnt/datapool/documents",
    "read_only": false,
    "guest_ok": false,
    "valid_users": ["admin"]
  }
]
```

---

### POST /api/shares/smb

Create a new SMB usershare.

**Auth required:** yes

**Pre-flight check:** verifies that `smb.conf` has `usershare path` and
`usershare max shares` configured. Returns `409` if not.

**Request body:**

```json
{
  "name": "Documents",
  "path": "/mnt/datapool/documents",
  "read_only": false,
  "guest_ok": false,
  "valid_users": ["admin"]
}
```

**Behaviour (dual write):**

1. Pre-flight: `engine.execute("samba", "test_config")` — check smb.conf
2. `engine.execute("samba", "create_share", share_name="Documents", path="...", ...)`
3. `config.add_smb_share({...})` + `config.save()`

**Response:** `{ "ok": true, "name": "Documents" }`

**Errors:**

| Code | Reason |
|------|--------|
| 409 | Samba usershares not configured (run setup again) |
| 409 | Share name already exists |
| 400 | Path does not exist |
| 500 | Samba command failed |

---

### DELETE /api/shares/smb/{name}

Delete an SMB usershare.

**Auth required:** yes

**Behaviour (dual write):**

1. `engine.execute("samba", "delete_share", share_name="Documents")`
2. `config.remove_smb_share("Documents")` + `config.save()`

**Response:** `{ "ok": true }`

---

## NFS Shares

### GET /api/shares/nfs

List all NFS exports.

**Auth required:** yes

**Response:**

```json
[
  {
    "name": "backup",
    "path": "/mnt/datapool/backup",
    "allowed_hosts": "192.168.1.0/24",
    "options": "rw,sync,no_subtree_check"
  }
]
```

---

### POST /api/shares/nfs

Create a new NFS export.

**Auth required:** yes

**Request body:**

```json
{
  "name": "backup",
  "path": "/mnt/datapool/backup",
  "allowed_hosts": "192.168.1.0/24",
  "options": "rw,sync,no_subtree_check"
}
```

**Behaviour (dual write):**

1. `engine.execute("nfs", "add_export", path="/mnt/datapool/backup", allowed_hosts="...", options="...")`
2. `engine.execute("nfs", "reload_exports")`
3. `config.add_nfs_share({...})` + `config.save()`

**Response:** `{ "ok": true, "name": "backup" }`

---

### DELETE /api/shares/nfs/{name}

Delete an NFS export.

**Auth required:** yes

**Behaviour (dual write):**

1. `engine.execute("nfs", "remove_export", path="/mnt/datapool/backup")`
2. `engine.execute("nfs", "reload_exports")`
3. `config.remove_nfs_share("backup")` + `config.save()`

**Response:** `{ "ok": true }`
