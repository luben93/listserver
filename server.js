import express from 'express';
import {
  readFileSync, writeFileSync, existsSync,
  readdirSync, mkdirSync, unlinkSync, statSync
} from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname, basename } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const PAGES_DIR = join(__dirname, 'pages');
const DATA_DIR  = process.env.DATA_DIR ?? join(__dirname, 'data');
const SPEC_PATH = join(__dirname, 'SPEC.md');

mkdirSync(PAGES_DIR, { recursive: true });
mkdirSync(DATA_DIR,  { recursive: true });

app.use('/api', express.json({ limit: '8mb' }));

// ── MIME types for static assets ─────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.pdf':  'application/pdf',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.zip':  'application/zip',
};

// No whitelist — any extension is uploadable. Unknown types are served as
// application/octet-stream (browser downloads them rather than rendering).
function mimeFor(ext) { return MIME[ext] || 'application/octet-stream'; }

// Which extensions get a card on the index (entry-point pages)
const PAGE_EXT = new Set(['.html', '.md', '.txt']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeSlug(s) { return /^[a-z0-9_.-]+$/.test(s); }

function listFiles() {
  return readdirSync(PAGES_DIR).map(f => ({
    name: f,
    ext:  extname(f),
    slug: basename(f, extname(f)),
    size: statSync(join(PAGES_DIR, f)).size,
  }));
}

// KV store — one JSON file per app slug, keys are arbitrary strings
function kvFile(slug) { return join(DATA_DIR, `${slug}.json`); }

function kvRead(slug) {
  const p = kvFile(slug);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

function kvWrite(slug, store) {
  writeFileSync(kvFile(slug), JSON.stringify(store, null, 2), 'utf8');
}

// ── Index ─────────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  const files  = listFiles();
  const pages  = files.filter(f => PAGE_EXT.has(f.ext));
  const assets = files.filter(f => !PAGE_EXT.has(f.ext));

  const pageCards = pages.map(f => `
    <div class="card">
      <a class="card-main" href="/p/${f.name}">
        <span class="card-icon">${f.ext === '.html' ? '📄' : f.ext === '.md' ? '📝' : '📃'}</span>
        <span class="card-name">${f.name}</span>
        <span class="card-meta">${(f.size/1024).toFixed(1)} KB</span>
        <span class="card-arrow">→</span>
      </a>
      <button class="card-update" title="Upload a new version of ${f.name}" onclick="updateFile('${f.name}')">⟳</button>
      <button class="card-del" title="Delete ${f.name}" onclick="del('${f.name}', true)">✕</button>
    </div>`).join('');

  const assetRows = assets.map(f => `
    <div class="asset-row">
      <span class="asset-name">${f.name}</span>
      <span class="asset-meta">${(f.size/1024).toFixed(1)} KB</span>
      <a class="asset-link" href="/p/${f.name}" target="_blank">↗</a>
      <button class="card-update" title="Upload a new version of ${f.name}" onclick="updateFile('${f.name}')">⟳</button>
      <button class="card-del" title="Delete ${f.name}" onclick="del('${f.name}')">✕</button>
    </div>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pages</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
  :root { --ink:#1a1a18; --paper:#f5f2eb; --muted:#8a8778; --rule:#d4cfc0; --green:#3d6b4f; --green-light:#e8f0eb; --amber:#c47c2b; --red:#b84040; --bg:#ece9e0; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'IBM Plex Sans',sans-serif; background:var(--bg); color:var(--ink); min-height:100vh; }
  header { background:var(--ink); color:var(--paper); padding:24px; border-bottom:3px solid var(--amber); }
  header h1 { font-family:'IBM Plex Mono',monospace; font-size:16px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--amber); }
  header p  { font-size:12px; color:#a09d94; font-family:'IBM Plex Mono',monospace; margin-top:4px; }
  main { max-width:640px; margin:0 auto; padding:24px 16px; }
  h2 { font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); margin-bottom:12px; margin-top:28px; }
  h2:first-child { margin-top:0; }
  .cards { display:flex; flex-direction:column; gap:8px; }
  .card { display:flex; align-items:center; gap:2px; background:var(--paper); border:1px solid var(--rule); border-radius:3px; padding:0 8px 0 0; transition:border-color 0.15s,background 0.15s; }
  .card:hover { border-color:var(--amber); background:#f0ede4; }
  .card-main { display:flex; align-items:center; gap:10px; flex:1; min-width:0; padding:13px 14px; text-decoration:none; color:var(--ink); }
  .card-icon { font-size:14px; }
  .card-name { font-family:'IBM Plex Mono',monospace; font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; }
  .card-meta { font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--muted); }
  .card-arrow { color:var(--amber); font-size:16px; }
  .card-update { background:none; border:none; color:var(--muted); cursor:pointer; font-size:15px; padding:4px 6px; }
  .card-update:hover { color:var(--amber); }
  .card-del { background:none; border:none; color:var(--red); cursor:pointer; font-size:14px; padding:4px 6px; }
  .card-del:hover { color:#8f2626; }
  .empty { font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--muted); padding:16px; background:var(--paper); border:1px solid var(--rule); border-radius:3px; }
  .asset-list { background:var(--paper); border:1px solid var(--rule); border-radius:3px; overflow:hidden; }
  .asset-row { display:flex; align-items:center; gap:10px; padding:9px 14px; border-bottom:1px solid var(--rule); font-size:13px; }
  .asset-row:last-child { border-bottom:none; }
  .asset-name { font-family:'IBM Plex Mono',monospace; font-size:12px; flex:1; }
  .asset-meta { font-family:'IBM Plex Mono',monospace; font-size:11px; color:var(--muted); }
  .asset-link { color:var(--amber); text-decoration:none; font-size:14px; }
  .upload-box { background:var(--paper); border:1px solid var(--rule); border-radius:3px; padding:20px; }
  .drop-zone { border:2px dashed var(--rule); border-radius:3px; padding:28px 16px; text-align:center; cursor:pointer; transition:border-color 0.15s,background 0.15s; margin-bottom:10px; }
  .drop-zone.dragover { border-color:var(--amber); background:var(--green-light); }
  .drop-zone p { font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--muted); margin-bottom:4px; }
  .drop-zone small { font-family:'IBM Plex Mono',monospace; font-size:10px; color:var(--muted); opacity:0.7; }
  .drop-zone input[type=file] { display:none; }
  .upload-btn { font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; background:var(--green); color:white; border:none; padding:8px 16px; border-radius:2px; cursor:pointer; width:100%; }
  .upload-btn:disabled { opacity:0.4; cursor:not-allowed; }
  .msg { margin-top:10px; font-family:'IBM Plex Mono',monospace; font-size:12px; }
  .msg.ok  { color:var(--green); }
  .msg.err { color:var(--red); }
  .spec-banner { display:flex; align-items:center; gap:14px; background:var(--green-light); border:1px solid var(--green); border-radius:3px; padding:14px 16px; margin-bottom:8px; }
  .spec-text { flex:1; display:flex; flex-direction:column; gap:2px; }
  .spec-text strong { font-family:'IBM Plex Mono',monospace; font-size:12px; letter-spacing:0.02em; }
  .spec-text span { font-size:12px; color:var(--muted); }
  .spec-actions { display:flex; gap:8px; flex-shrink:0; }
  .spec-link { font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; text-decoration:none; color:var(--green); border:1px solid var(--green); padding:6px 10px; border-radius:2px; white-space:nowrap; }
  .spec-link:hover { background:var(--green); color:white; }
  .spec-copy { font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; background:var(--green); color:white; border:none; padding:6px 10px; border-radius:2px; cursor:pointer; white-space:nowrap; }
</style>
</head>
<body>
<header>
  <h1>Pages</h1>
  <p>upload · serve · persist</p>
</header>
<main>
  <div class="spec-banner">
    <div class="spec-text">
      <strong>Building a new page?</strong>
      <span>Give an LLM this URL and it can generate a compatible page.</span>
    </div>
    <div class="spec-actions">
      <a class="spec-link" href="/spec" target="_blank">View spec ↗</a>
      <button class="spec-copy" onclick="copySpec()">Copy URL</button>
    </div>
  </div>

  <h2>Pages</h2>
  <div class="cards">
    ${pages.length ? pageCards : '<div class="empty">No pages yet — upload one below.</div>'}
  </div>

  ${assets.length ? `<h2>Assets</h2><div class="asset-list">${assetRows}</div>` : ''}

  <h2>Upload</h2>
  <div class="upload-box">
    <div class="drop-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
      <p id="dropLabel">Click or drag &amp; drop any file here</p>
      <small>html · css · js · json · md · pdf · png · jpg · mp4 · anything</small>
      <input type="file" id="fileInput">
    </div>
    <button class="upload-btn" id="uploadBtn" disabled>Upload</button>
    <div class="msg" id="msg"></div>
  </div>
</main>
<script>
  const drop = document.getElementById('dropZone');
  const input = document.getElementById('fileInput');
  const btn = document.getElementById('uploadBtn');
  const msg = document.getElementById('msg');
  const label = document.getElementById('dropLabel');
  let file = null;

  function setFile(f) {
    file = f;
    label.textContent = f.name;
    btn.disabled = false;
    msg.textContent = '';
  }

  input.addEventListener('change', () => input.files[0] && setFile(input.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragover'); e.dataTransfer.files[0] && setFile(e.dataTransfer.files[0]); });

  btn.addEventListener('click', async () => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    btn.disabled = true; msg.className='msg'; msg.textContent='Uploading…';
    try {
      const res = await fetch('/upload', { method:'POST', body:fd });
      const data = await res.json();
      if (res.ok) {
        msg.className='msg ok';
        msg.textContent = data.isPage ? 'Uploaded! Redirecting…' : 'Uploaded!';
        if (data.isPage) setTimeout(() => window.location='/p/'+data.name, 700);
        else setTimeout(() => window.location.reload(), 700);
      } else {
        msg.className='msg err'; msg.textContent=data.error||'Upload failed.'; btn.disabled=false;
      }
    } catch { msg.className='msg err'; msg.textContent='Network error.'; btn.disabled=false; }
  });

  async function del(name, isPage) {
    if (!confirm('Delete ' + name + (isPage ? ' and its saved data?' : '?'))) return;
    const res = await fetch('/delete/' + encodeURIComponent(name), { method:'DELETE' });
    if (res.ok && isPage) {
      // Clean up the page's KV/state store — the server only removes it if
      // no other page still uses the slug (?orphan=1 safeguard).
      const slug = name.replace(/\\.[^.]+$/, '');
      await fetch('/api/kv/' + encodeURIComponent(slug) + '?orphan=1', { method:'DELETE' }).catch(() => {});
    }
    if (res.ok) window.location.reload();
  }

  // Update-in-place: pick a file and upload it under the existing name,
  // so the URL/slug stays stable no matter what the new file is called.
  const updInput = document.createElement('input');
  updInput.type = 'file';
  let updateTarget = null;

  function updateFile(name) { updateTarget = name; updInput.click(); }

  updInput.addEventListener('change', async () => {
    const f = updInput.files[0];
    if (!f || !updateTarget) return;
    const fd = new FormData(); fd.append('file', f);
    msg.className = 'msg'; msg.textContent = 'Updating ' + updateTarget + '…';
    try {
      const res = await fetch('/upload?name=' + encodeURIComponent(updateTarget), { method:'POST', body:fd });
      const data = await res.json();
      if (res.ok) { msg.className='msg ok'; msg.textContent='Updated!'; setTimeout(() => window.location.reload(), 500); }
      else { msg.className='msg err'; msg.textContent = data.error || 'Update failed.'; }
    } catch { msg.className='msg err'; msg.textContent='Network error.'; }
    updInput.value = '';
  });

  function copySpec() {
    const url = window.location.origin + '/spec';
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.querySelector('.spec-copy');
      const old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = old, 1500);
    });
  }
</script>
</body>
</html>`);
});

