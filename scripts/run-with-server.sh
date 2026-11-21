#!/usr/bin/env bash
# Levanta el dev server, espera ready, corre los tests indicados y apaga el server.
# Uso (desde la raíz del repo entregado o desde el workspace de desarrollo):
#   bash scripts/run-with-server.sh "node scripts/test-a.cjs" "node scripts/test-b.cjs" ...
#
# Portable (F3-OPS-04): el server arranca donde viva package.json (raíz del
# workspace o app/ del repo); los tests SIEMPRE corren desde la carpeta que
# contiene scripts/ (la raíz), para que las rutas relativas de los comandos
# coincidan con lo documentado en cada cabecera de test.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/package.json" ]; then APP="$ROOT";
elif [ -f "$ROOT/app/package.json" ]; then APP="$ROOT/app";
else echo "[runner] no encuentro package.json ni en $ROOT ni en $ROOT/app" >&2; exit 1; fi

# Higiene: ningún server huérfano sirviendo código viejo en :3000.
pkill -f 'next dev -p 3000' 2>/dev/null
sleep 0.5

(
  cd "$APP" && exec ./node_modules/.bin/next dev -p 3000 > /tmp/dev-server.log 2>&1
) &
SERVER_PID=$!

# Esperar a que el puerto responda (máx 90 s)
READY=0
for i in $(seq 1 90); do
  if curl -s -o /dev/null --max-time 2 http://localhost:3000/; then
    echo "[runner] server listo tras ${i}s"
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" != "1" ]; then
  echo "[runner] el server no respondió en 90 s — log:" >&2
  tail -5 /tmp/dev-server.log >&2
  kill $SERVER_PID 2>/dev/null
  exit 1
fi

FAIL=0
for cmd in "$@"; do
  echo ""
  echo "════════ $cmd ════════"
  # NODE_PATH apunta al node_modules de la APP para que los scripts de la raíz
  # que usan Prisma resuelvan el CLIENTE de la app (su BD), no el de un
  # directorio padre ajeno (fallo silencioso detectado en FASE 0).
  (cd "$ROOT" && NODE_PATH="$APP/node_modules${NODE_PATH:+:$NODE_PATH}" bash -c "$cmd") || FAIL=1
done

kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
exit $FAIL
