# Pipeline Sheet — Column Schema

The Pipeline spreadsheet lives in the Shared Drive (ID `0ABJJvi8pLaB8Uk9PVA`) and is named **`Pipeline`**. The Apps Script appends one row per submission using exactly the column order below.

## Setup

1. Create a new Google Sheet named `Pipeline` in the Shared Drive root.
2. Rename the default tab to `Pipeline` (matching the sheet name — the script looks for this tab first).
3. Paste the header row below into row 1.
4. Freeze row 1 (View → Freeze → 1 row).
5. Apply a filter (Data → Create a filter) so you can sort/filter by Status etc.

## Header row

Paste the following as a single row (tab-separated when you paste into Sheets, it fills columns correctly):

```
Submitted At	Status	Parent Name	Parent Email	Parent Phone	Relationship	Location	Child First Name	Child Last Name	Stage Name	Date of Birth	Age	Gender (casting)	Height	Hair	Eyes	Ethnicity / Category	Prior Representation	Union Status	CA Work Permit	Coogan	Training	Credits	Special Skills	Demo Reel	Résumé Link	Self-Tape Setup	Instagram	TikTok	YouTube	Followers	School Type	Availability	Goals / Fit	How Heard	Folder	Headshot	Full-Length	Notes	Decline Reason
```

## Status values

The `Status` column is what drives pipeline tracking. The script writes `New` on every submission. Lisa (or anyone with edit access) moves it manually through these stages:

| Status | Meaning |
|---|---|
| `New` | Just arrived — hasn't been triaged yet |
| `Screening` | Quick first-pass fit assessment in progress |
| `In-depth review` | Reviewing reel, résumé, photos in detail |
| `Meeting invited` | Reached out to family to set up a conversation |
| `Meeting held` | Conversation happened, decision pending |
| `Offer extended` | Offer made, waiting on family |
| `Negotiating` | Terms being worked out |
| `Signed` | Under representation |
| `Declined` | Not a fit — fill in `Decline Reason` |
| `Archived` | Historical record; no active action |

### Suggested `Decline Reason` values (for reporting consistency)

- `Not enough experience yet`
- `Geographic constraints`
- `Roster fit`
- `No response from family`
- `Family withdrew`
- `Other (see Notes)`

## Conditional formatting (optional polish, do later)

Color Status column by value so the pipeline scans faster:

- `New` → light gold background
- `Meeting held` / `Offer extended` / `Negotiating` → light green
- `Signed` → solid green
- `Declined` / `Archived` → light gray, text muted

## Notes

- Don't reorder columns without also updating `apps-script/Code.gs → appendSheetRow`. The script appends by position, not by header name.
- `Notes` and `Decline Reason` are the only columns meant to be edited by hand. Everything else is written once by the script.
- `Age` is computed from `Date of Birth` at submission time and is a snapshot — it does not auto-update. That's intentional: when reviewing a 6-month-old submission, it's useful to know how old the child was *when they applied*.
