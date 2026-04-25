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

1. Open `script.google.com` → **New project**. Name it `LionHeart Artists — Talent Intake`.
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

### 4. Deploy as a web app

1. Click **Deploy → New deployment**.
2. Type: **Web app**.
3. Description: `v1 intake endpoint`.
4. Execute as: **Me (james@lionheartartists.com)**.
5. Who has access: **Anyone** (no Google sign-in required for applicants).
6. Click **Deploy**. Google will prompt you to authorize the four scopes in `appsscript.json` — approve them.
7. **Copy the web app URL.** It looks like `https://script.google.com/macros/s/AKfy.../exec`.

### 5. Add the installable onEdit trigger (powers Lisa's "any new entry" email)

`doPost` notifies Lisa for form submissions inline, but Lisa also wants an email when she or someone else manually adds a row in the Sheets UI. That path goes through the spreadsheet's **onEdit** trigger.

1. Apps Script editor → left sidebar → **Triggers** (clock icon) → **Add Trigger** (bottom right).
2. Function to run: **`handleSpreadsheetEdit`**.
3. Deployment: **Head**.
4. Event source: **From spreadsheet**.
5. Select spreadsheet: pick the **Pipeline** sheet (`1eVTKM8kvaCAj6LOeRhRRapjUk-HB1L_X-gWYbTH-IGM`).
6. Event type: **On edit**.
7. Failure notification settings: leave default (notify immediately on failure).
8. **Save**. Apps Script will prompt you to grant Sheets and Mail permissions — approve.

The trigger is idempotent: it skips rows whose `Notified At` cell (column 41 / AO) is already populated, and skips rows that don't yet have a parent email + child first name (i.e., mid-typing state).

### 6. Add the Notified At column to the Pipeline sheet

Open the Pipeline sheet, type **`Notified At`** in cell **AO1** (column 41, immediately after `Decline Reason`). The script writes a timestamp here when it successfully emails Lisa. To force a re-send for a row, clear that cell.

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

7. A warm confirmation email goes to the submitting parent.
8. `notifyLisaOfRow(lastRow)` is invoked, which sends Lisa's notification email and timestamps the row's `Notified At` cell (column AO).

Each path is wrapped in try/catch. If either fails, the failure is logged but the submission is still reported as successful to the user — their data is already safely persisted in Phase 2. You'll see the failure in the logs and can manually follow up.

**Manual entries (separate path)**

When Lisa or James types a new row directly in the Sheets UI, the Apps Script `handleSpreadsheetEdit` installable trigger fires on every cell edit and calls `notifyLisaOfRow(editedRow)`. The function reads the row's data, skips if either Parent Email or Child First Name is blank (mid-typing), and emails Lisa once the row is complete. The `Notified At` column ensures one email per row even though onEdit fires on every keystroke.

## Monitoring (lightweight today; deeper alerting is a follow-up)

Every meaningful event emits a structured JSON line via `console.log` / `console.error` (`*_failed` and `*_error` events use `console.error`, surfacing as ERROR severity in Cloud Logging).

**To view in real time:**
1. Open the Apps Script editor at `script.google.com` and select the project
2. Click the **Executions** icon in the left sidebar — it sits below **Triggers** (the clock icon) and shows a list view (icon looks like horizontal lines / a play arrow). The Executions panel lists every recent script run.
3. **Click anywhere on a row** to expand it inline. The structured log lines (and any stack traces) appear beneath the row.
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

- `MailApp.sendEmail`: 100/day on a consumer Gmail, **1500/day on Workspace** — far above expected intake volume.
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
- The submitting email address receives the confirmation
