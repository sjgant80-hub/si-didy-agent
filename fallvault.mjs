#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  fallvault · sovereign single-file HTML backup · ◊·κ=1
//  Walks a folder · embeds files (text + small binaries) · AES-GCM
//  encrypts the whole tree · wraps in HTML viewer · chunks if > 90MB
//
//  Usage:
//    set passphrase via env var (NEVER in CLI args · NEVER in this chat):
//      $env:FALLVAULT_PASS = "your-passphrase-here"
//      node fallvault.mjs C:\Users\sjgan\Downloads
//
//    other env vars:
//      $env:FALLVAULT_OUT       = ".\fallvault-out"  (output dir)
//      $env:FALLVAULT_MAX_FILE  = "5242880"          (skip files larger · default 5MB)
//      $env:FALLVAULT_MAX_CHUNK = "94371840"         (chunk size · default 90MB)
//      $env:FALLVAULT_SKIP      = "node_modules,.git,AppData,*.log"
//
//  The output HTML files are sovereign — open them in any browser, type
//  the passphrase, decrypt in-page, browse tree, click to download.
// ═══════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const ROOT      = process.argv[2] || process.cwd();
const PASS      = process.env.FALLVAULT_PASS;
const OUT_DIR   = process.env.FALLVAULT_OUT || './fallvault-out';
const MAX_FILE  = parseInt(process.env.FALLVAULT_MAX_FILE  || (5 * 1024 * 1024), 10);
const MAX_CHUNK = parseInt(process.env.FALLVAULT_MAX_CHUNK || (90 * 1024 * 1024), 10);
const SKIP      = (process.env.FALLVAULT_SKIP || [
  // junk + system
  'node_modules', '.git', 'AppData', 'Library', '$Recycle.Bin',
  '.next', '.cache', '.vscode', '.idea', 'dist', 'build', '.parcel-cache',
  'Thumbs.db', '.DS_Store',
  // logs / tmp
  '*.log', '*.tmp', '*.lock',
  // images (you said no screenshots needed)
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.svg', '*.bmp', '*.ico',
  '*.heic', '*.raw', '*.psd', '*.ai', '*.tif', '*.tiff',
  // video / audio
  '*.mp4', '*.mov', '*.avi', '*.mkv', '*.webm', '*.flv',
  '*.mp3', '*.wav', '*.flac', '*.m4a', '*.ogg',
  // big binaries
  '*.zip', '*.tar', '*.gz', '*.7z', '*.rar', '*.iso', '*.dmg', '*.exe', '*.msi',
  '*.dll', '*.so', '*.dylib', '*.pdb', '*.bin', '*.dat',
  // fonts (re-downloadable)
  '*.ttf', '*.otf', '*.woff', '*.woff2', '*.eot',
  // proprietary / OS
  '*.pst', '*.ost', '*.lnk', 'desktop.ini', 'NTUSER.DAT*',
].join(','))
                    .split(',').map(s => s.trim()).filter(Boolean);

// SKIP_GIT_REPOS: if true, any directory containing a .git subdir is skipped entirely
// (because it's already backed up on github). Default ON for fallvault.
const SKIP_GIT_REPOS = (process.env.FALLVAULT_SKIP_GIT || '1') !== '0';

if (!PASS) {
  console.error('✗ FALLVAULT_PASS env var not set');
  console.error('  In PowerShell:');
  console.error('    $env:FALLVAULT_PASS = "your-secret-here"');
  console.error('    node fallvault.mjs <folder>');
  process.exit(1);
}
if (!fs.existsSync(ROOT)) { console.error('✗ folder not found · ' + ROOT); process.exit(1); }

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('◊·κ=1 · fallvault start');
console.log('   root  · ' + ROOT);
console.log('   out   · ' + OUT_DIR);
console.log('   max file · ' + MAX_FILE + ' bytes');
console.log('   max chunk · ' + MAX_CHUNK + ' bytes');
console.log('   skip · ' + SKIP.join(', '));

// ────── walk ──────
function shouldSkip(name) {
  for (const pat of SKIP) {
    if (pat.startsWith('*.')) { if (name.endsWith(pat.slice(1))) return true; }
    else if (name === pat) return true;
  }
  return false;
}

