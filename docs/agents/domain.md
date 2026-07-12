# Domain Docs

Before exploring the codebase, read `CONTEXT.md` and relevant ADRs under
`docs/adr/`. If these files do not exist, proceed silently; domain-modeling
skills create them when terminology or decisions are resolved.

## Layout

This repository uses a single-context layout:

```text
/
|-- CONTEXT.md
|-- docs/adr/
`-- apps/ and packages/
```

Use terminology defined in `CONTEXT.md` consistently in issues, code, tests,
and documentation. Explicitly flag proposals that conflict with an existing ADR.
