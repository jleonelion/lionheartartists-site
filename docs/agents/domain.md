# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. This repo is **single-context**.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (the domain glossary), if it exists.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence or suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

Note: for this repo, the authoritative operational context already lives in `CLAUDE.md` (page structure and anchor IDs, styling conventions, the intake pipeline data flow, branch/deploy workflow) and in `SHEET_SCHEMA.md` (the Pipeline Sheet column order that `apps-script/Code.gs` depends on by position). Read those alongside any `CONTEXT.md`.

## File structure (single-context)

```
/
├── CONTEXT.md          ← created lazily by /domain-modeling
├── docs/
│   ├── adr/            ← created lazily as decisions get recorded
│   └── agents/         ← this directory (issue tracker, triage labels, domain rules)
└── ... (index.html, apply.html, privacy.html, assets/, apps-script/, tests/)
```

## Use the glossary's vocabulary

When your output names a domain concept (a Work Queue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md` / `CLAUDE.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 — but worth reopening because…_
