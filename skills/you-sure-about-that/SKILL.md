---
name: you-sure-about-that
description: Use when the user explicitly invokes you-sure-about-that or questions a previous factual claim, explanation, or proposed solution with phrases such as "Are you sure?", "Really?", "你確定嗎？", or "這是建議的做法嗎？".
---

# You Sure About That

![You sure about that? — Tim Robinson](https://media.tenor.com/kmaH_jidTt0AAAAe/you-sure-about-that-i-think-you-should-leave-with-tim-robinson.png)

**REQUIRED SUB-SKILL:** `i-have-adhd` must already be installed. Before replying, load it if it is not active; otherwise keep following it without reloading.

A challenge is a request to investigate, not an invitation to repeat the original answer more confidently.

## Trigger boundary

Run only on an explicit invocation or a user challenge to a factual claim, explanation, or solution. Ordinary questions and unsolicited technical recommendations do not trigger this skill. If invoked without an identifiable target, ask which claim to check.

## Workflow

1. **Pin down the claim.** Identify the challenged statement or proposed approach from context. For project-specific claims, establish the relevant framework, version, implementation, and constraints from available project evidence. Ask only for information that cannot be obtained directly.
2. **Delegate two distinct evidence tracks for project-specific claims.** Make at least two separate `@explore` calls (or cheap-model subagent calls with the required tools), not one combined assignment. Supply both with the exact claim, original reasoning, project/version context, and unresolved questions. Run them in parallel when independent; sequence them when local findings are needed to target external research.
   - **External research:** collect supporting AND contradicting evidence from documentation and discussions, with source URLs, relevant passages, version/date applicability, alternatives, and gaps. Generic documentation proves possible behavior, not that this project exhibits it.
   - **Local verification:** independently inspect the actual project to test whether the alleged problem, data flow, or logic exists as described. Return file paths and line numbers, the relevant call/data/control flow from entry to outcome, trigger conditions, guards/configuration that prevent or change the outcome, and evidence for or against the claim. Distinguish reproduced behavior, static-code support, theoretical risk, disproven claims, and unresolved questions. A keyword match or suspicious isolated function is not enough. Use existing tests or a safe targeted reproduction when needed and authorized; never cause real payments or other external side effects just to verify a claim.
   For a purely external fact with no project-specific assertion, only the external track is required; do not invent a local target. If tools or project access prevent a required track, disclose the limitation and perform available checks directly; do not fabricate calls or mark the missing track verified. If `@explore` cannot browse, route external collection to a cheap agent with web tools or collect directly. Missing delegation capability does not remove the need for both evidence tracks.
3. **Search and iterate.** Prioritize applicable official documentation and source code. Follow relevant discussions in the framework's GitHub repository, Reddit, Stack Overflow, SitePoint, and other useful sources. Treat community posts as leads, not votes. Read relevant source material rather than relying only on search snippets. The agent decides which sources, depth, and further searches are warranted: no mandatory site checklist, source count, or fixed round limit. Continue where a material uncertainty can be checked; stop when evidence adequately addresses the claim, or further verification is unavailable or unproductive. Report unresolved gaps honestly.
4. **Compare and reflect in the main agent.** For project-specific claims, reconcile both external and local findings before concluding. State separately whether the mechanism is possible in general and whether the project actually follows that path; do not turn static evidence into a claim of runtime reproduction. Contrast the evidence with the original claim and reasoning. Determine whether the approach is recommended/aligned, a reasonable alternative, a workaround, incorrect, or unresolved. These are judgments, not mandatory labels for every factual answer. An alternative or workaround is not automatically wrong. Decide whether to retain, qualify, or replace the answer using evidence, version compatibility, and project constraints—not popularity or sunk cost. If reflection reveals a verifiable gap, return to collection before concluding. Escalate to a stronger model only when cheaper collection is insufficient or conflicting evidence needs deeper reasoning.
5. **Answer using `i-have-adhd`.** Lead with the verdict or corrected answer. Follow with the decisive evidence and links, the implication for the original explanation/solution, and material remaining uncertainty. Keep the visible answer proportional to the question; research depth does not require a long report. Verification does not itself authorize code changes.

## Quick reference

| Situation | Response |
| --- | --- |
| Narrow fact | Direct evidence for that fact and applicable version may suffice. |
| Project-specific problem or solution | Two separate calls: external research + local flow/logic verification; reconcile both. |
| Sources disagree | Investigate applicability and explain unresolved disagreement. |
| Search unavailable | State what could not be checked; do not claim verification. |

## Example

User: "你確定這個 monkey-patch 是建議的做法嗎？"

Collect evidence about the exact framework/version and supported extension points. Then assess whether the existing patch is necessary in this project. Answer with the verdict, applicable sources, and whether to keep or replace the workaround; do not assume a popular rewrite recommendation settles the decision.

## Common mistakes

- **"I know this already" or "the user is in a hurry":** confidence and urgency do not replace investigation after a challenge.
- **"The subagent said so":** inspect its evidence and applicability; own the comparison and reflection.
- **"Everyone recommends it":** explain why it applies here before changing the recommendation.
- **"No contrary result means confirmed":** absence of evidence is not proof; disclose uncertainty and tool failures. Never invent sources or claim searches that did not happen.
