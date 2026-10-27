# INFORME REFERENTES — PUBLICACIÓN EN GRUPOS DE FACEBOOK

> Investigación previa al módulo FB-GROUPS de COMUNITI-MANAGER · 2026-10-28
> Método: solo lectura (webs + repos clonados + documentación oficial Meta).
> Regla: no se declara capacidad sin fuente; todo lo no verificable queda marcado.
> Este informe NO se consulta durante la construcción (método sala limpia).

## 0. Hallazgo que define la arquitectura

**La Graph API oficial de Meta ya NO permite publicar en grupos.**
Verificado en el changelog oficial v19.0 (developers.facebook.com):
- Permiso `publish_to_groups`: obsoleto en v19.0 (23/01/2024).
- API de Grupos completa: eliminada el **22/04/2024**, incluida la posibilidad
  de instalar apps en grupos por parte de administradores.
- No existe alternativa oficial documentada para grupos. Solo Páginas
  (publicación en Páginas ya cubierta por Postgale en el chaleco).

Consecuencia: **la única vía viable para grupos es automatización de navegador
con la sesión propia del usuario**. Es lo que hacen los 10 referentes SaaS
estudiados, sin excepción.

## 1. Referentes SaaS (10 estudiados)

| # | Herramienta | Precio | Técnica | Funciones distintivas |
|---|---|---|---|---|
| 1 | AutoGP | $229–929/año | Extensión Chrome | Warmup por antigüedad de cuenta, multi-cuenta (10 perfiles en Agency), scheduling solo en planes altos |
| 2 | PilotPoster | $47/mes | Extensión Chrome + panel web | Auto AI (escribe y publica), Safety Autopilot (autopausa de grupos que rechazan), health score por grupo, seguimiento de clics, publica también en perfil y como Página en grupos |
| 3 | Group Posting | €5.75–24/mes | Extensión Chrome/Edge | Documenta 2 motores: "Direct API" (peticiones web internas de facebook.com) y "Classic DOM" (compositor visible); Lead Radar; automations con bucles |
| 4 | SimplePoster | $4.99–6.99/mes | Extensión Chrome (Win 10/11) | Tecleo humano simulado, rotación de sets de medios, medidor de riesgo, historial CSV, reanudación de campañas |
| 5 | MaherPost | $29/mes | Extensión Chrome | Warmup, RSS→posts, Lead Radar con aprobación previa, solo grupos (no Páginas) |
| 6 | SafePoster | $47/mes | Extensión Chrome + panel web | Motor de seguridad con pausa ante actividad inusual; cola con reanudación si la extensión se desconecta; spin IA |
| 7 | FB Group Bulk Poster | $8.99/mes | Extensión Chrome | Smart Delivery Pacing (retrasos 30–300s), fondos de color, reutilización de posts ganadores |
| 8 | AI Groups Poster | $0–7/mes | Extensión Chrome | Espacio de trabajo editorial, reescritura IA por grupo, intervalos de ritmo configurables, posición anti-spam explícita |
| 9 | MultiGroupPoster | $5.83/mes (anual) | Extensión Chrome | Primer comentario auto, modos Rápido/Equilibrado/Máximo, importación CSV/Excel, paquetes por categoría |
| 10 | GoizanTools | no publicada | Extensión Chrome | Importación CSV, seguimiento en tiempo real por grupo, disclaimer "no afiliada a Meta" |

Dato de mercado (página comparativa de PilotPoster): de 18 herramientas
revisadas, **solo 4 siguen operativas** — todas basadas en navegador. La
categoría muere cuando el método deja de ser browser-based.

## 2. Patrón común de la industria (extracto sala limpia)

1. Extensión/daemon en el navegador del usuario con **su propia sesión**;
   ninguna herramienta pide la contraseña de Facebook.
2. **Ritmo humano**: pausas aleatorias entre grupos (30 s–20 min según herramienta),
   tecleo simulado, un grupo a la vez.
3. **Variante única por grupo** (spintax o reescritura IA) para no parecer spam.
4. **Warmup escalonado** para cuentas nuevas (p. ej. 5→10→20/día en 6 días).
5. **Primer comentario automático** para colocar enlaces sin triggear filtros.
6. **Pausa defensiva** ante advertencias/desafíos de FB (12 h en Group Posting).
7. **Colecciones/listas de grupos** por nicho o campaña; importación automática
   o por CSV.
8. **Scheduling recurrente** (única/diaria/semanal/mensual) + reintentos.
9. Corte nocturno por defecto (22:00–07:00) en las serias.
10. Disclaimer universal: "no afiliada a Meta" + riesgo de restricción asumido
    por el usuario.

## 3. Repos GitHub relevantes

| Repo | ★ | Qué aporta al estudio |
|---|---|---|
| Hao0321/claude-skill-social-post | 743 | Patrón de modos P0–P5: Plan, Learn Voice (style_profile.md), Draft/Publish vía "Chrome bridge", Log Outcome, Optimize Patterns, Comment Ops. Publica con Chrome controlado, sin API de Meta, actuation en vivo desactivada por defecto. Valida: perfil de voz + skills Markdown + HITL. |
| vonhatminh/FaceBook_Group_AutoPoster_Pro | 7 | Escritorio Windows (Python + CustomTkinter + Playwright empaquetado). Muestra la vía "app local con Playwright" fuera del modelo extensión. |
| naqashafzal/AI-Content-Studio | 882 | Generación de contenido IA multirred (no publicación en grupos); referencia de pipeline creativo. |
| Hecate1337-py/HecatePost | 0 | Publicación a Páginas por Graph API con rotación de tokens multi-página — confirma que la vía oficial solo existe para Páginas. |
| mirzaasadijaz/Facebook-Auto-Poster | — | **Repo eliminado** (404 en API). No evaluable; citado por el dueño como referente, se registra su ausencia. |

## 4. Ecosistema ALBRA8 (auditado 2026-10-28, 21 repos)

Ningún repo del ecosistema toca publicación en Facebook o redes (lo más
cercano: YOUTUBE-AUTOMATION hace YouTube; CRM-ALBRA/WHATSPOWER/ULTRA hacen
mensajería WhatsApp). **El hueco es real.** Patrones reutilizables como
CONCEPTO (no como código): capas anti-ban de WHATSPOWER-ULTRA (jitter,
cooldown, horario, fatiga, locks), HMAC de webhooks, idempotencia y leases
anti-doble-disparo del chaleco, auditoría append-only.

## 5. Decisión de proveedor para grupos

No se integra ningún SaaS del informe (son cerrados, de pago y frágiles a la
detección de Meta). Se construye módulo propio con implementación original
(sala limpia) que replica el patrón común de la industria. Postgale sigue
siendo el proveedor de publicación para Páginas/redes oficiales del chaleco;
el módulo FB-GROUPS cubre exclusivamente el hueco de grupos (+ perfil personal
+ publicación como Página en grupos).
