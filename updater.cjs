// Wrapper do electron-updater: liga os eventos do autoUpdater a um único canal de
// status e expõe check/download/install. O autoUpdater é injetável pra testar sem a
// lib (e pra não carregá-la em dev). Em dev (não empacotado) nada roda: só reporta 'dev'.

function normalizeNotes(notes) {
  if (!notes) return '';
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes))
    return notes.map((n) => (typeof n === 'string' ? n : (n && n.note) || '')).join('\n');
  return '';
}

function initUpdater({ send, notify, isPackaged, autoUpdater }) {
  if (!isPackaged) {
    const dev = () => send({ state: 'dev' });
    return { check: dev, download: dev, install: () => {}, checkOnBoot: () => {} };
  }

  const au = autoUpdater || require('electron-updater').autoUpdater;
  au.autoDownload = false;
  au.autoInstallOnAppQuit = true;

  let fromBoot = false;

  au.on('checking-for-update', () => send({ state: 'checking' }));
  au.on('update-available', (info) => {
    const payload = { state: 'available', version: info && info.version };
    const notes = normalizeNotes(info && info.releaseNotes);
    if (notes) payload.notes = notes;
    send(payload);
    if (fromBoot && notify) notify(info && info.version);
  });
  au.on('update-not-available', () => send({ state: 'idle' }));
  au.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round((p && p.percent) || 0) }),
  );
  au.on('update-downloaded', (info) =>
    send({ state: 'downloaded', version: info && info.version }),
  );
  au.on('error', (err) => send({ state: 'error', message: String((err && err.message) || err) }));

  return {
    check: () => {
      fromBoot = false;
      Promise.resolve(au.checkForUpdates()).catch(() => {});
    },
    checkOnBoot: () => {
      fromBoot = true;
      Promise.resolve(au.checkForUpdates()).catch(() => {});
    },
    download: () => {
      Promise.resolve(au.downloadUpdate()).catch(() => {});
    },
    install: () => {
      au.quitAndInstall();
    },
  };
}

module.exports = { initUpdater, normalizeNotes };
