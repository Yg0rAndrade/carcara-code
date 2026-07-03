# Build oficial de Linux (AppImage) — Carcará Code

**Data:** 2026-07-03
**Status:** aprovado, aguardando plano de implementação

## Objetivo

Distribuir o Carcará Code para Linux como um **AppImage** oficial, publicado
automaticamente junto do instalador `.exe` do Windows a cada release. O suporte a
macOS fica para uma segunda rodada (exige conta Apple Developer paga, ~US$99/ano,
e não vale a pena agora).

Nenhuma mudança no comportamento do app: o trabalho é de empacotamento e
automação de CI. O código já é cross-platform onde importa:

- `shellForOS()` cai para `$SHELL`/`bash` fora do Windows (`main.js:1188`).
- `killProc()` usa `proc.kill()` fora do Windows (`main.js:88`).
- O fechamento de janela já respeita a convenção do sistema (`main.js:242`).
- As checagens de ferramentas usam `spawnSync(..., { shell: true })`, portável.
- O ícone `build/icon.png` (256px) já existe — é o formato que o Linux usa.

## Por que AppImage (e só ele)

- Arquivo único, sem instalação: o usuário baixa, dá permissão de execução e
  abre com duplo-clique — coerente com a proposta "baixe e rode" do app.
- Roda em praticamente qualquer distro.
- Suporta auto-update via `electron-updater` (já usado pelo app).
- **Não é sandboxed.** Isso é essencial: o Carcará precisa disparar binários do
  sistema do usuário (`claude`, `node`, `git`, shells, dev servers). Formatos
  sandboxed (**Snap/Flatpak**) quebrariam isso e por isso estão descartados.

## Escopo

### Incluído
1. Config de empacotamento Linux no `package.json`.
2. Script npm `pack:appimage`.
3. Workflow de CI `build-linux.yml` (gêmeo do `build-windows.yml`).
4. Auto-update: publicar `latest-linux.yml` nas releases.
5. Atualizar a seção de download do README.
6. Atualizar o site de marketing (`carcara-code-site`, Astro → carcaracode.net)
   para oferecer o download de Linux, mantendo app e site em sincronia.

### Fora de escopo (YAGNI)
- macOS (assinatura + notarização Apple) — segunda rodada.
- `.deb`, `.rpm`, Snap, Flatpak.
- Assinatura de código no Linux.

## Design

### 1. `package.json` — bloco `linux`

Adicionar ao objeto `build` existente, espelhando o bloco `win`:

```jsonc
"linux": {
  "target": "AppImage",
  "icon": "build/icon.png",
  "category": "Development",
  "artifactName": "CarcaraCode-${version}.AppImage"
}
```

Novo script:

```jsonc
"pack:appimage": "vite build && electron-builder --linux AppImage --publish never"
```

O único módulo nativo (`node-pty`) tem binário pré-compilado para Linux, então o
build funciona igual ao do Windows — sem rebuild manual. A config atual mantém
`npmRebuild: false` e `asarUnpack` do `node-pty`, que continuam válidos.

### 2. CI — `.github/workflows/build-linux.yml`

Gêmeo do `build-windows.yml` (mesmos comentários em português, mesma lógica),
rodando em `ubuntu-latest`:

- **Gatilhos:** `workflow_dispatch` (botão manual) e `push` de tag `v*`.
- **Permissões:** `contents: write` (necessário para criar a Release).
- **Passos:** checkout → setup Node 20 (cache npm) → `npm ci` →
  `npm run pack:appimage`.
- **Artefato:** subir `release/*.AppImage` via `upload-artifact` (para downloads
  em execuções manuais, sem tag).
- **Release (só em tags `v*`):** anexar `release/*.AppImage` e
  `release/latest-linux.yml` à **mesma** página de Release onde o `.exe` é
  publicado. Assim, uma tag `v0.1.6` gera Windows e Linux lado a lado.

Observação: os dois workflows (Windows e Linux) disparam na mesma tag e ambos
usam `softprops/action-gh-release@v2`, que faz upsert na release da tag — os
artefatos se somam na mesma página, sem conflito.

### 3. Distribuição e auto-update

- `latest-linux.yml` anexado à release habilita o auto-update do AppImage via
  `electron-updater` (espelho do `latest.yml` do Windows).
- README: adicionar o link do AppImage na seção de download e uma linha curta de
  "como abrir" (`chmod +x CarcaraCode-*.AppImage` e duplo-clique).
- Site (`carcara-code-site`): adicionar o botão/opção de download de Linux,
  buildar (`npm run build`) e fazer deploy via Cloudflare.

## Riscos e mitigações

- **node-pty não carregar no Linux:** improvável (ships prebuilds), mas o
  primeiro build de teste valida isso. Mitigação: rodar o workflow manualmente
  uma vez antes de cravar numa tag.
- **AppImage e FUSE:** AppImages modernos empacotados pelo electron-builder
  lidam com isso; distros atuais rodam sem passos extras.
- **Sem hardware Linux para teste manual:** o teste real é rodar o AppImage
  gerado pelo CI. Aceitável para um primeiro lançamento "oficial" enxuto;
  qualquer usuário de Linux que reporte problema entra na próxima iteração.

## Critérios de sucesso

1. `npm run pack:appimage` gera um `.AppImage` em `release/` localmente/no CI.
2. Uma tag `v*` publica `.exe` **e** `.AppImage` na mesma GitHub Release.
3. O AppImage abre, mostra a interface e consegue iniciar uma sessão do Claude e
   um Preview (spawns do sistema funcionando).
4. README e site oferecem o download de Linux.
