# QA-Tasks History (Google Apps Script)

A Google Apps Script web app that renders the **QA-Tasks History**
dashboard from the QA team's daily-status Google Sheet (one tab per
QA: Isra, Sowmiya, Keerthana, Yogesh, Tamizharasi). The page shows
KPI cards, charts, a sortable / searchable task table, and three
breakdown tables with CSV download.

This folder is a self-contained Apps Script project. There is no
local build step. Source files in this folder are uploaded as-is to
script.google.com (manually or via clasp) and executed by Google's
Apps Script runtime.

## Two ways to deploy

### Option A: Bound to the QA sheet (recommended)

Use this when you own the QA - Daily Status Google Sheet.

1. Open the QA - Daily Status spreadsheet in your browser.
2. From the menu, choose `Extensions > Apps Script`. A new
   bound-script project opens.
3. Create the files listed in **File order** below and paste in the
   contents from this folder.
4. In `Code.gs`, leave `SPREADSHEET_ID = ''` empty - because the
   script is bound, `SpreadsheetApp.getActiveSpreadsheet()` already
   returns the right sheet.
5. Save, then deploy (see **Deploy** below).

### Option B: Standalone

Use this when the script lives in its own Apps Script project (not
attached to any sheet).

1. Visit https://script.google.com and click `New project`.
2. Create the files listed in **File order** below and paste in the
   contents from this folder.
3. In `Code.gs`, set `SPREADSHEET_ID` to the ID of the QA sheet.
   The ID is the segment of the sheet URL between `/d/` and `/edit`,
   for example:
   `https://docs.google.com/spreadsheets/d/`**`1AbCdEf...XyZ`**`/edit`.
4. Save, then deploy (see **Deploy** below).

## File order

After the consolidation refactor the project is exactly two source
files plus the manifest. In the Apps Script editor, create them in
this order:

1. `appsscript.json` - manifest. Visible only after enabling
   **Project Settings > Show "appsscript.json" manifest file in
   editor**. Replace the default with the contents of
   `apps-script/appsscript.json`.
2. `Code.gs` - server-side logic: `doGet`, `SPREADSHEET_ID`,
   `MEMBER_SHEETS`, `getMembers`, `getConfig`, sheet I/O,
   normalization, aggregation and chart shaping. All public reads
   are cached for 60 seconds via `CacheService`.
3. `History.html` - the entire client (CSS + markup + script in one
   file). Loaded by `doGet` via
   `HtmlService.createHtmlOutputFromFile('History')`.

## Breakdown tables

Below the main daily-tasks table, the page renders three additional
tables for cross-checking the totals:

- **Client-wise summary** - one row per distinct client with task
  count, total / billable / non-billable hours, status counts and
  bugs.
- **Billable tasks** - all rows where `Billability` is `YES`.
- **Non-Billable tasks** - all rows where `Billability` is anything
  other than `YES`.

Each table has a small CSV download button in its header that
exports the currently-visible rows (search and member filter
applied) as a `.csv` file.

## Deploy

Once the files are in place:

1. Click **Deploy > New deployment**.
2. For **Select type**, click the gear icon and pick **Web app**.
3. Fill in:
   - **Description**: `QA-Tasks History`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone with Google account`
4. Click **Deploy**. Apps Script will prompt you to authorize the
   OAuth scopes listed below the first time you deploy.
5. Copy the **Web app URL** that is shown after deployment - that is
   the dashboard link.

To ship updates after editing source files, use
**Deploy > Manage deployments**, pick the existing deployment, click
the pencil icon, change **Version** to `New version`, then **Deploy**.

## Updating the team list

The five QA tab names live in **one** place: the `MEMBER_SHEETS`
constant in `Code.gs`.

```js
var MEMBER_SHEETS = ['Isra', 'Sowmiya', 'Keerthana', 'Yogesh', 'Tamizharasi'];
```

Edit that array, save, redeploy. The banner buttons, KPI cards,
chart series and table filters are all generated from
`getMembers()` / `getConfig()` on the client, so they pick up the
change automatically. No HTML edits are required.

A new member also needs a new tab in the spreadsheet whose name
matches the entry in `MEMBER_SHEETS` exactly (case-sensitive). The
tab must follow the same row-1-title / row-2-header layout as the
existing tabs.

## Required OAuth scopes

The first deployment will prompt the user to authorize:

- `https://www.googleapis.com/auth/spreadsheets.currentonly` - read
  the bound sheet (Option A).
- `https://www.googleapis.com/auth/spreadsheets.readonly` - read the
  configured sheet by ID (Option B).
- `https://www.googleapis.com/auth/script.container.ui` - render the
  dashboard inside the host UI.

These are declared in `appsscript.json` so the consent screen lists
them up-front instead of prompting on first call.

> Note: ECharts and the Google Font are loaded from public CDNs by
> the user's browser at view time. Those fetches do not go through
> Apps Script and therefore do not require the
> `script.external_request` scope (which only governs server-side
> `UrlFetchApp` calls). The scope is intentionally **not** declared.

## Security and access

The default `appsscript.json` declares the web app as:

```json
"webapp": {
  "access": "ANYONE_WITH_GOOGLE",
  "executeAs": "USER_DEPLOYING"
}
```

and `Code.gs` calls
`HtmlService.XFrameOptionsMode.ALLOWALL` on the rendered page.

What that means for the QA team data:

- **Anyone with a Google account** who learns the deployment URL can
  open the dashboard.
- The page runs **as the deployer**, so it can read the QA sheet
  even for viewers who do not have direct access to the spreadsheet.
- The page can be **embedded in an iframe from any origin** (handy
  for pasting into a Sites/Confluence/Notion page, but it also means
  anyone who copies the URL can frame the dashboard).

This is permissive on purpose - the dashboard is meant to be easy to
share inside the team. To tighten it for a more sensitive deployment:

| Goal | Change |
| --- | --- |
| Restrict to deployer only | `appsscript.json` -> `webapp.access` = `MYSELF` |
| Restrict to a Google Workspace domain | `webapp.access` = `DOMAIN` (works only for paid Workspace deployments) |
| Run as the viewer (so each user must have access to the sheet) | `webapp.executeAs` = `USER_ACCESSING` |
| Block iframe embedding | `Code.gs` -> change `setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)` to `setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT)` |

After changing any of the above, redeploy a new version for the
change to take effect.

## Cache TTL

`Code.gs` routes every public read through
`CacheService.getScriptCache()` with a TTL of **60 seconds** keyed
by function name + arguments. This keeps the dashboard snappy when
five users open it back-to-back, but means a fresh edit to the sheet
can take up to 60 seconds to appear.

To bust the cache immediately:

- **Wait it out.** Entries expire after 60 seconds; the next request
  reads fresh from the sheet. Saving or redeploying the script does
  **not** clear `CacheService` - those entries persist until TTL
  expiry or an explicit `removeAll`.
- **Clear it from the editor.** In the Apps Script editor, run a
  one-line function such as:

  ```js
  function clearDashboardCache() {
    CacheService.getScriptCache().removeAll([
      'getMembers::[]',
      'getAllTasks::[]',
      'getAllSummaries::[]',
      'getChartData::[]'
    ]);
  }
  ```

  (Per-member keys look like `getMemberTasks::["Isra"]` etc.)
- **Lower `CACHE_TTL_SECONDS_`** at the top of `Code.gs` and
  redeploy if you want shorter caching during active sheet edits.

## Optional: clasp

`clasp` is **not required**. If you want to manage this project from
the command line, copy `.clasp.json.example` to `.clasp.json` and
fill in your script ID. See https://github.com/google/clasp.
