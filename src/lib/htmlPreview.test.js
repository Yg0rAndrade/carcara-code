import { describe, it, expect } from 'vitest';
import { isHtml, fileUrlFor } from './htmlPreview.js';

describe('isHtml', () => {
  it('reconhece .html, .htm e .xhtml (case-insensitive)', () => {
    expect(isHtml('index.html')).toBe(true);
    expect(isHtml('page.HTM')).toBe(true);
    expect(isHtml('doc.xhtml')).toBe(true);
  });

  it('rejeita outras extensões', () => {
    expect(isHtml('readme.md')).toBe(false);
    expect(isHtml('app.js')).toBe(false);
    expect(isHtml('styles.css')).toBe(false);
    expect(isHtml('semponto')).toBe(false);
  });

  it('não quebra com valor vazio/nulo', () => {
    expect(isHtml('')).toBe(false);
    expect(isHtml(null)).toBe(false);
  });
});

describe('fileUrlFor', () => {
  it('converte caminho Windows com barras invertidas', () => {
    expect(fileUrlFor('C:\\Users\\x\\page.html')).toBe('file:///C:/Users/x/page.html');
  });

  it('codifica espaços no caminho', () => {
    expect(fileUrlFor('C:\\Users\\Ygor Andrade\\a b.html')).toBe(
      'file:///C:/Users/Ygor%20Andrade/a%20b.html',
    );
  });

  it('aceita caminho que já usa barras normais', () => {
    expect(fileUrlFor('C:/foo/bar.html')).toBe('file:///C:/foo/bar.html');
  });

  it('codifica # e ? no nome do arquivo', () => {
    expect(fileUrlFor('C:/a/p#1.html')).toBe('file:///C:/a/p%231.html');
    expect(fileUrlFor('C:/a/q?x.html')).toBe('file:///C:/a/q%3Fx.html');
  });

  it('não quebra com valor vazio/nulo', () => {
    expect(fileUrlFor(null)).toBe('file:///');
    expect(fileUrlFor('')).toBe('file:///');
  });
});
