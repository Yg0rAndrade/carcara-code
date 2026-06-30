const path = require('path');

const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv', '.m4v']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.oga', '.m4a', '.aac', '.opus']);
const UNSUPPORTED_MEDIA_EXT = new Set(['.avi', '.mkv', '.mov', '.wmv']);

const MIME = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/ogg',
};

function extOf(name) {
  return path.extname(String(name || '')).toLowerCase();
}

// Normaliza pra comparar paths; no Windows o FS é case-insensitive.
function norm(p) {
  const r = path.resolve(String(p || ''));
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

function mediaKind(name) {
  const ext = extOf(name);
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return null;
}

function isUnsupportedMedia(name) {
  return UNSUPPORTED_MEDIA_EXT.has(extOf(name));
}

function mimeForMedia(name) {
  return MIME[extOf(name)] || 'application/octet-stream';
}

// Só serve arquivos dentro de uma das pastas de projeto abertas (escopo de segurança).
function isWithinRoots(filePath, roots) {
  if (!filePath || !Array.isArray(roots) || roots.length === 0) return false;
  const target = norm(filePath);
  for (const root of roots) {
    if (!root) continue;
    const base = norm(root);
    if (target === base) return true;
    const withSep = base.endsWith(path.sep) ? base : base + path.sep;
    if (target.startsWith(withSep)) return true;
  }
  return false;
}

// Parser de header HTTP Range. null = sem header; {start,end} inclusivos; {invalid:true} = não satisfazível.
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return { invalid: true };
  const hasStart = m[1] !== '';
  const hasEnd = m[2] !== '';
  if (!hasStart && !hasEnd) return { invalid: true };
  let start;
  let end;
  if (!hasStart) {
    const n = parseInt(m[2], 10);
    if (!n || n <= 0) return { invalid: true };
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = hasEnd ? parseInt(m[2], 10) : size - 1;
    if (end >= size) end = size - 1;
  }
  if (start > end || start >= size || start < 0) return { invalid: true };
  return { start, end };
}

module.exports = {
  VIDEO_EXT, AUDIO_EXT, UNSUPPORTED_MEDIA_EXT,
  mediaKind, isUnsupportedMedia, mimeForMedia, isWithinRoots, parseRange,
};
