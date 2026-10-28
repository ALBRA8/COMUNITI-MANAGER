# FB-GROUPS Worker

El Chrome que publica en grupos de Facebook para el chaleco COMUNITI-MANAGER.
Mismo paquete para **PC local** (Chrome visible) o **VPS** (24/7). El chaleco no
sabe dónde corre: solo habla HMAC-SHA256 con él.

## Requisitos

- Node 20+ y Google Chrome instalado.
- Un perfil de Chrome dedicado a este worker (se crea solo en `./chrome-profile`).
- El chaleco COMUNITI-MANAGER corriendo y accesible.

## Instalación

```bash
npm install
npm run setup        # instala el canal Chrome de Playwright (usa tu Chrome real)
cp .env.example .env # y edita los valores
```

## Configuración (.env)

```ini
FB_WORKER_PORT=8765
HARNESS_URL=http://IP-DEL-CHALECO:3000
WORKER_ID=paste_aqui_el_id_del_worker
WORKER_SECRET=paste_aqui_el_secreto_mostrado_una_vez
FB_PROFILE_DIR=./chrome-profile
FB_HEADFUL=1            # 1 en PC (Chrome visible), 0 en VPS (headless)
FB_NIGHT_START=22       # corte nocturno local
FB_NIGHT_END=7
FB_MIN_GAP_MIN=3        # ritmo humano entre posts
FB_MAX_GAP_MIN=10
FB_JOIN_GAP_MIN=20      # ritmo humano entre uniones (P6 auto-join)
FB_JOIN_GAP_MAX=45
```

## Puesta en marcha (5 minutos)

1. En el panel del chaleco → **Grupos de Facebook** → registra el worker con su
   URL y copia el **secreto** (se muestra una sola vez).
2. `npm start` en la PC/VPS.
3. Abre `http://localhost:8765/health` para ver el estado.
4. `curl -X POST http://localhost:8765/api/check-session` → si responde
   `AWAITING_SESSION`, inicia sesión de Facebook en la ventana de Chrome del
   worker (solo la primera vez; el perfil persiste).
5. `curl -X POST http://localhost:8765/api/sync-groups` → importa tus grupos;
   el chaleco los guarda automáticamente.
6. Crea una campaña en el panel. El worker reclama jobs cada 60 s dentro de la
   ventana horaria y del techo diario con warmup.

### Adjuntos de imagen (P1)

Cada campaña admite hasta 4 imágenes. En el panel pega una por línea:

- **URL http(s)** — el worker la descarga a un temp local antes de publicar
  (jpg/png/webp/gif; sirve cualquier URL pública, incluso sin extensión).
- **Ruta local** — un archivo de la máquina donde corre el worker
  (Windows: `C:\fotos\promo.jpg` · Linux/macOS: `/home/tu/foto.png`).

Si una imagen no se puede descargar o el compositor no acepta adjuntos, el job
falla con `ADJUNTO_FALLIDO` y **no se publica un post sin las fotos prometidas**.

### Auto-join (P6)

El worker puede **unirse a grupos** desde una cola creada en el panel:

1. Busca grupos con tu keyword en Facebook y pega sus URLs en la tarjeta
   **Auto-join** del panel (una por línea; keyword opcional para trazabilidad).
2. El worker reclama tareas por `/api/fb-joins/claim` y visita cada grupo:
   si el botón "Unirse" está disponible, hace clic y confirma honestamente.
3. Estados: `JOINED` (el grupo entra en la colección `auto-join` y queda en
   rotación), `REQUESTED` (solicitud enviada, espera al admin; el grupo se crea
   excluido), `SKIPPED` (ya eras miembro; no consume techo), `FAILED` (motivo
   exacto, sin datos inventados).

Ritmo propio y conservador: hueco de **20-45 min** entre uniones (`FB_JOIN_GAP_MIN/MAX`),
**techo diario 2/4/6** según antigüedad de la cuenta (lo aplica el chaleco),
corte nocturno y pausa defensiva de 12 h compartidos con la publicación.
Los grupos con cuestionario de admisión o cuya unión no se puede confirmar
quedan en `FAILED`: **nunca se automatizan respuestas ni se fuerza nada**.

## Checklist de la primera campaña real

1. Worker registrado en el panel y `npm start` con el `.env` completo.
2. Estado del worker en `IDLE` (no `OFFLINE`): significa HMAC y ping OK.
3. `check-session` → `OK` y sesión de Facebook ya iniciada en el Chrome del worker.
4. `sync-groups` ejecutado: tus grupos aparecen en el panel; revisa colecciones
   y excluye los que no quieras en rotación.
5. Antigüedad de la cuenta declarada con honestidad (define el techo: 5/10/20).
6. Primera campaña: **2 o 3 grupos, no 30**. Texto con `{spintax|variaciones}`.
7. Mira la ventana de Chrome: verifica que el post quedó como esperabas.
8. Revisa el panel: `POSTED` con URL, o el motivo honesto si falló.
9. Deja correr el ritmo (3-10 min entre grupos). No fuerces tandas.

## Qué NO hace (honestidad)

- No omite aprobaciones de administradores, no responde cuestionarios de
  admisión, no toca cuentas ajenas, no raspa feeds de terceros.
- Si Facebook muestra un bloqueo o checkpoint, se pausa 12 h y alerta al chaleco.
- Si un grupo exige revisión del admin, el job queda `PENDING_REVIEW`: nunca
  se cuenta como publicado sin URL viva (o evidencia de envío documentada).
- Si la campaña lleva imágenes y no se pueden adjuntar, falla con
  `ADJUNTO_FALLIDO`: nunca publica un post distinto al aprobado.
- El motor `internal` (peticiones web internas) está deshabilitado en v1.

## Riesgo declarado

Automatizar publicación viola los Términos de Meta. Este worker usa TU sesión,
en TU navegador, con contenido aprobado por humano y ritmo humano. El riesgo de
restricción de la cuenta es del dueño. No afiliado a Meta.
