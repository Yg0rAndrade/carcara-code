// Moldura do aparelho desenhada por cima do <webview> no modo dispositivo do Preview.
// Mesma geometria do applyViewport (fitDevice), então a "tela" da moldura cai exatamente
// em cima da página. Tudo pointer-events-none: cliques passam direto pro site. Embaixo,
// o nome do aparelho e as medidas (largura × altura e a escala, quando encolhido).
import { fitDevice } from '@/lib/devices';
import { Lock, RotateCw, ChevronLeft, ChevronRight, Share, BookOpen, Copy } from 'lucide-react';
import { toRgb, isLightRgb } from '@/lib/pageChrome';
import {
  IosSignal,
  IosWifi,
  IosBattery,
  AndroidWifi,
  AndroidSignal,
  AndroidBattery,
} from './status-icons.jsx';
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

// showLabel=false: quem usa desenha o próprio rótulo (o Preview põe ali o botão de trocar).
// page: { top, bottom, y, host } lido da página (PAGE_CHROME_SCRIPT) — pinta as barras.
export function DeviceFrame({ dev, box, showLabel = true, page }) {
  const t = useT();
  if (!dev || !box?.width || !box?.height) return null;
  // Mesma regra do Preview: Safari grande no topo da página, compacto depois de rolar.
  const expandedBar = (page?.y ?? 0) <= 8;
  const g = fitDevice(dev, box, { expanded: expandedBar });
  const s = g.scale;
  const phone = dev.group === 'android' || dev.group === 'apple';
  const apple = dev.group === 'apple';
  const topBg = page?.top || '#000';
  const bottomBg = page?.bottom || '#000';
  const topInk = isLightRgb(toRgb(topBg)) ? '#000' : '#fff';
  const bottomInk = isLightRgb(toRgb(bottomBg)) ? '#000' : '#fff';
  const host = page?.host || 'localhost';
  // Safari grande no topo da página; compacto depois de rolar (só iPhone).
  const expanded = apple && (page?.y ?? 0) <= 8;
  const bottomH = g.chrome.bottom; // já é a barra grande ou a compacta (fitDevice)
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
          // +1px pra dentro: a borda cobre 1px da tela, senão o arredondamento da escala
          // deixava um fiozinho da página (branco) aparecendo entre a moldura e a tela.
          borderLeftWidth: g.bezel.side + 1,
          borderRightWidth: g.bezel.side + 1,
          borderTopWidth: g.bezel.top + 1,
          borderBottomWidth: g.bezel.bottom + 1,
          borderRadius: outerRadius,
          // Aro do aparelho (a "bordinha" de metal): prata no iPhone, grafite no Android.
          boxShadow: `0 0 0 ${Math.max(1, 2 * s)}px ${apple ? '#b9bcc2' : '#3a3b40'}, 0 24px 60px rgba(0,0,0,0.45)`,
        }}
      />
      {/* Barra de status: cor do topo do site (theme-color ou o header), ícones claros ou
          escuros conforme o fundo — como o iOS/Android fazem. */}
      {g.chrome.top > 0 && (
        <div
          className="absolute flex items-center justify-between transition-colors duration-300"
          style={{
            left: g.screen.x,
            top: g.screen.y,
            width: g.screen.w,
            height: g.chrome.top,
            background: topBg,
            color: topInk,
            borderTopLeftRadius: dev.radius * s,
            borderTopRightRadius: dev.radius * s,
            padding: `${(apple ? 4 : 2) * s}px ${(apple ? 30 : 16) * s}px 0 ${(apple ? 38 : 16) * s}px`,
            fontSize: 15 * s,
            fontWeight: 600,
          }}
        >
          {apple ? (
            <>
              {/* iOS: hora centrada na "orelha" esquerda, semibold; ícones na direita. */}
              <span className="tabular-nums" style={{ fontSize: 17 * s, fontWeight: 600 }}>
                9:41
              </span>
              <span className="flex items-center" style={{ gap: 6 * s }}>
                <IosSignal h={11 * s} />
                <IosWifi h={11 * s} />
                <IosBattery h={12 * s} />
              </span>
            </>
          ) : (
            <>
              <span className="tabular-nums" style={{ fontSize: 14 * s, fontWeight: 500 }}>
                9:41
              </span>
              <span className="flex items-center" style={{ gap: 3 * s }}>
                <AndroidWifi h={15 * s} />
                <AndroidSignal h={14 * s} />
                <AndroidBattery h={15 * s} />
              </span>
            </>
          )}
        </div>
      )}
      {/* Embaixo. iPhone: barra do Safari — no topo da página ela é grande (endereço +
          ferramentas) e fica POR CIMA do site; depois de rolar, encolhe pra só o
          endereço. Android: só o indicador de gestos. Cor do rodapé visível do site. */}
      {g.chrome.bottom > 0 && (
        <div
          className="absolute flex flex-col items-center justify-end transition-[height,background-color] duration-300 ease-out"
          style={{
            left: g.screen.x,
            top: g.page.y + g.page.h + g.chrome.bottom - bottomH,
            width: g.screen.w,
            height: bottomH,
            background: bottomBg,
            color: bottomInk,
            borderBottomLeftRadius: dev.radius * s,
            borderBottomRightRadius: dev.radius * s,
            paddingBottom: 8 * s,
            fontSize: 13 * s,
          }}
        >
          {apple && expanded && (
            <>
              <div
                className="flex items-center justify-between"
                style={{
                  width: g.screen.w - 28 * s,
                  height: 40 * s,
                  marginBottom: 8 * s,
                  padding: `0 ${12 * s}px`,
                  borderRadius: 12 * s,
                  background: 'color-mix(in srgb, currentColor 12%, transparent)',
                }}
              >
                <span style={{ fontSize: 14 * s, fontWeight: 500 }}>AA</span>
                <span className="flex min-w-0 items-center" style={{ gap: 4 * s }}>
                  <Lock style={{ width: 11 * s, height: 11 * s }} strokeWidth={2.5} />
                  <span className="truncate">{host}</span>
                </span>
                <RotateCw style={{ width: 14 * s, height: 14 * s }} strokeWidth={2} />
              </div>
              <div
                className="flex items-center justify-between opacity-90"
                style={{ width: g.screen.w - 56 * s, marginBottom: 10 * s }}
              >
                {[ChevronLeft, ChevronRight, Share, BookOpen, Copy].map((I, i) => (
                  <I key={i} style={{ width: 19 * s, height: 19 * s }} strokeWidth={1.75} />
                ))}
              </div>
            </>
          )}
          {apple && !expanded && (
            <span className="flex items-center" style={{ gap: 4 * s, marginBottom: 9 * s }}>
              <Lock style={{ width: 10 * s, height: 10 * s }} strokeWidth={2.5} />
              <span className="truncate">{host}</span>
            </span>
          )}
          <span
            className="rounded-full"
            style={{
              width: (apple ? 134 : 110) * s,
              height: 5 * s,
              background: 'currentColor',
              opacity: 0.9,
            }}
          />
        </div>
      )}
      {/* Câmera / entalhe, presos ao topo da tela (por cima da barra de status). */}
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
      {showLabel && (
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
      )}
    </div>
  );
}
