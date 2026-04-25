/**
 * LionHeart Artists — Talent Intake backend
 * Runs as a Google Apps Script web app deployed from james@lionheartartists.com.
 * See apps-script/README.md for deployment and configuration.
 *
 * Three-phase submission flow:
 *   PHASE 1 — Parse + verify (Turnstile, validation). Failures return a user-facing
 *             error message; nothing has been persisted yet.
 *   PHASE 2 — Persist (CRITICAL): create Drive folder, save uploaded files, append
 *             Pipeline sheet row. Any failure here returns an error to the user.
 *   PHASE 3 — Notify (NON-CRITICAL): notification email to Lisa, confirmation email
 *             to the parent. Each is wrapped individually; failures are logged but
 *             the submission still succeeds.
 *
 * Monitoring: every meaningful event emits a structured JSON log line via
 * console.log / console.error (`*_failed` and `*_error` events use console.error).
 * Tail them in the Apps Script "Executions" tab (click an execution row to expand
 * its logs) or set up a filter in Google Cloud Logging on `severity=ERROR`.
 */

// === Configuration — read from Script Properties (Project Settings → Script Properties) ===
// Required properties:
//   TURNSTILE_SECRET          Cloudflare Turnstile secret key
//   SHARED_DRIVE_ID           ID of the "LionHeart Artists — Talent Intake" Shared Drive
//   APPLICANTS_FOLDER_ID      ID of the "Applicants" subfolder in that drive
//   PIPELINE_SHEET_ID         ID of the Pipeline spreadsheet
//   NOTIFY_EMAIL              Address to email on every new submission (currently lisa@lionheartartists.com)

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const REQUIRED_FIELDS = [
  'parentName', 'parentEmail', 'parentPhone', 'relationship', 'location',
  'childFirstName', 'childDob', 'childGender', 'goals',
];

function doPost(e) {
  let body;

  // PHASE 1 — parse + verify (no persistence side effects yet)
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    logEvent_('parse_failed', { error: String((err && err.message) || err) });
    return json({ ok: false, error: 'Invalid request format. Please reload the page and try again.' });
  }

  try {
    if (!verifyTurnstile(body.turnstileToken)) {
      logEvent_('turnstile_rejected', {});
      return json({ ok: false, error: 'Verification challenge failed. Please reload the page and try again.' });
    }
  } catch (err) {
    logEvent_('turnstile_error', { error: String((err && err.message) || err), stack: err && err.stack });
    return json({ ok: false, error: 'Verification temporarily unavailable. Please try again in a moment.' });
  }

  const validation = validateSubmission(body);
  if (!validation.valid) {
    logEvent_('validation_rejected', { reason: validation.message });
    return json({ ok: false, error: validation.message });
  }

  // PHASE 2 — persist (CRITICAL: failures here return an error to the user)
  let applicantFolder, headshotFile, fullLengthFile;
  try {
    applicantFolder = createApplicantFolder(body);
    headshotFile = saveFile(body.headshot, applicantFolder, 'headshot');
    fullLengthFile = saveFile(body.fullLength, applicantFolder, 'full-length');
    appendSheetRow(body, applicantFolder, headshotFile, fullLengthFile);
    logEvent_('persisted', {
      folderId: applicantFolder.getId(),
      childFirstName: body.childFirstName,
      parentEmail: body.parentEmail,
    });
  } catch (err) {
    logEvent_('persist_failed', {
      error: String((err && err.message) || err),
      stack: err && err.stack,
      childFirstName: body && body.childFirstName,
      parentEmail: body && body.parentEmail,
    });
    return json({ ok: false, error: 'We couldn\'t save your submission. Please try again, or call 424-777-9493.' });
  }

  // PHASE 3 — notify (NON-CRITICAL: failures are logged but the submission still succeeds)
  trySendEmail_('notification_email', () => sendNotification(body, applicantFolder));
  trySendEmail_('confirmation_email', () => sendParentConfirmation(body));

  return json({ ok: true });
}

function doGet() {
  return json({ ok: true, service: 'LionHeart Artists Intake' });
}

function verifyTurnstile(token) {
  const secret = prop_('TURNSTILE_SECRET');
  if (!token) return false;
  const res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post',
    payload: { secret, response: token },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return false;
  const result = JSON.parse(res.getContentText());
  return result.success === true;
}

function validateSubmission(body) {
  for (const f of REQUIRED_FIELDS) {
    if (!body[f] || !String(body[f]).trim()) {
      return { valid: false, message: 'Please complete all required fields before submitting.' };
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.parentEmail)) {
    return { valid: false, message: 'Please enter a valid email address.' };
  }
  if (body.consent !== true) {
    return { valid: false, message: 'Please confirm the consent checkbox.' };
  }
  const fileCheck = (f, label) => {
    if (!f || !f.base64 || !f.mime) return `${label} is missing.`;
    if (!ALLOWED_MIME.includes(f.mime)) return `${label} must be JPEG, PNG, or WebP.`;
    if (f.size > MAX_FILE_BYTES) return `${label} exceeds the 10 MB limit.`;
    return null;
  };
  const hErr = fileCheck(body.headshot, 'Headshot');
  if (hErr) return { valid: false, message: hErr };
  const fErr = fileCheck(body.fullLength, 'Full-length photo');
  if (fErr) return { valid: false, message: fErr };
  return { valid: true };
}

