import { describe, it, expect } from 'vitest';
import {
  commandsFor,
  catalogFor,
  uninstallGuide,
  parseVersion,
  cmpVersions,
  computeUpdateAvailable,
  INSTALLABLE_KEYS,
} from './ai-catalog.cjs';

describe('commandsFor', () => {
  it('devolve passos + doc oficial por SO', () => {
    const win = commandsFor('codex', 'win32');
    expect(win.install).toHaveLength(1);
    expect(win.install[0]).toContain('chatgpt.com/codex/install.ps1');
    expect(win.docs).toMatch(/^https:\/\//);

    const mac = commandsFor('codex', 'darwin');
    expect(mac.install[0]).toContain('curl');
    expect(commandsFor('codex', 'linux')).toEqual(mac); // unix compartilha o slot
  });

  it('update cai no install quando o fornecedor não tem comando próprio', () => {
    const c = commandsFor('codex', 'win32');
    expect(c.update).toEqual(c.install);
  });

  it('update próprio quando existe (claude update / opencode upgrade)', () => {
    expect(commandsFor('claude', 'linux').update).toEqual(['claude update']);
    expect(commandsFor('opencode', 'linux').update).toEqual(['opencode upgrade']);
  });

  it('agy precisa de dois passos (instalador + `agy install`)', () => {
    const c = commandsFor('agy', 'linux');
    expect(c.install).toHaveLength(2);
    expect(c.install[1]).toBe('agy install');
  });

  it('CLI desconhecida → null', () => {
    expect(commandsFor('custom', 'linux')).toBeNull();
    expect(commandsFor('zzz', 'linux')).toBeNull();
  });
});

describe('regressões de 2026-08-06', () => {
  // O `sh`/`bash` não está no PATH do Windows nem com o Git instalado (medido). Uma
  // receita que dependesse deles era inexecutável — foi o que travou o "Instalar" do
  // OpenCode em "Instalando…" para sempre.
  it('nenhuma receita de Windows depende de bash/sh', () => {
    for (const key of INSTALLABLE_KEYS) {
      const c = commandsFor(key, 'win32');
      for (const step of [...c.install, ...c.update]) {
        expect(step, `${key}: ${step}`).not.toMatch(/\|\s*(bash|sh)\b/);
        expect(step, `${key}: ${step}`).not.toMatch(/^\s*(bash|sh)\b/);
      }
    }
  });

  // npm >= 12 bloqueia postinstall por padrão. O `opencode-ai` entrega o binário real
  // justamente nele: sem o flag sobra um stub de 479 bytes, o Windows recusa o
  // executável e a CLI passa a ser detectada como "não instalada".
  it('todo `npm install` das receitas libera os scripts do pacote', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      for (const key of INSTALLABLE_KEYS) {
        const c = commandsFor(key, platform);
        for (const step of [...c.install, ...c.update]) {
          if (/\bnpm\s+(install|i)\b/.test(step)) {
            expect(step, `${key}/${platform}`).toMatch(/--allow-scripts=/);
          }
        }
      }
    }
  });

  it('opencode no Windows vai por npm (não por curl|bash)', () => {
    const c = commandsFor('opencode', 'win32');
    expect(c.install[0]).toContain('npm install -g');
    expect(c.install[0]).toContain('--allow-scripts=opencode-ai');
  });
});

describe('uninstallGuide', () => {
  it('comando reversível com nota', () => {
    const g = uninstallGuide('codex');
    expect(g.kind).toBe('command');
    expect(g.run).toBe('npm uninstall -g @openai/codex');
    expect(g.note_key).toBe('settings.uninstallCodexNote');
    expect(g.bin).toBe('codex');
  });
  it('agy delega pros Apps do SO (sem comando)', () => {
    const g = uninstallGuide('agy');
    expect(g.kind).toBe('os-apps');
    expect(g.run).toBeUndefined();
    expect(g.note_key).toBe('settings.uninstallAgyNote');
  });
  it('CLI desconhecida → null', () => {
    expect(uninstallGuide('zzz')).toBeNull();
  });
});

describe('parseVersion', () => {
  it('extrai x.y.z de saídas variadas', () => {
    expect(parseVersion('codex', 'codex-cli 0.9.1')).toBe('0.9.1');
    expect(parseVersion('agy', 'agy version 1.4.2 (build 9)')).toBe('1.4.2');
  });
  it('sem número → null', () => {
    expect(parseVersion('codex', 'not installed')).toBeNull();
  });
});

describe('cmpVersions / computeUpdateAvailable', () => {
  it('compara semver simples', () => {
    expect(cmpVersions('1.2.0', '1.2.1')).toBe(-1);
    expect(cmpVersions('2.0.0', '1.9.9')).toBe(1);
    expect(cmpVersions('1.4', '1.4.0')).toBe(0);
  });
  it('update disponível só quando latest > installed', () => {
    expect(computeUpdateAvailable('1.0.0', '1.1.0')).toBe(true);
    expect(computeUpdateAvailable('1.1.0', '1.1.0')).toBe(false);
    expect(computeUpdateAvailable('1.1.0', null)).toBe(false);
    expect(computeUpdateAvailable(null, '1.1.0')).toBe(false);
  });
});

describe('catalogFor / INSTALLABLE_KEYS', () => {
  it('cobre as 4 CLIs e propaga receita + guia', () => {
    expect(INSTALLABLE_KEYS).toEqual(['codex', 'opencode', 'agy', 'claude']);
    const keys = catalogFor('linux').map((e) => e.key);
    expect(keys).toEqual(['codex', 'opencode', 'agy', 'claude']);
    expect(keys).not.toContain('custom');
    for (const e of catalogFor('linux')) {
      expect(e.docs).toMatch(/^https:\/\//);
      expect(e.install.length).toBeGreaterThan(0);
      expect(e.update.length).toBeGreaterThan(0);
      expect(e.uninstall).toBeTruthy();
    }
  });
  it('note_key só onde a receita explica algo (opencode/win)', () => {
    const win = Object.fromEntries(catalogFor('win32').map((e) => [e.key, e]));
    expect(win.opencode.note_key).toBe('settings.aiNoteOpencodeWin');
    expect(win.codex.note_key).toBeNull();
  });
});