// ── Serve any file in pages/ ──────────────────────────────────────────────────

app.get('/p/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!safeSlug(name)) return res.status(400).send('Invalid filename');
  const filePath = join(PAGES_DIR, name);
  if (!existsSync(filePath)) return res.status(404).send('Not found');
  const mime = mimeFor(extname(name));
  res.setHeader('Content-Type', mime);
  res.sendFile(filePath);
});

// ── Spec ──────────────────────────────────────────────────────────────────────
// Serves the page-authoring spec so an LLM (or you) can generate new pages
// that are compatible with this server without needing prior context.
// The server's own address is injected so generated pages/uploads point at
// the right place even behind Tailscale, a reverse proxy, or a custom domain.

app.get('/spec', (req, res) => {
  if (!existsSync(SPEC_PATH)) return res.status(404).send('SPEC.md not found — place it next to server.js');
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  let spec;
  try { spec = readFileSync(SPEC_PATH, 'utf8'); }
  catch { return res.status(500).send('Could not read SPEC.md'); }

  const banner = `> **This server's address:** \`${baseUrl}\`\n` +
    `> Use this as the base URL for all API calls and uploads below — e.g. \`${baseUrl}/api/kv/my-app/my-key\`, \`${baseUrl}/upload\`.\n\n`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.send(banner + spec);
});

