# Decision Stage

**See the options. Explore the differences. Decide with clarity.**

When an AI conversation turns into a wall of explanations and scattered questions, Decision Stage puts the discussion on a shared page. The agent shows diagrams, comparisons, and interactive demonstrations on the left; you answer questions or leave notes on the right.

**Show the difference—not just another list of options.**

## A look at the stage

![Decision Stage: interactive comparisons and a slider on the left, linked questions and notes on the right](docs/images/decision-stage.png)

*An actual browser screenshot of a simulated editor-design discussion. Explore the alternatives on the left, then choose an option or write your own answer on the right. No real project or personal session data is shown.*

## What it does

- **Makes trade-offs visible.** Use flows, mode comparisons, sliders, tables, or custom interactive simulations to explain what changes between options.
- **Keeps questions connected to their explanation.** Question numbers match the sections on the left, with links in both directions. Explanation-only sections are clearly marked.
- **Lets you challenge the question.** A nonblank note is enough to submit; you do not have to choose an option that does not fit. “Explain this more” asks the agent for a clearer visual explanation.
- **Remembers decisions across rounds.** A short, per-session decision log preserves answers and unresolved questions outside the conversation history. Later pages show earlier decisions at the bottom.
- **Brings settled conclusions back to work.** When no explanation is requested, the agent receives a gentle reminder to update the current plan or spec if the discussion is settled—or summarize if neither exists. It is not permission to start implementation.
- **Stays quiet in chat.** After opening the page, the agent shares the link instead of repeating everything already on the screen.

There is no three-question limit. The agent should inventory the relevant discussion, not silently reduce it to a few questions. Technical unknowns belong in the evidence section; they are not automatically choices for the user to make.

## When to use it

Good fits:

> “There are too many open questions. Use decision-stage to show them together.”
>
> “Show me how these two approaches would behave before I choose.”
>
> “Use decision-stage and expose the page so I can answer from my phone.”

Not a good fit: a simple clarification question that needs no diagram or demonstration. Use the harness's question tool for that. Multiple questions alone are not a reason to open a page; an explicit request is.

## Requirements and compatibility

- **Node.js 22+**; no npm dependencies or build step.
- An agent harness that supports skills, shell commands, and background-command completion notifications.
- A browser on the host machine, or manual access to the printed URL.

The scripts provide Windows, macOS, and Linux browser-launch commands. Runtime tests have been run on Windows; the other platforms have not been verified here.

**OpenCode / OpenChamber:** session environment variables provide per-session isolation. OpenChamber additionally supports automatic session-title display and direct delivery of answers into the session.

**Other harnesses:** answers return through command output. Without `OPENCODE_SESSION_ID`, isolation falls back to the working directory, so two sessions in the same directory share a lock and decision log. Automatic session-title lookup and direct delivery are OpenChamber-specific.

## Installation

For OpenCode, clone the repository into the skill directory:

```sh
git clone https://github.com/cropse/cropse-skills.git ~/cropse-skills
cp -R ~/cropse-skills/skills/decision-stage ~/.config/opencode/skills/decision-stage
```

Windows PowerShell:

```powershell
git clone https://github.com/cropse/cropse-skills.git "$HOME\cropse-skills"
Copy-Item -Recurse "$HOME\cropse-skills\skills\decision-stage" "$HOME\.config\opencode\skills\decision-stage"
```

If the destination already exists, do not overwrite it. Review that installation or use a separate checkout first. Other harnesses can install this folder in their own skill location; consult that harness's instructions.

Ask your agent to use **decision-stage**. The behavioral instructions are in [`SKILL.md`](SKILL.md); the agent writes a content specification, not a new server or reply panel.

## How a round works

1. The agent gathers the relevant questions and separates verified facts from technical unknowns.
2. It writes a JSON specification with explanations, demonstrations, and linked questions.
3. The script validates the specification, opens the page, and waits.
4. You choose options, write notes, or request more explanation, then press **Send replies** once.
5. The script saves the answers and decision log, delivers the response, and exits automatically.
6. The agent clarifies unresolved items. If everything is settled, it reads the recorded conclusions and updates the current plan or spec, or summarizes the outcome.

If **any** answer requests more explanation, the response omits both the consolidation reminder and its decision-log path. The log is still saved. Otherwise the path follows a conditional reminder; the agent must still notice objections and other unresolved issues rather than assume the conversation is finished.