const manifest = []; // { path, size, mtime, base64? }
let totalScanned = 0, totalEmbedded = 0, totalSkippedSize = 0, totalSkippedCount = 0;

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { console.log('   ⚠ unreadable · ' + dir); return; }

  // emergency-backup logic: if this dir is a git repo, skip the whole subtree
  // (it's already on github · no point duplicating)
  if (SKIP_GIT_REPOS && entries.some(e => e.isDirectory() && e.name === '.git')) {
    console.log('   ⊘ skip git repo · ' + path.relative(ROOT, dir));
    return;
  }

  for (const e of entries) {
    if (shouldSkip(e.name)) continue;
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const st = fs.statSync(full);
        totalScanned++;
        if (st.size > MAX_FILE) {
          totalSkippedCount++;
          totalSkippedSize += st.size;
          manifest.push({ path: path.relative(ROOT, full), size: st.size, mtime: st.mtimeMs, skipped: 'too_large' });
          continue;
        }
        const buf = fs.readFileSync(full);
        manifest.push({
          path: path.relative(ROOT, full).split(path.sep).join('/'),
          size: st.size,
          mtime: st.mtimeMs,
          base64: buf.toString('base64'),
        });
        totalEmbedded++;
        if (totalEmbedded % 500 === 0) console.log('   · embedded ' + totalEmbedded + ' files · ' + (manifest.reduce((a,m)=>a+(m.base64?m.base64.length:0),0)/1024/1024).toFixed(1) + 'MB raw');
      }
    } catch (err) { console.log('   ⚠ skip ' + full + ' · ' + err.message); }
  }
}

console.log('\n◊ walking ' + ROOT + ' …');
walk(ROOT);
console.log('   scanned ' + totalScanned + ' files · embedded ' + totalEmbedded + ' · skipped ' + totalSkippedCount + ' (too large: ' + (totalSkippedSize/1024/1024).toFixed(1) + 'MB)');

// ────── encrypt + chunk ──────
function deriveKey(pass, salt) {
  return crypto.scryptSync(pass, salt, 32, { N: 16384, r: 8, p: 1 });
}

function encrypt(plaintext) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(PASS, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { salt, iv, tag, enc };
}

console.log('\n◊ packing manifest into chunks of ' + (MAX_CHUNK/1024/1024).toFixed(0) + 'MB …');

// chunk manifest by encoded payload size
const chunks = [];
let cur = [];
let curBytes = 0;
for (const m of manifest) {
  const entryBytes = (m.base64 ? m.base64.length : 0) + JSON.stringify(m).length;
  if (curBytes + entryBytes > MAX_CHUNK && cur.length > 0) {
    chunks.push(cur);
    cur = [];
    curBytes = 0;
  }
  cur.push(m);
  curBytes += entryBytes;
}
if (cur.length) chunks.push(cur);

console.log('   chunks · ' + chunks.length);

