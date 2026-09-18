# Core Engine

The engine is the heart of FreedomNAS. It translates abstract actions into
OS-specific shell commands using JSON profiles. It is implemented as a
**thread-safe singleton**.

It exists twice — once in Python, once in Nim — behind one import. See
[Two implementations](#two-implementations) below; everything else on this
page describes both.

## Two implementations

`engine.py` no longer holds the engine: it chooses which one answers.

| File | What it is |
|------|-----------|
| `engine.py` | The import everything uses, and the backend switch |
| `engine_py.py` | The engine in pure Python — the reference implementation |
| `engine_native.py` | The Python side of the Nim engine: singleton, attributes, exception classes |
| `nim/src/fnas/` | The Nim engine itself, compiled into `freedomnas_native.so` |

`FREEDOMNAS_ENGINE` picks the backend, and `engine.BACKEND` reports which
one is live:

| Value | Engine |
|-------|--------|
| `python` (default) | `engine_py.py` |
| `native` | `engine_native.py`; `ImportError` if the extension was not built |
| `auto` | native when the extension is importable, Python otherwise |

Why: the appliance runs Python only because the engine does. Moving the
engine to Nim first is what eventually allows a boot path — `unlock-pools`,
`firstboot.sh`, the initramfs — with no interpreter at all, and it removes
a dependency that is packaged differently on all six editions. It does not
make anything faster: the engine spends its time waiting for `zfs` and the
package manager, not computing.

The two are held to identical behaviour by `tests/test_engine_parity.py`,
which runs every command of every shipped profile through both backends and
compares results, exception classes and message text. The suite runs twice
in CI, once per backend.

!!! note "One recorded difference"
    `list_actions()` on a profile key that is a string rather than a section
    (`os_name`) raises `AttributeError` in the Python engine and returns
    `[]` in the native one. Nothing in FreedomNAS asks a scalar for its
    actions; the difference is asserted in the parity suite rather than
    hidden.

### What lives on which side

Profile search paths and reading `/etc/os-release` stay in Python; parsing
that file, resolving the distribution, merging profiles, formatting
commands, splitting argv and running processes are all in Nim. The native
engine releases the GIL while a command runs, so a long `zpool create` never
blocks the WebUI's other threads — a parity test asserts exactly that.

### Building it

```bash
cd nim && nimble native   # -> freedomnas_native.so in the package root
cd nim && nimble cli      # -> nim/freedomnas, the native CLI
```

`nimble native` needs Nim ≥ 2.0, a C compiler and, the first time, network
access to fetch nimpy. Both the Debian and Arch packages run it before
building the wheel, which is why `freedomnas-core` is no longer an
architecture-independent package.

Both tasks build with `--tlsEmulation:off --passC:"-ftls-model=global-dynamic"`
(see `nim/freedomnas.nimble`), needed for correctness, not performance: a
thread the host process creates — `asyncio.to_thread`, `threading.Thread`,
which the WebUI uses for `reconcile()` — and not Nim itself will segfault
the first time it calls into the native engine, reliably once the process
has done enough allocator activity (one scrypt-sized keyslot wrap is
enough — see [Security](security.md#encrypted-pool-keyslots)), with
either flag missing. Nim's emulated TLS only registers threads Nim
creates; native TLS with the default (`initial-exec`) model assumes a
static block that a `dlopen`'d library's late threads cannot always reach.
`global-dynamic` resolves through `__tls_get_addr()` instead and has no
such gap. `tests/test_native_threads.py` keeps it that way: it drives the
engine, the configuration and key management from `threading.Thread` and
`asyncio.to_thread` after scrypt-sized allocations, in a child interpreter
so a crash fails the test rather than the suite. The segfault does not
reproduce on every system (not on glibc 2.43 / GCC 15), so a green run
there proves less than one on the machine where it was found.

The native CLI currently answers `status`, `check`, `config show|check|path`,
`snapshot-run <interval>`, `shadow-sync` and `version`. Everything that
needs the keyslots or the module runtime — `reconcile`, `unlock-pools`,
`serve` — is still `python -m freedomnas`.

Scheduled snapshots (`snapshots.py`), pool cache/log attachment
(`pools.py`) and the configuration's shadow copy (`shadow.py`) follow the
engine's own split: `snapshots_py.py`/`pools_py.py`/`shadow_py.py` are the
reference implementations, `snapshots_native.py`/`pools_native.py`/
`shadow_native.py` are the Python side of `fnas/snapshots.nim`/
`fnas/pools.nim`/`fnas/shadow.nim`, and `FREEDOMNAS_SNAPSHOTS`/
`FREEDOMNAS_POOLS`/`FREEDOMNAS_SHADOW` (each falling back to
`FREEDOMNAS_ENGINE`) pick between them. All three native sides call the
native engine's handle directly — `engine._handle` — rather than going
through `engine.execute()`, so none of them makes sense without the native
engine.

!!! note "Native modules follow the engine back"
    The modules whose logic runs in Nim — snapshots, pools, shadow,
    reconcile, key management — switch to their Python implementation
    whenever `FREEDOMNAS_ENGINE` is not `native`, whatever their own
    variable says (with a warning if it said `native`). Setting
    `FREEDOMNAS_ENGINE=python` is therefore always a complete rollback. The
    opposite direction works too: under the native engine, any single
    module can be pinned back with `FREEDOMNAS_<MODULE>=python`. Native code
    handed a Python engine anyway raises a `TypeError` naming the problem
    (`engine_native.native_handle()`). `tests/test_backend_selection.py`
    checks every combination. `tests/test_snapshots_parity.py`, `tests/test_pools_parity.py` and
`tests/test_shadow_parity.py` hold each pair to identical behaviour against
a throwaway "zfs" profile whose actions read and write a plain file instead
of talking to real ZFS.

### Running the tests

`tests/conftest.py` removes any installed `freedomnas-core` from
`sys.path` before the tests import anything. Every module imports its
siblings as `freedomnas.<name>` first; with `/usr/lib/freedomnas/core` on
the path that finds the *installed* copy, whose exception classes are not
the ones the tests raise — parity tests then fail or pass depending on what
the machine has installed.

CI runs the suite on pure Python, on Nim, on Nim with each module pinned
back to Python in turn, and on the Python engine with every module asking
for Nim.

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
