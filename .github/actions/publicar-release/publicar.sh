#!/usr/bin/env bash
# Anexa os arquivos à Release da tag atual.
#
# Por que isto existe em vez de um `softprops/action-gh-release` direto: na tag v0.1.13 a
# API do GitHub devolveu um 5xx transitório no meio do publish. A action não tem retry, o
# passo morreu, e a release ficou sem `.exe` e sem `latest.yml` — o `electron-updater` de
# todos os usuários passou a tomar 404 e a mostrar "Falha ao atualizar". O binário estava
# pronto; só não chegou na release.
#
# Roda igual nos três SOs (o `gh` já vem instalado nos runners do GitHub).
set -uo pipefail

tag="${GITHUB_REF_NAME:?GITHUB_REF_NAME nao definido}"

# Cada linha de $FILES é um glob. `nullglob` faz o padrão sem match sumir, em vez de
# sobrar como literal e virar um "arquivo" inexistente na hora do upload.
shopt -s nullglob
arquivos=()
while IFS= read -r padrao; do
  padrao="${padrao%$'\r'}"
  padrao="$(printf '%s' "$padrao" | tr -d '[:space:]')"
  [ -z "$padrao" ] && continue
  for encontrado in $padrao; do
    [ -f "$encontrado" ] && arquivos+=("$encontrado")
  done
done <<< "${FILES}"

if [ ${#arquivos[@]} -eq 0 ]; then
  echo "::error::Nenhum arquivo casou com os padroes informados — nada a publicar."
  exit 1
fi

echo "Arquivos a publicar:"
printf '  %s\n' "${arquivos[@]}"

# Retry com backoff exponencial. O alvo é justamente a janela de instabilidade da API:
# 5 tentativas cobrem ~75s, muito mais que o blip que nos quebrou. As duas variáveis só
# existem para o smoke rodar em segundos; em CI valem os defaults.
tentar() {
  local descricao="$1"; shift
  local tentativa=1 espera="${RETRY_ESPERA_INICIAL:-5}"
  local maximo="${RETRY_TENTATIVAS:-5}"
  until "$@"; do
    if [ "$tentativa" -ge "$maximo" ]; then
      echo "::error::${descricao} falhou apos ${tentativa} tentativas."
      return 1
    fi
    echo "::warning::${descricao} falhou (tentativa ${tentativa}). Nova tentativa em ${espera}s."
    sleep "$espera"
    tentativa=$((tentativa + 1))
    espera=$((espera * 2))
  done
}

# Os jobs dos vários SOs correm em paralelo sobre a MESMA tag: quem chegar primeiro cria a
# release, os outros só anexam. Perder a corrida no `create` não é erro.
if ! gh release view "$tag" >/dev/null 2>&1; then
  if ! tentar "Criar a release ${tag}" gh release create "$tag" --title "$tag" --generate-notes; then
    if gh release view "$tag" >/dev/null 2>&1; then
      echo "Outro job criou a release ${tag} enquanto tentavamos; seguindo para o upload."
    else
      exit 1
    fi
  fi
fi

tentar "Anexar assets em ${tag}" gh release upload "$tag" "${arquivos[@]}" --clobber || exit 1

# Guardião: comando sem erro não prova que o asset ficou lá. Confere na própria release,
# que é exatamente o que o cliente vai baixar.
publicados="$(gh release view "$tag" --json assets --jq '.assets[].name')"
faltando=()
for caminho in "${arquivos[@]}"; do
  nome="$(basename "$caminho")"
  grep -Fxq "$nome" <<< "$publicados" || faltando+=("$nome")
done

if [ ${#faltando[@]} -gt 0 ]; then
  echo "::error::Assets ausentes na release ${tag} apos o upload: ${faltando[*]}"
  exit 1
fi

echo "OK — todos os assets confirmados na release ${tag}:"
printf '  %s\n' "${arquivos[@]##*/}"
