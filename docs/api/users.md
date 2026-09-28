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

`username` and `password` are required. `groups` defaults to `[]`, `shell`
to `/bin/bash`. `uid` and `gid` are optional — omit them to let the OS
assign IDs. The password is at least 8 characters; neither it nor the
username may hold line breaks or control characters, and the username may
not hold `:` — `chpasswd` reads one `user:password` per line.

**Behaviour (dual write):**

1. `engine.execute("users", "create", username=..., groups=..., shell=..., uid=..., gid=...)`
2. The password through `users.set_password_stdin`, on stdin, shaped by
   `users.password_stdin_format` — never in a command line
3. Where Samba is installed (`samba.check_installed`), the same password
   through `samba.set_user_password` (`smbpasswd -a -s`), on stdin too:
   Samba keeps its own database, and an account missing from it cannot
   open a share
4. `config.add_user({username, groups, shell, [uid, gid]})` — never the password

**Response:**

```json
{ "username": "sarah" }
```

**Errors:**

| Code | Detail |
|------|--------|
| 422 | `username` or `password` missing, password under 8 characters, a control character in either, `:` in the username |
| 500 | OS user creation failed (duplicate username, invalid groups, etc.) |

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
| 500 | OS user deletion failed |

!!! warning
    The API does not prevent deleting the currently authenticated user or
    the last admin account. Guard these cases in the UI layer.
