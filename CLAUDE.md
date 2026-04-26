# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Marketing site for **LionHeart Artists**, a boutique talent management firm for young performers (ages 4–18) founded by Lisa Leone. Deployed via GitHub Pages to `lionheartartists.com` (see `CNAME`).

## Architecture

A static site with three HTML pages plus a Google Apps Script backend. No build step, no package manager, no framework, no tests. Each HTML file contains its own inline CSS and JS — we have not introduced shared CSS or JS files, and doing so should require an explicit ask (splitting creates caching/versioning work that is not worth it at this scale).

- `index.html` — marketing home page. Sections gated by ID (see below).
- `apply.html` — talent intake application form. POSTs JSON to the Apps Script backend; files are read as base64 client-side and included in the payload. Turnstile widget gates the submit. The `APPS_SCRIPT_URL` constant near the bottom of the `<script>` must be set to the deployed Apps Script web app URL before the form works.
- `privacy.html` — privacy policy. Referenced from the home page footer and from the apply form consent checkbox. Draft only — has an explicit "review by legal counsel" callout at the top.
- `assets/` — images (headshots, on-set photos, logos). Some hero/banner images are still pulled from `images.unsplash.com` via inline URLs.
- `apps-script/` — source of truth for the Google Apps Script web app that handles `/apply.html` submissions. See `apps-script/README.md` for deployment. The script itself runs in Google's cloud from `james@lionheartartists.com`; changes here must be re-pasted into the Apps Script editor and a new deployment version cut.
- `SHEET_SCHEMA.md` — column schema for the Pipeline Google Sheet. Apps Script appends rows by column **position**, not header name, so reordering columns requires editing `apps-script/Code.gs → appendSheetRow` in lockstep.
- `CNAME` — GitHub Pages custom domain. Do not remove.

### Intake pipeline data flow

`apply.html` (browser) → Cloudflare Turnstile → Apps Script web app → Shared Drive folder (`Applicants/<year>/<LastName> — <First> (timestamp)/`) + Pipeline Sheet row + notification email to Lisa + confirmation email to parent. Turnstile secret lives **only** in Apps Script Script Properties, never the repo. Drive's built-in malware scan handles uploaded photos.

### Page structure (anchors wired to the nav)

`index.html` sections use IDs that the fixed nav and scroll-spy script depend on: `#about`, `#services`, `#industries`, `#values`, `#apply`. The `#apply` section is a CTA that links to `/apply.html` — it does not contain a form. If you rename or reorder a section, update both the `<nav>` links and the `sections`/`navLinks` logic near the bottom of the `<script>` block.

### Styling conventions

All three HTML pages share a palette (`--gold`, `--gold-light`, `--dark`, `--cream`, etc.) and type stack (Cormorant Garamond headings + Montserrat body) defined as `:root` custom properties in each file's inline `<style>`. Keep them in sync when tweaking the brand. The `.fade-in` + `IntersectionObserver` scroll animation pattern is on the home page only.

### Phone number

The primary phone number `424-777-9493` appears in `index.html` (contact section + footer), `apply.html` (header callout + success panel), and `privacy.html` (contact section). Update all occurrences together.

## Development workflow

Two long-lived branches drive deploys, and **`main` is production**:

- `main` → GitHub Pages → `lionheartartists.com`
- `staging` → Cloudflare Workers → `https://staging-lionheartartists-site.james-c2a.workers.dev`

Both branches auto-deploy on push, so the gate between them is the only review step in the pipeline. Work always lands on `staging` first, gets eyeballed on the Cloudflare URL, and is promoted to `main` as a separate batch.

**Never commit directly to `main` or `staging`.** Always work on a feature branch (e.g. `feature/intake-form-setup`, `fix/nav-a11y`, `content/services-copy`) and open a PR.

Typical flow for a new change:

```
git checkout staging && git pull        # branch from staging, not main —
git checkout -b feature/<session-scope> # so you inherit any in-flight work
# ...edits, commits...
git push -u origin feature/<session-scope>
gh pr create --base staging             # PR into staging, NOT main
```

After the feature PR merges into `staging`, Cloudflare auto-deploys; verify on the staging URL.

Promoting `staging` → `main` (production release) is a separate, deliberate step:

```
gh pr create --base main --head staging --title "Release: <summary>"
```

Review the cumulative diff (it may include several features), merge, and GitHub Pages auto-deploys to `lionheartartists.com`.

Committing and pushing on a feature branch is fine — proceed without waiting for explicit confirmation each time. **Never commit or push directly to `staging` or `main`**, and never merge a PR (especially `staging` → `main`) without explicit approval. Always create the feature branch off `staging` so it inherits any in-flight work.

## Local preview

No build. Either open `index.html` directly, or serve the directory so relative `assets/` paths resolve the same as production:

```
python3 -m http.server 8000
```

## Deploy

There are two auto-deploys, both on push:

- Push to `staging` → Cloudflare Workers redeploys the preview site. Use this for review before production.
- Push to `main` → GitHub Pages redeploys `lionheartartists.com` (the domain in `CNAME`). This is production — no other gate.

There is no CI. The branch + PR flow above is the only review step.
