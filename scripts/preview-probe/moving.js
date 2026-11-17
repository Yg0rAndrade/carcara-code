/* global document, getComputedStyle, innerHeight, scrollY */
// Avaliado DENTRO do site pela sonda (Runtime.evaluate): conta os elementos animados por
// transform/opacity que mudaram em 1,5 s, no total e na tela.
(async () => {
  const els = [
    ...document.querySelectorAll('[style*="transform"], [style*="opacity"], [style*="translate"]'),
  ];
  const snap = () =>
    els.map((e) => {
      const c = getComputedStyle(e);
      return c.transform + '|' + c.opacity;
    });
  const a = snap();
  await new Promise((r) => setTimeout(r, 1500));
  const b = snap();
  const moving = els.filter((_, i) => a[i] !== b[i]);
  const inView = (e) => {
    const r = e.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0;
  };
  return `animados=${els.length} mexendo=${moving.length} (na tela ${moving.filter(inView).length}/${els.filter(inView).length}) scrollY=${Math.round(scrollY)} vis=${document.visibilityState}`;
})();
