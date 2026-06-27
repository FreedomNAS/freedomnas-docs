# Core Engine

`engine.py` is the heart of FreedomNAS. It translates abstract actions into
OS-specific shell commands using JSON profiles. It is implemented as a
**thread-safe singleton**.

## Responsibilities

- Detect the running OS and init system at startup
- Load the correct JSON profile and merge the init profile's `services` section
- Translate abstract action names into shell command strings
- Execute commands safely (no `shell=True` unless the profile command requires it)
- Provide introspection: list available categories and actions

## Public API

```python
class FreedomNASEngine:
    def __init__(self, profile_dir=None, os_override=None)

    # Command retrieval
    def get_command(self, category, action, **kwargs) -> str | list
    def get_profile_value(self, category, key) -> str  # e.g. "smb_service", "config_file"

    # Execution
    def execute(self, category, action, timeout=30, check=True, **kwargs) -> tuple[str, str]
    def execute_with_stdin(self, category, action, stdin_data, ...) -> tuple[str, str]

    # Introspection
    def get_os_info(self) -> dict    # includes init_system
    def list_categories(self) -> list
    def list_actions(self, category) -> list

def get_engine(profile_dir=None) -> FreedomNASEngine   # singleton accessor
```

Always use `get_engine()` from `deps.py` — never instantiate `FreedomNASEngine` directly.

## OS Detection

On startup, the engine reads `/etc/os-release` on Linux or uses
`platform.system()` for FreeBSD. Detection is automatic — no user selection.

## Init System Detection

The engine detects the running init system by checking filesystem markers:

| Marker | Init system |
|--------|-------------|
| `/run/systemd/private` | systemd |
| `/run/openrc/started` | openrc |
| `/run/runit` | runit |
| `/run/s6` | s6 |
| `/run/dinit` | dinit |
| `/etc/rc.conf` (BSD) | bsd_rc |

Falls back to the `init_system` field in the OS profile. Defaults to `systemd`.

The init profile (`init/{name}.json`) is loaded separately. Its `services`
section is merged into the OS profile at runtime. OS profiles never contain
a `services` key directly.

## Command Execution Safety

All commands use `shlex.split()` + `subprocess.run(shell=False)`.

Exception: commands in the profile that contain `|`, `>`, or `$()` metacharacters
trigger `shell=True` automatically inside `engine._run_safe()`. This is the only
place where `shell=True` is permitted, and it is controlled by the profile — not by application code.

## Sensitive Data

`execute_with_stdin()` pipes passwords and other sensitive data to the process
via stdin. This prevents them from appearing in the command string (visible in
`ps aux`) or in log files.

```python
# Correct — password via stdin
engine.execute_with_stdin("users", "set_password", stdin_data="newpassword\n", username="admin")

# Wrong — never do this
engine.execute("users", "set_password_inline", username="admin", password="newpassword")
```

## Template Substitution

`get_command()` substitutes `{variable}` placeholders in the profile command
string using `str.format_map(kwargs)`. Before substitution, `_sanitize_kwargs()`
strips shell metacharacters from all kwargs to prevent injection.

Example:

```json
"hostname_set": "hostnamectl set-hostname {hostname}"
```

```python
engine.execute("system", "hostname_set", hostname="freedomnas")
# → runs: hostnamectl set-hostname freedomnas
```
