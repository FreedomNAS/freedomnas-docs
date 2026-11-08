# Users API

## GET /api/users/

List all users recorded in `config.yaml`.

**Auth required:** yes

**Response:**

```json
{
  "users": [
    {
      "username": "admin",
      "groups": ["sudo", "samba"],
      "shell": "/bin/bash"
    },
    {
      "username": "sarah",
      "groups": ["samba"],
      "shell": "/bin/bash"
    }
  ]
}
```

!!! note
    This returns what is stored in `config.yaml` — not a live read from
    `/etc/passwd`. Users created outside FreedomNAS will not appear here.

---

## POST /api/users/

Create a new OS user with its password, and persist it to `config.yaml`.

**Auth required:** yes

**Request body:**

```json
{
  "username": "sarah",
  "password": "at least eight characters",
  "groups": ["samba"],
  "shell": "/bin/bash",
  "uid": 1001,
  "gid": 1001
}
```

`username` and `password` are required. `groups` defaults to `[]`; the
groups administrators get (`admin_groups_present`: `docker`, `libvirt`) come
only with the edition's administrator group (`users.sudo_group`), and asking
for one without it answers `422` ("docker: only administrators may be in
this group"), since each gives root's power. `shell`
to `/bin/bash`. `uid` and `gid` are optional — omit them to let the OS
assign IDs. The password is at least 8 characters; neither it nor the
username may hold line breaks or control characters, and the username may
not hold `:` — `chpasswd` reads one `user:password` per line.

**Behaviour (dual write):**

1. `engine.execute("users", "create", username=..., groups=..., shell=...)`, or
   `users.create_with_uid` (`useradd -u`) when `uid` is given
2. The password through `users.set_password_stdin`, on stdin, shaped by
   `users.password_stdin_format` — never in a command line
3. Where Samba is installed (`samba.check_installed`), the same password
   through `samba.set_user_password` (`smbpasswd -a -s`), on stdin too:
   Samba keeps its own database, and an account missing from it cannot
   open a share
4. `config.add_user({username, groups, shell, uid, gid})` — never the password.
   `uid` and `gid` are the ones the system gave the account
   (`users.get_user_info`), whether asked for or not: files on a pool carry
   these numbers, and a restore on another system or edition recreates the
   account with them ([Reconciler](../architecture/reconciler.md))

If step 2, 3 or 4 fails, the account created in step 1 is taken back
(`samba.delete_user`, then `users.delete`, i.e. `userdel -r`) before the
error is returned: no half-created account is left on the system, unknown
to the configuration and blocking the next attempt with "user already
exists". When step 1 itself fails nothing is undone, so an account that
already existed is never deleted.

**Response:**

```json
{ "username": "sarah" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `username` or `password` missing, password under 8 characters, a control character in either, `:` in the username |
| 500 | OS user creation failed (duplicate username, invalid groups, etc.), or setting a password or saving the configuration failed — the account is then removed again |

---

## POST /api/users/{target}/password

Set an existing account's password, for the system and, where Samba is
installed, for Samba.

**Auth required:** yes

```json
{ "password": "a new password" }
```

Same rules and the same two stdin commands as creation. `422` for a
password that breaks the rules, `500` when a command fails.

```json
{ "detail": "Password updated for sarah" }
```

---

## POST /api/users/{target}/admin

Give an existing account the administrator role, or take it back.

```json
{ "admin": true }
```

The edition's administrator group (`users.sudo_group`) and the groups
administrators get with it (`admin_groups_present`: `docker`, `libvirt`) are added
with `users.add_to_group` or taken with `users.remove_from_group`, only
those the account does (not) have yet (`users.list_groups`); the
configuration entry gets `admin`, its `groups` without those. Answers
`{"username", "admin"}`.

| Status | When |
|--------|------|
| 422 | `admin` is not a boolean; the caller takes their own role; the account is the last administrator |
| 404 | no such user in the configuration |
| 500 | a command or saving the configuration failed |

## DELETE /api/users/{target}

Delete an OS user and remove from `config.yaml`.

**Auth required:** yes

**Path parameter:** `target` — the username to delete

**Behaviour (dual write):**

1. Where Samba is installed: `samba.delete_user` (`smbpasswd -x`)
2. `engine.execute("users", "delete", username=target)`
3. `config.remove_user(target)`

**Response:**

```json
{ "detail": "User sarah deleted" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `target` is your own account, `root`, or the last administrator in the configuration — nothing is deleted |
| 500 | OS user deletion failed |

The refusals are checked before any command runs, with the same rule as
`POST /api/users/{target}/admin` (nobody acts on their own account, the last
administrator stays).

## GET /api/account/me

**Auth required:** any account, administrator or not (401 for a wrong
password, never 403).

```json
{
  "username": "mario", "admin": false, "groups": ["mario", "media"],
  "hostname": "freedomnas", "edition": "artix",
  "shares": {"smb": [{"name": "media", "path": "/tank/media", "comment": "media", "read_only": false}],
             "nfs": []},
  "links": [{"name": "jellyfin", "title": "Jellyfin", "path": "/", "url": "https://jellyfin.freedomnas.home.arpa/"},
            {"name": "pihole", "title": "Pi-hole", "path": "/admin/", "scheme": "https", "port": 8053}],
  "ca_fingerprint": "2D:24:64:15:…"
}
```

`shares` are the SMB shares the account owns, is a valid user of, or whose
group it is in (`users.list_groups`), and the NFS shares it owns. `links`
joins what every module's `links()` gives, by name: the containers module
gives each app that is up with its title and path, and its port unless the
proxy serves it; the proxy module gives each site, by name when names are on
(the own domain first) or on its port. An entry with `scheme` and `port` is
on the address the WebUI was reached at; one with neither port nor `url` is
left out. All modules are asked at once: one that raises, or has not
answered within 5 seconds, gives no links, and the others are listed.

## POST /api/account/password

**Auth required:** no Basic credentials: the body carries them. Any account
may call it for itself, administrator or not.

```json
{"username": "mario", "password": "the current one", "new_password": "a new one"}
```

The current password is checked against PAM with the same lockout as
signing in, and may be a temporary one that has expired (PAM answers
`PAM_NEW_AUTHTOK_REQD`): changing it is what this is for. The new password
must differ and meet the usual rules. It is set for the system and Samba,
the expiry is lifted (`users.password_fresh`) and `temporary_password`
leaves the account's entry. `401` for a wrong name or password, `422` for a
bad new one or `root`.

