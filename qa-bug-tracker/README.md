# CC Digital · QA Bug Tracker

An interactive, 3D-animated **Bug Tracking dashboard** built on top of the 17-column
*QA Error Tracker* Google Sheet. It ships in two forms:

| Build | Folder | Data source | Use it for |
|-------|--------|-------------|------------|
| **Apps Script web app** | [`appscript/`](appscript) | Live Google Sheet (cached) | The real, always-up-to-date tool |
| **Standalone demo** | [`demo/`](demo) | Embedded sample rows | A no-setup preview you can open in a browser / view on GitHub |

> The two builds share **one source of truth**: `demo/app.js` (logic) and the CSS in
> `demo/index.html`. The Apps Script `JavaScript.html` / `Stylesheet.html` are generated
> from those files, so the demo looks and behaves exactly like the live app.

---

## ✨ Features

- **Sticky header with 5 menus** — Dashboard · QA Resources · Clients · Master Table · Analytics (with scroll-spy active highlighting + light/dark toggle).
- **Interactive animated banner** — live particle-network canvas + parallax 3D orbs that react to the mouse (no external GIF/video dependency, so it loads instantly).
- **Dashboard** — animated count-up KPI cards (records, issues, rounds, clients, resources, avg issues/record).
- **QA Resource workload** — every QA engineer gets their **own section & task cards**, plus a **dropdown filter** (one resource or all) and sort options.
- **Client-wise bugs** — per-client 3D tilt cards with issue/record/round counts and a click-through breakdown modal.
- **Master Records table** — mirrors the sheet exactly (all 17 columns) with:
  global search, per-column sort, Client / QA / Month / QA-Type filters, page-size control, pagination, **CSV export**, sticky headers, severity color coding and clickable Bug Report links.
- **Analytics** — pure SVG/CSS bar + donut charts (issues by client, QA resource, month, QA type).
- **Footer** — QA Lead card + the 5-member QA team.
- **De-duplication + case-normalization** — repeated rows are dropped and values that differ only by case/spacing (e.g. `Humana`/`humana`, `Yogesh Kumar D`/`Yogesh kumar d`) are merged into the most-common spelling, so resources/clients don't split into phantom groups.
- **Multi-sheet** — combine several tabs (e.g. `2025` + `2026`) into one view; a **Sheet** filter appears automatically in the master table when more than one source is loaded.
- **Fast data reflecting** — server-side chunked caching + a single round-trip load + 100% client-side filtering/sorting for instant interaction.

---

## 🗂️ The 17 columns

`S NO` · `Month` · `Received Date` · `Client` · `Project` · `Project ID` · `Requestor` ·
`QA Resource` · `Production Resource` · `Email subject line` · `Type of QA` ·
`QA Delivery date` · `Error description` · `Comments` · `Number of Rounds` ·
`Number of issues` · `Bug Report`

Headers are matched by name (see `HEADER_MAP` in `Code.gs`), so reordering columns in the
sheet will not break the app.

---

## 🚀 Deploy the Apps Script web app

1. Open your tracker Google Sheet → **Extensions → Apps Script**.
2. In the editor create four files and paste the matching contents from [`appscript/`](appscript):
   - `Code.gs`
   - `Index.html`
   - `Stylesheet.html`
   - `JavaScript.html`
   *(Apps Script HTML files are created as “HTML”; the `.html` is implied.)*
3. Open `Code.gs` and edit **`CONFIG`**:
   - `SHEETS` → array of tab name(s) holding the data, e.g. `['2026']` or `['2025', '2026']` to **combine multiple sheets**. Leave `[]` to use the active tab.
   - `QA_LEAD` and the 5 `TEAM` members (names / roles / emails).
4. **Deploy → New deployment → Web app**
   - *Execute as:* **Me**
   - *Who has access:* your choice (e.g. *Anyone in your org*).
   - **Deploy** and open the web-app URL.
5. After large edits, use the **“QA Tracker ▸ Refresh data cache”** menu in the sheet
   (added automatically on open) to clear the cache instantly.

### 🔗 Combining data from more than one sheet/tab

Set `CONFIG.SHEETS` to the list of tabs you want to merge:

```js
SHEETS: ['2025', '2026'],   // both tabs are read, combined and de-duplicated
```

- Every listed tab must use the **same header row** and column names (matched by `HEADER_MAP`).
- Rows are merged, then **de-duplicated** (case-insensitive, ignoring `S NO`).
- Each record is tagged with its source tab, and a **“All Sheets” filter** appears in the
  master table so you can narrow to one tab.
- Tabs in the list that don't exist are skipped (not an error).

> Want data from a **different spreadsheet file** (not just another tab)? Open that file's ID
> and read it with `SpreadsheetApp.openById('FILE_ID').getSheetByName('Tab')` inside
> `getBugData()` — the rest of the pipeline is unchanged.

---

## 👀 View the demo (GitHub HTML link)

The `demo/` build is self-contained and renders from a CDN that serves the raw files:

- **Live render (this branch):**
  https://raw.githack.com/israjethro/Hello_World/feature/qa-bug-tracker/qa-bug-tracker/demo/index.html
- **Live render (after merge to master):**
  https://raw.githack.com/israjethro/Hello_World/master/qa-bug-tracker/demo/index.html
- **Source:** [`demo/index.html`](demo/index.html)

> `raw.githack.com` serves the raw GitHub file with the correct `text/html` content-type so
> it renders as a page. The plain `raw.githubusercontent.com` URL shows source text only.

---

## 🛠️ Regenerate the Apps Script partials

If you change `demo/app.js` or the CSS in `demo/index.html`, regenerate the partials:

```bash
{ echo '<style>'; awk '/<style>/{f=1;next} /<\/style>/{f=0} f' demo/index.html; echo '</style>'; } > appscript/Stylesheet.html
{ echo '<script>'; cat demo/app.js; echo '</script>'; } > appscript/JavaScript.html
```

---

## 📁 Structure

```
qa-bug-tracker/
├── README.md
├── appscript/            # Google Apps Script web app (live data)
│   ├── appsscript.json
│   ├── Code.gs
│   ├── Index.html
│   ├── Stylesheet.html   # generated from demo CSS
│   └── JavaScript.html   # generated from demo/app.js
└── demo/                 # standalone preview (sample data)
    ├── index.html
    ├── app.js
    └── data.sample.js
```
