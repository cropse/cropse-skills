# Install Cropse Skill Pack

Install **all skills shipped under `skills/`**, keeping each skill's supporting files. External dependencies are separate; reuse them when already installed.

## Ask your agent

```text
Install the entire Cropse Skill Pack from https://github.com/cropse/cropse-skills
for my current coding agent. Follow install.md and register every bundled skill,
not just one. Reuse existing installations, preserve settings and local changes,
and resolve required external dependencies without adding optional plugins.
Verify all bundled skills and required dependencies can be loaded; report any
missing dependencies or checks you could not perform.
```

## OpenCode V2

1. Reuse an existing checkout, or clone outside automatically scanned skill directories:

   ```sh
   git clone https://github.com/cropse/cropse-skills.git ~/cropse-skills
   ```

   Windows PowerShell:

   ```powershell
   git clone https://github.com/cropse/cropse-skills.git "$HOME\cropse-skills"
   ```

2. Back up your existing global `~/.config/opencode/opencode.json` or `opencode.jsonc`, then merge the **whole `skills` directory** into its `skills` array:

   ```jsonc
   {
     "skills": ["~/cropse-skills/skills"]
   }
   ```

   Use your actual checkout path. An absolute Windows path such as `C:/Users/YOUR_NAME/cropse-skills/skills` works too. Respect custom config locations, preserve existing entries and comments, and do not create a second competing config file. This is a skill-source registration, not a plugin installation.

3. Resolve required dependencies below, then ask the agent to load every bundled skill and verify its base directory points into this checkout. If runtime loading cannot be checked, report that explicitly; file existence alone is not verification.

## Required dependencies

| Skill | Requirement |
| --- | --- |
| `decision-stage` | Node.js 22+ |
| `you-sure-about-that` | [`i-have-adhd`](https://github.com/ayghri/i-have-adhd/blob/main/INSTALL.md) |
| `grill-me` | Bundled `grilling` |
| `grill-me-brainstorming`, when present in the checkout | Superpowers [`brainstorming`](https://github.com/obra/superpowers) and its required workflow skills; bundled `grilling` |

Read external dependencies' installation instructions for the current runtime. Reuse existing skills; do not add optional always-on plugins, install duplicate copies, or claim a dependency is ready when it is missing. If an upstream installer requires broader changes, explain them before proceeding.

Pack contents may change between revisions. Discover bundled skills from `skills/*/SKILL.md` in the actual checkout, not from a hardcoded list. Do not fabricate a skill absent from that revision.

## Claude Code, Codex and other agents

Use the runtime's documented skill installation mechanism to make **every bundled skill** discoverable. If it does not support external source registration, place each complete skill folder in its supported skill directory; copying only `SKILL.md` breaks skills with scripts or assets. Resolve the same dependencies and verify runtime loading where available.

Do not apply OpenCode configuration syntax to another runtime.

## Updating or removing the pack

- Update the checkout through your normal Git workflow. Never reset or pull over local changes. Copied installations need their corresponding copies updated too.
- Avoid duplicate skill IDs. Compare existing copies and preserve modified files; ask before removing them.
- To remove a registered OpenCode pack, remove its directory entry from the `skills` array. Do not delete the checkout or external dependencies unless separately requested.

To install only one skill, explicitly request that skill instead of the whole pack; register or copy its individual folder and resolve its dependencies.

[OpenCode V2 skill discovery reference](https://opencode.ai/v2/docs/skills/)
