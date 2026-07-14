// Utilitário de anexo de imagem do chat da Carcará. Decisões PURAS (isImageType,
// targetDimensions) são testadas em Vitest (env node). Os wrappers de DOM
// (FileReader/canvas) são finos e verificados manualmente no app.
export const MAX_IMAGES = 10;
export const MAX_EDGE = 1568; // limite de borda longa recomendado p/ visão da Anthropic

let _n = 0;
const nextId = () => 'a' + ++_n;

// Puro: é um MIME de imagem?
export function isImageType(type) {
  return typeof type === 'string' && type.startsWith('image/');
}

// Puro: dimensão-alvo mantendo proporção, reduzindo só se a borda longa > maxEdge.
export function targetDimensions(width, height, maxEdge = MAX_EDGE) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// DOM: lê um File/Blob como data-URL.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('falha ao ler arquivo'));
    r.readAsDataURL(file);
  });
}

// DOM: reduz um data-URL via canvas se necessário. PNG mantém PNG; resto vira JPEG.
export function downscaleImage(dataUrl, { maxEdge = MAX_EDGE, mime = 'image/png' } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = targetDimensions(img.naturalWidth, img.naturalHeight, maxEdge);
      if (width === img.naturalWidth && height === img.naturalHeight) {
        return resolve({ dataUrl, mime });
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const outMime = mime === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve({ dataUrl: canvas.toDataURL(outMime, 0.9), mime: outMime });
    };
    img.onerror = () => resolve({ dataUrl, mime }); // fallback: manda como veio
    img.src = dataUrl;
  });
}

// DOM: converte uma lista de File/Blob em anexos prontos. Ignora não-imagens e falhas.
export async function filesToAttachments(files, { maxEdge = MAX_EDGE, max = MAX_IMAGES } = {}) {
  const list = Array.from(files || []).filter((f) => isImageType(f.type));
  const out = [];
  for (const file of list) {
    if (out.length >= max) break;
    try {
      const raw = await fileToDataUrl(file);
      const { dataUrl, mime } = await downscaleImage(raw, { maxEdge, mime: file.type });
      out.push({ id: nextId(), dataUrl, mime, name: file.name || 'imagem.png' });
    } catch {
      /* pula arquivo inválido */
    }
  }
  return out;
}
