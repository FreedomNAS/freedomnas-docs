# AI Assistant Constraints

This page documents the rules that AI assistants (Claude, Copilot, etc.)
must follow when working on this project.

## Scope

When working on a specific repository, do NOT modify other repositories
unless explicitly asked. Each task is scoped to the repository currently
under discussion.

## Modification Rules

| Rule | Explanation |
|------|-------------|
| Do NOT redesign project structure | Unless explicitly requested |
| Do NOT move, rename, split, or delete files | Unless explicitly requested |
| Do NOT rewrite working modules for style | Code style is not a task |
| Do NOT touch tests, docs, or packaging | Unless the task requires it |
| Do NOT introduce abstractions beyond the task | Three similar lines > premature abstraction |
| Do NOT hardcode OS-specific commands | They belong in JSON profiles |
| Do NOT add `shell=True` | Profile commands that need it are handled by `_run_safe()` |
| Do NOT use `subprocess` in route handlers | Use `engine.execute()` always |
| Do NOT skip the dual write rule | Every mutation: engine + config persist |

## Default Workflow

Unless the user says to proceed autonomously ("fai tutto", "vai avanti"):

1. **Repository understanding** — summarize what the repo does and its state
2. **Files to touch** — minimal set of files that must change
3. **Files to avoid** — files that must not be touched
4. **Plan** — step-by-step implementation plan
5. **STOP** — wait for explicit approval before implementing

After approval: implement, then summarize what changed.

## Autonomous Mode

When the user says **"fai tutto uno alla volta"** or equivalent, the STOP step
is suspended. Proceed through all steps without waiting for approval between them.
Authorization applies to the current scope only.

## Output Conventions

- No `Co-Authored-By` in commit messages
- No trailing summary paragraph after code changes ("In summary, I have...")
- No `TODO:` comments in committed code
- No explanatory comments in code (code should be self-explanatory)
- Short, direct commit messages in imperative mood

## Golden Rule (repeated for emphasis)

!!! warning
    Python code must NEVER contain a native system command.
    All syscalls go through `engine.execute()`, which reads commands from JSON profiles.
    This rule has no exceptions in application code.
