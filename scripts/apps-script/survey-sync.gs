// Survey sync: posts every response in this sheet to hack.claudeseattle.org/api/surveys/sync.
//
// Setup, once per response sheet (Extensions > Apps Script in the sheet):
// 1. Paste this file. Set SURVEY below to 'attendee' or 'small_business'.
// 2. Project Settings > Script Properties: add SURVEY_SYNC_SECRET (same value as in Vercel).
// 3. Run install() once and approve the permissions. It syncs right away and adds a
//    30-minute trigger. Check the log for the counts.
//
// Schedule (Pacific): every 2 hours until Sat Oct 24, 12:00 pm; every 30 minutes until
// Sun Oct 25, 8:00 am; one last sync after that, then the trigger removes itself.
// The respondent's name never leaves this sheet. Revenue is sent, and the site stores it only in
// an anonymous copy with no email, name, business or timestamp.

const SURVEY = 'attendee'; // or 'small_business'
const SHEET_NAME = 'Form Responses 1';
const ENDPOINT = 'https://hack.claudeseattle.org/api/surveys/sync';
const FREQUENT_FROM = new Date('2026-10-24T12:00:00-07:00');
const STOP_AT = new Date('2026-10-25T08:00:00-07:00');
const NEVER_SEND = ['your name'];

function install() {
  removeTriggers_();
  ScriptApp.newTrigger('scheduledSync').timeBased().everyMinutes(30).create();
  sync();
}

function scheduledSync() {
  const now = new Date();
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('LAST_SYNC') || 0);
  if (now >= STOP_AT) {
    if (last < STOP_AT.getTime()) sync();
    removeTriggers_();
    return;
  }
  const interval = (now < FREQUENT_FROM ? 120 : 30) * 60 * 1000;
  // Triggers drift by a few minutes, so allow 5 minutes early.
  if (now.getTime() - last >= interval - 5 * 60 * 1000) sync();
}

function sync() {
  const values = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME).getDataRange().getValues();
  const headers = values[0];
  const keep = headers.map((h) => !NEVER_SEND.some((p) => String(h).toLowerCase().includes(p)));
  const pick = (row) => row.filter((_, i) => keep[i]);
  const rows = values.slice(1).filter((row) => row.some((v) => v !== ''));

  const response = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + PropertiesService.getScriptProperties().getProperty('SURVEY_SYNC_SECRET') },
    payload: JSON.stringify({ survey: SURVEY, headers: pick(headers), rows: rows.map(pick) }),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  console.log(SURVEY + ' sync: HTTP ' + code + ' ' + response.getContentText());
  if (code !== 200) throw new Error('Survey sync failed with HTTP ' + code);
  PropertiesService.getScriptProperties().setProperty('LAST_SYNC', String(Date.now()));
}

function removeTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'scheduledSync')
    .forEach((t) => ScriptApp.deleteTrigger(t));
}
