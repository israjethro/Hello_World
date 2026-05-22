/**
 * Code.gs - Combined server-side logic for the
 * "QA-Tasks History" Google Apps Script web app.
 *
 * Responsibilities:
 *   - Serve History.html via doGet().
 *   - Hold the SPREADSHEET_ID constant and the MEMBER_SHEETS list.
 *   - Sheet I/O, normalization, aggregation and chart-shaping.
 *   - All public server functions are wrapped through
 *     CacheService.getScriptCache() with a 60-second TTL.
 *
 * Sheet shape (one tab per member, names in MEMBER_SHEETS):
 *   row 1 - merged title (skipped)
 *   row 2 - header: S NO, DATE, CLIENT, PROJECT NAME, HOURS,
 *           Billability, Status, Bug Captured, No of Bugs,
 *           Bugs Description (skipped)
 *   row 3+ - data rows. Fully-empty rows separate day groups and
 *            are skipped during read.
 *
 * Dates may be either Date objects or strings of the form
 * 'dd/mm/yy' (e.g. '18/08/25'). The two-digit year is interpreted
 * as 20yy.
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
 * Web-app entry point. Serves History.html as a complete HTML page.
 *
 * @param {Object} e Event object provided by Apps Script. Unused.
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('History')
    .setTitle('QA-Tasks History')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Returns the team member list. Exposed to the client via
 * google.script.run so the banner buttons stay in sync with
 * MEMBER_SHEETS without any HTML edits.
 *
 * @return {string[]}
 */
function getMembers() {
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

// =====================================================================
// DataService - Sheet I/O, normalization, aggregation, chart-shaping
// =====================================================================

/** @const {number} Cache TTL for all DataService reads, in seconds. */
var CACHE_TTL_SECONDS_ = 60;

/** @const {number} Number of leading columns we consider "the row" (A..J). */
var ROW_WIDTH_ = 10;

/**
 * Cache wrapper. Computes a key from (fnName, args), looks up
 * CacheService, and on miss invokes the producer, stores its JSON,
 * and returns it. Errors in the producer bypass the cache entirely.
 *
 * @private
 * @param {string} fnName
 * @param {Array} args
 * @param {function():*} producer
 * @return {*} Whatever the producer returns (after JSON round-trip
 *     when served from cache).
 */
function withCache_(fnName, args, producer) {
  var cache = null;
  var key = fnName + '::' + JSON.stringify(args || []);
  try {
    cache = CacheService.getScriptCache();
    var cached = cache.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheReadErr) {
    // Cache unavailable - fall through to fresh read.
    cache = null;
  }
  var fresh = producer();
  if (cache) {
    try {
      var payload = JSON.stringify(fresh);
      // CacheService rejects values >100KB; guard so a large payload
      // does not throw and break the underlying read.
      if (payload && payload.length < 95 * 1024) {
        cache.put(key, payload, CACHE_TTL_SECONDS_);
      }
    } catch (cacheWriteErr) {
      // Swallow - cache is best-effort.
    }
  }
  return fresh;
}

/**
 * Normalize an arbitrary date cell value to ISO yyyy-mm-dd.
 *
 * Accepts:
 *   - Date objects (returned by Apps Script for typed date cells)
 *   - Strings like '18/08/25' (dd/mm/yy, 2-digit year => 20yy)
 *   - Strings like '18/08/2025' (dd/mm/yyyy)
 *   - Already-ISO strings 'yyyy-mm-dd' (returned as-is)
 *
 * Returns '' for empty/unparseable input.
 *
 * @private
 * @param {*} value
 * @return {string}
 */
function normalizeDate_(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    var y = value.getFullYear();
    var m = value.getMonth() + 1;
    var d = value.getDate();
    return y + '-' + pad2_(m) + '-' + pad2_(d);
  }
  var s = String(value).trim();
  if (!s) return '';
  // Already ISO-ish.
  var isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return isoMatch[1] + '-' + pad2_(isoMatch[2]) + '-' + pad2_(isoMatch[3]);
  }
  // dd/mm/yy or dd/mm/yyyy (also tolerate '-' or '.' separators).
  var parts = s.split(/[\/\-.]/);
  if (parts.length >= 3) {
    var dd = parseInt(parts[0], 10);
    var mm = parseInt(parts[1], 10);
    var yy = parseInt(parts[2], 10);
    if (!isNaN(dd) && !isNaN(mm) && !isNaN(yy)) {
      var year = yy < 100 ? 2000 + yy : yy;
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        return year + '-' + pad2_(mm) + '-' + pad2_(dd);
      }
    }
  }
  // Last resort: try the JS Date parser.
  var fallback = new Date(s);
  if (!isNaN(fallback.getTime())) {
    return fallback.getFullYear() + '-' +
      pad2_(fallback.getMonth() + 1) + '-' +
      pad2_(fallback.getDate());
  }
  return '';
}

