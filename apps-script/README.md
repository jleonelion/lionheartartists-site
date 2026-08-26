# Apps Script Backend — Talent Intake

This directory contains the source for the Google Apps Script web app that receives submissions from `apply.html`. Apps Script itself runs in Google's cloud, not from this repo — these files are the **source of truth** for the deployed script and should be kept in sync.

## One-time setup (do this signed in as `james@lionheartartists.com`)

### 1. Shared Drive folder structure

Already created inside the "LionHeart Artists — Talent Intake" Shared Drive (ID `0ABJJvi8pLaB8Uk9PVA`):

| Resource | Value |
|---|---|
| Shared Drive ID | `0ABJJvi8pLaB8Uk9PVA` |
| Applicants folder ID | `10j6gvxoOPlsaiaaQigEob9zBehkHKH68` |
| Pipeline spreadsheet ID | `1eVTKM8kvaCAj6LOeRhRRapjUk-HB1L_X-gWYbTH-IGM` |

The Pipeline sheet already has the header row pre-populated (matching `../SHEET_SCHEMA.md`). The first tab is named `Sheet1` by default; you may rename it to `Pipeline` for consistency with the schema doc, but the script works either way.

If you ever need to re-create these from scratch, the structure is: `Applicants/` folder at the Shared Drive root, and a Google Sheet named `Pipeline` at the root with the header row from `SHEET_SCHEMA.md`.

### 2. Create the Apps Script project

