# Cropse Skill Pack

A growing collection of practical skills for AI coding agents, by [cropse](https://github.com/cropse).

Each skill is self-contained: its instructions, scripts, assets, and tests live together under `skills/<name>/`. Install only the skills you want; the pack itself is not a single skill.

## Skills

| Skill | What it helps with |
| --- | --- |
| [Decision Stage](skills/decision-stage/README.md) | Show options through diagrams and interactive demonstrations, collect answers and notes, and preserve decisions across rounds. |
| [Grill Me](skills/grill-me/SKILL.md) | Explicit shortcut to Grilling; install both skills together. |
| [Grilling](skills/grilling/SKILL.md) | Stress-test plans, decisions, and ideas through rounds of branching questions and recommendations. |
| [You Sure About That](skills/you-sure-about-that/SKILL.md) | Verify a challenged fact, explanation, or solution through delegated research and evidence-based reflection. Requires `i-have-adhd`. |

Grill Me and Grilling are based on [Matt Pocock's skills](https://github.com/mattpocock/skills), imported from commit `5beb35b040e3de97e54fa9e386d7e42d15c295c2`. Grilling is customized to route routine fact-finding through `@explore` or a cheap-model subagent, with stronger-model escalation only when needed. Each includes the upstream MIT license. To install them, copy both `skills/grill-me` and `skills/grilling` into your harness's supported skill directory. No runtime dependencies are required.

## Decision Stage

**See the options. Explore the differences. Decide with clarity.**

Turn tangled discussions into a shared page: explanations and interactive comparisons on the left, linked questions and notes on the right.

![Decision Stage screenshot](skills/decision-stage/docs/images/decision-stage.png)

[Usage, requirements, and security notes →](skills/decision-stage/README.md)

## Installation

Paste this prompt into your AI coding agent. Replace the skill name to install a different skill from the table above.

```text
Install the you-sure-about-that skill from https://github.com/cropse/cropse-skills
for my current coding agent. Read the repository's install.md and the selected
skill's instructions first. Install only the selected skill and its required
dependencies using my runtime's documented installation method. Reuse existing
installations and preserve unrelated settings and local changes. Verify that
the skill can be loaded, and report anything you could not verify.
```

## You Sure About That

Invoke `you-sure-about-that` explicitly, or challenge an earlier claim with "Are you sure?" / "你確定嗎？". Ordinary questions do not trigger it. The agent delegates evidence collection to `@explore` or a cheap model when suitable tools are available, then compares and reflects on the evidence itself. Research depth, stopping conditions, and whether to change the original answer are agent judgments—not fixed quotas or popularity votes.

Requires [`i-have-adhd`](https://github.com/ayghri/i-have-adhd), which the installation prompt asks your agent to install if missing. [Detailed installation guide →](install.md)

## Development

Keep each new skill under `skills/<skill-name>/` with a `SKILL.md` and its supporting resources. Add it to the table above, and document its dependencies and test commands.

Decision Stage requires Node.js 22+ with no npm dependencies. Run its regression tests from the repository root:

```sh
node --test skills/decision-stage/tests/*.test.mjs
```

Tests verify runtime behavior; they do not guarantee an agent follows every instruction or that LAN firewall access works from another device.

## Repository structure

```text
README.md
skills/
└── decision-stage/
    ├── SKILL.md
    ├── README.md
    ├── template.spec.json
    ├── assets/
    ├── scripts/
    ├── tests/
    └── docs/images/
```

Runtime answers, decision memory, and session data are temporary local files—not contents of this repository.
