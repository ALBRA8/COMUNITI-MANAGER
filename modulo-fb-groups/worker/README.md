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

## Qué NO hace (honestidad)

- No se une a grupos, no omite aprobaciones de administradores, no toca cuentas
  ajenas, no raspa feeds de terceros.
- Si Facebook muestra un bloqueo o checkpoint, se pausa 12 h y alerta al chaleco.
- Si un grupo exige revisión del admin, el job queda `PENDING_REVIEW`: nunca
  se cuenta como publicado sin URL viva (o evidencia de envío documentada).
- El motor `internal` (peticiones web internas) está deshabilitado en v1.

## Riesgo declarado

Automatizar publicación viola los Términos de Meta. Este worker usa TU sesión,
en TU navegador, con contenido aprobado por humano y ritmo humano. El riesgo de
restricción de la cuenta es del dueño. No afiliado a Meta.
