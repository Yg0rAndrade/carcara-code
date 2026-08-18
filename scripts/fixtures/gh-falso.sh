#!/usr/bin/env bash
# `gh` de mentira para o smoke de scripts/publicar-release.smoke.cjs.
#
# Controlado por variáveis de ambiente:
#   GH_FAKE_STATE   diretório de estado (arquivos `existe`, `n`, `assets`)
#   GH_FAKE_FALHAS  em qual tentativa o `release upload` passa a dar certo (1 = na primeira)
estado="${GH_FAKE_STATE:?}"
sub="$1 $2"

# `release view --json assets --jq ...` devolve a lista de nomes que o guardião confere.
if [ "$sub" = "release view" ] && printf '%s\n' "$@" | grep -q -- '--jq'; then
  cat "$estado/assets" 2>/dev/null
  exit 0
fi

case "$sub" in
  "release view")
    [ -f "$estado/existe" ] && exit 0 || exit 1
    ;;
  "release create")
    touch "$estado/existe"
    exit 0
    ;;
  "release upload")
    n=$(cat "$estado/n" 2>/dev/null || echo 0)
    n=$((n + 1))
    echo "$n" > "$estado/n"
    if [ "$n" -lt "${GH_FAKE_FALHAS:-1}" ]; then
      echo "HttpError: No server is currently available" >&2
      exit 1
    fi
    exit 0
    ;;
esac
exit 0
