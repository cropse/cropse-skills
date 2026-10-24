# Decision Stage

**See the options. Explore the differences. Decide with clarity.**

Turn a confusing discussion into an interactive page: explanations and diagrams on the left, questions and your replies on the right.

![Decision Stage example](docs/images/decision-stage.png)

*Example discussion shown in a browser. OpenChamber can display the page directly in the conversation.*

## How to use

Ask your agent:

```text
Use decision-stage to explain these options visually before I choose.
```

1. Explore the diagrams, comparisons and interactive examples.
2. Choose answers or write your own response in the notes.
3. For an explanation-only section, click **Ask / give feedback** beside its heading, then choose **Explain this section** or **Comment / ask a question**.
4. Press **Send replies** once. If something is missing, the page lists what to complete and links to each field.

You can switch feedback types or close and reopen a feedback card without losing its text. Asking for more explanation does not require a note; comments and questions do.

## What to expect

- **OpenChamber:** the page normally appears inside the conversation. Replies return to the agent, but do not appear as a separate full user prompt.
- **Claude Code, Codex and other environments:** the page opens in a browser. If inline display is unavailable, browser mode is the fallback.
- Ask for access from another device if needed. Only share that link on a trusted network: anyone who can reach it can read and answer the page.

The agent keeps track of replies across rounds and explains unclear points before continuing. **Sending replies is not blanket approval to implement changes.**

Best for visual explanations and comparisons—not simple questions that can be answered directly in chat. Requires Node.js 22+.
