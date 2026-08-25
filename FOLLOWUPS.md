# Follow-ups

Tracked work items deferred from the initial intake-pipeline build. Roughly ordered by priority.

## Operations & monitoring

- **Cloud Logging alert on Apps Script errors.** Apps Script writes structured `console.error` lines (event names listed in `apps-script/README.md`). In Google Cloud Logging, build a filter like `severity=ERROR AND resource.type="app_script_function" AND jsonPayload.event=~"_failed|_error"` and route matches to an email/Slack alert via Cloud Monitoring. Most important alerts: `persist_failed` (user-facing failure), `turnstile_error` (verify path broken), `notification_email_failed` / `confirmation_email_failed` (silent partial failures).
- **Periodic deliverability audit.** Spot-check that confirmation emails to applicants aren't landing in spam, and that DKIM/SPF/DMARC stay aligned.
- **Pipeline-sheet hygiene.** Optional cosmetic: rename `Sheet1` tab to `Pipeline` (script handles either), freeze row 1, add filter view, conditional formatting on Status column.

## Email / DNS

- **Route DMARC aggregate reports somewhere we actually read them.** `_dmarc.lionheartartists.com` currently sets `rua=mailto:dmarc_rua@onsecureserver.net` — a leftover from the pre-Cloudflare registrar. Nobody at LionHeart has ever seen a report, and the policy is already `p=quarantine`, so an authentication break would silently quarantine our mail with no signal. Sign up at https://dmarc.postmarkapp.com (free, no account required, weekly email digest), then replace the whole record value in Cloudflare DNS with `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:<address Postmark issues>;`. Drop the `onsecureserver.net` destination rather than keeping it alongside.

## Site infrastructure

- **Decide on hosting consolidation.** Today: GitHub Pages serves prod (`lionheartartists.com`); Cloudflare Workers serves the staging preview. Either migrate prod to Cloudflare too (delete `CNAME` file, bind `lionheartartists.com` to Cloudflare project) or leave the split. Migration unlocks per-branch custom domains (`stage.lionheartartists.com` instead of the `*.workers.dev` URL) if we convert the Workers project to a classic Pages project at the same time.
- **`.html` URL parity.** Cloudflare Workers Static Assets redirects `/apply.html` → `/apply` (307); GitHub Pages serves both. Either set `assets.html_handling: "none"` in `wrangler.jsonc` or update `index.html` CTA links to drop the `.html` suffix.
- **Webroot hygiene.** `apps-script/`, `SHEET_SCHEMA.md`, `CLAUDE.md`, and `FOLLOWUPS.md` are technically reachable at the public domain (e.g., `lionheartartists.com/CLAUDE.md`) because the static deployer serves the repo root. The repo is public on GitHub anyway, but moving HTML/assets into a `public/` directory and pointing the deployer at it would be cleaner. Low priority.

## Legal

- **Privacy-policy legal review.** `privacy.html` is a working draft prepared in this build. Have qualified legal counsel familiar with California privacy law (CCPA/CPRA), child-performer regulations, and talent-agency recordkeeping review before publishing. The "Effective" date is currently a placeholder.

## Form / UX

- **Confirmation email deliverability.** Watch for spam classification in the first weeks of operation, especially confirmations going to `@gmail.com` and `@outlook.com`.
- **Replace placeholder Instagram/LinkedIn footer links** in `index.html` (currently `href="#"`).