function createApplicantFolder(body) {
  const applicantsRoot = DriveApp.getFolderById(prop_('APPLICANTS_FOLDER_ID'));
  const year = String(new Date().getFullYear());
  const yearFolder = getOrCreateSubfolder_(applicantsRoot, year);
  const childLast = (body.childLastName || body.parentName).trim().split(/\s+/).pop();
  const safeName = [childLast, body.childFirstName].filter(Boolean).join(' — ').replace(/[\\/:*?"<>|]/g, '');
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Los_Angeles', 'yyyy-MM-dd HHmm');
  return yearFolder.createFolder(`${safeName} (${stamp})`);
}

function getOrCreateSubfolder_(parent, name) {
  const existing = parent.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parent.createFolder(name);
}

function saveFile(fileData, folder, label) {
  const bytes = Utilities.base64Decode(fileData.base64);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[fileData.mime] || 'bin';
  const blob = Utilities.newBlob(bytes, fileData.mime, `${label}.${ext}`);
  return folder.createFile(blob);
}

function appendSheetRow(body, folder, headshotFile, fullLengthFile) {
  const ss = SpreadsheetApp.openById(prop_('PIPELINE_SHEET_ID'));
  const sheet = ss.getSheetByName('Pipeline') || ss.getSheets()[0];
  sheet.appendRow([
    new Date(),
    'New',
    body.parentName,
    body.parentEmail,
    body.parentPhone,
    body.relationship,
    body.location,
    body.childFirstName,
    body.childLastName || '',
    body.stageName || '',
    body.childDob,
    computeAge_(body.childDob),
    body.childGender,
    body.height || '',
    body.hairColor || '',
    body.eyeColor || '',
    body.ethnicity || '',
    body.priorRepresentation || '',
    body.unionStatus || '',
    body.workPermit || '',
    body.coogan || '',
    body.training || '',
    body.credits || '',
    body.specialSkills || '',
    body.demoReelUrl || '',
    body.resumeUrl || '',
    body.selfTapeSetup || '',
    body.instagram || '',
    body.tiktok || '',
    body.youtube || '',
    body.followerCounts || '',
    body.schoolType || '',
    body.availability || '',
    body.goals,
    body.howHeard || '',
    folder.getUrl(),
    headshotFile.getUrl(),
    fullLengthFile.getUrl(),
    '',
    '',
  ]);
}

function computeAge_(dobStr) {
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function sendNotification(body, folder) {
  const age = computeAge_(body.childDob);
  const subject = `New intake: ${body.childFirstName} (age ${age}) — ${body.parentName}`;
  const htmlBody = [
    '<p>A new representation inquiry has arrived.</p>',
    `<p><strong>Child:</strong> ${esc_(body.childFirstName)}${body.childLastName ? ' ' + esc_(body.childLastName) : ''}${body.stageName ? ' (stage: ' + esc_(body.stageName) + ')' : ''}, age ${age}</p>`,
    `<p><strong>Parent:</strong> ${esc_(body.parentName)} &lt;<a href="mailto:${esc_(body.parentEmail)}">${esc_(body.parentEmail)}</a>&gt; &middot; ${esc_(body.parentPhone)}</p>`,
    `<p><strong>Location:</strong> ${esc_(body.location)}</p>`,
    body.unionStatus ? `<p><strong>Union:</strong> ${esc_(body.unionStatus)}</p>` : '',
    body.priorRepresentation ? `<p><strong>Prior rep:</strong> ${esc_(body.priorRepresentation)}</p>` : '',
    `<p><strong>Goals:</strong><br>${esc_(body.goals).replace(/\n/g, '<br>')}</p>`,
    `<p><a href="${folder.getUrl()}">Open applicant folder</a></p>`,
  ].filter(Boolean).join('\n');
  MailApp.sendEmail({
    to: prop_('NOTIFY_EMAIL'),
    subject,
    htmlBody,
    replyTo: body.parentEmail,
    name: 'LionHeart Intake',
  });
}

function sendParentConfirmation(body) {
  const subject = 'We received your inquiry — LionHeart Artists';
  const htmlBody = [
    `<p>Dear ${esc_(body.parentName)},</p>`,
    `<p>Thank you for reaching out to LionHeart Artists about ${esc_(body.childFirstName)}. We've received your application and are genuinely excited to learn more.</p>`,
    '<p>Our team reviews every inquiry personally. You can expect to hear back from us within <strong>7–10 business days</strong>.</p>',
    '<p>If you have questions in the meantime, please call <a href="tel:4247779493">424-777-9493</a>.</p>',
    '<p>Warmly,<br>Lisa Leone<br>Founder, LionHeart Artists</p>',
    '<p style="color:#888;font-size:12px;margin-top:2rem">This is an automated confirmation — please do not reply directly to this message.</p>',
  ].join('\n');
  MailApp.sendEmail({
    to: body.parentEmail,
    subject,
    htmlBody,
    name: 'LionHeart Artists',
  });
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function prop_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error(`Missing Script Property: ${key}`);
  return v;
}

function json(obj) {
  // Apps Script web apps always return HTTP 200 — clients must check the `ok` field.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function trySendEmail_(label, fn) {
  try {
    fn();
    logEvent_(label + '_sent', {});
  } catch (err) {
    logEvent_(label + '_failed', {
      error: String((err && err.message) || err),
      stack: err && err.stack,
    });
  }
}

function logEvent_(event, data) {
  // Structured JSON log line — searchable in Apps Script Executions and in Cloud Logging.
  // *_failed and *_error events are logged at ERROR severity so they surface in Cloud Logging error filters.
  const entry = Object.assign({ event: event, ts: new Date().toISOString() }, data || {});
  const line = JSON.stringify(entry);
  if (event.endsWith('_failed') || event.endsWith('_error')) {
    console.error(line);
  } else {
    console.log(line);
  }
}
