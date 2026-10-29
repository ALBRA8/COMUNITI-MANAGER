#!/usr/bin/env bash
# Recaptura dirigida: calendario P8 del módulo y heatmap P10 (textos únicos del módulo)
set -u
cd /home/z/my-project
CAP=clones/COMUNITI-MANAGER/docs/capturas

./node_modules/.bin/next start -p 3000 > /tmp/prod-server.log 2>&1 &
SPID=$!
trap "kill $SPID 2>/dev/null" EXIT
for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://localhost:3000/ && break; sleep 1; done

ab() { agent-browser "$@" 2>/dev/null; }
findref() { ab snapshot -i | rg "$1" | rg -o 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'; }

ab open http://localhost:3000
ab wait --load networkidle
ab set viewport 1440 900
NAV=$(findref 'Grupos de Facebook')
ab click "$NAV" && sleep 2.5

# Mejores horas P10 (texto único del módulo)
ab find text "Mejores horas (datos propios)" scrollintoview > /dev/null 2>&1 || ab scroll down 400
sleep 1
ab screenshot "$CAP/fb-groups-p10-mejores-horas.png"
echo "[recap] mejores-horas OK"

# Calendario P8 del módulo (descripción única)
ab find text "La semana vista en tiempo" scrollintoview > /dev/null 2>&1 || ab scroll down 1200
sleep 1
ab screenshot "$CAP/fb-groups-p8-calendario.png"
echo "[recap] calendario módulo OK"

ab close
echo "[recap] fin"
