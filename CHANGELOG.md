# CHANGELOG — COMUNITI-MANAGER

Formato: entradas por fecha con los commits del entregable. Metodología de la casa: sala limpia, honestidad de estados, auditoría append-only.

## 2026-11-15 — P18: panel fusionado — centro de ajustes e integraciones + consola minimalista

### Panel (una sola plataforma para configurar todo)
- Nueva vista **Ajustes e integraciones** (`src/components/sections/settings.tsx` + `GET/POST /api/integrations`): centro unificado donde se configura y comprueba TODO el arnés desde un solo lugar — IA (LLM embebido), vías de publicación multirred (Instagram/Facebook vía Postgale/Postiz/PostLake; Facebook Groups vía worker propio), WhatsApp y mensajería (WHATSPOWER-ULTRA, CRM-ALBRA, AGENTE-CHISMOSO), investigación (ScrapeCreators, NEX-SCOPE), creatividad (KREA, YTAUTO), semilla AGENTE-GENERAL, webhooks entrantes, cuentas sociales objetivo y estado del sistema.
- Cada tarjeta muestra el estado REAL (conectada / pendiente de credenciales), las variables de entorno exactas que faltan y un botón **Probar** que hace una prueba de conexión de solo lectura (endpoint documentado si existe; alcanzabilidad HTTP cruda para instancias propias del ecosistema; nunca simula éxito).
- Honestidad radical: las claves NUNCA se guardan en la base de datos del panel (protección de datos > comodidad); viven en variables de entorno del servidor y la vista lo explica. FB-GROUPS solo aparece conectado con un worker real registrado (mismo criterio del registro central).
- La pregunta "¿el agente es mock?" queda respondida en código: ninguna integración se simula; lo no conectado se declara `AWAITING_CREDENTIALS` con la variable exacta que falta.

### Consola minimalista
- Navegación reorganizada de 6 grupos difusos a 5 claros por frecuencia de uso (Panel, Comunidad, Contenido, Operación, Sistema); los nombres ancla del arnés de QA (`Grupos de Facebook`, `Centro de Cumplimiento Meta`) se conservan intactos.
- Tema oscuro por defecto con conmutador claro/oscuro (`next-themes`, ya dependiente); identidad unificada COMUNITI-MANAGER ("Panel del agente de comunidad"); footer reducido; sin ornamentos (una tarjeta por integración, texto sobrio).

### Tests
- `scripts/test-integrations.cjs`: 22 checks nuevos (estado unificado honesto, contrato anti-mock, pruebas de conexión, 400 en herramienta desconocida). Batería completa certificada en esta entrada: 221 checks verdes (P2 26, E2E 25, joins 24, P1 11, mejoras 25, P8-P12 24, besttime 10, meta-policy 54, integraciones 22), tsc 0, lint 0, cola limpia, capturas del panel 8/8.

## 2026-11-15 — P17-lite: destripe browser-use y arnés agéntico propio de QA

### Documentación
- `docs/research/BROWSER_USE_DESTRIPE.md`: destripe en sala limpia de browser-use v1.0.5 (repo clonado shallow a /tmp, commit `e717df1` del 14/11/2026) — patrones extraíbles numerados (registro de acciones, guardarrails de dominio en capas con trust model honesto, juez de cierre, extracción estructurada, topes de bucle, pin exacto), arquitectura verificada 0.x→1.0 (de una acción por paso a REPL+CDP) y matriz de compliance mapeada al motor de 6 estados. Decisión: NO se integra como dependencia (su caso de uso primario es la categoría que la regla fija §5.1 tiene bloqueada: `BROWSER_AUTOMATION*` → `BLOQUEADO`); lo valioso se re-implementa como patrón propio.

### Herramientas (workspace, no forman parte del pipeline)
- `scripts/agent-browser-e2e.cjs`: arnés agéntico de QA para el panel propio sobre Playwright global (cero dependencias nuevas en el entregable). Registro de acciones con validación (`abrir`, `clicRol`, `textoVisible`, `captura`, `extraerEstado`, `esperar`, `fin`); guardarrails deny-by-default más estrictos que el referente (allowlist solo `TEST_BASE`, `file:`/`javascript:` denegados, aborto de subrecursos de terceros con registro de violación); topes duros de pasos/tiempo; extracción estructurada de estado; juez determinista de cierre que distingue violaciones esperadas de inesperadas. 4 misiones solo-lectura: portada, módulo Grupos de Facebook por navegación real, Centro de Cumplimiento Meta (pestaña Techos multi-red) y prueba negativa del guardarrail. Primera corrida certificada: 4/4 misiones, 16 pasos, 0 violaciones inesperadas, 0 `pageerror`, cola limpia y lint 0 tras la corrida.

