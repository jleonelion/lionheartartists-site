# Triage Labels

The `triage` skill speaks in terms of canonical triage roles. This repo's tracker is the **Notion Forge Work Queue** (see `issue-tracker.md`), which has no GitHub-style labels — it uses a `Status` select and a `Kind` select. This file maps the canonical roles onto that vocabulary, identically to `~/code/lionclaw`.

## State roles → Notion `Status`

| Canonical role    | Notion `Status`  | Meaning                                                  |
| ----------------- | ---------------- | -------------------------------------------------------- |
| `needs-triage`    | `Triage`         | Maintainer needs to evaluate this item                   |
| `needs-info`      | `Info Pending`   | Waiting on the reporter for more information             |
| `ready-for-agent` | `Ready`          | Fully specified, an AFK agent can claim and implement it |
| `ready-for-human` | `Review Pending` | Needs James's action (see caveat below)                  |
| `wontfix`         | `Deferred`       | Will not be actioned (set `Deferred reason`)             |

**Return path (human contract).** An underspecified-but-still-valid `Triage` item moves to `Info Pending` when it needs a human to supply the missing scope, edge cases, or definition of done, with what's missing recorded in `Next action`. `Info Pending` items are invisible to the Forge `backlog-review` grooming pass (it grooms only `Status = Triage`), so **when the missing information is added, set `Status` back to `Triage`** to re-enter the next grooming cycle. Left in `Info Pending`, an item waits indefinitely; nothing sweeps it.

### Caveat on `ready-for-human` → `Review Pending`

Chosen deliberately to keep one "needs my action" state, even though the two meanings differ: `ready-for-human` means *un-started work a human must implement*, while `Review Pending`'s native meaning is *work that is done and awaiting PR review*. Consequences:

- `notion-pr-reconcile` auto-completes `Review Pending` items when their **required PRs merge**. A `ready-for-human` item has no PR, so it sits until acted on — it will not be auto-completed.
- Leave `Tokens used` blank for a `ready-for-human` item; there's no implementation work yet.

When applying `ready-for-human`, note in the page body / `Next action` that it needs human implementation, so it isn't mistaken for a finished item awaiting review.

## Category roles → Notion `Kind`

The Work Queue has no `bug`/`enhancement` axis. Keep `Kind` as `follow-up` (task-level) or `project` (effort container); record any bug-vs-enhancement nuance in the body.

Edit this table if the vocabulary changes.
