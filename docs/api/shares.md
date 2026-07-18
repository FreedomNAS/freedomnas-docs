# Shares API

## SMB Shares

### GET /api/shares/smb

List all SMB shares from `config.yaml`.

**Auth required:** yes

**Response:**

```json
{
  "shares": [
    {
      "name": "Documents",
      "path": "/mnt/datapool/documents",
      "read_only": false,
      "valid_users": ["admin"],
      "guest_ok": false
    }
  ]
}
```

---

### POST /api/shares/smb

Create a new SMB usershare.

**Auth required:** yes

**Pre-flight check (spec §7.6):** Reads the Samba config file path from the OS
profile (`samba.config_file`) and checks that it contains both `usershare path`
and `usershare max shares`. Returns `409` if the setup wizard has not yet
written these lines.

**Request body:**

```json
{
  "name": "Documents",
  "path": "/mnt/datapool/documents",
  "comment": "Documents",
  "acl": "Everyone:R,admin:F",
  "read_only": false,
  "valid_users": ["admin"]
}
```

Optional fields: `comment` (defaults to `name`), `acl`
(defaults to `Everyone:R,<logged-in-user>:F`), `read_only`, `valid_users`.

**Behaviour (dual write):**

1. Pre-flight: open and scan `smb.conf` for usershare stanza
2. `engine.execute("samba", "create_share", share_name=..., path=..., comment=..., acl=...)`
3. `engine.execute("samba", "reload_config")`
4. `config.add_smb_share({name, path, read_only, valid_users, guest_ok: false})`

**Response:**

```json
{ "name": "Documents", "path": "/mnt/datapool/documents" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 409 | Samba usershare not configured — run the setup wizard first |
| 422 | `name` or `path` missing |
| 500 | Samba command failed |

---

### DELETE /api/shares/smb/{name}

Delete an SMB usershare.

**Auth required:** yes

**Behaviour (dual write):**

1. `engine.execute("samba", "delete_share", share_name=name)`
2. `engine.execute("samba", "reload_config")`
3. `config.set("shares.smb", [shares without this one])`

**Response:**

```json
{ "detail": "Share Documents deleted" }
```

---

## NFS Shares

### GET /api/shares/nfs

List all NFS exports from `config.yaml`.

**Auth required:** yes

**Response:**

```json
{
  "shares": [
    {
      "name": "backup",
      "path": "/mnt/datapool/backup",
      "allowed_hosts": "192.168.1.0/24",
      "options": "rw,sync,no_subtree_check"
    }
  ]
}
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

All three of `name`, `path`, and `allowed_hosts` are required.
`options` defaults to `rw,sync,no_subtree_check`.

**Behaviour (dual write):**

1. Read the exports file path from profile (`nfs.config_file`)
2. Append `{path} {allowed_hosts}({options})` line to the exports file
3. `engine.execute("nfs", "exportfs_reload")`
4. `config.add_nfs_share({name, path, allowed_hosts, options})`

**Response:**

```json
{ "name": "backup", "path": "/mnt/datapool/backup" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `name`, `path`, or `allowed_hosts` missing |
| 500 | NFS command failed or exports file not writable |

---

### DELETE /api/shares/nfs/{name}

Delete an NFS export.

**Auth required:** yes

**Behaviour (dual write):**

1. Look up the share's `path` from `config.yaml` — returns `404` if not found
2. Remove the matching line from the exports file
3. `engine.execute("nfs", "exportfs_reload")`
4. `config.remove_nfs_share(name)`

**Response:**

```json
{ "detail": "NFS share backup deleted" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 404 | NFS share not found in config |
| 500 | NFS command failed |
