# Users API

## GET /api/users/

List all configured users.

**Auth required:** yes

**Response:**

```json
[
  {
    "username": "admin",
    "uid": 1000,
    "gid": 1000,
    "shell": "/bin/bash",
    "groups": ["sudo", "samba"]
  },
  {
    "username": "sarah",
    "uid": 1001,
    "gid": 1001,
    "shell": "/bin/bash",
    "groups": ["samba"]
  }
]
```

---

## POST /api/users/

Create a new system user.

**Auth required:** yes

**Request body:**

```json
{
  "username": "sarah",
  "uid": 1001,
  "gid": 1001,
  "shell": "/bin/bash",
  "groups": ["samba"],
  "password": "s3cur3pass",
  "samba_password": "s3cur3pass"
}
```

**Behaviour (dual write):**

1. `engine.execute("users", "create", username="sarah", uid=1001, ...)`
2. `engine.execute_with_stdin("users", "set_password", stdin_data="sarah:s3cur3pass\n", username="sarah")`
3. `engine.execute_with_stdin("users", "set_samba_pass", stdin_data="s3cur3pass\n", username="sarah")`
4. `config.add_user({...})` + `config.save()`

Passwords are always passed via stdin — never in command strings.

**Response:** `{ "ok": true, "username": "sarah" }`

**Errors:**

| Code | Reason |
|------|--------|
| 409 | Username already exists |
| 400 | Invalid username or UID conflict |
| 500 | OS user creation failed |

---

## DELETE /api/users/{target}

Delete a system user.

**Auth required:** yes

**Path parameter:** `target` — the username to delete

**Behaviour (dual write):**

1. `engine.execute("users", "delete", username="sarah")` (removes home directory)
2. `config.remove_user("sarah")` + `config.save()`

**Response:** `{ "ok": true }`

**Errors:**

| Code | Reason |
|------|--------|
| 404 | User not found |
| 403 | Attempt to delete the last admin user |
| 500 | OS user deletion failed |
