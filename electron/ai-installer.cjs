'use strict';
// Executor das CLIs de IA (com Node). Detecta versão instalada, resolve a última
// publicada (GitHub/npm, cache 24h, degradação silenciosa) e roda o instalador
// oficial num PTY real. As DECISÕES (comando por SO, parse) vêm do ai-catalog puro;
// aqui só a execução. Ver docs/superpowers/specs/2026-07-10-gestao-clis-ia-design.md.

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { spawnSync } = require('node:child_process');
const catalog = require('./ai-catalog.cjs');

const TTL_MS = 24 * 60 * 60 * 1000;

function detect(key) {
  const entry = catalog.CATALOG[key];
  if (!entry) return { installed: false, version: null };
  try {
    const r = spawnSync(entry.bin, ['--version'], {
      shell: true,
      encoding: 'utf8',
      timeout: 8000,
    });
    if (r.error || r.status !== 0) return { installed: false, version: null };
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    return { installed: true, version: catalog.parseVersion(key, out) };
  } catch {
    return { installed: false, version: null };
  }
}

function cachePath(userDataDir) {
  return path.join(userDataDir, 'ai-versions.json');
}

function readCache(userDataDir) {
  try {
    const v = JSON.parse(fs.readFileSync(cachePath(userDataDir), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeCache(userDataDir, obj) {
  try {
    fs.writeFileSync(cachePath(userDataDir), JSON.stringify(obj));
  } catch {
    /* cache é best-effort */
  }
}

function isFresh(entry, nowMs, ttlMs = TTL_MS) {
  return !!entry && typeof entry.checkedAt === 'number' && nowMs - entry.checkedAt < ttlMs;
}

// GET JSON com timeout/redirect; resolve null em qualquer falha (degradação).
function getJson(url, redirectsLeft = 3) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'carcara-code', Accept: 'application/json' } },
      (res) => {
        const { statusCode, headers } = res;
        res.on('error', () => resolve(null));
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return resolve(null);
          let redirectUrl;
          try {
            redirectUrl = new URL(headers.location, url).toString();
          } catch {
            return resolve(null);
          }
          return resolve(getJson(redirectUrl, redirectsLeft - 1));
        }
        if (statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => req.destroy());
  });
}

async function fetchLatest(latest) {
  if (!latest || latest.type === 'builtin') return null;
  if (latest.type === 'github') {
    const j = await getJson(`https://api.github.com/repos/${latest.repo}/releases/latest`);
    const tag = j && (j.tag_name || j.name);
    return tag ? catalog.parseVersion(null, tag) : null;
  }
  if (latest.type === 'npm') {
    const j = await getJson(`https://registry.npmjs.org/${latest.pkg}/latest`);
    return j && j.version ? catalog.parseVersion(null, j.version) : null;
  }
  return null;
}

async function latestVersion(key, { userDataDir, nowMs = Date.now() }) {
  const entry = catalog.CATALOG[key];
  if (!entry || !entry.latest || entry.latest.type === 'builtin') return null;
  const cache = readCache(userDataDir);
  if (isFresh(cache[key], nowMs)) return cache[key].version;
  const version = await fetchLatest(entry.latest);
  if (version) {
    cache[key] = { version, checkedAt: nowMs };
    writeCache(userDataDir, cache);
  }
  return version;
}

module.exports = { detect, cachePath, readCache, writeCache, isFresh, latestVersion };
