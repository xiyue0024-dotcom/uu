'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function emptyDb() {
  return {
    users: [],
    sessions: {},
    contacts: [],
    messages: [],
    memories: [],
    flows: [],
    progress: [],
    flowEvents: [],
    knowledge: [],
    settings: [],
    usage: [],
    audit: [],
    meta: { createdAt: new Date().toISOString() }
  };
}

let cache = null;
let writeTimer = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDir();
  try {
    cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    cache = emptyDb();
  }
  const base = emptyDb();
  for (const key of Object.keys(base)) {
    if (cache[key] === undefined) cache[key] = base[key];
  }
  return cache;
}

function flush() {
  const db = load();
  ensureDir();
  const tmp = DB_FILE + '.tmp';
  const payload = JSON.stringify(db, null, 2);
  try {
    fs.writeFileSync(tmp, payload, 'utf8');
    try {
      fs.renameSync(tmp, DB_FILE);
    } catch (e) {
      fs.writeFileSync(DB_FILE, payload, 'utf8');
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  } catch (e) {
    console.error('[db] 写入失败:', e.message);
  }
}

function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush();
  }, 40);
}

function mutate(fn) {
  const db = load();
  const result = fn(db);
  save();
  return result;
}

function id() {
  return require('crypto').randomUUID();
}

function now() {
  return new Date().toISOString();
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

process.on('exit', () => { try { flush(); } catch (_) {} });
process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

module.exports = { load, save, mutate, flush, id, now, today, DB_FILE };
