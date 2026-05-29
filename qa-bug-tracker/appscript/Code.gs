/**
 * CC DIGITAL — QA BUG TRACKER  ·  Google Apps Script (server)
 * ----------------------------------------------------------------
 * Reads the 17-column "QA Error Tracker" sheet and serves an
 * interactive web-app dashboard (Index.html + Stylesheet + JavaScript).
 *
 * SETUP
 *  1. Open your tracker Google Sheet → Extensions → Apps Script.
 *  2. Create files: Code.gs, Index.html, Stylesheet.html, JavaScript.html
 *     and paste the matching contents from this repo.
 *  3. Edit CONFIG below (sheet/tab name, QA lead, 5 team members).
 *  4. Deploy → New deployment → Web app → Execute as "Me",
 *     access as needed → Deploy. Open the web-app URL.
 *
 *  Use "QA Tracker ▸ Refresh data cache" menu after big sheet edits.
 */

var CONFIG = {
  // Tab that holds the records. Use the active sheet if left blank.
  SHEET_NAME: '2026',
  HEADER_ROW: 1,

  // Cache makes data load instantly on repeat visits (seconds).
  CACHE_KEY: 'QA_BUG_DATA_V1',
  CACHE_SECONDS: 600,

  // ---- Edit these to match your team -------------------------------
  QA_LEAD: {
    name: 'QA Lead Name',
    role: 'QA Lead — CC Digital',
    email: 'lead@ccdigital.example',
    phone: '+91 00000 00000'
  },
  TEAM: [
    { name: 'Tamizharasi',      role: 'Senior QA Engineer', email: 'tamizharasi@ccdigital.example' },
    { name: 'Sowmiya Chandran', role: 'QA Engineer',        email: 'sowmiya@ccdigital.example' },
    { name: 'Yogesh Kumar D',   role: 'QA Engineer',        email: 'yogesh@ccdigital.example' },
    { name: 'Praveen Kumar S',  role: 'QA Engineer',        email: 'praveen@ccdigital.example' },
    { name: 'Divya Ramesh',     role: 'QA Engineer',        email: 'divya@ccdigital.example' }
  ]
};

/** Maps normalized sheet headers -> the keys used by the front-end. */
var HEADER_MAP = {
  's no': 'sno', 'sno': 'sno', 's.no': 'sno',
  'month': 'month',
  'received date': 'receivedDate',
  'client': 'client',
  'project': 'project',
  'project id': 'projectId',
  'requestor': 'requestor', 'requester': 'requestor',
  'qa resource': 'qaResource',
  'production resource': 'productionResource',
  'email subject line': 'emailSubject', 'email subject': 'emailSubject',
  'type of qa': 'typeOfQA',
  'qa delivery date': 'qaDeliveryDate',
  'error description': 'errorDescription',
  'comments': 'comments',
  'number of rounds': 'rounds', 'no of rounds': 'rounds',
  'number of issues': 'issues', 'no of issues': 'issues',
  'bug report': 'bugReport'
};

/** Web-app entry point. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('CC Digital · QA Bug Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Allows Index.html to inline Stylesheet/JavaScript partials. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Single round-trip the client calls on load. */
function getInitData() {
  return {
    rows: getBugData(),
    config: { qaLead: CONFIG.QA_LEAD, team: CONFIG.TEAM }
  };
}

/** Reads + caches the sheet, returning an array of record objects. */
function getBugData() {
  var cached = readCache_(CONFIG.CACHE_KEY);
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = CONFIG.SHEET_NAME ? ss.getSheetByName(CONFIG.SHEET_NAME) : ss.getActiveSheet();
  if (!sheet) throw new Error('Sheet "' + CONFIG.SHEET_NAME + '" not found. Update CONFIG.SHEET_NAME.');

  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow <= CONFIG.HEADER_ROW) return [];

  var headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getDisplayValues()[0];
  var colKey = {};            // column index -> field key
  for (var c = 0; c < headers.length; c++) {
    var norm = String(headers[c]).trim().toLowerCase().replace(/\s+/g, ' ');
    if (HEADER_MAP[norm]) colKey[c] = HEADER_MAP[norm];
  }

  var n = lastRow - CONFIG.HEADER_ROW;
  var range = sheet.getRange(CONFIG.HEADER_ROW + 1, 1, n, lastCol);
  var display = range.getDisplayValues();
  var rich = range.getRichTextValues();   // used to extract Bug Report hyperlinks

  var rows = [];
  for (var r = 0; r < display.length; r++) {
    var obj = {}, hasData = false;
    for (var ci in colKey) {
      ci = +ci;
      var key = colKey[ci];
      var text = display[r][ci];
      if (key === 'bugReport') {
        obj.bugReport = { text: text, url: extractLink_(rich[r][ci]) };
        if (text) hasData = true;
      } else {
        obj[key] = text;
        if (text !== '' && text != null) hasData = true;
      }
    }
    if (!obj.bugReport) obj.bugReport = { text: '', url: '' };
    if (hasData) rows.push(obj);
  }

  writeCache_(CONFIG.CACHE_KEY, JSON.stringify(rows), CONFIG.CACHE_SECONDS);
  return rows;
}

/** Pulls a URL out of a RichTextValue cell (whole-cell or first linked run). */
function extractLink_(rtv) {
  if (!rtv) return '';
  try {
    var whole = rtv.getLinkUrl();
    if (whole) return whole;
    var runs = rtv.getRuns();
    for (var i = 0; i < runs.length; i++) {
      var u = runs[i].getLinkUrl();
      if (u) return u;
    }
  } catch (e) {}
  return '';
}

/* ---------- chunked cache (handles payloads > 100KB) ---------- */
function writeCache_(key, str, secs) {
  try {
    var cache = CacheService.getScriptCache();
    var size = 90000, parts = Math.ceil(str.length / size), map = {};
    map[key + '_n'] = String(parts);
    for (var i = 0; i < parts; i++) map[key + '_' + i] = str.substr(i * size, size);
    cache.putAll(map, secs);
  } catch (e) { /* cache is best-effort */ }
}
function readCache_(key) {
  try {
    var cache = CacheService.getScriptCache();
    var nStr = cache.get(key + '_n');
    if (!nStr) return null;
    var parts = +nStr, keys = [];
    for (var i = 0; i < parts; i++) keys.push(key + '_' + i);
    var got = cache.getAll(keys), out = '';
    for (var j = 0; j < parts; j++) { var v = got[key + '_' + j]; if (v == null) return null; out += v; }
    return out;
  } catch (e) { return null; }
}

/** Spreadsheet menu to clear the cache on demand. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('QA Tracker')
    .addItem('Refresh data cache', 'refreshCache')
    .addToUi();
}
function refreshCache() {
  CacheService.getScriptCache().remove(CONFIG.CACHE_KEY + '_n');
  getBugData();
  SpreadsheetApp.getActiveSpreadsheet().toast('QA Tracker cache refreshed.', 'Done', 4);
}
