# Issue tracker: Notion Forge Work Queue

Issues, follow-ups, and specs for this repo do **not** live in GitHub Issues. They live in the **Forge Work Queue** Notion database — the same cross-repo backlog used by `~/code/lionclaw` and `~/code/hermes-ranger`. The engineering skills (`to-spec`, `to-tickets`, `triage`, `qa`) read from and write to that database.

GitHub is still where the *code* lives (PRs, branches — see `CLAUDE.md` → Development workflow). Only issue tracking moved.

## Database

- **Forge Work Queue** — database id `d32d3cf4-5a60-40db-a3d7-2c98ad911d79`, data source `55b12c05-2d2e-445a-a043-207375441195`, URL `https://www.notion.so/d32d3cf45a6040dba3d72c98ad911d79`.
- Access is the Notion REST API, version `2025-09-03`. Key at `~/.config/notion/api_key` on the host (or `NOTION_TOKEN`). Not the `gh` CLI.
  - Query: `POST /v1/data_sources/55b12c05-2d2e-445a-a043-207375441195/query`
  - Create a row: `POST /v1/pages` against the database
  - Update a row: `PATCH /v1/pages/{id}`

## When a skill says "create / publish an issue"

Create a page in the Forge Work Queue with these properties:

- `Title` — concise summary
- `Kind` — `follow-up` (task-level) or `project` (multi-task effort container). Never claim or work a `Kind=project` row.
- `Owner` — **`lionheartartists-site`** for work in this repo; empty for genuinely `cross-cutting` work. Do **not** use `lionheart` — that is the OpenClaw agent workspace, not this marketing site. The select option is created on first write.
- `Target repos` — `lionheartartists-site` (same caveat; multi-select, created on first write).
- `Status` — `Triage` for new rows (see `triage-labels.md` for the state vocabulary)
- `Surfaced by` — the session/PR that surfaced it
- `Depends On` (optional) — directional relation to prerequisite rows. Workers honor a dependency gate: an item isn't worked while any `Depends On` item is not `Complete`. It is one-way; Notion auto-syncs the reverse edge into `Blocks`, which the gate ignores. Never write the reverse edge.
- Put the detail in the page body: the observation, why it matters, and the recommended change.

## When a skill says "fetch the relevant ticket"

Query the data source by `ID` (the `unique_id` property) or `Title`, or read the page directly by id when the user passes a URL / id. When planning new work, filter `Kind = follow-up` and `Owner = lionheartartists-site` first, so related follow-ups get bundled into the current change rather than deferred again.

## PRs as a request surface

Off. External GitHub PRs are **not** part of this triage queue. PRs that implement Work Queue items are tracked in the related **Work Pull Requests** database (data source `1c97d2a6-a5a3-4d49-8e3d-b01dbe82228b`), linked to their item via `Work Item`, with `Repo`, `PR URL`, and `Review role` set.

## Dependency & lifecycle rules

- Task rows link to an overarching effort via `Parent effort` (reciprocal `Child tasks`); this is grouping, separate from `Depends On` sequencing.
- Move a row to `Review Pending` (and set `Tokens used` — a cumulative best-effort integer estimate, blank if you can't estimate) only after its PR(s) are open. The `notion-pr-reconcile` cron auto-completes `Review Pending` items when their required PRs merge.
- `Risk` and `Last Reviewed` are maintained by the Forge `backlog-review` skill during grooming, not by whoever files the row.
- This repo deploys `staging` → Cloudflare and `main` → GitHub Pages with no CI gate, so a Work Queue item is not done until it has been eyeballed on the staging URL.
