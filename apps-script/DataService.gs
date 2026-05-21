/**
 * DataService.gs - Sheet I/O, normalization, aggregation and
 * chart-shaping for the "QA - Daily Status Dashboard".
 *
 * All public server functions in this file are wrapped through
 * CacheService.getScriptCache() with a 60-second TTL, keyed by
 * function name plus arguments. On cache miss we read fresh from
 * the spreadsheet and store the JSON; on any error we fall through
 * to a fresh read so that a transient failure cannot poison the
 * cache and block the UI on subsequent requests.
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
 * @private
 * @param {Array} row
 * @return {boolean} True when every cell in columns A..J is blank.
 */
function isEmptyRow_(row) {
  for (var i = 0; i < ROW_WIDTH_ && i < row.length; i++) {
    var v = row[i];
    if (v !== '' && v !== null && v !== undefined) {
      // Treat whitespace-only strings as empty, too.
      if (typeof v === 'string') {
        if (v.trim().length > 0) return false;
      } else {
        return false;
      }
    }
  }
  return true;
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
        // Surface a tab-missing problem to the UI per-member rather
        // than failing the whole dashboard.
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
  var totalBugs = 0;
  var clients = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    totalHours += toNumber_(r.hours, 0);
    if (r.billability === 'BILLABLE') {
      billableHours += toNumber_(r.hours, 0);
    }
    if (r.status === 'COMPLETED') completedCount++;
    else if (r.status === 'IN-PROGRESS' || r.status === 'IN PROGRESS') inProgressCount++;
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
        rows = [];
      }
      var s = summarize_(name, rows);
      summaries.push(s);
      totals.totalTasks += s.totalTasks;
      totals.totalHours += s.totalHours;
      totals.billableHours += s.billableHours;
      totals.completedCount += s.completedCount;
      totals.inProgressCount += s.inProgressCount;
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
 *  - statusBreakdown: donut/pie [{label, value}] for COMPLETED vs
 *    IN-PROGRESS across the whole team
 *  - hoursPerDay: line chart, both per-member and 'all' aggregate
 *  - billableSplit: { billable, nonBillable } total hours
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
    var statusCounts = { COMPLETED: 0, 'IN-PROGRESS': 0 };
    var billable = 0;
    var nonBillable = 0;

    for (var i = 0; i < MEMBER_SHEETS.length; i++) {
      var name = MEMBER_SHEETS[i];
      var rows;
      try {
        rows = readMemberRows_(name);
      } catch (err) {
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
        if (r.billability === 'BILLABLE') billable += h;
        else if (r.billability) nonBillable += h;
        if (r.status === 'COMPLETED') statusCounts.COMPLETED++;
        else if (r.status === 'IN-PROGRESS' || r.status === 'IN PROGRESS') {
          statusCounts['IN-PROGRESS']++;
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
        { label: 'IN-PROGRESS', value: statusCounts['IN-PROGRESS'] }
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
