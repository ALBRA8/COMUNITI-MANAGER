#!/usr/bin/env bash
# Levanta el dev server, espera ready, corre los tests indicados y apaga el server.
# Uso: bash scripts/run-with-server.sh "node scripts/test-a.cjs" "node scripts/test-b.cjs" ...
# Raíz del proyecto portable (F3-OPS-04): en el workspace, scripts/ cuelga de la
# raíz Next; en el repo entregado, la app vive en app/.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/package.json" ]; then cd "$ROOT";
elif [ -f "$ROOT/app/package.json" ]; then cd "$ROOT/app";
else echo "[runner] no encuentro package.json ni en $ROOT ni en $ROOT/app" >&2; exit 1; fi

./node_modules/.bin/next dev -p 3000 > /tmp/dev-server.log 2>&1 &
SERVER_PID=$!

# Esperar a que el puerto responda (máx 60 s)
for i in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
    echo "[runner] server listo tras ${i}s"
    break
  fi
  sleep 1
done

FAIL=0
for cmd in "$@"; do
  echo ""
  echo "════════ $cmd ════════"
  bash -c "$cmd" || FAIL=1
done

kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
exit $FAIL
