// Helpers puros do visualizador de HTML inline (testáveis sem React/Electron).

// Arquivos que o visualizador trata como página renderizável.
export function isHtml(name) {
  const e = String(name || '')
    .toLowerCase()
    .split('.')
    .pop();
  return ['html', 'htm', 'xhtml'].includes(e);
}

// Caminho absoluto -> URL file:// pro <webview>. Normaliza barras do Windows,
// tira barras iniciais (pra não duplicar em file:///), e codifica espaços e
// caracteres que quebrariam a URL. encodeURI preserva ':' e '/', mas deixa
// '#' e '?' passarem — por isso a troca explícita desses dois.
export function fileUrlFor(path) {
  const norm = String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return 'file:///' + encodeURI(norm).replace(/#/g, '%23').replace(/\?/g, '%3F');
}
