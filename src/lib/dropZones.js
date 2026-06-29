// Zonas de drop pro arrastar-e-soltar (sessões e painéis). 'center' = miolo;
// senão, a borda/canto mais próxima do cursor (coords relativas 0..1).
export function computeZone(x, y) {
  const margin = 0.28;
  const d = { left: x, right: 1 - x, top: y, bottom: 1 - y };
  const min = Math.min(d.left, d.right, d.top, d.bottom);
  if (min > margin) return 'center';
  if (min === d.left) return 'left';
  if (min === d.right) return 'right';
  if (min === d.top) return 'top';
  return 'bottom';
}

// Estilo (inset) do realce de cada zona — metade/inteiro do alvo.
export const ZONE_STYLE = {
  center: { inset: 0 },
  left: { left: 0, top: 0, bottom: 0, width: '50%' },
  right: { right: 0, top: 0, bottom: 0, width: '50%' },
  top: { left: 0, right: 0, top: 0, height: '50%' },
  bottom: { left: 0, right: 0, bottom: 0, height: '50%' },
};
