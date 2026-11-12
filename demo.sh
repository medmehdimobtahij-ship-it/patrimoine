#!/bin/sh
# Patrimoine : démo hors ligne (données inventées, aucun compte externe). Nécessite Node.js 18+.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8787}"
command -v node >/dev/null 2>&1 || { echo "Node.js introuvable : https://nodejs.org"; exit 1; }
( sleep 1; command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT/?demo" || command -v open >/dev/null && open "http://localhost:$PORT/?demo" ) >/dev/null 2>&1 &
exec node tools/serve.mjs "$PORT"