## Run the script directly

From the `skills/decision-stage` directory:

```sh
node scripts/decision-stage.mjs --new example
```

This prints a temporary `spec.json` path copied from [`template.spec.json`](template.spec.json). Edit it, then run:

```sh
node scripts/decision-stage.mjs "/path/to/spec.json" --check
node scripts/decision-stage.mjs "/path/to/spec.json"
```

The second command serves the page until submission or timeout. Run it in the background when using an agent harness. The script opens the browser itself; do not start it again merely to check that it is running.

### Available content blocks

| Block | Purpose |
| --- | --- |
| `text`, `callout` | Introduce a problem or highlight an important constraint |
| `table` | Compare choices or present supporting facts |
| `flow` | Show a sequence, boundary, or data path |
| `compare` | Switch between modes and inspect their described results |
| `slider` | Explore a numerical relationship interactively |
| `html` | Build a trusted custom simulation when standard blocks are insufficient |

A `compare` block is a described comparison, not a real product execution. Custom demonstrations must also distinguish simulation from verified behavior.

Each decision requires a stable `id`, a 1-based `section` number, a title, a question, and two to five options. Keep IDs stable when rewording a question; use a new ID for a genuinely different decision. See [`SKILL.md`](SKILL.md) for the full format.

### Command options

| Flag | Purpose |
| --- | --- |
| `--check` | Validate only; do not start a server or write output files |
| `--expose` | Allow access through the host's LAN IP; off by default |
| `--replace` | Ask this session's verified previous server to exit before starting a new round |
| `--minutes N` | Wait timeout; default is 60 minutes |
| `--session-title "Title"` | Set a title instead of looking it up through OpenChamber |
| `--no-open` | Do not launch a browser |
| `--no-send` | Deliver full answers through command output only |

## Session safety and answer delivery

- One live page per session. A duplicate start is refused rather than opening another server.
- A session gets a best-effort stable port in `41000–41999`, with fallback ports if necessary.
- A random round token prevents an old tab from submitting answers to a newer round on the same port.
- Replacement checks session identity, PID, and token, then asks the old server to exit. It does not kill a PID.
- Successful direct session delivery prints only a receipt into command output. If delivery fails or is unavailable, command output carries the full answers instead. A round ID helps identify retries.

Never stop servers by matching process names, or remove other sessions' lock files. Server processes normally finish their own work and exit.

## Temporary data and privacy

Generated pages, answer files, locks, and decision logs live under `<OS temp>/decision-stage/`, outside the repository. They are not uploaded to GitHub by this tool.

Temporary records are eligible for cleanup after seven days; cleanup runs when the script is invoked, not on a scheduled timer. Decision logs keep the latest answer per stable question ID, not a complete conversation transcript. They help recover choices, but cannot replace missing context or the project’s authoritative documents.

### Sharing with another device

Request exposure explicitly, or run:

```sh
node scripts/decision-stage.mjs "/path/to/spec.json" --expose
```

The printed link uses a LAN IP. Windows Firewall or network isolation may still prevent another device from connecting. The script does not change firewall settings or configure internet access.

**Anyone who can reach an exposed port can read the page and answer it.** Exposure uses plain HTTP without a password; use a trusted network, and do not put secrets in a specification. A round token is not access control.

Custom HTML and scripts execute in the page and must be trusted. OpenChamber credentials are read from the environment and are not embedded in generated pages.

## Development and tests

```sh
node --test tests/*.test.mjs
```

The suite uses Node's built-in test runner, real child servers, and a lightweight DOM fixture. It covers:

- canonical answer validation and rejection of unknown options;
- note-only replies and a single submit button;
- stable decision IDs and cross-round memory;
- session isolation, verified replacement, and stale-token rejection;
- local-only defaults and opt-in LAN exposure;
- conditional consolidation reminders and nonduplicated answer delivery.

Tests do not open browsers or dispatch real session prompts. LAN tests connect from the host itself, not a separate device. They do not guarantee real-browser appearance, cross-device firewall access, or an agent's compliance with every instruction.

## Repository layout

```text
SKILL.md               Agent workflow and content format
README.md              Installation, usage, and limitations
template.spec.json     Starting point for a page
scripts/               Validation, rendering, and server entry point
assets/                Page styles, reply panel, and interactive widgets
tests/                 Dependency-free regression tests
```