app.get('/spec.md', (_req, res) => res.redirect('/spec'));

// ── KV Store API ──────────────────────────────────────────────────────────────
//
//  GET    /api/kv/:slug            → { key: value, … }   (full store)
//  GET    /api/kv/:slug/:key       → value (any JSON)
//  POST   /api/kv/:slug/:key       ← body: any JSON       → { ok }
//  DELETE /api/kv/:slug/:key       → { ok }
//  DELETE /api/kv/:slug            → { ok }  (wipe entire store)
//
//  Legacy blob compat (packing list pages use this):
//  GET    /api/state/:slug         → value of key "__blob" or null
//  POST   /api/state/:slug         ← body: any JSON → stored as "__blob"

app.get('/api/kv/:slug', (req, res) => {
  const { slug } = req.params;
  if (!safeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  res.json(kvRead(slug));
});

app.get('/api/kv/:slug/:key', (req, res) => {
  const { slug, key } = req.params;
  if (!safeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const store = kvRead(slug);
  if (!(key in store)) return res.status(404).json({ error: 'Key not found' });
  res.json(store[key]);
});

app.post('/api/kv/:slug/:key', (req, res) => {
  const { slug, key } = req.params;
  if (!safeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  try {
    const store = kvRead(slug);
    store[key] = req.body;
    kvWrite(slug, store);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Write failed' }); }
});

app.delete('/api/kv/:slug/:key', (req, res) => {
  const { slug, key } = req.params;
  if (!safeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  try {
    const store = kvRead(slug);
    delete store[key];
    kvWrite(slug, store);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Delete failed' }); }
});

app.delete('/api/kv/:slug', (req, res) => {
  const { slug } = req.params;
  if (!safeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  try {
    // ?orphan=1 → cleanup mode (used by the index after deleting a page):
    // remove the store file only if no page still uses this slug.
    if ('orphan' in req.query) {
      const inUse = listFiles().some(f => f.slug === slug && PAGE_EXT.has(f.ext));
      if (inUse) return res.json({ ok: true, skipped: 'slug still in use' });
      if (existsSync(kvFile(slug))) unlinkSync(kvFile(slug));
      return res.json({ ok: true, removed: true });
    }
    kvWrite(slug, {});
    res.json({ ok: true });
  }
  catch { res.status(500).json({ error: 'Wipe failed' }); }
});

// ── Legacy blob API (packing list compat) ─────────────────────────────────────

app.get('/api/state/:slug', (req, res) => {
  const { slug } = req.params;
  if (!safeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const store = kvRead(slug);
  res.json(store.__blob ?? null);
});

app.post('/api/state/:slug', (req, res) => {
  const { slug } = req.params;
  if (!safeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  try {
    const store = kvRead(slug);
    store.__blob = req.body;
    kvWrite(slug, store);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Write failed' }); }
});

app.delete('/api/state/:slug', (req, res) => {
  const { slug } = req.params;
  if (!safeSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  try {
    const store = kvRead(slug);
    delete store.__blob;
    kvWrite(slug, store);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Reset failed' }); }
});

// ── Upload ────────────────────────────────────────────────────────────────────

app.post('/upload', (req, res) => {
  const chunks = [];
  let totalSize = 0;
  const MAX_SIZE = 200 * 1024 * 1024; // 200MB cap

  req.on('data', c => {
    totalSize += c.length;
    if (totalSize > MAX_SIZE) { req.destroy(); return; }
    chunks.push(c);
  });

  req.on('end', () => {
    try {
      if (totalSize > MAX_SIZE) return res.status(413).json({ error: 'File too large (200MB max)' });

      const body = Buffer.concat(chunks);
      const ct = req.headers['content-type'] || '';
      const bm = ct.match(/boundary=(.+)$/);
      if (!bm) return res.status(400).json({ error: 'No boundary' });

      const boundaryBuf = Buffer.from('--' + bm[1]);
      const parts = splitBuffer(body, boundaryBuf);

      let filename = null, fileBuffer = null;

      for (const part of parts) {
        // Header/body split on the raw buffer — find \r\n\r\n as bytes, not string
        const sep = part.indexOf('\r\n\r\n');
        if (sep === -1) continue;
        const header = part.slice(0, sep).toString('utf8');
        // Trim trailing \r\n before next boundary
        let content = part.slice(sep + 4);
        if (content.slice(-2).toString() === '\r\n') content = content.slice(0, -2);

        const nm = header.match(/name="([^"]+)"/);
        const fm = header.match(/filename="([^"]+)"/);
        if (nm?.[1] === 'file' && fm) {
          filename = fm[1];
          fileBuffer = content; // raw bytes, untouched — safe for pdf/video/binary
        }
      }

      if (!filename || !fileBuffer) return res.status(400).json({ error: 'No file' });

      // ?name=<existing.ext> replaces that exact file regardless of what the
      // uploaded file is called — used by the ⟳ update button on the index.
      const target = typeof req.query.name === 'string' ? req.query.name : '';
      let name, ext;
      if (target) {
        if (!safeSlug(target) || !extname(target)) return res.status(400).json({ error: 'Invalid target name' });
        name = target;
        ext = extname(target).toLowerCase();
      } else {
        ext = extname(filename).toLowerCase();
        // No whitelist — any extension accepted, served with best-guess MIME type.
        const base = basename(filename, ext).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
        if (!base) return res.status(400).json({ error: 'Invalid filename' });
        name = base + ext;
      }

      writeFileSync(join(PAGES_DIR, name), fileBuffer);
      res.json({ ok: true, name, isPage: PAGE_EXT.has(ext), size: fileBuffer.length });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

// Split a Buffer on a Buffer delimiter (like String.split but binary-safe)
function splitBuffer(buf, delim) {
  const parts = [];
  let start = 0;
  let idx;
  while ((idx = buf.indexOf(delim, start)) !== -1) {
    parts.push(buf.slice(start, idx));
    start = idx + delim.length;
  }
  parts.push(buf.slice(start));
  // First and last parts are preamble/epilogue — drop them like the old .slice(1,-1)
  return parts.slice(1, -1);
}

// ── Delete file ───────────────────────────────────────────────────────────────

app.delete('/delete/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  if (!safeSlug(name)) return res.status(400).json({ error: 'Invalid name' });
  const p = join(PAGES_DIR, name);
  if (!existsSync(p)) return res.status(404).json({ error: 'Not found' });
  try { unlinkSync(p); res.json({ ok: true }); }
  catch { res.status(500).json({ error: 'Delete failed' }); }
});

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Pages server  →  http://localhost:${PORT}`);
});