// ────── HTML wrapper ──────
function buildHtml(chunkIndex, totalChunks, payload) {
  const meta = {
    chunk: chunkIndex + 1,
    of: totalChunks,
    created: new Date().toISOString(),
    root: ROOT,
    fileCount: payload.fileCount,
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>◊ fallvault · chunk ${chunkIndex+1}/${totalChunks} · ${new Date().toISOString().slice(0,10)}</title>
<style>
:root{--ox:#8b1a1a;--brass:#b8974a;--cream:#c4bfb2;--void:#0b0a0f;--void-2:#14121a;--void-3:#1e1b25;--green:#4caf50}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--void);color:var(--cream);font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;padding:32px;min-height:100vh}
h1{color:var(--brass);font-weight:400;font-size:18px;letter-spacing:3px;margin-bottom:6px}
h1 .sigil{color:var(--ox);font-size:20px}
.meta{color:var(--cream);opacity:.6;font-size:11px;margin-bottom:24px}
.gate{max-width:520px;margin:60px auto;padding:32px;background:var(--void-2);border:1px solid var(--ox)}
.gate h2{color:var(--ox);font-size:13px;letter-spacing:3px;margin-bottom:18px}
input[type=password]{width:100%;background:var(--void);color:var(--cream);border:1px solid var(--void-3);padding:10px 12px;font-family:inherit;font-size:13px;margin-bottom:12px}
input[type=password]:focus{outline:1px solid var(--brass);border-color:var(--brass)}
button{background:var(--ox);color:#fff;border:1px solid var(--ox);padding:10px 18px;font-family:inherit;cursor:pointer;letter-spacing:2px;font-size:11px}
button:hover{background:#a02020}
button.dim{background:var(--void-2);color:var(--cream);border-color:var(--void-3)}
.tree{margin-top:24px;font-size:12px}
.tree details{margin-left:14px}
.tree summary{cursor:pointer;padding:3px 0;color:var(--cream)}
.tree summary:hover{color:var(--brass)}
.tree .f{padding:2px 8px;color:var(--cream);opacity:.85;display:flex;justify-content:space-between;align-items:center;gap:8px}
.tree .f:hover{background:var(--void-2);color:var(--brass)}
.tree .f .size{opacity:.5;font-size:10px}
.tree .f .restore{font-size:10px;color:var(--brass);cursor:pointer;text-decoration:underline}
.search{width:100%;background:var(--void-2);color:var(--cream);border:1px solid var(--void-3);padding:10px 12px;font-family:inherit;font-size:13px;margin-bottom:14px}
.err{color:#e53935;margin-top:10px;font-size:12px}
.ok{color:var(--green);font-size:11px;margin-top:8px}
</style>
</head>
<body>
<h1><span class="sigil">◊</span> fallvault · chunk ${chunkIndex+1} / ${totalChunks}</h1>
<div class="meta">root: ${ROOT.replace(/\\/g,'/')} · created ${meta.created} · ${meta.fileCount} files in this chunk · AES-256-GCM</div>

<div id="gate" class="gate">
  <h2>◊ ENTER PASSPHRASE</h2>
  <input id="pass" type="password" placeholder="passphrase" autofocus>
  <button id="unlock">UNLOCK ◊</button>
  <button id="all" class="dim" style="float:right">DOWNLOAD ALL (.zip)</button>
  <div id="err" class="err"></div>
</div>

<div id="content" style="display:none">
  <input id="search" class="search" type="text" placeholder="search filenames…">
  <button class="dim" id="all-after">DOWNLOAD ALL FILES (.zip)</button>
  <div id="tree" class="tree"></div>
</div>

<script>
const PAYLOAD = ${JSON.stringify(payload.cipherPackage)};

const $ = s => document.querySelector(s);
const b64ToBuf = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const bufToB64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));

async function deriveKey(pass, salt){
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
}

// Node uses scrypt; for browser-portable decrypt, we re-key with PBKDF2 server-side.
// To support both, the script first tries scrypt (via WASM·polyfill) then PBKDF2 fallback.
// For sovereignty + speed, this HTML uses PBKDF2 (browser-native).
// The Node side derives via scrypt; we'll embed BOTH parameters · the HTML uses PBKDF2.

async function unlock(){
  const pass = $('#pass').value;
  if (!pass) return;
  $('#err').textContent = 'decrypting…';
  try {
    const salt = b64ToBuf(PAYLOAD.salt);
    const iv = b64ToBuf(PAYLOAD.iv);
    const enc = b64ToBuf(PAYLOAD.enc);
    const key = await deriveKey(pass, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc);
    // plain is gzip · need inflate · use DecompressionStream
    const blob = new Blob([plain]);
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    let parts = [];
    while (true) { const { done, value } = await reader.read(); if (done) break; parts.push(value); }
    const text = new TextDecoder().decode(new Blob(parts).slice ? await new Blob(parts).arrayBuffer() : parts);
    const arr = await new Blob(parts).arrayBuffer();
    const manifestJson = new TextDecoder().decode(arr);
    const files = JSON.parse(manifestJson);
    showTree(files);
  } catch (e) {
    $('#err').textContent = 'wrong passphrase · or chunk corrupted · ' + e.message;
  }
}
$('#unlock').onclick = unlock;
$('#pass').addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });

function showTree(files){
  $('#gate').style.display = 'none';
  $('#content').style.display = 'block';
  const tree = {};
  for (const f of files) {
    const parts = f.path.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || { _dir: true };
      node = node[parts[i]];
    }
    node[parts[parts.length-1]] = f;
  }
  $('#tree').innerHTML = renderNode(tree, '');
  $('#tree').addEventListener('click', e => {
    const r = e.target.closest('.restore');
    if (!r) return;
    const path = r.dataset.path;
    const f = files.find(x => x.path === path);
    if (!f || !f.base64) return;
    const blob = new Blob([b64ToBuf(f.base64)]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = path.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    $('#tree').querySelectorAll('.f').forEach(el => {
      el.style.display = el.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
    });
  });
  $('#all-after').onclick = () => downloadAllZip(files);
}
function renderNode(node, p){
  let html = '';
  for (const k of Object.keys(node).sort()) {
    const v = node[k];
    if (v && v._dir) {
      html += '<details open><summary>📁 ' + k + '</summary>' + renderNode(v, p + k + '/') + '</details>';
    } else if (v && v.base64) {
      html += '<div class="f"><span>📄 ' + k + '</span><span class="size">' + fmtSize(v.size) + ' · <span class="restore" data-path="' + v.path + '">restore</span></span></div>';
    } else if (v && v.skipped) {
      html += '<div class="f"><span>⊘ ' + k + ' (' + v.skipped + ')</span><span class="size">' + fmtSize(v.size) + '</span></div>';
    }
  }
  return html;
}
function fmtSize(b){ if (b<1024) return b+'B'; if (b<1024*1024) return (b/1024).toFixed(1)+'KB'; return (b/1024/1024).toFixed(1)+'MB'; }

async function downloadAllZip(files){
  alert('zip-all not yet wired · use individual restore for now. (next iteration: stream-zip in-browser)');
}
$('#all').onclick = () => alert('decrypt first');
</script>
</body>
</html>`;
  return html;
}

// for each chunk: JSON → gzip → AES-GCM → wrap
let totalOutBytes = 0;
for (let i = 0; i < chunks.length; i++) {
  const manifestForChunk = chunks[i];
  const json = JSON.stringify(manifestForChunk);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'));

  // Derive key with PBKDF2 (browser-compatible) instead of scrypt
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(PASS, salt, 200000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(gz), cipher.final()]);
  const tag = cipher.getAuthTag();
  // append tag to enc · AES-GCM expects ciphertext+tag concatenated in WebCrypto
  const encWithTag = Buffer.concat([enc, tag]);

  const cipherPackage = {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    enc: encWithTag.toString('base64'),
    kdf: 'pbkdf2-sha256-200k',
    cipher: 'aes-256-gcm',
  };
  const html = buildHtml(i, chunks.length, { cipherPackage, fileCount: manifestForChunk.length });
  const outPath = path.join(OUT_DIR, 'vault-' + String(i+1).padStart(3,'0') + '.html');
  fs.writeFileSync(outPath, html);
  const bytes = Buffer.byteLength(html);
  totalOutBytes += bytes;
  console.log('   wrote ' + outPath + ' · ' + (bytes/1024/1024).toFixed(2) + 'MB · ' + manifestForChunk.length + ' files');
}

// index README
const readme = `# fallvault · sovereign backup · ◊·κ=1

Created: ${new Date().toISOString()}
Root: ${ROOT}
Chunks: ${chunks.length}
Total files: ${totalEmbedded}
Skipped (too large): ${totalSkippedCount} files (${(totalSkippedSize/1024/1024).toFixed(1)}MB)
Total output: ${(totalOutBytes/1024/1024).toFixed(1)}MB

## How to restore

1. Clone this repo (privately) on any machine
2. Open any \`vault-NNN.html\` in a browser
3. Enter your passphrase
4. Browse the tree · click any "restore" link to download that file back

## Crypto

- KDF: PBKDF2-SHA256 (200k iterations)
- Cipher: AES-256-GCM
- Salt per chunk: 16 bytes random
- IV per chunk: 12 bytes random
- Auth tag: 16 bytes, appended to ciphertext

## Sovereignty

- Passphrase never leaves your machine
- GitHub cannot decrypt these files
- Each HTML is fully self-contained · no CDN deps
- Open from file:// works perfectly

◊·κ=1 · prime 379
`;
fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme);

console.log('\n◊·κ=1 · fallvault complete');
console.log('   total · ' + (totalOutBytes/1024/1024).toFixed(1) + 'MB across ' + chunks.length + ' HTML chunks');
console.log('   out · ' + path.resolve(OUT_DIR));
console.log('\n◊ next steps:');
console.log('   1. inspect: open ' + path.join(OUT_DIR, 'vault-001.html') + ' · type your passphrase · verify it works');
console.log('   2. push to private repo:');
console.log('      cd ' + OUT_DIR);
console.log('      gh repo create sjgant80-hub/fallvault-private --private --source=. --push');
console.log('   3. nightly: schedule this script via Task Scheduler');
