# QA - Daily Status Dashboard (Google Apps Script)

A Google Apps Script web app that reads the QA team's daily-status
Google Sheet (one tab per QA: Isra, Sowmiya, Keerthana, Yogesh,
Tamizharasi) and renders an interactive dashboard with KPI cards,
charts, and a sortable / searchable task table.

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

In the Apps Script editor, create the files in this order. (Order is
not strictly required for execution, but creating them in this order
makes the manifest available before HTML files reference it.)

1. `appsscript.json` - manifest. Visible only after enabling
   **Project Settings > Show "appsscript.json" manifest file in
   editor**. Replace the default with the contents of
   `apps-script/appsscript.json`.
2. `Code.gs` - entry point: `doGet`, `include` helper,
   `SPREADSHEET_ID`, `MEMBER_SHEETS`, `getMembers`, `getConfig`.
3. `DataService.gs` - sheet read, normalization, aggregation, chart
   shaping. All public functions are cached for 60 seconds via
   `CacheService`.
4. `Index.html` - main page shell (added in FEAT-002).
5. `Banner.html` - hero / member buttons partial (added in FEAT-002).
6. `Stylesheet.html` - `<style>` block partial (added in FEAT-002).
7. `Javascript.html` - `<script>` block partial (added in FEAT-002).

> The four HTML files are introduced by FEAT-002. After FEAT-001
> alone the project will not yet render a page; the server-side
> foundation is what FEAT-001 ships.

## Deploy

Once the files are in place:

1. Click **Deploy > New deployment**.
2. For **Select type**, click the gear icon and pick **Web app**.
3. Fill in:
   - **Description**: `QA - Daily Status Dashboard`
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
- `https://www.googleapis.com/auth/script.external_request` - load
  the ECharts library from its CDN at view time.

These are declared in `appsscript.json` so the consent screen lists
them up-front instead of prompting on first call.

## Cache TTL

`DataService.gs` routes every public read through
`CacheService.getScriptCache()` with a TTL of **60 seconds** keyed
by function name + arguments. This keeps the dashboard snappy when
five users open it back-to-back, but means a fresh edit to the sheet
can take up to 60 seconds to appear.

To bust the cache immediately:

- Open the Apps Script editor.
- Make any trivial edit to `DataService.gs` (e.g. add and remove a
  space) and **Save**, then redeploy.
  Saving invalidates the script cache and serves a fresh read on the
  next request.
- Alternatively, run `CacheService.getScriptCache().removeAll([...])`
  from the editor with the cache keys you want cleared.

## Optional: clasp

`clasp` is **not required**. If you want to manage this project from
the command line, copy `.clasp.json.example` to `.clasp.json` and
fill in your script ID. See https://github.com/google/clasp.
