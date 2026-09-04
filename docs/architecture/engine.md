# Core Engine

`engine.py` is the heart of FreedomNAS. It translates abstract actions into
OS-specific shell commands using JSON profiles. It is implemented as a
**thread-safe singleton**.

## Responsibilities

- Detect the running OS and init system at startup
- Load the shared `os/os-<os>.json` base fragment, merge in every module's
  own `<module>/<module>-<os>.json` fragment (see
  [Profile System Overview](../profiles/overview.md)), then merge the init
  profile's `services` section last
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

    # Installer only — a non-singleton engine bound to another OS
    @classmethod
    def for_target(cls, os_type, root=None, profile_dir=None,
                   init_system=None, chroot_prefix=None) -> FreedomNASEngine
```

Always use `get_engine()` (from `api/deps.py` in the WebUI) — never instantiate
`FreedomNASEngine` directly in application code.

### Target engines

The singleton describes the machine the process is running on. That is right
for the WebUI and the modules, and useless for an installer provisioning a
*different* edition into a chroot, so `for_target()` returns a fresh,
non-singleton engine bound to another profile:

```python
target = FreedomNASEngine.for_target("void", root="/mnt")
target.execute("packages", "install", package_name="zfs")
# -> chroot /mnt xbps-install -y zfs
```

- `root=None` (or `"/"`) means "run on the host" — what the in-place install
  mode wants.
- With a `root`, every command is prefixed with the profile's
  `chroot.exec_prefix`.
- The target's init system comes from its own profile declaration; a target
  engine never probes the running host for it.
- The singleton is untouched: `get_engine()` still returns the host's engine.

## OS Detection

On startup, the engine reads `/etc/os-release` on Linux or uses
`platform.system()` for FreeBSD. Detection is automatic — no user selection.

Supported: `debian` (also matches Ubuntu), `arch`, `freebsd`.
Raises `OSNotSupportedException` for RHEL/CentOS and any unrecognised OS.

## Init System Detection

The engine detects the running init system by checking filesystem markers in
this order:

| Check | Init system |
|-------|-------------|
| `/run/systemd/system` exists | `systemd` |
| `/sbin/openrc` or `/usr/sbin/openrc` exists | `openrc` |
| `/sbin/runit` or `/run/runit` exists | `runit` |
| `/usr/bin/s6-svscan` exists | `s6` |
| `/usr/bin/dinit` exists | `dinit` |
| `/etc/rc.d` exists + FreeBSD | `bsd_rc` |
| none of the above | read `init_system` from OS profile, or default `systemd` |

The init profile (`init/init-{name}.json`) is loaded separately, last. Its
`services` section **replaces** the merged profile's `services` section at
runtime.

## Profile Search Path

The engine searches for profiles in this order:

1. `/usr/lib/freedomnas/profiles` — system install
2. `../../freedomnas-profiles` — sibling repo in dev tree
3. `../os_profiles`, `./os_profiles` — local dev
4. `/opt/freedomnas/lib/os_profiles` — alternative install

## Command Execution Safety

Commands without shell metacharacters (`|`, `>`, `<`, `;`, `&`, `$(`) run via
`shlex.split()` + `subprocess.run(shell=False)`.

Commands containing those metacharacters trigger `shell=True` automatically
inside `_run_safe()`. This is the only permitted use of `shell=True`, and it is
controlled by the profile author — not by application code.

Before template substitution, `_sanitize_kwargs()` strips the characters
`;|&$\`` from all kwargs values to limit injection risk even in `shell=True`
paths.

A **target engine with a chroot prefix never uses `shell=True`**: the prefix
argv is prepended, and a command that needs a shell is handed to `sh -c`
*inside* the chroot as a single argument, so quoting inside it can never
escape into the host's shell.

## Sensitive Data

`execute_with_stdin()` pipes passwords and other sensitive values to the process
via stdin. They never appear in the command string (visible in `ps aux`) or
in log files.

```python
# Correct — password via stdin
engine.execute_with_stdin("users", "set_password", stdin_data="newpassword\n", username="admin")

# Wrong — never do this
engine.execute("users", "set_password_inline", username="admin", password="newpassword")
```

## Template Substitution

`get_command()` formats `{variable}` placeholders in the profile command
using `str.format(**safe_kwargs)`. All kwargs are sanitised first.

Example:

```json
"hostname_set": "hostnamectl set-hostname {hostname}"
```

```python
engine.execute("system", "hostname_set", hostname="freedomnas")
# → runs: hostnamectl set-hostname freedomnas
```

## Command Sequences

A profile entry may be a list of commands instead of a single string. The
engine executes them in order and returns the output of the last command.
`execute_with_stdin()` does not support sequences (raises
`CommandTranslationError` if the template is a list).

## Exceptions

| Exception | When raised |
|-----------|-------------|
| `OSNotSupportedException` | OS not recognised or profile file not found |
| `CommandTranslationError` | Category or action key missing in profile |
| `CommandExecutionError` | Command exited non-zero (if `check=True`) or timed out |
