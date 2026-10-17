import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import pluginHost from './plugin-host.cjs';

const { discover, schemes, activate, list, chatModeOf, chatView, setTheme, isValidPlugin } =
  pluginHost;

let dir;
const write = (id, src) => {
  fs.mkdirSync(path.join(dir, id), { recursive: true });
  fs.writeFileSync(path.join(dir, id, 'index.cjs'), src);
};
const PLUGIN = (id, extra = '') => `module.exports = {
  id: '${id}', label: 'L ${id}', description: 'D',
  schemes: [{ scheme: '${id}-s', privileges: { standard: true } }],
  activate: (ctx) => ({
    chatView: async (o) => ({ src: '${id}://app/?' + o.tabId, preload: 'file:///p' }),
    setTheme: (t) => { ctx.seen.push(t); },
  }),
  ${extra}
};`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carcara-plugins-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('discover', () => {
  it('pasta inexistente = nenhum plugin', () => {
    expect(discover(path.join(dir, 'nao-existe'))).toEqual([]);
  });

  it('carrega plugins válidos e ignora os quebrados sem lançar', () => {
    write('bom', PLUGIN('bom'));
    write('quebrado', 'throw new Error("boom")');
    write('sem-activate', "module.exports = { id: 'sem-activate', label: 'x' };");
    write('id-errado', PLUGIN('outro-id'));
    fs.mkdirSync(path.join(dir, 'sem-index'));
    const logs = [];
    const found = discover(dir, (...a) => logs.push(a.join(' ')));
    expect(found.map((p) => p.mod.id)).toEqual(['bom']);
    expect(logs).toHaveLength(3);
  });
});

describe('isValidPlugin', () => {
  it('exige id no formato e igual à pasta', () => {
    const mod = { id: 'Ruim_Id', label: 'x', activate() {} };
    expect(isValidPlugin(mod, 'Ruim_Id')).toBe(false);
    expect(isValidPlugin({ ...mod, id: 'ok' }, 'ok')).toBe(true);
  });
});

describe('ciclo de vida', () => {
  it('schemes, activate, list, chatView e setTheme', async () => {
    write('a', PLUGIN('a'));
    write('b', PLUGIN('b'));
    const plugins = discover(dir);
    expect(schemes(plugins).map((s) => s.scheme)).toEqual(['a-s', 'b-s']);

    const ctx = { seen: [], log: () => {} };
    activate(plugins, ctx);
    expect(list(plugins)).toEqual([
      { id: 'a', label: 'L a', description: 'D' },
      { id: 'b', label: 'L b', description: 'D' },
    ]);
    await expect(chatView(plugins, 'b', { tabId: 't1' })).resolves.toEqual({
      src: 'b://app/?t1',
      preload: 'file:///p',
    });
    await expect(chatView(plugins, 'zzz', {})).rejects.toThrow(/indisponível/);
    setTheme(plugins, { background: '0 0% 9%' });
    expect(ctx.seen).toHaveLength(2);
  });

  it('plugin que falha no activate fica de fora da lista', () => {
    write(
      'ruim',
      "module.exports = { id: 'ruim', label: 'x', activate() { throw new Error('x'); } };",
    );
    const plugins = discover(dir);
    activate(plugins, { log: () => {} });
    expect(list(plugins)).toEqual([]);
  });
});

describe('chatModeOf', () => {
  it("aceita 'chat', plugin ativo e cai em 'cli' no resto", () => {
    write('a', PLUGIN('a'));
    const plugins = discover(dir);
    activate(plugins, { seen: [], log: () => {} });
    expect(chatModeOf(plugins, 'chat')).toBe('chat');
    expect(chatModeOf(plugins, 'plugin:a')).toBe('plugin:a');
    expect(chatModeOf(plugins, 'plugin:sumiu')).toBe('cli');
    expect(chatModeOf(plugins, undefined)).toBe('cli');
    expect(chatModeOf([], 'plugin:a')).toBe('cli');
  });
});
