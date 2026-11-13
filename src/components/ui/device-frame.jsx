// Moldura do aparelho desenhada por cima do <webview> no modo dispositivo do Preview.
// Mesma geometria do applyViewport (fitDevice), então a "tela" da moldura cai exatamente
// em cima da página. Tudo pointer-events-none: cliques passam direto pro site. Embaixo,
// o nome do aparelho e as medidas (largura × altura e a escala, quando encolhido).
import { fitDevice } from '@/lib/devices';
import { useT } from '@/lib/i18n';

const BODY = '#0e0e10'; // corpo do aparelho (igual em todos os temas)
const EDGE = '#26262b'; // botões laterais e acabamento

function Cutout({ dev, s }) {
  const c = dev.cutout;
  const base = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    background: BODY,
  };
  if (c === 'island')
    return (
      <span style={{ ...base, top: 11 * s, width: 124 * s, height: 36 * s, borderRadius: 999 }} />
    );
  if (c === 'notch')
    return (
      <span
        style={{
          ...base,
          top: 0,
          width: 162 * s,
          height: 32 * s,
          borderBottomLeftRadius: 20 * s,
          borderBottomRightRadius: 20 * s,
        }}
      />
    );
  if (c === 'punch')
    return (
      <span style={{ ...base, top: 12 * s, width: 13 * s, height: 13 * s, borderRadius: 999 }} />
    );
  if (c === 'drop')
    return (
      <span
        style={{
          ...base,
          top: 0,
          width: 26 * s,
          height: 18 * s,
          borderBottomLeftRadius: 999,
          borderBottomRightRadius: 999,
        }}
      />
    );
  return null;
}

export function DeviceFrame({ dev, box }) {
  const t = useT();
  if (!dev || !box?.width || !box?.height) return null;
  const g = fitDevice(dev, box);
  const s = g.scale;
  const phone = dev.group === 'android' || dev.group === 'apple';
  const outerRadius = (dev.radius + g.bezel.side / s) * s;
  const label = dev.id === 'custom' ? t('preview.device_custom') : dev.name;
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden="true">
      {/* Corpo: só a borda é pintada; o miolo é a página. Os cantos de dentro (raio da
          borda) cobrem as quinas retas do webview. */}
      <div
        className="absolute"
        style={{
          left: g.frame.x,
          top: g.frame.y,
          width: g.frame.w,
          height: g.frame.h,
          borderStyle: 'solid',
          borderColor: BODY,
          borderLeftWidth: g.bezel.side,
          borderRightWidth: g.bezel.side,
          borderTopWidth: g.bezel.top,
          borderBottomWidth: g.bezel.bottom,
          borderRadius: outerRadius,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.09), 0 24px 60px rgba(0,0,0,0.45)',
        }}
      />
      {/* Câmera / entalhe, presos ao topo da tela. */}
      <div
        className="absolute"
        style={{ left: g.screen.x, top: g.screen.y, width: g.screen.w, height: g.screen.h }}
      >
        <Cutout dev={dev} s={s} />
      </div>
      {/* Botões laterais (só celulares): liga/desliga à direita, volume à esquerda. */}
      {phone && (
        <>
          <span
            className="absolute rounded-r"
            style={{
              left: g.frame.x + g.frame.w,
              top: g.frame.y + 170 * s,
              width: 3 * s + 1,
              height: 90 * s,
              background: EDGE,
            }}
          />
          {[130, 210].map((y) => (
            <span
              key={y}
              className="absolute rounded-l"
              style={{
                left: g.frame.x - 3 * s - 1,
                top: g.frame.y + y * s,
                width: 3 * s + 1,
                height: 60 * s,
                background: EDGE,
              }}
            />
          ))}
        </>
      )}
      {/* Nome + medidas embaixo do aparelho. */}
      <div
        className="absolute flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground"
        style={{ left: g.frame.x + g.frame.w / 2, top: g.frame.y + g.frame.h + 9 }}
      >
        {label && <span className="font-medium text-foreground/80">{label}</span>}
        <span className="font-mono tabular-nums">
          {dev.w} × {dev.h}
        </span>
        {s < 0.995 && <span className="font-mono tabular-nums">· {Math.round(s * 100)}%</span>}
      </div>
    </div>
  );
}
