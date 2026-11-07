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
- Leave out an invalid community module fragment and record it in
  `profile_failures`; stop on an invalid core fragment (see
  [Invalid fragments](../profiles/overview.md#invalid-fragments))
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
`platform.system()` for FreeBSD. Detection is automatic — no user selection;
the first-run wizard's edition field only records the result.

`SUPPORTED_OS`: `debian`, `freebsd`, `arch`, `artix`, `void`, `gentoo`.

On Linux, the `/etc/os-release` fields are matched against `_DISTRO_IDS`:

| Step | Match | Result |
|------|-------|--------|
| 1 | `ID` is a key of `_DISTRO_IDS` (`debian`, `ubuntu`, `arch`, `artix`, `void`, `gentoo`) | That profile — `ubuntu` maps to `debian`, with a warning |
| 2 | A word of `ID_LIKE` is a key of `_DISTRO_IDS` | The parent's profile, with a warning naming the unknown distribution |
| 3 | `ID` is in `_KNOWN_UNSUPPORTED` (`fedora`, `rhel`, `centos`, `rocky`, `almalinux`) | `OSNotSupportedException` — "RHEL-based systems not yet supported" |
| 4 | Anything else | `OSNotSupportedException` listing the supported ids |

The exact `ID` is checked first so a derivative with its own profile (Artix,
`ID_LIKE=arch`) never falls through to its parent's. Any other OS than Linux
or FreeBSD raises `OSNotSupportedException`.

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

### Values that depend on the init system

Some values change with the init system on the same distribution: on Artix
the Samba service is `smb` under OpenRC but `smbd` under dinit and runit. A
profile section can carry a `by_init` object, keyed by init name, whose values
replace the section's own once the init system is known:

```json
"samba": {
  "smb_service": "smbd",
  "by_init": {
    "openrc": { "smb_service": "smb" }
  }
}
```

`by_init` is removed from the merged profile, so `get_profile_value` and
`get_profile_section` only ever see the resolved values. It holds data, never
code: the names still live in the JSON profiles.

## Profile Search Path

The engine asks `paths.profiles_dir()`, which searches, relative to the
core's own location:

1. `<install_root>/profiles` — system install (the core is
   `<install_root>/core/freedomnas/`)
2. `../freedomnas-profiles` — sibling repo in a dev tree

No absolute path is involved: `<install_root>` is whatever the edition's
packages chose (see [System Stack](system-stack.md#installed-filesystem-layout)).

## Command Execution Safety

Templates without shell metacharacters (`|`, `>`, `<`, `;`, `&`, `$(`) run
via `shlex.split()` + `subprocess.run(shell=False)`.

Templates containing those metacharacters run with `shell=True` inside
`_run_safe()`. This is the only permitted use of `shell=True`, and it is
controlled by the profile author — not by application code. The decision is
taken on the **template**, never on the formatted command, so no value can
turn the shell on.

Every template variable is quoted with `shlex.quote()` before substitution
(`_quote_kwargs()`), so a value reaches the command as **exactly one
argument** whatever it contains — spaces, quotes, `;`, `$(…)`, `>` — on the
`shlex.split()` path and through `sh` alike. An empty value is an empty
argument. Values are refused, never cleaned: a control character (`\n`,
`\r`, NUL), or a single argument starting with `-` that the command would
read as an option, raises `CommandTranslationError`.

A variable that carries several arguments on purpose — `{devices}`,
`{package_list}`, an optional `{force}` flag — is listed under its
category's `multi_args` in the profile. Its value is split on whitespace and
each word is quoted on its own; an empty value then adds nothing.

```json
"zfs": {
  "pool_add_cache": "zpool add {pool_name} cache {devices}",
  "multi_args": ["devices", "vdev_type"]
}
```

Because the engine quotes, a placeholder must never sit inside quotes of
its own in a template: `'{path} {clients}'` would let a quote in the value
close the template's. Where a value has to be part of a larger word,
concatenate: `{path}' '{clients}'('{options}')'`, `"root=ZFS="{dataset}" rw"`.

A **target engine with a chroot prefix never uses `shell=True`**: the prefix
argv is prepended, and a command that needs a shell is handed to `sh -c`
*inside* the chroot as a single argument, so quoting inside it can never
escape into the host's shell.

`_run_safe()` also runs every command with **stdin on `/dev/null`**. Output is
captured, so a command that decides to prompt would write its question into a
pipe and then wait forever on a terminal it does not own; with `/dev/null` it
reads EOF and fails visibly. Commands that legitimately need input use
`execute_with_stdin()`.

## Sensitive Data

`execute_with_stdin()` pipes passwords and other sensitive values to the process
via stdin. They never appear in the command string (visible in `ps aux`) or
in log files.

```python
# Correct — password via stdin, payload shaped by the profile
payload = engine.get_profile_value("users", "password_stdin_format")
engine.execute_with_stdin(
    "users", "set_password_stdin",
    payload.format(username="admin", password="newpassword"),
    username="admin",
)

# Wrong — the password is in argv, visible in ps aux
engine.execute("users", "some_action", username="admin", password="newpassword")
```

## Template Substitution

`get_command()` formats `{variable}` placeholders in the profile command
using `str.format()`, after quoting every value — see
[Command Execution Safety](#command-execution-safety).

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
| `CommandTranslationError` | Category or action key missing in profile, or a value refused by `_quote_kwargs()` |
| `CommandExecutionError` | Command exited non-zero (if `check=True`) or timed out |