/**
 * Two-digit zero-padded number-to-string.
 * @private
 * @param {number|string} n
 * @return {string}
 */
function pad2_(n) {
  var s = String(n);
  return s.length < 2 ? '0' + s : s;
}

/**
 * Coerce a value to Number, returning a default for blanks/NaN.
 * @private
 * @param {*} value
 * @param {number=} fallback
 * @return {number}
 */
function toNumber_(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback || 0;
  }
  if (typeof value === 'number' && !isNaN(value)) return value;
  var n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? (fallback || 0) : n;
}

/**
 * Trim + uppercase a string-ish value.
 * @private
 * @param {*} value
 * @return {string}
 */
function upperTrim_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().toUpperCase();
}

/**
 * Trim a string-ish value (no case change).
 * @private
 * @param {*} value
 * @return {string}
 */
function trimStr_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Decide whether a sheet row should be skipped as an "empty separator".
 *
 * The QA tabs use blank separator rows between day groups. Earlier
 * versions of this function treated a row as empty only when all ten
 * columns (A..J) were blank, but in practice the trailing columns
 * (Billability, Status, Bug Captured, No of Bugs, Bugs Description)
 * are sometimes filled in alone (for example, a stray "PENDING"
 * status pill on an otherwise blank row). Such rows do not represent
 * real work and should still be dropped.
 *
 * The new heuristic looks at exactly five columns - S NO, DATE,
 * CLIENT, PROJECT NAME, HOURS - and treats the row as empty iff EVERY
 * one of those is blank or whitespace-only. Columns F..J are not
 * considered for the emptiness decision. A real task may legitimately
 * have HOURS = 0, so numeric 0 (and any other number) and Date
 * objects always count as PRESENT; only null / undefined / '' /
 * whitespace-only strings count as blank.
 *
 * Edge case worth knowing: because the gate is an AND across all five
 * cells, a row that has ONLY S NO populated (e.g. a stray serial
 * number in column A with everything else blank) still passes and is
 * kept as a "real" row. This matches the pre-change behavior - the
 * sheet shape is owned by humans and a stray number in column A is
 * rare in practice - so it is documented here rather than blocked.
 *
 * @private
 * @param {Array} row Raw row from Sheet.getValues(); only indices 0..4
 *     (S NO, DATE, CLIENT, PROJECT NAME, HOURS) are inspected.
 * @return {boolean} True when ALL five gate cells are blank.
 */
function isEmptyRow_(row) {
  function isBlank_(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    // Numbers (including 0) and Date objects count as PRESENT.
    return false;
  }
  // Gate columns: A=S NO, B=DATE, C=CLIENT, D=PROJECT NAME, E=HOURS.
  return isBlank_(row[0]) && isBlank_(row[1]) && isBlank_(row[2]) &&
    isBlank_(row[3]) && isBlank_(row[4]);
}

/**
 * Read raw rows for one member, skipping the title row, the header
 * row and any fully-empty separator rows.
 *
 * @private
 * @param {string} memberName
 * @return {!Array<!Object>}
 */
function readMemberRows_(memberName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(memberName);
  if (!sheet) {
    throw new Error('Sheet "' + memberName + '" not found');
  }
  var lastRow = sheet.getLastRow();
  var maxCols = sheet.getMaxColumns();
  // We need 10 columns (A..J). New Sheets default to 26 columns so this
  // is normally fine; guard with a clear message in case the tab was
  // explicitly trimmed below the expected width.
  if (maxCols < ROW_WIDTH_) {
    throw new Error(
      'Sheet "' + memberName + '" has only ' + maxCols + ' column(s); the ' +
      'dashboard expects at least ' + ROW_WIDTH_ + ' (A..J: S NO, DATE, ' +
      'CLIENT, PROJECT NAME, HOURS, Billability, Status, Bug Captured, ' +
      'No of Bugs, Bugs Description).'
    );
  }
  var lastCol = Math.max(sheet.getLastColumn(), ROW_WIDTH_);
  // Nothing past the header.
  if (lastRow < 3) return [];
  var values = sheet.getRange(3, 1, lastRow - 2, lastCol).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (isEmptyRow_(row)) continue;
    out.push({
      sNo: trimStr_(row[0]),
      date: normalizeDate_(row[1]),
      client: trimStr_(row[2]),
      projectName: trimStr_(row[3]),
      hours: toNumber_(row[4], 0),
      billability: upperTrim_(row[5]),
      status: upperTrim_(row[6]),
      bugCaptured: upperTrim_(row[7]),
      noOfBugs: toNumber_(row[8], 0),
      bugsDescription: trimStr_(row[9])
    });
  }
  return out;
}

