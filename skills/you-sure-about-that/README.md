# You Sure About That

![You sure about that? — Tim Robinson](https://media.tenor.com/kmaH_jidTt0AAAAe/you-sure-about-that-i-think-you-should-leave-with-tim-robinson.png)

Ask the agent to verify an earlier claim—not just repeat it more confidently.

## How to use

```text
You sure about that? Check whether this actually applies to our project.
```

Invoke `you-sure-about-that`, or challenge an answer with “Are you sure?” / “你確定嗎？”. Ordinary questions do not trigger it.

The agent checks relevant sources and, for project-specific claims, the actual implementation. It explains what the evidence supports, corrects its earlier answer when needed, and states what remains uncertain.

Replies follow the concise format of the required [`i-have-adhd`](https://github.com/ayghri/i-have-adhd) skill. Verification does not authorize code changes.
