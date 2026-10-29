# BASE DOCUMENTAL INICIAL — Políticas, Condiciones de Uso y Cumplimiento de Meta

> **Naturaleza de este documento (leer antes de usar):** esta base es el informe
> entregado por el administrador, incorporado a COMUNITI-MANAGER como **base de
> investigación de partida**, NO como certificación de Meta ni concepto jurídico.
> **Su fecha de referencia es el 8 de octubre de 2026.** Cada fuente debe
> verificarse en la página oficial correspondiente antes de tratar una
> afirmación como regla vigente: el sistema META POLICY INTELLIGENCE existe
> precisamente para sustituir esta base estática por verificación viva.
>
> Distinguir siempre: política oficial verificada · información pendiente de
> verificación · interpretación técnica · recomendación preventiva · restricción
> legal · limitación de API · regla interna de seguridad.

## Qué contiene (17 familias)

1. **Marco normativo general de Meta** — condiciones generales, jerarquía de documentos, principios de integridad y autenticidad.
2. **Condiciones generales, integridad y normas comunitarias** — Conducta en plataformas, contenido prohibido, coordinación de daño, autenticidad.
3. **Facebook e Instagram** — condiciones de servicio, normas de grupos, publicación, cuentas y páginas.
4. **Publicidad digital y marketing** — normas publicitarias, páginas de destino, categorías restringidas, datos personales en publicidad.
5. **Comercio electrónico, catálogos y Marketplace** — políticas de comercio, artículos prohibidos, garantías.
6. **Desarrolladores, APIs y aplicaciones** — términos y políticas para desarrolladores, permisos, revisión de apps, límites de tasa.
7. **WhatsApp Business** — diferencias entre Messenger / Business App / Business Platform (Cloud API), normas de mensajería, plantillas, ventanas de atención, agentes de terceros.
8. **Evolution API, Baileys, n8n y CRM** — riesgos de automatización no oficial en WhatsApp (violación de términos, baneo de números), alcance real de cada vía.
9. **Inteligencia artificial y agentes automatizados** — política de IA de Meta, etiquetado de contenido generado, límites de automatización.
10. **Protección de datos en Colombia** — Ley 1581 de 2012, autorizaciones de tratamiento, reglas de la SIC; Ley 1480 de 2011 (consumidor); derecho de autor (DNDA); obligaciones tributarias (DIAN).
11. **Otras familias de políticas** — cookies, herramientas empresariales, marca, transparencia.
12. **Inventario maestro de políticas** — listado de documentos con URL oficial (espejo de las 26 fuentes registradas en el motor).
13. **Matriz de riesgos** — probabilidad × impacto por tipo de operación (publicación en grupos, mensajería, publicidad, scraping, automatización no oficial).
14. **Aplicación a los proyectos identificados** — FB-GROUPS, WHATSPOWER-ULTRA, AGENTE-LEADS, CRM-ALBRA y el resto del ecosistema ALBRA.
15. **Plan de implementación** — orden sugerido de controles (el mandato del 30/10/2026 lo reemplaza por las 9 fases ejecutadas).
16. **Indicadores de cumplimiento** — frescura de fuentes, cambios abiertos, incidentes, operaciones bloqueadas (hoy computados por el motor).
17. **Conclusiones y recomendaciones** — prioridad de cumplimiento sobre autonomía y volumen.

## Cómo se usa en COMUNITI-MANAGER

- Las **fuentes oficiales** de este informe están registradas en el motor
  (modelo `MetaPolicySource`) y se consultan periódicamente: la base estática
  nunca reemplaza la consulta viva a la fuente.
- Las **afirmaciones relevantes** de este informe (p. ej. «no hay API de
  publicación en grupos desde el 22/04/2024», límites de mensajería de
  WhatsApp, permisos de desarrollador) deben re-verificarse contra la fuente
  oficial antes de apoyar una decisión operativa: el registro queda en la
  auditoría del motor (`META_POLICY_CHECK` y revisiones humanas).
- Las **reglas operativas vigentes** del arnés viven en el motor de
  autorización (`src/lib/meta-policy.ts`) y en las FICHA — no en este informe.

## Registro de verificación inicial (30/10/2026, sandbox)

Hecho verificado en la primera ronda de vigilancia automática (evidencia en el
panel → Fuentes → evidencia de consultas):

- 26/26 fuentes registradas; 21 capturaron línea base v1 (hash + extracto).
- 4 fuentes colombianas (funcionpublica Ley 1581, Ley 1480, SIC) inalcanzables
  desde el entorno de ejecución → fallo registrado honesto, revisión manual
  pendiente del administrador.
- 1 fuente con método MANUAL (consola de apps de desarrolladores, requiere
  sesión).
- Interpretación marcada como tal: la consulta automatizada usa UA estándar de
  lectura para documentos públicos; sin login ni evasión de sistemas anti-abuso.