1. Open `script.google.com` → **New project**. Name it `LionHeart Artists — Talent Intake`. (Already done — the live project is [`LionHeart Artists — Talent Intake`](https://script.google.com/home/projects/1VSXdn9xRMpeTIHMjn5v3dOQ1NmsWmd9lJeGBPIVj2AtHvaSRcgohJqqX/edit). Sign in as `james@lionheartartists.com`; if you have several Google accounts signed in, Google rewrites the URL with a `/u/<n>/` account index of its own accord.)
2. Replace the default `Code.gs` contents with the contents of `Code.gs` in this directory.
3. Click the gear icon → **Show "appsscript.json" manifest file in editor**, then replace it with the `appsscript.json` in this directory.

### 3. Set Script Properties

**Project Settings → Script Properties → Add script property**, for each of:

| Key | Value |
|---|---|
| `TURNSTILE_SECRET` | (the Cloudflare Turnstile secret key — from the Cloudflare Turnstile dashboard, not the site key) |
| `SHARED_DRIVE_ID` | `0ABJJvi8pLaB8Uk9PVA` |
| `APPLICANTS_FOLDER_ID` | `10j6gvxoOPlsaiaaQigEob9zBehkHKH68` |
| `PIPELINE_SHEET_ID` | `1eVTKM8kvaCAj6LOeRhRRapjUk-HB1L_X-gWYbTH-IGM` |
| `NOTIFY_EMAIL` | `lisa@lionheartartists.com` |

### 3b. Enable the Gmail advanced service and the `info@` send-as alias

The parent confirmation email is sent **from `info@lionheartartists.com`**, a Google Group
collaborative inbox, so that replies reach Lisa and James together rather than landing in
James's personal inbox. Two one-time setup steps make that possible.

**Verify the alias** (in `james@lionheartartists.com` Gmail, since the web app executes as
that user):

1. Settings → **Accounts** → "Send mail as" → **Add another email address**.
2. Name `LionHeart Artists`, address `info@lionheartartists.com`, leave "Treat as an alias" checked.
3. Gmail sends a verification code **to the group**, not to James — retrieve it from the group's
   inbox. If it never arrives, the group's *Post* permission is the usual culprit: widen it
   temporarily, grab the code, then tighten it back.
4. Confirm `info@lionheartartists.com` now appears in the "Send mail as" list.

**Enable the advanced service:** Apps Script editor → **Services** (+ icon in the left rail) →
**Gmail** → **Add**. This is what makes the `Gmail` symbol resolve in `sendParentConfirmation`.

**Why the Gmail advanced service and not `GmailApp`?** `GmailApp.sendEmail({ from })` would be a
one-liner, but it requires the `https://mail.google.com/` scope — full read, modify, and delete
across the whole mailbox. `doPost` is an unauthenticated public endpoint running as James, and
this pipeline handles minors' photographs and dates of birth, so the script holds
`gmail.send` (send-only) and assembles the raw MIME message itself in `buildRawMessage_`.

If the alias is ever removed or unverified, `Gmail.Users.Messages.send` throws and the failure
surfaces as `confirmation_email_failed` — the submission itself still succeeds.

### 3c. Attach the standard Cloud project

The script runs against a standard Google Cloud project — **`Talent Intake`**, project ID
`talent-intake`, project number `451087517085` — rather than the hidden default project Apps
Script creates on its own. This is what makes Cloud Logging readable from outside the editor
(see **Monitoring** below).

If this ever has to be redone: Apps Script editor → **Project Settings** → **Google Cloud
Platform (GCP) Project** → **Change project** → enter the project *number* → **Set project**.
The OAuth consent screen must already be configured in that Cloud project (**Internal** user
type — Workspace-only, which avoids Google's app-verification process), or the attach fails.

**Enable every API the script touches, manually.** This is the part that bites. On the default
project Apps Script silently enables whatever the scopes imply; on a standard project it tries
to enable them for you and fails with `Permission denied while enabling APIs: <api>`. In
**APIs & Services → Library**, enable all three:

- **Google Drive API**
- **Google Sheets API**
- **Gmail API**

Miss Drive or Sheets and `createApplicantFolder` throws inside **Phase 2**, so the applicant
sees "We couldn't save your submission" and nothing is persisted — a far worse failure than
the optional email path. Also confirm `james@lionheartartists.com` holds **Owner** in
**IAM & Admin → IAM**.

Attaching or changing the Cloud project **invalidates existing authorizations**, so expect to
re-authorize, and re-check the onEdit trigger afterwards (see step 5).

### 4. Deploy as a web app

1. Click **Deploy → New deployment**.
2. Type: **Web app**.
3. Description: `v1 intake endpoint`.
4. Execute as: **Me (james@lionheartartists.com)**.
5. Who has access: **Anyone** (no Google sign-in required for applicants).
6. Click **Deploy**. Google will prompt you to authorize the scopes in `appsscript.json` — approve them. If you are re-deploying after a scope change (e.g. the `gmail.send` addition), Google re-prompts; read the new scope before approving.
7. **Copy the web app URL.** It looks like `https://script.google.com/macros/s/AKfy.../exec`.

### 5. Install the onEdit trigger (one-time, runs from the editor)

`doPost` notifies Lisa for form submissions inline, but Lisa also wants an email when she or someone else manually adds a row in the Sheets UI. That path goes through an installable **onEdit** trigger on the Pipeline spreadsheet.

**Why this is set up via code, not the Triggers UI:** this Apps Script project is *standalone* (created at `script.google.com`), not container-bound to a specific spreadsheet. The Triggers UI only offers "Time-driven" and "From calendar" as event sources for standalone scripts — "From spreadsheet" requires container-binding. The fix is to call `ScriptApp.newTrigger('...').forSpreadsheet(id).onEdit().create()` programmatically, which works regardless of binding. The helper `installEditTrigger` in `Code.gs` does exactly this.

1. Apps Script editor → at the top, find the **function dropdown** (between the Debug button and Run button) → select **`installEditTrigger`**.
2. Click **Run**.
3. Apps Script will prompt to authorize the additional `script.scriptapp` scope — approve.
4. The function runs, prints `{"event":"edit_trigger_installed",...}` to the log, and exits.
5. **Verify:** select **`listTriggers`** in the function dropdown → Run. Check the log output: you should see one trigger entry for `handleSpreadsheetEdit` with eventType `ON_EDIT`. Or open the **Triggers** tab (clock icon) — the new trigger now appears there.

The trigger is idempotent: it skips rows whose `Notified At` cell (column 44 / AR) is already populated, and skips rows that don't yet have a parent email + child first name (i.e., mid-typing state). Re-running `installEditTrigger` is safe — it removes any prior `handleSpreadsheetEdit` triggers first, so duplicates don't pile up.

### 6. Add the Notified At column to the Pipeline sheet

Open the Pipeline sheet, type **`Notified At`** in cell **AR1** (column 44, immediately after `Decline Reason`). The script writes a timestamp here when it successfully emails Lisa. To force a re-send for a row, clear that cell.

### 7. Wire the deployed web-app URL into the form

In `apply.html`, find the line:

```js
const APPS_SCRIPT_URL = 'REPLACE_WITH_DEPLOYED_APPS_SCRIPT_URL';
```

Replace the placeholder with the URL from step 4. Commit, push, and merge to `main` to deploy.

## Updating the script after changes

1. Edit files in this repo, commit to a feature branch, PR into `main`.
2. In the Apps Script editor, paste the updated `Code.gs` content over the existing file.
3. **Deploy → Manage deployments → pencil icon on the active deployment → Version: New version → Deploy.** Keeps the same URL, so the form keeps working without any site change.

**If you changed `appsscript.json` — scopes or advanced services — pasting and deploying is not
enough.** Deploying updates what the script *requests*; it does not re-run the consent flow, so
the old grant stays in force and the new capability fails at runtime. Because Phase 3 swallows
its own errors, this is silent: the applicant sees success, the row is written, and only the
confirmation email quietly never sends. Force consent by **running a function in the editor**
(`listTriggers` is read-only and safe) and approving the prompt. Verify at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions) that the new scope
is actually listed before trusting a test.

## How the backend handles a submission

The script splits into three phases. Failures in **Phase 1** or **Phase 2** return an error to the user; failures in **Phase 3** are logged but the submission still succeeds.

**Phase 1 — Parse + verify (no persistence yet)**
1. `doPost` parses the JSON body (sent as `text/plain` to avoid a CORS preflight).
2. `verifyTurnstile` calls Cloudflare's `siteverify`. If rejected, the user sees "Verification challenge failed."
3. `validateSubmission` enforces required fields, email format, MIME type (JPEG/PNG/WebP only), and 10 MB file size.

**Phase 2 — Persist (critical)**

4. A folder is created under `Applicants/<year>/<LastName> — <First> (timestamp)/`.
5. Both photos are base64-decoded and written into that folder. **Google Drive's native malware scan runs automatically** on files under 100 MB.
6. One row is appended to the Pipeline sheet with all form fields + links to the folder and files.

If any of steps 4–6 fail, the user sees "We couldn't save your submission." and the failure is logged at ERROR severity for monitoring.

**Phase 3 — Notify (non-critical)**

7. A warm confirmation email goes to the submitting parent, sent from `info@lionheartartists.com` so replies land in the shared inbox.
8. `notifyLisaOfRow(lastRow)` is invoked, which sends Lisa's notification email and timestamps the row's `Notified At` cell (column AR).

Each path is wrapped in try/catch. If either fails, the failure is logged but the submission is still reported as successful to the user — their data is already safely persisted in Phase 2. You'll see the failure in the logs and can manually follow up.

**Manual entries (separate path)**

When Lisa or James types a new row directly in the Sheets UI, the Apps Script `handleSpreadsheetEdit` installable trigger fires on every cell edit and calls `notifyLisaOfRow(editedRow)`. The function reads the row's data, skips if either Parent Email or Child First Name is blank (mid-typing), and emails Lisa once the row is complete. The `Notified At` column ensures one email per row even though onEdit fires on every keystroke.

## Monitoring (lightweight today; deeper alerting is a follow-up)

Every meaningful event emits a structured JSON line via `console.log` / `console.error` (`*_failed` and `*_error` events use `console.error`, surfacing as ERROR severity in Cloud Logging).

**From the command line (fastest, and works when the Executions panel misbehaves):**

```bash
bun add -g @google/clasp
clasp login                     # as james@lionheartartists.com
clasp clone 1VSXdn9xRMpeTIHMjn5v3dOQ1NmsWmd9lJeGBPIVj2AtHvaSRcgohJqqX
clasp tail-logs --simplified    # add --watch to follow
```

Clone into a scratch directory, **not** this repo — `clasp clone` writes `Code.js` and
`appsscript.json` and would overwrite the copies here. `clasp tail-logs` needs `projectId`
set to `talent-intake` in `.clasp.json` (`clasp setup-logs` prompts for it). Diffing the
cloned files against `apps-script/` is also the quickest way to prove what is actually
deployed versus what this repo says.

**To view in the editor:**
1. Open the [Apps Script project](https://script.google.com/home/projects/1VSXdn9xRMpeTIHMjn5v3dOQ1NmsWmd9lJeGBPIVj2AtHvaSRcgohJqqX/edit)
2. Click the **Executions** icon in the left sidebar — it sits below **Triggers** (the clock icon) and shows a list view (icon looks like horizontal lines / a play arrow). The Executions panel lists every recent script run.
3. **Click anywhere on a row** to expand it inline. The structured log lines (and any stack traces) appear beneath the row. If rows refuse to expand, it is usually a multi-account browser session — the URL carries a `/u/<n>/` account index that does not match the project owner. Open the project in an incognito window signed in only as `james@lionheartartists.com`, or use `clasp tail-logs` above.
4. Status `Completed` does **not** mean "succeeded for the user" — `doPost` always finishes cleanly because errors are caught and returned as JSON. Look at the actual log lines: an `event:"persist_failed"` or `event:"*_failed"` line indicates a real problem.

Example log lines:

```json
{"event":"persisted","ts":"2026-04-25T16:51:55.123Z","folderId":"...","childFirstName":"...","parentEmail":"..."}
{"event":"notification_email_failed","ts":"...","error":"Invalid email","stack":"..."}
{"event":"persist_failed","ts":"...","error":"...","stack":"..."}
```

**Event reference:**

| Severity | Event | Meaning |
|---|---|---|
| INFO | `persisted` | Folder, files, and sheet row all wrote successfully |
| INFO | `notification_email_sent` | Notification to `NOTIFY_EMAIL` succeeded; `Notified At` cell now populated |
| INFO | `confirmation_email_sent` | Confirmation to the submitting parent succeeded |
| INFO | `notification_skipped_incomplete` | A row was checked but Parent Email or Child First Name was missing — normal mid-typing state |
| INFO | `turnstile_rejected` | A submission failed Turnstile (normal user error) |
| INFO | `validation_rejected` | A submission failed field validation (normal user error) |
| ERROR | `parse_failed` | Request body wasn't valid JSON |
| ERROR | `turnstile_error` | Cloudflare's siteverify call threw |
| ERROR | `persist_failed` | Drive folder/file/sheet write blew up — **user-facing failure** |
| ERROR | `notification_email_failed` | Lisa didn't get the notification — `Notified At` left blank so next edit retries |
| ERROR | `confirmation_email_failed` | Parent didn't get the receipt — submission still saved |
| ERROR | `inline_notification_failed` | Lisa-notification path inside doPost threw before reaching `notifyLisaOfRow` (e.g., couldn't open the spreadsheet); the onEdit trigger will still cover the row when it fires |
| ERROR | `handleSpreadsheetEdit_failed` | The onEdit trigger handler itself threw — investigate Apps Script Executions for the row context |

When the basic flow is stable, set up a Google Cloud Logging filter on `severity=ERROR` and route alerts to email/Slack. Tracked in the project follow-ups list.

## Security notes

- The `TURNSTILE_SECRET` never leaves Apps Script. It is never committed to the repo or logged.
- Turnstile verification happens server-side; a client with a valid site key but no real token cannot bypass it.
- The web app is public (no Google sign-in required) — rate limiting is handled by Turnstile, not by Apps Script.
- Apps Script can't return custom HTTP status codes; all responses are HTTP 200 with an `ok` field in the JSON body. The browser code handles both cases.
- Decoded file bytes live only in-memory inside the Apps Script execution; they're streamed directly to Drive.

## Quotas (for reference)

- `MailApp.sendEmail` (Lisa's notification): 100/day on a consumer Gmail, **1500/day on Workspace** — far above expected intake volume.
- `Gmail.Users.Messages.send` (parent confirmation): draws on the same Workspace sending limits, not the Apps Script quota.
- `UrlFetchApp` (for Turnstile verify): 20,000/day.
- Drive uploads: effectively unlimited for this volume.

## Testing

After deploy, test with a `GET` request (should return `{"ok":true,"service":"LionHeart Artists Intake"}`):

```
curl "https://script.google.com/macros/s/.../exec"
```

Then test a full submission through `apply.html`. Check:
- A new folder appears under `Applicants/<year>/`
- A row appears in the Pipeline sheet with `Status = New`
- Lisa receives the notification email
- The submitting email address receives the confirmation, and its `From` reads `LionHeart Artists <info@lionheartartists.com>` — reply to it and check the reply arrives in the group inbox
