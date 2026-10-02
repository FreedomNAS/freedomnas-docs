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
  "owner": "anna",
  "read_only": false
}
```

Optional fields: `comment` (defaults to `name`), `owner`, `read_only`, and
`acl` / `valid_users`, which default to the owner alone:
`Unix User\<owner>:F` (`:R` when `read_only`) and `[<owner>]`. The ACL names
the account through Samba's `Unix User` domain: a bare name is not looked up
as the account (the connection is refused), and a `HOSTNAME\user` one stops
matching when the hostname changes.

**Owner.** A share is as writable as its directory. When `path` is the
directory a dataset of a data pool mounts on, it is given to the owner —
`directories.owner_set`, then `directories.mode_set` `0700` — exactly as
`POST /api/storage/datasets` does. With no `owner` in the request, a
directory that already belongs to an account keeps it (a share the
administrator makes of a dataset given to someone else does not take it
back), and one still owned by root goes to the signed-in account. Any other
path — a subdirectory, a directory outside ZFS — keeps its permissions, and
the response says so in `warning`.

**Behaviour (dual write):**

1. Pre-flight: open and scan `smb.conf` for usershare stanza
2. `engine.execute("samba", "create_share", share_name=..., path=..., comment=..., acl=...)`
3. `engine.execute("samba", "reload_config")`
4. `config.add_smb_share({name, path, comment, acl, read_only, valid_users, owner, guest_ok: false})`

The ACL is recorded with the share because disaster recovery and a loaded
configuration recreate the share from `config.yaml`. A share recorded
before the ACL was stored gets back what the WebUI gave it, `Everyone:R`
plus full control for its `valid_users`, never more. `read_only` and
`valid_users` are recorded but not applied separately: the ACL is what
Samba enforces.

**Response:**

```json
{ "name": "Documents", "path": "/mnt/datapool/documents", "owner": "anna" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 409 | Samba usershare not configured — run the setup wizard first |
| 422 | `name` or `path` missing, or an `owner` with no account |
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
`options` defaults to `rw,sync,no_subtree_check`. `owner` works as for SMB
shares: the dataset directory goes to that account, mode `0700`.

**Mapping onto the owner.** NFS has no login: the server takes the client's
word for the user ID, and the same person often has another ID on their own
computer. When the directory was given to the owner, the share is recorded
with `map_to_owner: true` and exported with `nfs.owner_options` appended —
`all_squash,anonuid=<uid>,anongid=<gid>` on Linux, `-mapall=<owner>` on
FreeBSD — so every user of an allowed host works as the owner, whatever ID
they have there. `allowed_hosts` is therefore what decides who that is:
name the owner's own computer. The mapping is never written into `options`;
it is added each time the export is written (here, by the reconciler, when
a dataset moves), with the IDs of the system doing it.

**Behaviour (dual write):**

1. Read the exports file path from profile (`nfs.config_file`)
2. Append `{path} {allowed_hosts}({options})` line to the exports file
3. `engine.execute("nfs", "exportfs_reload")`
4. `config.add_nfs_share({name, path, allowed_hosts, options, owner, map_to_owner})`

**Response:**

```json
{ "name": "backup", "path": "/mnt/datapool/backup", "owner": "anna" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `name`, `path`, or `allowed_hosts` missing, or an `owner` with no account |
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
