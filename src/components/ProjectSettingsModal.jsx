import { useEffect, useRef, useState } from 'react';
import { Settings2, Palette, ImagePlus, Trash2, Undo2, X } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { cn } from '@/lib/utils';
import { colorFor, initials } from '@/lib/projectColor';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';

// Cores prontas p/ o avatar. A última "casa" é um input de cor livre, então estas são
// só atalhos comuns — não uma paleta fechada.
const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b'];

// Limite de caracteres do nome — segura o input e serve de teto pro que persiste.
const NAME_MAX = 256;

// Modal central de personalização do projeto no rail: nome, cor e imagem, tudo num
// lugar só (antes era um menu de contexto lotado). Cor/imagem/reset aplicam na hora
// (o `project` vem vivo da lista, então o preview reflete de imediato); o nome é
// rascunho local e só persiste ao confirmar (Enter, "Concluir" ou fechar).
export function ProjectSettingsModal({ project, onClose, onRename, onSetColor, onSetIcon, onResetCustom }) {
  const t = useT();
  const [name, setName] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { if (project) setName(project.name || ''); }, [project?.path]);

  if (!project) return null;
  const p = project;
  const basename = p.path.split(/[\\/]/).filter(Boolean).pop() || p.path;

  const commitName = () => {
    const clean = name.trim().slice(0, NAME_MAX);
    if (clean !== (p.name || '')) onRename?.(p, clean);
  };
  const close = () => { commitName(); onClose(); };

  const onImageChosen = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // permite reescolher o mesmo arquivo depois
    if (!file) return;
    // O diálogo nativo deixa trocar o filtro p/ "Todos os arquivos" e escolher qualquer
    // coisa; barra o que não é imagem AQUI, antes de ler (evita também ler um vídeo
    // enorme em base64 à toa).
    if (!file.type.startsWith('image/')) { toast.error(t('rail.image_invalid')); return; }
    const reader = new FileReader();
    reader.onload = () => onSetIcon?.(p, String(reader.result || ''));
    reader.onerror = () => toast.error(t('rail.image_invalid'));
    reader.readAsDataURL(file);
  };

  const isCustomColor = p.color && !PRESET_COLORS.includes(p.color);
  const avatarStyle = p.icon ? { background: 'hsl(var(--secondary))' } : { background: p.color || colorFor(p.name) };

  return (
    // Overlay centralizado: o modal fica sempre 100% na tela, independente de onde o
    // menu foi aberto. Clicar fora fecha (confirmando o nome).
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Settings2 className="size-4 text-primary" />
          <span className="font-medium">{t('rail.settings_title')}</span>
          <button
            type="button"
            onClick={close}
            title={t('rail.settings_close')}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          {/* Preview do avatar + nome */}
          <div className="flex items-center gap-3">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-base font-bold text-white"
              style={avatarStyle}
            >
              {p.icon
                ? <img src={p.icon} alt="" draggable={false} className="h-full w-full object-contain p-1" />
                : <span>{initials(name || basename)}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{t('rail.name_label')}</label>
              <input
                autoFocus
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); close(); }
                  else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
                }}
                placeholder={basename}
                className="w-full rounded border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{t('rail.name_hint')}</p>
                {name.length > NAME_MAX - 40 && (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{name.length}/{NAME_MAX}</span>
                )}
              </div>
            </div>
          </div>

          {/* Cor do avatar: atalhos + seletor livre (ícone nítido, sem gradiente pixelado) */}
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t('rail.menu_color')}</div>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onSetColor?.(p, c)}
                  title={c}
                  className={cn(
                    'h-6 w-6 rounded-full border border-black/10 transition-transform hover:scale-110',
                    p.color === c && 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                  )}
                  style={{ background: c }}
                />
              ))}
              {/* Cor livre: a casa vira um input nativo de cor. Ícone vetorial (nítido em
                  qualquer tamanho), no lugar do antigo conic-gradient que pixelava. */}
              <label
                title={t('rail.menu_color_custom')}
                className={cn(
                  'relative grid h-6 w-6 cursor-pointer place-items-center rounded-full transition-transform hover:scale-110',
                  isCustomColor
                    ? 'border border-black/10 ring-2 ring-primary ring-offset-2 ring-offset-card'
                    : 'border border-dashed border-muted-foreground/40'
                )}
                style={isCustomColor ? { background: p.color } : undefined}
              >
                <Palette className={cn('size-3.5', isCustomColor ? 'text-white/90' : 'text-muted-foreground')} />
                <input
                  type="color"
                  value={isCustomColor ? p.color : '#3b82f6'}
                  onChange={(e) => onSetColor?.(p, e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>

          {/* Imagem: enviar / remover. Só aceita imagem (validado no onImageChosen). */}
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t('rail.icon_label')}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus /> {t('rail.menu_image')}
              </Button>
              {p.icon && (
                <Button variant="ghost" size="sm" onClick={() => onSetIcon?.(p, '')}>
                  <Trash2 /> {t('rail.menu_image_remove')}
                </Button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{t('rail.image_hint')}</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => { onResetCustom?.(p); setName(basename); }}>
            <Undo2 /> {t('rail.menu_reset')}
          </Button>
          <Button size="sm" onClick={close}>{t('rail.settings_done')}</Button>
        </div>
      </div>
    </div>
  );
}
