# Listserver Page Spec

A listserver page is a **single self-contained HTML file** dropped into `pages/`.
The server handles routing (`/p/<slug>`), state persistence (`/api/state/<slug>`),
and upload. The page only needs to implement UI and talk to the API.

---

## File naming

`pages/<slug>.html` — slug must match `[a-z0-9-]+`.
Examples: `car-camping.html`, `bikepacking.html`, `road-trip-37d.html`

---

## State API

```
GET  /api/state/:slug   → returns JSON array (sections) or null on first load
POST /api/state/:slug   ← body: full sections array, saves to /data/:slug.json
```

The page is responsible for falling back to `initialData` when GET returns null.

---

## Data model

```js
// Top level: array of sections
[
  {
    id: 'shelter',          // unique string, no spaces
    title: 'Shelter & Sleep',
    icon: '🏕️',
    collapsed: false,       // persisted per session
    items: [
      {
        id: 's1',           // unique string within section
        text: 'Rainfly / tarp',
        tag: 'critical',    // 'critical' | 'note' | null
        checked: false
      }
    ]
  }
]
```

**Tags:**
- `'critical'` — red badge, `⚠ critical`
- `'note'`     — amber badge, `💡 tip`
- `null`       — no badge

---

## Visual design

### Fonts
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
```

### CSS variables
```css
:root {
  --ink:          #1a1a18;
  --paper:        #f5f2eb;
  --muted:        #8a8778;
  --rule:         #d4cfc0;
  --green:        #3d6b4f;
  --green-light:  #e8f0eb;
  --amber:        #c47c2b;
  --red:          #b84040;
  --bg:           #ece9e0;
}
```

Body background: `--bg`. Section cards: `--paper` on `--rule` border.
Headers / labels: `IBM Plex Mono`. Body text: `IBM Plex Sans`.

---

## Required page structure

### `<header>` (sticky, `background: var(--ink)`, `border-bottom: 3px solid var(--amber)`)
- `<h1>` — list title in `--amber`, uppercase mono
- `<p>` — subtitle (trip context, people, dogs etc.)
- Progress bar: `div.progress-bar > div.progress-fill` (width % driven by JS)
- Progress label: `checked / total packed`

### Controls bar (`background: var(--paper)`)
- Filter buttons: **All**, **⚠ Critical**, **Unpacked** (add more as needed)
- `← Lists` anchor linking back to `/`

### Sections container
Each section:
```
div.section[.collapsed]
  div.section-header  (onclick toggleSection)
    .section-icon  .section-title  .section-count  .section-toggle (▾, rotates when collapsed)
  div.items
    div.item[.checked]  (onclick toggleItem)
      div.item-check   (shows ✓ when checked)
      span.item-text
      span.item-tag.tag-critical | .tag-note   (if tag set)
    div.add-item-form[.visible]   (hidden by default)
      input + button
    button.section-add-btn   (toggles add-item-form)
```

---

## Required JavaScript

### Constants
```js
const PAGE_ID = 'your-slug';   // must match filename without .html
```

### State functions
```js
async function loadState() {
  try {
    const res = await fetch(`/api/state/${PAGE_ID}`);
    if (res.ok) { const r = await res.json(); if (r && Array.isArray(r) && r.length) return r; }
  } catch {}
  return null;
}

let saveTimeout = null;
function saveState(d) {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await fetch(`/api/state/${PAGE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      });
    } catch {}
  }, 400);   // 400ms debounce
}
```

### Required functions
| Function | Description |
|---|---|
| `toggleItem(sectionId, itemId)` | Flip `checked`, call `saveState`, call `render` |
| `toggleSection(sectionId)` | Flip `collapsed`, call `saveState`, call `render` |
| `addItem(sectionId, text)` | Push new item `{id, text, tag:null, checked:false}`, save, render |
| `setFilter(filter, btn)` | Set `activeFilter`, toggle `.active` class on buttons, render |
| `render()` | Re-render all sections + update progress bar |

### Boot
```js
(async () => {
  const remote = await loadState();
  if (remote) data = remote;
  render();
})();
```

---

## Minimal page template

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My List</title>
<style>
  /* paste full CSS here */
</style>
</head>
<body>
<header>
  <h1>My List</h1>
  <p>context · people · trip length</p>
  <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
  <div class="progress-label" id="progressLabel">0 / 0 packed</div>
</header>
<div class="controls">
  <button class="filter-btn active" onclick="setFilter('all',this)">All</button>
  <button class="filter-btn" onclick="setFilter('critical',this)">⚠ Critical</button>
  <button class="filter-btn" onclick="setFilter('unpacked',this)">Unpacked</button>
  <a class="home-btn" href="/">← Lists</a>
</div>
<div class="sections" id="sectionsContainer"></div>
<script>
const PAGE_ID = 'my-list';
const initialData = [ /* sections here */ ];
let data = JSON.parse(JSON.stringify(initialData));
let activeFilter = 'all';

/* paste loadState, saveState, toggleItem, toggleSection,
   addItem, setFilter, tagLabel, render functions here */

(async () => { const r = await loadState(); if (r) data = r; render(); })();
</script>
</body>
</html>
```

---

## Checklist for a new page

- [ ] `PAGE_ID` matches filename (without `.html`)
- [ ] All section and item `id` values are unique
- [ ] State fetched from `/api/state/${PAGE_ID}`
- [ ] Falls back to `initialData` if null
- [ ] Save debounced at 400ms
- [ ] `← Lists` link present pointing to `/`
- [ ] Tags only `'critical'`, `'note'`, or `null`

---

## KV Store API

Each page/app gets an isolated key-value store identified by its slug.
Values are any JSON — objects, arrays, strings, numbers.

```
GET    /api/kv/:slug            → { key: value, … }   full store
GET    /api/kv/:slug/:key       → value                single key (404 if missing)
POST   /api/kv/:slug/:key       ← any JSON body        upsert key
DELETE /api/kv/:slug/:key       → { ok }               remove key
DELETE /api/kv/:slug            → { ok }               wipe entire store
```

### Usage from a page

```js
const APP = 'my-app';

// Read a key
const res = await fetch(`/api/kv/${APP}/settings`);
const settings = res.ok ? await res.json() : {};

// Write a key
await fetch(`/api/kv/${APP}/settings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ theme: 'dark', lang: 'sv' })
});

// Delete a key
await fetch(`/api/kv/${APP}/temp`, { method: 'DELETE' });
```

### Multiple isolated slices (e.g. a kanban)

```js
// Save columns separately — other keys are untouched
await post(`/api/kv/kanban/todo`,   todoItems);
await post(`/api/kv/kanban/doing`,  doingItems);
await post(`/api/kv/kanban/done`,   doneItems);
await post(`/api/kv/kanban/config`, { darkMode: true });
```

### Legacy blob compat

Packing list pages use `/api/state/:slug` — still works, stored as key `__blob`.
New pages should prefer `/api/kv/:slug/:key`.

---

## Uploading files

Any of these file types can be dropped on the index upload zone or POSTed to `/upload`:

`html` `css` `js` `json` `md` `txt` `svg` `png` `jpg` `jpeg` `ico` `woff2` `woff`

- `.html`, `.md`, `.txt` → shown as page cards on the index (clickable, open in browser)
- Everything else → shown as assets (linked, deletable)
- Files are served at `/p/<filename>` with correct Content-Type
- Filename is slugified on upload (lowercase, special chars → `-`)

Delete any file from the index UI or via:
```
DELETE /delete/:filename
```
