import { describe, it, expect } from 'vitest';
import {
  mediaKind, isUnsupportedMedia, mimeForMedia, isWithinRoots, parseRange,
} from './media-core.cjs';
import path from 'path';

describe('mediaKind', () => {
  it('classifica vídeo e áudio suportados (case-insensitive)', () => {
    expect(mediaKind('clip.mp4')).toBe('video');
    expect(mediaKind('movie.WEBM')).toBe('video');
    expect(mediaKind('song.mp3')).toBe('audio');
    expect(mediaKind('voice.OPUS')).toBe('audio');
  });
  it('devolve null pra não-mídia e pra formatos não suportados', () => {
    expect(mediaKind('readme.txt')).toBe(null);
    expect(mediaKind('movie.avi')).toBe(null);
    expect(mediaKind('movie.mkv')).toBe(null);
    expect(mediaKind('')).toBe(null);
    expect(mediaKind(null)).toBe(null);
  });
});

describe('isUnsupportedMedia', () => {
  it('reconhece formatos de mídia que o Chromium não decodifica', () => {
    expect(isUnsupportedMedia('a.avi')).toBe(true);
    expect(isUnsupportedMedia('b.MKV')).toBe(true);
    expect(isUnsupportedMedia('c.mov')).toBe(true);
    expect(isUnsupportedMedia('d.wmv')).toBe(true);
  });
  it('é falso pros suportados e pra não-mídia', () => {
    expect(isUnsupportedMedia('a.mp4')).toBe(false);
    expect(isUnsupportedMedia('a.txt')).toBe(false);
  });
});

describe('mimeForMedia', () => {
  it('mapeia extensões pros mimes corretos', () => {
    expect(mimeForMedia('a.mp4')).toBe('video/mp4');
    expect(mimeForMedia('a.webm')).toBe('video/webm');
    expect(mimeForMedia('a.mp3')).toBe('audio/mpeg');
    expect(mimeForMedia('a.flac')).toBe('audio/flac');
  });
  it('cai em octet-stream pra desconhecido', () => {
    expect(mimeForMedia('a.xyz')).toBe('application/octet-stream');
  });
});

describe('isWithinRoots', () => {
  const roots = [path.resolve('/projects/app'), path.resolve('/projects/site')];
  it('aceita arquivo dentro de uma root', () => {
    expect(isWithinRoots(path.resolve('/projects/app/media/clip.mp4'), roots)).toBe(true);
    expect(isWithinRoots(path.resolve('/projects/site/a.mp3'), roots)).toBe(true);
  });
  it('rejeita fora das roots e tentativa de escape com ..', () => {
    expect(isWithinRoots(path.resolve('/projects/other/x.mp4'), roots)).toBe(false);
    expect(isWithinRoots(path.resolve('/projects/app/../secret.mp4'), roots)).toBe(false);
    expect(isWithinRoots(path.resolve('/etc/passwd'), roots)).toBe(false);
  });
  it('rejeita quando não há roots ou input inválido', () => {
    expect(isWithinRoots(path.resolve('/projects/app/a.mp4'), [])).toBe(false);
    expect(isWithinRoots('', roots)).toBe(false);
  });
});

describe('parseRange', () => {
  it('sem header devolve null (arquivo inteiro)', () => {
    expect(parseRange(null, 5000)).toBe(null);
    expect(parseRange('', 5000)).toBe(null);
  });
  it('faixa fechada', () => {
    expect(parseRange('bytes=0-1023', 5000)).toEqual({ start: 0, end: 1023 });
  });
  it('faixa aberta no fim usa size-1', () => {
    expect(parseRange('bytes=1000-', 5000)).toEqual({ start: 1000, end: 4999 });
  });
  it('sufixo (últimos N bytes)', () => {
    expect(parseRange('bytes=-500', 5000)).toEqual({ start: 4500, end: 4999 });
  });
  it('clampa o fim no tamanho do arquivo', () => {
    expect(parseRange('bytes=4000-99999', 5000)).toEqual({ start: 4000, end: 4999 });
  });
  it('marca não-satisfazível e lixo como invalid', () => {
    expect(parseRange('bytes=5000-6000', 5000)).toEqual({ invalid: true });
    expect(parseRange('bytes=abc', 5000)).toEqual({ invalid: true });
    expect(parseRange('lixo', 5000)).toEqual({ invalid: true });
  });
});
