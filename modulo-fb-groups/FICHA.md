# FB-GROUPS — FICHA DE ESPECIFICACIÓN DEL MÓDULO (método sala limpia)

> ClonaKit · Módulo de `COMUNITI-MANAGER` · Fecha: 2026-10-28
> Única fuente para construir `modulo-fb-groups/`. La investigación
> (10 SaaS + repos GitHub + changelog Graph API) vive en
> `docs/research/FB_GROUPS_REFERENTES.md` y NO se consulta durante la construcción.

## 1. Qué construimos

**FB-GROUPS**, el **pantalón** del traje ALBRA: un módulo de publicación en
grupos de Facebook que se pone el chaleco COMUNITI-MANAGER. Si el chaleco
gestiona marcas, calendario, memoria, aprobaciones y métricas, el pantalón es
la prenda que camina hacia los grupos: toma un borrador aprobado, lo adapta
por grupo, lo publica a ritmo humano desde el navegador del usuario y vuelve
con evidencia (URL del post o motivo exacto del fallo).

Relación con el chaleco (contrato, no fusión): el módulo NO reimplementa
calendario, memoria de marca, skills, aprobaciones, auditoría ni scheduler —
los CONSUME del arnés. El módulo aporta solo lo que nadie tiene: la ejecución
en grupos de Facebook vía navegador con sesión propia.

## 2. Principio rector: no duplicar

| Función | La aporta | El módulo la consume |
|---|---|---|
| Calendario y scheduling recurrente | Chaleco (Schedule, timezone IANA) | El ciclo dispara campañas; el worker no programa por su cuenta |
| Memoria de marca (tono, vocabulario, prohibidos) | Chaleco (BrandMemory) | Las variantes respetan la marca activa |
| Skills (procedimientos SKILL.md) | Chaleco (biblioteca Skill) | Nueva skill `fb-groups-posting` versionada |
| Aprobación humana HITL | Chaleco (Approval, L1/L2/L3) | Ningún job sale sin el nivel de autonomía que corresponda |
| Auditoría append-only | Chaleco (AuditEntry) | Cada claim/dispatch/report deja traza |
| Publicación oficial multi-red (Páginas, IG, TikTok…) | Postgale | Sin tocar: este módulo es SOLO grupos+perfil+Página-en-grupo |
| Difusión masiva WhatsApp | WHATSPOWER-ULTRA | Sin relación |
| Generación de assets | AGENTE-KREA | El worker publica, no crea imágenes |

## 3. Decisiones de diseño (firmadas por el dueño, 2026-10-28)

1. **Worker portable**: mismo worker corre en PC local (Chrome headful con
   perfil dedicado) o VPS (Chrome headful 24/7). El chaleco no sabe ni le
   importa dónde; solo habla HMAC con él.
2. **Método híbrido**: motor DOM (compositor visible + tecleo humano) por
   defecto; motor de peticiones web internas como fallback configurable por
   campaña.
3. **Alcance v1 completo**: grupos donde el usuario es miembro + muro del
   perfil personal + publicar como Página en grupos donde la Página está
   presente.
4. **Vive dentro del chaleco**: `modulo-fb-groups/` en COMUNITI-MANAGER,
   capa hermana de `especializacion-albra/`.
5. **IA graduada por nivel de autonomía** (resuelve la duda del dueño — ver §4).
6. **Anti-ban balanceado** (ver §6).

## 4. Nivel de IA: autopiloto GATEADO, no binario

La duda del dueño ("¿cuánta IA?") se responde con el gobierno que el chaleco
ya tiene. El módulo soporta los tres grados; el interruptor es el nivel de
autonomía L1/L2/L3 del chaleco, no una preferencia suelta del módulo:

| Nivel | Qué hace la IA | Qué ve el humano |
|---|---|---|
| **L1 Asistido** | Nada. Solo spintax determinista opcional. | Redacta, aprueba y dispara todo |
| **L2 Supervisado (DEFAULT)** | Reescritura IA por grupo del borrador YA aprobado (voz de la marca de BrandMemory; prohibidos y vocabulario respetados). Variante registrada en auditoría antes de salir. | Aprueba el contenido una vez; las variantes por grupo quedan visibles y auditables |
| **L3 Autónomo (opt-in, OFF por defecto)** | Pipeline RSS/temas→borrador→variante→publicación sin aprobación por post, con techos duros (cap diario, whitelist de colecciones). | Revisa el reporte posterior; pausa global disponible siempre |

Regla dura: **cambiar el nivel es una acción del panel con auditoría**, y el
L3 exige techos configurados; sin techos, el sistema degrada a L2.

## 5. Arquitectura

