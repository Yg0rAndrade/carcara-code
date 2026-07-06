import { useState } from 'react';
import { validateRemoteProfile } from '@/lib/remoteProfile.js';
import { useT } from '@/lib/i18n';
import { toast } from '@/lib/toast.js';

// Padrão = senha (o caminho mais comum, estilo Termius). Chave/passphrase ficam atrás
// de um link discreto. Diretório remoto é opcional (em branco = pasta home).
const EMPTY = {
  host: '',
  port: 22,
  user: '',
  authType: 'password',
  keyPath: '',
  remoteDir: '',
  label: '',
};

export function RemoteProjectModal({ open, onClose, onAdded }) {
  const t = useT();
  const [p, setP] = useState(EMPTY);
  const [secret, setSecret] = useState('');
  const [test, setTest] = useState(null); // { ok, message }
  const [busy, setBusy] = useState(false);
  const [hosts, setHosts] = useState(null);
  const [useKey, setUseKey] = useState(false); // avançado: autenticar por chave em vez de senha
  if (!open) return null;
  const set = (k) => (e) => setP((v) => ({ ...v, [k]: e.target.value }));

  async function importConfig() {
    const { hosts } = await window.api.sshConfigHosts();
    setHosts(hosts || []);
  }
  function pickHost(h) {
    setP((v) => ({
      ...v,
      host: h.hostName || h.host,
      user: h.user || v.user,
      port: h.port || 22,
      authType: h.identityFile ? 'key' : 'password',
      keyPath: h.identityFile || v.keyPath,
      label: h.host,
    }));
    if (h.identityFile) setUseKey(true);
    setHosts(null);
  }
  async function doTest() {
    const v = validateRemoteProfile(p);
    if (!v.ok) {
      setTest({ ok: false, message: t(v.error) });
      return;
    }
    setBusy(true);
    setTest(await window.api.testRemote(p, secret));
    setBusy(false);
  }
  async function save() {
    const v = validateRemoteProfile(p);
    if (!v.ok) {
      setTest({ ok: false, message: t(v.error) });
      return;
    }
    setBusy(true);
    try {
      const res = await window.api.addRemote(p, secret);
      if (
        res &&
        res.secretSaved === false &&
        (p.authType === 'password' || p.authType === 'key') &&
        secret
      ) {
        toast(t('remote.warn_secret'));
      }
      onAdded?.(res && res.uri);
      onClose?.();
    } catch (e) {
      // Não falha em silêncio: mostra o erro (antes o await estourava e o modal só travava).
      setTest({ ok: false, message: String((e && e.message) || e) });
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[440px] max-w-[92vw] rounded-2xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{t('remote.title')}</h2>
        <button
          className="mb-4 text-xs text-primary underline"
          onClick={importConfig}
          disabled={busy}
        >
          {t('remote.import_config')}
        </button>

        {/* Lista do ~/.ssh/config só aparece quando há hosts (nada de "nenhum host" na cara). */}
        {hosts && hosts.length > 0 && (
          <ul className="mb-3 max-h-32 overflow-auto rounded-lg border border-border">
            {hosts.map((h) => (
              <li key={h.host}>
                <button
                  className="w-full p-2 text-left text-sm hover:bg-muted"
                  onClick={() => pickHost(h)}
                >
                  {h.host} — {h.hostName || '?'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Servidor */}
        <input
          className={input + ' mb-2'}
          placeholder={t('remote.ph_host')}
          value={p.host}
          onChange={set('host')}
          autoFocus
        />
        <div className="mb-3 grid grid-cols-[1fr_90px] gap-2">
          <input
            className={input}
            placeholder={t('remote.ph_user')}
            value={p.user}
            onChange={set('user')}
          />
          <input
            className={input}
            placeholder={t('remote.ph_port')}
            value={p.port}
            onChange={set('port')}
          />
        </div>

        {/* Credenciais: senha por padrão; chave atrás de um link. */}
        {!useKey ? (
          <>
            <input
              type="password"
              className={input}
              placeholder={t('remote.ph_password')}
              value={secret}
              onChange={(e) => {
                setSecret(e.target.value);
                setP((v) => ({ ...v, authType: 'password' }));
              }}
            />
            <button
              type="button"
              className="mb-3 mt-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setUseKey(true);
                setP((v) => ({ ...v, authType: 'key' }));
              }}
            >
              {t('remote.use_key')}
            </button>
          </>
        ) : (
          <>
            <input
              className={input + ' mb-2'}
              placeholder={t('remote.ph_keypath')}
              value={p.keyPath}
              onChange={set('keyPath')}
            />
            <input
              type="password"
              className={input}
              placeholder={t('remote.ph_passphrase')}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <button
              type="button"
              className="mb-3 mt-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setUseKey(false);
                setP((v) => ({ ...v, authType: 'password' }));
              }}
            >
              {t('remote.use_password')}
            </button>
          </>
        )}

        {/* Opcionais */}
        <input
          className={input + ' mb-2'}
          placeholder={t('remote.ph_remotedir_opt')}
          value={p.remoteDir}
          onChange={set('remoteDir')}
        />
        <input
          className={input}
          placeholder={t('remote.ph_label')}
          value={p.label}
          onChange={set('label')}
        />

        {test && (
          <p className={`mt-3 text-sm ${test.ok ? 'text-green-600' : 'text-red-500'}`}>
            {test.ok ? '✓ ' : '✗ '}
            {test.message}
          </p>
        )}
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={doTest}
            disabled={busy}
          >
            {t('remote.test_btn')}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
              onClick={onClose}
              disabled={busy}
            >
              {t('remote.cancel')}
            </button>
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              onClick={save}
              disabled={busy}
            >
              {t('remote.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
