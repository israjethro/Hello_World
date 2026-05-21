/**
 * Code.gs - Entry point and shared configuration for the
 * "QA - Daily Status Dashboard" Google Apps Script web app.
 *
 * Responsibilities:
 *   - Serve the HTML shell (Index.html) via doGet().
 *   - Provide the include() template helper used by the HTML files
 *     (e.g. <?!= include('Stylesheet') ?>).
 *   - Hold the SPREADSHEET_ID constant and the MEMBER_SHEETS list
 *     that the rest of the project (DataService.gs, Banner.html,
 *     Javascript.html) reads from.
 *
 * This file deliberately contains no sheet I/O - read/aggregate logic
 * lives in DataService.gs.
 */

/**
 * The ID of the QA - Daily Status Google Sheet.
 *
 * Two ways to use this script:
 *   1. STANDALONE: paste the spreadsheet ID between the quotes below.
 *      You can find the ID in the sheet URL between "/d/" and "/edit".
 *   2. BOUND: leave SPREADSHEET_ID empty (''). When the script is
 *      bound to a sheet (Extensions > Apps Script from inside the
 *      sheet), getSpreadsheet_() will use the active spreadsheet.
 *
 * @type {string}
 */
var SPREADSHEET_ID = '';

/**
 * Tab names of the five QA team members. Order here drives the order
 * of buttons in the banner and the order of KPI cards.
 *
 * NOTE: This list is mirrored by MOCK_MEMBERS in Javascript.html so
 * the mock-fallback path stays consistent with the live data. If you
 * edit this roster, update MOCK_MEMBERS too. (init() in Javascript.html
 * also derives the member list from live tasksByMember keys when
 * getMembers fails alone, so a temporary drift no longer surfaces
 * mock names against real-keyed data, but keeping the two lists in
 * sync is still the canonical setup.)
 *
 * @type {string[]}
 */
var MEMBER_SHEETS = ['Isra', 'Sowmiya', 'Keerthana', 'Yogesh', 'Tamizharasi'];

/**
 * Resolve the spreadsheet to read from.
 *
 * Prefers SPREADSHEET_ID when set; falls back to the active bound
 * spreadsheet. Throws a clear error if neither is available so the
 * UI can surface a useful message instead of an opaque null.
 *
 * @private
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet_() {
  if (SPREADSHEET_ID && String(SPREADSHEET_ID).trim().length > 0) {
    return SpreadsheetApp.openById(String(SPREADSHEET_ID).trim());
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return active;
  }
  throw new Error(
    'No spreadsheet configured. Either bind this script to the QA - Daily ' +
    'Status sheet (Extensions > Apps Script from inside the sheet), or set ' +
    'SPREADSHEET_ID at the top of Code.gs.'
  );
}

/**
 * Web-app entry point. Renders Index.html as a templated HtmlOutput
 * so that the include() scriptlets in the HTML can pull in the
 * Banner / Stylesheet / Javascript partials at server-render time.
 *
 * @param {Object} e Event object provided by Apps Script. Unused.
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('QA - Daily Status Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Template scriptlet helper. Used inside HTML files like:
 *
 *   <?!= include('Stylesheet') ?>
 *
 * to inline another HTML file into the rendered page.
 *
 * @param {string} filename Name of an HTML file in this project
 *     (without the .html extension).
 * @return {string} Raw HTML content of the named file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Returns the team member list. Exposed to the client via
 * google.script.run so the banner buttons stay in sync with
 * MEMBER_SHEETS without any HTML edits.
 *
 * @return {string[]}
 */
function getMembers() {
  // Return a defensive copy so a client mutation cannot disturb the
  // module-level constant on warm script instances.
  return MEMBER_SHEETS.slice();
}

/**
 * Returns dashboard config - the member list plus a server-side
 * timestamp the UI can show to indicate freshness.
 *
 * @return {{members: string[], generatedAt: string}}
 */
function getConfig() {
  return {
    members: MEMBER_SHEETS.slice(),
    generatedAt: new Date().toISOString()
  };
}