## 2026-11-06 — Auditoría integral y preparación para producción (9 ciclos, entregable 8f5d5cd)

### Motor de colas y anti-ban
- Reclamos atómicos de jobs y joins (updateMany condicional + count) con variante IA generada tras ganar el lease.
- Reaper de leases vencidos para jobs y joins con CAS; joins reencolados liberan el pin al worker muerto; fallo honesto al 3er intento.
- Reportes idempotentes solo desde LEASED; reintentos duplicados ignorados con traza y sin re-consumir techos; POSTED sin URL degrada a FAILED (honestidad).
- Techo diario cuenta posts/uniones en vuelo; corte nocturno 22:00-07:00 real con `nightOverride` auditado; lease = 10 min + commentDelaySec + margen.
- Pausa/cancelación que respetan leases en vuelo; DONE con CAS; telemetría de worker que no pisa estados defensivos.

### Seguridad
- `PANEL_TOKEN` opcional (comparación timing-safe) en las 23 mutaciones de panel; ping/claim/report/tick/webhooks mantienen sus mecanismos propios.
- Webhooks y tick fail-closed fuera de loopback sin secreto; whitelist de fuentes; comparaciones timing-safe unificadas.
- XSS: URLs de posts/grupos solo https en render y sinks; cabeceras de seguridad; mass-assignment cerrado en brands; media sin `..`.
- Log de queries de Prisma solo en desarrollo; /api/health sin detalle de errores al cliente.

### Integridad de datos y backend
- `$transaction` en creación de campaña (campaña+jobs+auditoría); CAS en approve/cancel/pause/resume/DONE y decisiones HITL (409 honestos).
- Edición de versiones publicadas bloqueada; auditoría DRAFT_VERSION_EDITED; memoria de marca con whitelist y auditoría.
- Reintentos de tareas del ciclo con backoff real (sweep con tope por tick), gracia de 120 s en recuperación de RUNNING vivas, CAS en research inline, CAS en schedules (tick interno/externo/manual).
- Índices nuevos (FbJob/FbJoinTask/AuditEntry) y unique de versiones de política; auditoría del claim silenciosa (sin ruido por latido).

### UI/UX
- Memoria de marca hidratada desde datos reales (antes borraba al guardar); formularios conservan el texto si la operación falla; res.ok + feedback en todos los controles; estados vacíos; calendario responsive; diálogos con scroll; metadata propia en español; error boundaries y 404 real.

### DevOps
- El build copia schema+DB al standalone (despliegue verificado en vivo); /api/health nuevo (proceso+DB+scheduler); tsc con `ignoreBuildErrors: false` (25 errores latentes corregidos); README de despliegue y .env.example; cola-check con estados reales; runner y scripts de navegador portables; locks del entregable; higiene de tests (nightOverride en baterías 0-24, restauración de autonomy_mode, limpieza E2E).

### Certificación
- Regresión 199/199 · tsc 0 · lint 0 · build producción · cola limpia · smoke standalone en vivo · 2 pasadas limpias consecutivas (ciclos 8-9). Detalle: AUDIT_REPORT.md y PRODUCTION_READINESS.md.

## 2026-11-06 — Antes de la auditoría (resumen)

- `3b830dd` Higiene de tests: default de test-media-fb 3199→3000; verificación relojito 194/194.
- `595975d` Techos propios multi-red en el motor (NETWORK_CAPS, 7 redes, 3 capas), POC Postgale endurecido, llms.txt propio; regresión 194/194.
- `188c41a` Destripe ClonaKit de Blotato: hub API+MCP de 9 redes; candidata secundaria tras Postgale; backlog P13/P14/P15.
- `30564d0` Prueba general post-familia-E: regresión 182/182 + build + cola limpia.
- `b366d85` Reglas oficiales de posteo por red + motor multi-red (familia E).
- `1f5a638` META POLICY INTELLIGENCE: vigilancia de 26 fuentes, motor de 6 estados, apagado de emergencia solo-humano.