```
┌──────────────────────── COMUNITI-MANAGER (chaleco) ────────────────────────┐
│  Panel UI (sección "Grupos de Facebook")                                   │
│  API: /api/fb-workers · /api/fb-groups · /api/fb-campaigns ·               │
│       /api/fb-jobs/claim · /api/fb-jobs/report                             │
│  Prisma: FbWorker · FbGroup · FbCollection · FbCampaign · FbJob ·          │
│          FbGroupHealth                                                     │
│  Ciclo 12 fases: PUBLICAR extiende su paso de distribución a FB-GROUPS     │
└───────────────▲───────────────────────────────────┬────────────────────────┘
                │ pull jobs (HMAC GET /claim,       │ push reportes
                │ lease anti-doble-disparo)         │ (HMAC POST)
┌───────────────┴───────────────────────────────────▼────────────────────────┐
│  WORKER (mismo paquete, portable PC/VPS): Node + Playwright + Chrome real  │
│  · Sesión: perfil Chrome dedicado; nunca pide contraseña ni guarda cookies │
│  · Motores: dom (default) | internal (fallback por campaña)                │
│  · Anti-ban v1 (§6) · Spintax determinista por (job, grupo)                │
│  · Primer comentario · Group sync por DOM + refresco manual                │
│  · Detección: advertencia/desafío/checkpoint → pausa 12h + alerta chaleco  │
│  · Estados: AWAITING_SESSION · IDLE · RUNNING · PAUSED_ANTI_BAN ·          │
│    CHALLENGE_DETECTED · OFFLINE                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

Dirección de las flechas: el worker **tira** de jobs (funciona detrás del NAT
de una PC doméstica) y **empuja** reportes firmados. El chaleco otorga leases
con expiración para que ningún job se publique dos veces.

## 6. Motor anti-ban v1 (postura balanceada)

1. **Techo diario con warmup**: 5/día → 10/día → 20/día (semana 1→2→3+),
   configurable por cuenta. Contador por cuenta, no por campaña.
2. **Ritmo humano**: pausa aleatoria 3–10 min entre grupos de una sesión;
   tecleo con jitter de teclas y micro-pausas; un grupo a la vez.
3. **Corte nocturno** 22:00–07:00 (hora local de la cuenta), salvo forzado
   explícito con auditoría.
4. **Variante única por grupo**: spintax determinista (semilla job+grupo) y/o
   reescritura IA según nivel (§4). Nunca el mismo texto dos veces.
5. **Escudo de detección**: cualquier advertencia, checkpoint, "action blocked"
   o grupo que rechaza → pausa de la cuenta 12 h + alerta en panel; el grupo
   problemático baja su health score y sale de la rotación hasta revisión.
6. **Fatiga**: si la cuenta acumula N días intensos, día de descanso sugerido
   en el panel (no forzado en v1).

## 7. Contratos y estados de honestidad

Contratos nuevos del registro de herramientas del chaleco:
- `fb_groups_post` (riesgo ALTO): publica en grupo/perfil/Página-en-grupo.
  Estados: `CONNECTED` (worker vivo y con sesión), `AWAITING_SESSION`
  (worker vivo, sin login), `AWAITING_WORKER` (no hay worker registrado),
  `PAUSED_ANTI_BAN`, `CHALLENGE_DETECTED`.
- `fb_groups_sync` (riesgo MEDIO): importa/refresca lista de grupos.
- `fb_groups_report` (riesgo BAJO): ingesta de resultados del worker.

Reglas heredadas del chaleco: idempotencia por `x-request-id`, HMAC-SHA256
en ambos sentidos con comparación en tiempo constante, append-only en
auditoría, ningún dato inventado (si no hay URL de post, el job es FALLIDA
con su motivo exacto).

## 8. Panel (sección nueva "Grupos de Facebook")

1. **Workers**: alta por URL+secreto, badge de estado, modo PC/VPS, última visita.
2. **Grupos**: tabla importada con colecciones/tags, health score por grupo
   (éxitos/fallos recientes), excluir de rotación.
3. **Campañas**: origen = borrador del calendario (o texto libre), targets =
   colecciones/grupos, modo (perfil/Página/en-grupo), primer comentario,
   motor (dom/internal), ventana horaria. Progreso en vivo y resultado por
   grupo con URL o motivo.
4. **Anti-ban**: uso del día vs techo, próxima ventana, warmup en curso,
   alertas de detección.
5. **Configuración del módulo**: nivel IA efectivo, techos L3, spintax
   on/off, comentarios auto on/off.

## 9. Stack técnico

- **Worker**: Node 20+ · Playwright (canal Chrome real, no Chromium desnudo) ·
  servidor HTTP mínimo nativo · portable con `npm start` y flags
  `--mode pc|vps` + `FB_WORKER_SECRET`.
- **Chaleco**: lo existente (Next.js 16 + TS + Prisma/SQLite + Tailwind 4);
  6 modelos Prisma nuevos; 5 rutas API nuevas; 1 sección de panel nueva.
- **IA de variantes**: z-ai-web-dev-sdk (ya en el stack), con fallback a
  reglas si no hay clave — nunca bloquea el spintax determinista.

## 10. Riesgos y legal (honestidad exigida)

- Automatizar publicación viola los Términos de Meta; todo el mercado de
  referentes opera igual y lo declara. Este módulo: usa SOLO la sesión y las
  membresías del propio usuario, publica contenido aprobado por humano en el
  nivel por defecto, a ritmo humano, y con pausa defensiva. **El riesgo de
  restricción de la cuenta es del dueño de la cuenta y queda declarado aquí.**
- No afiliado ni respaldado por Meta. Sin scraping de terceros. Sin
  interacción con cuentas ajenas.
- La sesión vive en el perfil Chrome local del worker; el chaleco nunca ve
  cookies ni contraseñas (solo resultados).

## 11. Fuera de alcance (explícito, v1)

- Unirse a grupos automáticamente. Omitir aprobaciones de administradores.
  Multi-cuenta simultánea (v1 = 1 perfil Chrome por worker; multi-cuenta en
  v2 con workers separados). Lead Radar de grupos (escucha de feeds) — hueco
  real pero se evaluará con AGENTE-CHISMOSO antes de duplicar.
- Garantizar publicación: si el grupo exige aprobación de admin, el job queda
  PENDING_REVIEW con evidencia, nunca "exitosa" hasta URL viva.

## 12. Fases de construcción

- **P1** Worker: esqueleto + HMAC + health + sesión + group sync + motor DOM +
  spintax + ritmo + techo diario + reportes firmados.
- **P2** Chaleco: modelos Prisma, rutas claim/report/workers/groups/campaigns,
  sección de panel, auditoría e idempotencia.
- **P3** IA graduada (reescritura L2/L3), primer comentario, modo Página-en-grupo,
  muro personal, health scores.
- **P4** Verificación E2E + build de producción + README + push.
