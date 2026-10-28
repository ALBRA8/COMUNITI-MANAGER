# Mejoras: repos GitHub, JVZoo/WarriorPlus y SaaS 2024-2026

> Investigación intensiva del 27-10-2026 (Task 10-b) para decidir el roadmap del
> módulo FB-GROUPS tras P6 (auto-join). Método honesto: GitHub API + webs
> directas de SaaS + HN Algolia + changelog de Meta vía curl. **Los buscadores
> generalistas estaban bloqueados desde esta IP: el catálogo JVZoo/WarriorPlus
> NO fue verificable directamente** (sus marketplaces renderizan 100% en
> cliente; warriorplus devolvió 403). Se usa el pricing de los SaaS del nicho
> como proxy de precios del nicho.

## A. Repos GitHub relevantes (top 8 de 12 catalogados)

| Repo | Stars | Actividad | Features | Takeaway |
|---|---|---|---|---|
| [MasuRii/FBScrapeIdeas](https://github.com/MasuRii/FBScrapeIdeas) | ★73 | 2025-12 | Scrapeo de posts+comentarios de grupos con Selenium/Playwright + IA; selectors auto-reparables | Base conceptual para nuestro triage de comentarios |
| [vasani-arpit/Social-Media-Automation](https://github.com/vasani-arpit/Social-Media-Automation) | ★484 | 2025-02 | Multi-red, plugins por acción | Catálogo de acciones humanizadas, no código a copiar |
| [jwmoss/forage](https://github.com/jwmoss/forage) | ★13 | **2026-10** | CLI PyPI, Playwright, scrape grupos privados, "capability contract" honesto | Muy activo; su contrato de capacidades es el espíritu de nuestra honestidad de estados |
| [phantakanxm/facebook-group-autopost](https://github.com/phantakanxm/facebook-group-autopost) | ★4 | 2026-04 | **Mismo stack que el nuestro** (Next.js+Playwright+SQLite) empaquetado en Electron con auto-update | Blueprint de distribución no-técnica para clientes |
| [TheBrianWilson/Facebook-Group-Auto-Joiner-Chrome-Extension](https://github.com/TheBrianWilson/Facebook-Group-Auto-Joiner-Chrome-Extension) | ★4 | 2026-02 | Auto-join human-like con delays | Único open-source dedicado a auto-join; ⚠️ su ZIP externo no auditado, no ingestar |
| [ethanXWL/Python-Selenium-Facebook-group-auto-poster](https://github.com/ethanXWL/Python-Selenium-Facebook-group-auto-poster) | ★60 | 2019 | Selenium multi-grupo | Estado del arte open-source es viejo: nuestro hueco es real |
| [Tinkprocodes/fca-unofficial](https://github.com/Tinkprocodes/fca-unofficial) | ★51 | 2022 | API no oficial por cookies/appstate | Riesgo alto de checkpoint: NO nos conviene frente a Playwright+sesión real |
| [Makepad-fr/fbjs](https://github.com/Makepad-fr/fbjs) | ★63 | 2023-12 | Interacciones FB con sesión | Stale 3 años; confirmación de que la vía DOM con sesión es la que sobrevive |

## B. JVZoo/WarriorPlus y proxy de precios del nicho

**JVZoo/WarriorPlus no verificables hoy** (403/shell JS; buscadores bloqueados).
Proxy verificado en webs oficiales de SaaS del nicho:

| Producto | Precio | Features | Takeaway |
|---|---|---|---|
| [MaherPost](https://maherpost.com) | $29/mo | Score de riesgo 0-100, Lead Radar, auto-comentario con delay, reportes cliente | Referencia #1 en anti-ban y triage |
| [SafePoster](https://safeposter.com/pricing/) | $47/mo + white-label | RSS→posts, auto-pausa, post como Página | El programa white-label es un modelo de negocio que no tenemos |
| [GroupPosting](https://www.groupposting.com) | Lite gratis / Plus €69/año / Pro €24/mo | Doble motor (API+DOM), Lead Radar, Safety Center, warmup opcional | Freemium + escalera anual = mejor pricing-match para nosotros |
| [PilotPoster](https://pilotposter.com) | trial 1 día | Auto AI diario desde la web de la marca, rotación de fotos, Safety Autopilot | UX de "autopiloto con aprobación" |

Conclusión honesta: los productos JVZoo típicos del nicho prometen lo que estos
SaaS ya ofrecen freemium; no perdemos nada por no haberlos catalogado.

## C. Features que nos faltan (rankeadas, con fuente)

1. **Score de riesgo pre-vuelo 0-100** — maherpost + groupposting safety
2. **Log de entrega por grupo** (posted / pending admin approval / rejected) — maherpost
3. **Triage tipo Lead Radar** (keywords buying-intent + borradores IA con HITL) — groupposting/maherpost
4. **Bump-comment con delay y variantes** — maherpost auto-comment
5. **Rotación de adjuntos entre jobs de una campaña** — pilotposter
6. **Auto AI diario** desde la web de la marca — pilotposter
7. **RSS→campañas recurrentes** — safeposter
8. **Respuestas automáticas con topes duros** (1-10/día, ≥2 min, posts <24h) — groupposting
9. **Reportes de agencia exportables** — maherpost agency playbook
10. **Doble motor** (replay de peticiones internas + DOM) — groupposting (⚠️ el más expuesto a ToS)
11. Post como **Página** por defecto (ya tenemos page_in_group opt-in)
12. **Packaging desktop + auto-update** — phantakanxm

## D. Anti-ban: números concretos (fuentes 2024-2026)

- Warmup GroupPosting: 5/día (días 1-2) → 10 (3-4) → 20 (5-6) → sin tope propio. **Coincide con nuestro warmup exacto.**
- Warmup MaherPost: 3-5 posts/día totales, ≥5 min entre posts, grupos añadidos en tandas de 10/semana.
- Escalado: semana 1: 10-15 grupos/día; semana 2: 20-25; escalar solo con logs de entrega limpios.
- Gaps: recomendación conservadora 5-10 min entre posts; motor real de MaherPost entrega con 35-90 s; GroupPosting sube el gap mínimo 15→30→45→60 s al pasar 30/60/100 posts en 24 h.
- Corte nocturno 22:00-07:00 ON por defecto (GroupPosting) — **coincide con el nuestro**.
- Tras bloqueo: auto-stop 12 h (GroupPosting); MaherPost recomienda 48-72 h, volver con volumen -50% y gaps mayores.
- Detección = patrones (ráfagas, texto idéntico, horas raras) + **~mitad de los bans vienen de admins de grupo**, no del algoritmo.
- Cuentas "aged" compradas violan ToS y traen restricciones ocultas (MaherPost lo desaconseja): nuestro warmup por edad declarada es la apuesta correcta.
- Nuestro **P6 auto-join (2/4/6 al día, huecos 20-45 min) es más conservador que ningún referente publicado** — no se hallaron cifras oficiales de joins/día de Meta (honesto).

## E. Top 10 mejoras propuestas (valor/esfuerzo, post-P6)

> Actualización P7 (28-10-2026): los items 1-4 y los 2 gaps menores de paridad
> (unicode bold, proxy por cuenta) están **hechos y verificados** (test E2E
> 25/25 + regresiones 11/11 y 24/24 + navegador). El item 7 (gap adaptativo por
> volumen) ya está **superado de serie**: nuestros huecos son de 3-10 MINUTOS,
> muy por encima del peor caso de GroupPosting (60 s). El item 6 (escalado
> graduado) lo cubre el techo por warmup 5/10/20 más el gauge de riesgo, que
> penaliza lotes grandes.

1. ✅ **Score de riesgo 0-100 pre-vuelo** (reusa warmup+auditoría que ya tenemos) — hecho en P7: factores deterministas, mitigaciones, instantánea persistida, gauge en vivo
2. ✅ **Log de entrega por grupo** con "pending admin approval" visible → hecho en P7: tabla expandible por campaña (PENDING_REVIEW visible, postUrl, motivo, worker)
3. ✅ **Rotación de adjuntos** entre jobs de la misma campaña — hecho en P7: mediaMode=rotate, rotación determinista por job
4. ✅ **Bump-comment con delay** — hecho en P7: commentDelaySec ±15% de jitter en el worker
5. **Triage de comentarios** estilo Lead Radar → evaluar integración con AGENTE-CHISMOSO antes de duplicar (pendiente de decisión de integración)
6. ✅ **Escalado graduado codificado** — cubierto: techo warmup 5/10/20 + factor "lote grande" del score de riesgo
7. ✅ **Gap mínimo adaptativo por volumen 24 h** — superado de serie: 3-10 min >> 60 s
8. **RSS→campaña recurrente** con HITL (roadmap futuro)
9. **Reporte exportable por marca** (reusa multi-marca + auditoría append-only; roadmap futuro)
10. **Packaging desktop con auto-update** para clientes no-técnicos (Electron, blueprint phantakanxm; roadmap futuro)

Gaps menores de paridad cerrados en P7: negrita unicode por segmentos *marcados*
y proxy por cuenta (FB_PROXY en el worker, declarado enmascarado en el panel).

## F. Riesgos y noticias

- **Groups API retirada en v19.0** (efectivo 2024-04-22, [changelog Meta](https://developers.facebook.com/docs/graph-api/changelog), [HN 39269642](https://news.ycombinator.com/item?id=39269642)): sin camino de regreso vía API oficial. Valida la arquitectura del módulo.
- La ruta "Direct API" (replay graphql de facebook.com) es la más expuesta a ToS/breakage: solo como experimento aislado, si algún día hace falta.
- Bans por admins ≈ mitad del problema: variación, relevancia y frecuencia importan tanto como eludir algoritmo.
- Precedente de escrutinio: flaw del Groups API a 100 devs ([ArsTechnica 2019](https://arstechnica.com/tech-policy/2019/11/facebook-groups-api-flaw-exposed-data-to-100-developers-company-says/)) — Meta audita el abuso de grupos.
- Ninguna herramienta puede prometer riesgo cero en una plataforma que no controla: replicar ese disclaimer honesto en nuestra UI nos protege.
- Supply-chain: no ingestar ZIPs de extensiones de auto-join de terceros sin revisión manual.

## Decisión de roadmap (qué NO hacemos y por qué)

- **Doble motor (Direct API)**: fuera. Riesgo ToS máximo y el DOM ya funciona con sesión real.
- **Lead Radar**: no duplicar — AGENTE-CHISMOSO ya hace escucha social; integración futura vía su mesh, no reimplementación.
- **Cuentas aged/proxies comprados**: fuera de producto; solo proxies residenciales del propio usuario como configuración local documentada.
