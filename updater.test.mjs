import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { initUpdater, normalizeNotes } from './updater.cjs';

function fakeAU() {
  const au = new EventEmitter();
  au.autoDownload = true;
  au.autoInstallOnAppQuit = false;
  au.checkForUpdates = vi.fn(() => Promise.resolve());
  au.downloadUpdate = vi.fn(() => Promise.resolve());
  au.quitAndInstall = vi.fn();
  return au;
}

describe('initUpdater (empacotado)', () => {
  it('configura autoDownload=false e autoInstallOnAppQuit=true', () => {
    const au = fakeAU();
    initUpdater({ send: () => {}, isPackaged: true, autoUpdater: au });
    expect(au.autoDownload).toBe(false);
    expect(au.autoInstallOnAppQuit).toBe(true);
  });

  it('mapeia os eventos do autoUpdater pra estados', () => {
    const sent = [];
    const au = fakeAU();
    initUpdater({ send: (p) => sent.push(p), isPackaged: true, autoUpdater: au });
    au.emit('checking-for-update');
    au.emit('update-available', { version: '0.1.3', releaseNotes: 'corrige x' });
    au.emit('download-progress', { percent: 42.7 });
    au.emit('update-downloaded', { version: '0.1.3' });
    au.emit('update-not-available', {});
    au.emit('error', new Error('boom'));
    expect(sent).toEqual([
      { state: 'checking' },
      { state: 'available', version: '0.1.3', notes: 'corrige x' },
      { state: 'downloading', percent: 43 },
      { state: 'downloaded', version: '0.1.3' },
      { state: 'idle' },
      { state: 'error', message: 'boom' },
    ]);
  });

  it('notifica só quando o update vem da checagem de boot', () => {
    const notify = vi.fn();
    const au = fakeAU();
    const u = initUpdater({ send: () => {}, notify, isPackaged: true, autoUpdater: au });
    u.check(); // manual
    au.emit('update-available', { version: '0.1.3' });
    expect(notify).not.toHaveBeenCalled();
    u.checkOnBoot(); // boot
    au.emit('update-available', { version: '0.1.3' });
    expect(notify).toHaveBeenCalledWith('0.1.3');
  });

  it('download/install delegam pro autoUpdater', () => {
    const au = fakeAU();
    const u = initUpdater({ send: () => {}, isPackaged: true, autoUpdater: au });
    u.download();
    u.install();
    expect(au.downloadUpdate).toHaveBeenCalled();
    expect(au.quitAndInstall).toHaveBeenCalled();
  });
});

describe('initUpdater (dev)', () => {
  it('não toca no autoUpdater e reporta estado dev', () => {
    const sent = [];
    const u = initUpdater({ send: (p) => sent.push(p), isPackaged: false });
    u.check();
    expect(sent).toEqual([{ state: 'dev' }]);
  });
});

describe('normalizeNotes', () => {
  it('aceita string, array e vazio', () => {
    expect(normalizeNotes('oi')).toBe('oi');
    expect(normalizeNotes([{ note: 'a' }, { note: 'b' }])).toBe('a\nb');
    expect(normalizeNotes(null)).toBe('');
  });
});
