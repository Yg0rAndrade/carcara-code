import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, ArrowUpRight, Square, Type, Undo2, Copy, X } from 'lucide-react';
import * as fabric from 'fabric';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

// Anotador do print: fica ENTRE a captura e o clipboard. Recebe a dataURL da captura
// crua (webContents.capturePage), deixa marcar por cima (caneta/retângulo/seta/texto)
// e devolve o PNG anotado pro chamador copiar. Fabric entra por import estático AQUI
// (arquivo carregado via lazy() no PreviewPanel), então fica no próprio chunk — nunca
// no bundle de boot.

const PALETTE = ['#f2792b', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ffffff', '#111111'];
const STROKE_W = 3;

const TOOLS = [
  { key: 'pen', Icon: Pencil, labelKey: 'annotator.pen' },
  { key: 'rect', Icon: Square, labelKey: 'annotator.rect' },
  { key: 'arrow', Icon: ArrowUpRight, labelKey: 'annotator.arrow' },
  { key: 'text', Icon: Type, labelKey: 'annotator.text' },
];

export default function AnnotatorModal({ dataURL, onCopy, onClose }) {
  const t = useT();
  const canvasElRef = useRef(null);
  const fabricRef = useRef(null);
  const toolRef = useRef('pen');
  const colorRef = useRef(PALETTE[0]);
  const tRef = useRef(t); // leitura síncrona dentro do handler mouse:down (effect com deps [dataURL])
  tRef.current = t;
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(PALETTE[0]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Cria o canvas Fabric com a captura de fundo (uma vez por dataURL).
  useEffect(() => {
    let disposed = false;
    let canvas = null;
    fabric.FabricImage.fromURL(dataURL).then((img) => {
      if (disposed || !canvasElRef.current) return;
      canvas = new fabric.Canvas(canvasElRef.current, {
        width: img.width,
        height: img.height,
        selection: false,
        preserveObjectStacking: true,
      });
      // Fabric v6+ trocou o origin padrão de 'left'/'top' pra 'center'/'center'. Este
      // componente foi escrito na semântica canto-superior-esquerdo (left/top = canto do
      // objeto), então o fundo entrava CENTRADO em (0,0): só o quadrante inferior-direito
      // da captura aparecia no canto do canvas e o resto ficava em branco — o bug do
      // "print recortado / imagem dobrada". Fixa o origin no canto (vale também pros
      // objetos desenhados, senão caem deslocados por meia dimensão).
      img.set({ originX: 'left', originY: 'top', left: 0, top: 0 });
      canvas.backgroundImage = img;
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.color = colorRef.current;
      canvas.freeDrawingBrush.width = STROKE_W;

      // Fit-to-viewport: mostra a captura INTEIRA (Bug "printa um pedaço"). O espaço de
      // coordenadas do Fabric segue no tamanho NATURAL da imagem (backstore full-res →
      // toDataURL exporta em resolução cheia); só o tamanho EXIBIDO encolhe via CSS
      // (setDimensions cssOnly). getScenePoint compensa a escala CSS pelo
      // getBoundingClientRect, então caneta/retângulo/seta/texto continuam caindo sob o
      // cursor mesmo com a imagem reduzida.
      const maxW = Math.min(img.width, Math.round(window.innerWidth * 0.88));
      const maxH = Math.min(img.height, Math.round(window.innerHeight * 0.72));
      const fit = Math.min(maxW / img.width, maxH / img.height, 1);
      if (fit < 1) {
        canvas.setDimensions(
          { width: Math.round(img.width * fit), height: Math.round(img.height * fit) },
          { cssOnly: true },
        );
      }

      canvas.renderAll();
      fabricRef.current = canvas;

      // Arraste pra desenhar retângulo/seta; clique pra soltar um texto. Clique em cima
      // de um objeto já existente = mover/selecionar (não desenha por cima).
      let draft = null; // { kind, origin, obj }
      canvas.on('mouse:down', (opt) => {
        const t = toolRef.current;
        if (t === 'pen' || opt.target) return;
        const p = canvas.getScenePoint(opt.e);
        if (t === 'text') {
          const text = new fabric.IText(tRef.current('annotator.textPlaceholder'), {
            left: p.x,
            top: p.y,
            originX: 'left',
            originY: 'top',
            fill: colorRef.current,
            fontFamily: 'Hanken Grotesk, sans-serif',
            fontSize: 28,
            fontWeight: 600,
          });
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          text.selectAll();
          return;
        }
        if (t === 'rect') {
          const rect = new fabric.Rect({
            left: p.x,
            top: p.y,
            originX: 'left',
            originY: 'top',
            width: 0,
            height: 0,
            fill: 'transparent',
            stroke: colorRef.current,
            strokeWidth: STROKE_W,
            strokeUniform: true,
          });
          canvas.add(rect);
          draft = { kind: 'rect', origin: { x: p.x, y: p.y }, obj: rect };
        } else if (t === 'arrow') {
          const line = new fabric.Line([p.x, p.y, p.x, p.y], {
            stroke: colorRef.current,
            strokeWidth: STROKE_W,
            strokeUniform: true,
          });
          canvas.add(line);
          draft = { kind: 'arrow', origin: { x: p.x, y: p.y }, obj: line };
        }
      });

      canvas.on('mouse:move', (opt) => {
        if (!draft) return;
        const p = canvas.getScenePoint(opt.e);
        if (draft.kind === 'rect') {
          const o = draft.origin;
          draft.obj.set({
            left: Math.min(o.x, p.x),
            top: Math.min(o.y, p.y),
            width: Math.abs(p.x - o.x),
            height: Math.abs(p.y - o.y),
          });
          draft.obj.setCoords();
        } else if (draft.kind === 'arrow') {
          draft.obj.set({ x2: p.x, y2: p.y });
          draft.obj.setCoords();
        }
        canvas.renderAll();
      });

      canvas.on('mouse:up', () => {
        if (!draft) return;
        const d = draft;
        draft = null;
        if (d.kind === 'rect') {
          if (d.obj.width < 3 && d.obj.height < 3) canvas.remove(d.obj);
          else canvas.setActiveObject(d.obj);
          canvas.renderAll();
          return;
        }
        // Seta: linha + cabeça (Triangle) agrupadas, apontando pro fim do arraste.
        const line = d.obj;
        const { x1, y1, x2, y2 } = line;
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 6) {
          canvas.remove(line);
          canvas.renderAll();
          return;
        }
        const angleDeg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        const head = new fabric.Triangle({
          left: x2,
          top: y2,
          originX: 'center',
          originY: 'center',
          width: 6 + STROKE_W * 4,
          height: 6 + STROKE_W * 4,
          fill: colorRef.current,
          angle: angleDeg + 90,
        });
        canvas.remove(line);
        const group = new fabric.Group([line, head]);
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.renderAll();
      });

      setReady(true);
    });
    return () => {
      disposed = true;
      try {
        canvas?.dispose();
      } catch {
        /* canvas já descartado */
      }
      fabricRef.current = null;
    };
  }, [dataURL]);

  // Espelha o tool escolhido no canvas (modo desenho x modo objeto).
  useEffect(() => {
    toolRef.current = tool;
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = tool === 'pen';
    if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = colorRef.current;
      canvas.freeDrawingBrush.width = STROKE_W;
    }
  }, [tool, ready]);

  // Cor: vale pra caneta, pros próximos objetos e pro objeto selecionado no momento.
  useEffect(() => {
    colorRef.current = color;
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (canvas.freeDrawingBrush) canvas.freeDrawingBrush.color = color;
    const active = canvas.getActiveObject();
    if (active) {
      if (active.type === 'i-text' || active.type === 'text') active.set('fill', color);
      else if (active.type === 'group')
        active.forEachObject((o) => o.set(o.fill ? 'fill' : 'stroke', color));
      else active.set('stroke', color);
      canvas.renderAll();
    }
  }, [color]);

  const undo = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const last = canvas.getObjects().at(-1);
    if (last) {
      canvas.remove(last);
      canvas.discardActiveObject();
      canvas.renderAll();
    }
  };

  const copy = async () => {
    const canvas = fabricRef.current;
    if (!canvas || busy) return;
    canvas.discardActiveObject();
    canvas.renderAll();
    const png = canvas.toDataURL({ format: 'png' });
    setBusy(true);
    try {
      await onCopy(png);
    } finally {
      setBusy(false);
    }
  };

  // Esc fecha (cancela, nada é copiado).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Portal pro <body>: o modal é `fixed inset-0`, mas fica renderizado FUNDO dentro do
  // painel de preview (ancestrais com transform/isolation confinariam o `fixed` e o
  // backdrop não cobriria a janela toda). No body ele cobre a viewport de verdade e os
  // cliques param nele — nada vaza pro conteúdo atrás. (O PreviewPanel ainda esconde o
  // <webview> nativo enquanto o modal está aberto, senão ele compõe por cima do DOM.)
  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] max-w-[92vw] flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
        {/* Palco (em cima): a imagem fica CENTRADA e emoldurada, pra deixar claro que
            é a captura inteira (não um pedaço) mesmo quando é menor que a barra. */}
        <div className="grid place-items-center overflow-auto bg-muted/30 p-3">
          <canvas ref={canvasElRef} className="block rounded ring-1 ring-border" />
        </div>

        {/* Toolbar (embaixo) */}
        <div className="flex flex-wrap items-center gap-2 border-t p-2">
          {TOOLS.map(({ key, Icon, labelKey }) => (
            <button
              key={key}
              type="button"
              title={t(labelKey)}
              onClick={() => setTool(key)}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-md border transition-colors',
                tool === key
                  ? 'border-primary/40 bg-primary text-primary-foreground'
                  : 'bg-background text-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}

          <div className="mx-1 h-6 w-px bg-border" />

          <div className="flex items-center gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => setColor(c)}
                className={cn(
                  'h-6 w-6 rounded-full border transition-transform',
                  color === c ? 'scale-110 ring-2 ring-primary ring-offset-1 ring-offset-card' : '',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="mx-1 h-6 w-px bg-border" />

          <button
            type="button"
            title={t('annotator.undo')}
            onClick={undo}
            className="grid h-8 w-8 place-items-center rounded-md border bg-background text-foreground hover:bg-muted"
          >
            <Undo2 className="h-4 w-4" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-sm text-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
              {t('annotator.cancel')}
            </button>
            <button
              type="button"
              onClick={copy}
              disabled={busy || !ready}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/40 bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Copy className="h-4 w-4" />
              {t('annotator.copy')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
