// URLs das fotos dos aparelhos (DEVICE_ART em devices.js). Separado pra devices.js seguir
// puro: aqui o Vite resolve cada imagem pra um arquivo do build.
const files = import.meta.glob('../assets/devices/*/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

// art.dir → { back, mask } (URLs), ou null se a pasta não existir.
export function artUrls(art) {
  if (!art) return null;
  const back = files[`../assets/devices/${art.dir}/back.webp`];
  const mask = files[`../assets/devices/${art.dir}/mask.webp`];
  return back ? { back, mask } : null;
}
