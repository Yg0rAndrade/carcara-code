import { describe, expect, it } from 'vitest';
import { hasPendingUpdate, updateView } from './updateView';

// `t` de mentira: devolve a chave, para os testes falarem de chaves e não de tradução.
const t = (chave) => chave;

describe('updateView', () => {
  it('esconde a pilula quando nao ha nada a fazer', () => {
    expect(updateView({ state: 'idle' }, t).visible).toBe(false);
    expect(updateView({ state: 'dev' }, t).visible).toBe(false);
    expect(updateView(undefined, t).visible).toBe(false);
  });

  it('oferece baixar quando ha versao disponivel', () => {
    const v = updateView({ state: 'available', version: '0.1.13' }, t);
    expect(v.visible).toBe(true);
    expect(v.action).toBe('download');
  });

  it('mostra o progresso durante o download', () => {
    const v = updateView({ state: 'downloading', percent: 42 }, t);
    expect(v.showProgress).toBe(true);
    expect(v.percent).toBe(42);
  });

  it('oferece instalar quando o download termina', () => {
    expect(updateView({ state: 'downloaded' }, t).action).toBe('install');
  });

  // O caso que motivou tudo isto: na v0.1.13 a release saiu sem `latest.yml`, o
  // electron-updater tomou 404 e a tela mostrou so "Falha ao atualizar", sem nenhuma
  // pista do motivo. A mensagem que o main manda tem que chegar na tela.
  it('expoe o motivo do erro vindo do main', () => {
    const v = updateView({ state: 'error', message: 'HttpError: 404 ao buscar latest.yml' }, t);
    expect(v.visible).toBe(true);
    expect(v.action).toBe('retry');
    expect(v.detail).toBe('HttpError: 404 ao buscar latest.yml');
  });

  it('nao inventa detalhe quando o main nao manda mensagem', () => {
    expect(updateView({ state: 'error' }, t).detail).toBe('');
  });

  it('nao carrega detalhe nos estados que nao sao de erro', () => {
    expect(updateView({ state: 'available', version: '1.0.0' }, t).detail).toBe('');
    expect(updateView({ state: 'downloaded' }, t).detail).toBe('');
  });
});

describe('hasPendingUpdate', () => {
  it('acende o ponto so quando ha o que baixar ou instalar', () => {
    expect(hasPendingUpdate({ state: 'available' })).toBe(true);
    expect(hasPendingUpdate({ state: 'downloaded' })).toBe(true);
    expect(hasPendingUpdate({ state: 'error' })).toBe(false);
    expect(hasPendingUpdate({ state: 'idle' })).toBe(false);
  });
});