/**
 * Public: get normalized task rows for a single member.
 *
 * @param {string} memberName One of MEMBER_SHEETS.
 * @return {!Array<!Object>} Array of normalized task objects.
 */
function getMemberTasks(memberName) {
  return withCache_('getMemberTasks', [memberName], function () {
    return readMemberRows_(memberName);
  });
}

/**
 * Public: get tasks for every member.
 *
 * @return {!Object<string, !Array<!Object>>}
 */
function getAllTasks() {
  return withCache_('getAllTasks', [], function () {
    var result = {};
    for (var i = 0; i < MEMBER_SHEETS.length; i++) {
      var name = MEMBER_SHEETS[i];
      try {
        result[name] = readMemberRows_(name);
      } catch (err) {
        try {
          Logger.log('getAllTasks: skipping member "' + name + '" - ' +
            (err && err.message ? err.message : err));
        } catch (logErr) { /* Logger may be unavailable in some contexts. */ }
        result[name] = [];
      }
    }
    return result;
  });
}

/**
 * Compute a summary object from an already-normalized rows array.
 *
 * @private
 * @param {string} memberName
 * @param {!Array<!Object>} rows
 * @return {!Object}
 */
function summarize_(memberName, rows) {
  var totalTasks = rows.length;
  var totalHours = 0;
  var billableHours = 0;
  var completedCount = 0;
  var inProgressCount = 0;
  var otherCount = 0;
  var totalBugs = 0;
  var clients = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    totalHours += toNumber_(r.hours, 0);
    // The sheet's Billability column stores literal 'YES' / 'NO',
    // upper-cased on read by upperTrim_(). Match that exactly.
    if (r.billability === 'YES') {
      billableHours += toNumber_(r.hours, 0);
    }
    if (r.status === 'COMPLETED') completedCount++;
    else if (r.status === 'IN-PROGRESS' || r.status === 'IN PROGRESS') inProgressCount++;
    else otherCount++;
    totalBugs += toNumber_(r.noOfBugs, 0);
    if (r.client) clients[r.client] = true;
  }
  var distinctClients = 0;
  for (var k in clients) if (Object.prototype.hasOwnProperty.call(clients, k)) distinctClients++;
  return {
    member: memberName,
    totalTasks: totalTasks,
    totalHours: round2_(totalHours),
    billableHours: round2_(billableHours),
    completedCount: completedCount,
    inProgressCount: inProgressCount,
    otherCount: otherCount,
    totalBugs: totalBugs,
    distinctClients: distinctClients
  };
}

/**
 * @private
 * @param {number} n
 * @return {number}
 */
function round2_(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Public: per-member summary KPIs.
 *
 * @param {string} memberName
 * @return {!Object}
 */
function getMemberSummary(memberName) {
  return withCache_('getMemberSummary', [memberName], function () {
    var rows = readMemberRows_(memberName);
    return summarize_(memberName, rows);
  });
}

/**
 * Public: array of summaries (one per member) plus an aggregate
 * 'totals' row covering the whole team.
 *
 * @return {!Array<!Object>}
 */
function getAllSummaries() {
  return withCache_('getAllSummaries', [], function () {
    var summaries = [];
    var totals = {
      member: 'totals',
      totalTasks: 0,
      totalHours: 0,
      billableHours: 0,
      completedCount: 0,
      inProgressCount: 0,
      otherCount: 0,
      totalBugs: 0,
      distinctClients: 0
    };
    var allClients = {};
    for (var i = 0; i < MEMBER_SHEETS.length; i++) {
      var name = MEMBER_SHEETS[i];
      var rows;
      try {
        rows = readMemberRows_(name);
      } catch (err) {
        try {
          Logger.log('getAllSummaries: skipping member "' + name + '" - ' +
            (err && err.message ? err.message : err));
        } catch (logErr) { /* Logger may be unavailable. */ }
        rows = [];
      }
      var s = summarize_(name, rows);
      summaries.push(s);
      totals.totalTasks += s.totalTasks;
      totals.totalHours += s.totalHours;
      totals.billableHours += s.billableHours;
      totals.completedCount += s.completedCount;
      totals.inProgressCount += s.inProgressCount;
      totals.otherCount += s.otherCount;
      totals.totalBugs += s.totalBugs;
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].client) allClients[rows[j].client] = true;
      }
    }
    var distinctAll = 0;
    for (var c in allClients) if (Object.prototype.hasOwnProperty.call(allClients, c)) distinctAll++;
    totals.distinctClients = distinctAll;
    totals.totalHours = round2_(totals.totalHours);
    totals.billableHours = round2_(totals.billableHours);
    summaries.push(totals);
    return summaries;
  });
}

