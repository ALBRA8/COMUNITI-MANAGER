#!/usr/bin/env bash
# Recorrido E2E en navegador del módulo FB-GROUPS sobre build de PRODUCCIÓN (v2).
# Formato real del snapshot: `texto "label" [ref=eX]` → extraer ref=eX → @eX.
set -u
cd /home/z/my-project
CAP=clones/COMUNITI-MANAGER/docs/capturas

./node_modules/.bin/next start -p 3000 > /tmp/prod-server.log 2>&1 &
SPID=$!
trap "kill $SPID 2>/dev/null" EXIT
for i in $(seq 1 40); do curl -s -o /dev/null --max-time 2 http://localhost:3000/ && break; sleep 1; done
echo "[e2e] server prod listo"

ab() { agent-browser "$@" 2>/dev/null; }
# findref TEXTO → @eX del primer elemento que contenga TEXTO
findref() {
  ab snapshot -i | rg "$1" | rg -o 'ref=e[0-9]+' | head -1 | sed 's/ref=/@/'
}

echo "[e2e] abrir panel"
ab open http://localhost:3000
ab wait --load networkidle
ab set viewport 1440 900

NAV=$(findref 'Grupos de Facebook')
echo "[e2e] nav ref: $NAV"
ab click "$NAV" && sleep 2.5
ab screenshot "$CAP/fb-groups-p2-panel.png"
echo "[e2e] captura panel OK"

# Banda ámbar del borrador (P2)
ab eval "document.querySelector('[class*=amber], [data-draft]')?.scrollIntoView({block:'center'})" > /dev/null 2>&1 || true
ab find text "Borrador pendiente de aprobación" scrollintoview > /dev/null 2>&1 || ab scroll down 1600
sleep 1
ab screenshot "$CAP/fb-groups-p2-borrador.png"
echo "[e2e] captura borrador OK"

# Crear una campaña desde el formulario (ejercita la UI del gate)
NREF=$(findref 'Nombre de campaña')
TREF=$(findref 'Texto base del post')
echo "[e2e] form refs: $NREF $TREF"
ab fill "$NREF" "Prueba UI gate P2"
ab fill "$TREF" "Texto de prueba del gate P2 desde el navegador {hola|chau}."
GREF=$(findref 'Marketing Digital Colombia')
[ -n "$GREF" ] && ab click "$GREF"
CREA=$(findref 'Crear campaña')
ab click "$CREA" && sleep 2
ab screenshot "$CAP/fb-groups-p2-creado-borrador.png"
echo "[e2e] captura creado-borrador OK"

# Aprobar la campaña demo desde la banda ámbar (HITL real en UI)
AREF=$(findref 'Aprobar y programar')
echo "[e2e] aprobar ref: $AREF"
if [ -n "$AREF" ]; then
  ab click "$AREF" && sleep 2
  ab screenshot "$CAP/fb-groups-p2-aprobada.png"
  echo "[e2e] captura aprobada OK"
else
  echo "[e2e] WARN: banda de aprobación no visible"
fi

# Calendario (P8)
ab scroll up 3000 && sleep 1
CREF=$(findref 'Calendario editorial')
[ -z "$CREF" ] && CREF=$(findref 'Calendario')
echo "[e2e] calendario ref: $CREF"
if [ -n "$CREF" ]; then ab click "$CREF" && sleep 1.5; fi
ab screenshot "$CAP/fb-groups-p8-calendario.png"
echo "[e2e] captura calendario OK"

# Mejores horas (P10)
BREF=$(findref 'Mejores horas')
echo "[e2e] mejores-horas ref: $BREF"
if [ -n "$BREF" ]; then ab click "$BREF" && sleep 1.5; fi
ab screenshot "$CAP/fb-groups-p10-mejores-horas.png"
echo "[e2e] captura mejores-horas OK"

# Informe P9 de la campaña demo con entregas reales
ab open http://localhost:3000/reports/cmvu3b0be000rpp9q62ljpejb
ab wait --load networkidle && sleep 1
ab screenshot --full "$CAP/fb-groups-p9-informe-completo.png"
echo "[e2e] captura informe OK"

ab close
echo "[e2e] fin"
