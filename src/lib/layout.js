// Resolve o layout EFETIVO de um projeto a partir do padrão global e do override
// do projeto. Override (só o lado do Claude) vence o global; o lado do rail é
// sempre global. Qualquer valor que não seja 'left'/'right' cai em 'left'.
const side = (v, fallback = 'left') => (v === 'right' ? 'right' : v === 'left' ? 'left' : fallback);

export function resolveLayout(global, projectOverride) {
  const railSide = side(global?.railSide);
  const globalClaude = side(global?.claudeSide);
  const claudeSide = side(projectOverride?.claudeSide, globalClaude);
  return { railSide, claudeSide };
}