/**
 * Public: data shaped for the dashboard charts.
 *
 *  - hoursPerMember: bar chart input [{member, hours}]
 *  - statusBreakdown: donut/pie [{label, value}] for COMPLETED,
 *    IN-PROGRESS and OTHER (anything not COMPLETED /
 *    IN-PROGRESS / IN PROGRESS, including blanks) across the team
 *  - hoursPerDay: line chart, both per-member and 'all' aggregate
 *  - billableSplit: { billable, nonBillable } total hours.
 *  - bugsPerMember: [{member, bugs}]
 *
 * @return {!Object}
 */
function getChartData() {
  return withCache_('getChartData', [], function () {
    var hoursPerMember = [];
    var bugsPerMember = [];
    var hoursPerDay = { all: [] };
    var allDayMap = {};
    var statusCounts = { COMPLETED: 0, 'IN-PROGRESS': 0, OTHER: 0 };
    var billable = 0;
    var nonBillable = 0;

    for (var i = 0; i < MEMBER_SHEETS.length; i++) {
      var name = MEMBER_SHEETS[i];
      var rows;
      try {
        rows = readMemberRows_(name);
      } catch (err) {
        try {
          Logger.log('getChartData: skipping member "' + name + '" - ' +
            (err && err.message ? err.message : err));
        } catch (logErr) { /* Logger may be unavailable. */ }
        rows = [];
      }
      var memHours = 0;
      var memBugs = 0;
      var memDayMap = {};
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        var h = toNumber_(r.hours, 0);
        memHours += h;
        memBugs += toNumber_(r.noOfBugs, 0);
        if (r.billability === 'YES') billable += h;
        else nonBillable += h;
        if (r.status === 'COMPLETED') {
          statusCounts.COMPLETED++;
        } else if (r.status === 'IN-PROGRESS' || r.status === 'IN PROGRESS') {
          statusCounts['IN-PROGRESS']++;
        } else {
          statusCounts.OTHER++;
        }
        if (r.date) {
          memDayMap[r.date] = (memDayMap[r.date] || 0) + h;
          allDayMap[r.date] = (allDayMap[r.date] || 0) + h;
        }
      }
      hoursPerMember.push({ member: name, hours: round2_(memHours) });
      bugsPerMember.push({ member: name, bugs: memBugs });
      hoursPerDay[name] = mapToSortedSeries_(memDayMap);
    }
    hoursPerDay.all = mapToSortedSeries_(allDayMap);

    return {
      hoursPerMember: hoursPerMember,
      statusBreakdown: [
        { label: 'COMPLETED', value: statusCounts.COMPLETED },
        { label: 'IN-PROGRESS', value: statusCounts['IN-PROGRESS'] },
        { label: 'OTHER', value: statusCounts.OTHER }
      ],
      hoursPerDay: hoursPerDay,
      billableSplit: {
        billable: round2_(billable),
        nonBillable: round2_(nonBillable)
      },
      bugsPerMember: bugsPerMember
    };
  });
}

/**
 * Convert a {date: hours} map to a sorted [{date, hours}] series.
 * @private
 * @param {!Object<string, number>} map
 * @return {!Array<{date:string, hours:number}>}
 */
function mapToSortedSeries_(map) {
  var keys = [];
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) keys.push(k);
  }
  keys.sort();
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    out.push({ date: keys[i], hours: round2_(map[keys[i]]) });
  }
  return out;
}
