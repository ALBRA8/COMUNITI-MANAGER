# DESTRIPE CLONAKIT — BROWSER-USE

> Task 22 · 2026-11-15 · Solicitud del usuario: "mira esto que es muy conveniente
> para nuestro comuniti manager así que dale manos y sube los cambios al repo
> cuando termines" + URL del repo + token de push.
> Método: solo lectura. Fuente única: github.com/browser-use/browser-use clon
> shallow a /tmp/bu-study (FUERA de todos los árboles del proyecto), commit
> `e717df1` (2026-11-14) = tag v1.0.5. Archivos consultados: README.md (292
> líneas), MIGRATING.md, pyproject.toml, browser_use/domains.py,
> browser_use/tools.py, browser_use/agent/{loop,judge,service,views}.py,
> browser_use/browser/browser.py. **Sala limpia: no se copia código, texto ni
> assets; se extraen patrones de producto y de arquitectura.** Lo no verificable
> queda marcado como tal.

## 0. Hallazgos que definen la relación

**0.1 browser-use es la categoría de producto exacta que nuestra regla fija
§5.1 ya gobierna — y su vertiente cloud vende el arsenal que las ToS prohíben.**
Se define como "the open-source browser agent": un agente que opera un
navegador real (Chromium local o cloud) para cumplir tareas como las haría una
persona. Su oferta cloud (browser por hora de pago, con "stealth, CAPTCHA
solving and residential proxies" — texto propio de su README, consultado
15/11/2026) es precisamente el arsenal anti-detección que las condiciones de
uso de Meta/X/YouTube prohíben emplear contra sus redes. El tool es legal y
neutral (MIT); lo que decide su carácter no es el tool sino el objetivo. Nuestro
motor ya clasifica esta categoría ANTES de este destripe: `BROWSER_AUTOMATION*`
→ `BLOQUEADO` por la regla fija §5.1 de `src/lib/meta-policy.ts`
(inmodificable por agentes, solo un humano puede cambiarla, y es en el código).
Veredicto: browser-use NO es un proveedor de publicación ni un integrable de
runtime para nosotros; es un CATALOGADOR de la categoría que ya bloqueamos y,
sobre todo, un MINA DE PATRONES para operar nuestra propia app.

**0.2 La v1.0 cambió de motor y confirma hacia dónde migra la industria: de
"acciones predefinidas" a "código agéntico con guardarrails".** 0.x: el agente
elige UNA acción por paso desde un volcado de DOM con índices (registro de
acciones `Tools`). 1.0 (mayo-2026 en adelante, `MIGRATING.md`): el modelo
ESCRIBE Python en un REPL persistente con helpers y CDP crudo, sobre Pydantic
AI; el registro de acciones sobrevive como compatibilidad (`Tools()`, `registry`)
y los guardarrails pasaron a ser la pieza crítica (`domains.py`). Lectura para
nuestro roadmap: el patrón "agente que escribe código contra una superficie
documentada con guardarrails duros" es el mismo patrón que ya adoptamos con
`/llms.txt` + HITL + techos P13 — sin el navegador de por medio.

**0.3 Sus guardarrails de dominio son adoptables al 100% — y podemos ser MÁS
ESTRICTOS que ellos.** Patrón verificado en `domains.py` + `browser.py`:
allowlist/prohibitlist con patrones (`example.com`, `*.example.com`,
`https://host/ruta`, `host:puerto`), lista mínima de siempre-permitidos
(`about:blank`, pestaña nueva, `data:`, `blob:`), denegación de `file:` y
esquemas sin host (`javascript:`), bloqueo opcional de IP literales. TRES capas
de enforcement: (a) los helpers del agente rechazan la URL no permitida,
(b) un guard en conexión CDP propia falla las requests de documento principal a
hosts no permitidos, (c) un barrido tras cada celda resetea pestañas que sigan
en página prohibida. Y la honestidad de su trust model es ejemplar y la
copiamos como doctrina: "un guardia para un modelo alineado, NO una sandbox" —
los subrecursos (fetch, imágenes, iframes) no se filtran y la red propia del
agente no pasa por el guard. Nuestra app es 100% local: deny-by-default también
para subrecursos de terceros, sin excepciones.

**0.4 El juez post-corrida es un patrón de QA directo.** `agent/judge.py`: tras
cada corrida, una pasada verifica la ejecución contra la tarea y destila
"gotchas" (lecciones cortas y generales sobre los sitios visitados, para el
próximo agente). El último commit del repo (1.0.5, 2026-11-14) es exactamente
"the judge, with screenshots and gotchas on success". Versión nuestra,
determinista y sin LLM: un juez final que re-verifica invariantes del arnés
(0 excepciones no capturadas, 0 violaciones de guardarrails no esperadas, todas
las misiones en verde) al cierre de cada batería.

**0.5 La conveniencia REAL para COMUNITI-MANAGER no está donde apunta el
marketing.** Tres usos legítimos: (a) arnés agéntico propio para E2E/QA de
nuestro panel — operar nuestra UI como lo hace un usuario real, con registro de
acciones y guardarrails (implementado HOY, §5); (b) patrones de guardarrails
multi-capa para el worker y para cualquier agente interno futuro (la misma
filosofía de techos y CAS que ya usamos, ahora también en la capa de navegador);
(c) confirmación externa de nuestra dirección: los referentes comerciales
(Blotato/Postgale, Task 17) publican por API oficial y los referentes agénticos
(browser-use) operan navegadores — la intersección "automatización de navegador
contra redes sociales" es la única zona que TODOS evitan o cobran por separado,
y nuestra §5.1 ya la tiene bloqueada por diseño.

## 1. Ficha rápida del destripado

| Campo | Valor (fuente: repo clonado, 15/11/2026) |
| --- | --- |
| Producto | browser-use — "the open-source browser agent" |
| Versión estudiada | 1.0.5 (commit `e717df1`, 2026-11-14 — repositorio con actividad diaria) |
| Licencia | MIT |
| Lenguaje | Python (>=3.11) + TypeScript (SDK) |
| Motor 1.0 | modelo escribe Python en REPL persistente + CDP crudo, sobre Pydantic AI |
| Motor 0.x (histórico) | una acción por paso desde volcado de DOM + registro `Tools` |
| Navegador local | Chromium local (vía Playwright internamente) |
| Cloud propio | browser de pago por hora, stealth, CAPTCHA, proxies residenciales (texto de su README; precio y detalles NO verificados por nosotros) |
| Restricción cloud relevante | el navegador cloud NO alcanza localhost/IPs privadas — para operar nuestra app hace falta browser local (nuestro caso exacto) |
| Regla de versionado recomendada por el propio repo | pin exacto (`==`, nunca `>=`): "releases move fast and can break APIs" |

## 2. Arquitectura verificada (módulo por módulo)

- `agent/loop.py` (1353 líneas): el bucle agéntico. Sesión con historial,
  compaction de mensajes, streaming, topes de ejecución. Patrón: el "cerebro"
  produce CÉLULAS DE CÓDIGO, no llamadas a acciones fijas.
- `agent/judge.py`: juez post-corrida (verifica la corrida contra la tarea;
  produce veredicto + gotchas reutilizables; apagable).
- `browser/domains.py`: `DomainRules` — la pieza de compliance. Patrones de
  dominio, siempre-permitidos mínimos, denegación de esquemas peligrosos,
  bloqueo de IPs literales, y tres capas de enforcement (helper / guard CDP /
  barrido post-celda). Documentación honesta de límites del guard (ver 0.3).
- `browser/browser.py` + `browser/local.py`: sesión de navegador; la
  configuración acepta `allowed_domains` / `prohibited_domains` /
  `block_ip_addresses` y también por variable de entorno.
- `tools.py`: registro de acciones del 0.x mantenido por compatibilidad
  (`Tools()`, `@registry.action`); en 1.0 queda como vía de acciones
  personalizadas, no como motor.
- `sensitive_data`: secretos con alcance de dominio, tecleo vía `type_secret`,
  redacción de valores en salidas — con trust model explícito de que NO es una
  sandbox (nosotros: ni los tocamos; nuestros guardarrails son de origen, no de
  redacción).
- `output_model_schema` → `result.structured_output`: extracción estructurada
  contra un schema en vez de texto libre.

## 3. Patrones extraíbles (extracto sala limpia, numerado)

1. **Registro de acciones con validación**: toda acción declarada en un
   registro (nombre, validación de argumentos, executor único); nada de
   scripts sueltos ni `eval`.
2. **Guardarrails deny-by-default**: allowlist de orígenes + lista mínima de
   siempre-permitidos + denegación de esquemas peligrosos (`file:`,
   `javascript:`) + bloqueo de IP literales.
3. **Enforcement en capas**: validación en el executor + interceptor de red +
   barrido post-paso. Una capa sola siempre tiene agujeros; ellos lo dicen
   abiertamente y nosotros lo formalizamos: capas, no un solo guardia.
4. **Honestidad del trust model**: documentar QUÉ no cubre el guardarrail
   (subrecursos, red del propio agente) junto a lo que cubre.
5. **Topes duros del bucle**: máximo de pasos y de tiempo; fallo declarado en
   lugar de bucle infinito; auto-corrección con memoria de fallos.
6. **Juez de cierre**: re-verificación de invariantes al terminar, con
   registro de lecciones para la siguiente corrida.
7. **Extracción estructurada**: estado de la página contra un schema (JSON
   con claves fijas), no capturas de texto libre.
8. **Secretos fuera del alcance**: si algún día un agente maneja credenciales,
   alcance por dominio y redacción en logs — o mejor, ni eso: cero
   credenciales en el agente (nuestra decisión).
9. **Pin exacto de versiones** de dependencias rápidas (`==`, nunca `>=`).
10. **Observabilidad por paso**: historial estructurado (acción, argumentos,
    resultado, duración) + capturas de evidencia.

## 4. Matriz de compliance — mapeo al motor de 6 estados

| Uso de un agente de navegador | Veredicto del motor | Base |
| --- | --- | --- |
| Publicar en FB grupos/páginas, X, YT, TikTok, IG vía navegador | `BLOQUEADO` | Regla fija §5.1 (meta-policy.ts, inmodificable por agentes); ToS de las redes |
| Scrapear redes sociales con sesión propia del usuario | `BLOQUEADO` | Meta prohíbe la automatización de scraping; nunca autorizado en REGLAS_POSTEO_REDES_BF.md |
| Operar NUESTRO panel (localhost) para QA/E2E | `PERMITIDO` | Propiedad propia, sin datos de terceros, sin credenciales de redes |
| Extraer estado estructurado de nuestra propia UI | `PERMITIDO` | Ídem |
| Destripes de producto con capturas aportadas por humanos | `PERMITIDO_CON_CONDICIONES` | Método sala limpia con humano en el loop (precedente Blotato, Task 17) |
| Cloud con stealth/CAPTCHA/proxies residenciales contra redes | `BLOQUEADO` | Equivale a circunvenir enforcement (§5.1); además requiere gasto y cuenta externa |

## 5. Qué adoptamos HOY (P17-lite, implementado en este commit)

`scripts/agent-browser-e2e.cjs` — arnés agéntico propio (Node + Playwright ya
presente en el entorno, cero dependencias nuevas en el entregable) que aplica
los patrones 1-7 y 10 sobre NUESTRA app:

- **Registro de acciones** (`REGISTRY`): `abrir`, `clicRol`, `textoVisible`,
  `captura`, `extraerEstado`, `esperar`, `fin` — cada una con validación y
  executor único; las misiones son secuencias declarativas del registro.
- **Guardarrails deny-by-default** (más estrictos que browser-use): solo
  `localhost`/`127.0.0.1` (del `TEST_BASE`) en la allowlist; `about:blank`,
  `data:`, `blob:` permitidos; `file:` y `javascript:` denegados; TODA request
  (documentos Y subrecursos) fuera de lista se aborta y queda registrada como
  violación con su misión.
- **Topes duros**: máximo de pasos y de tiempo por misión; fallo declarado.
- **Extracción estructurada**: `extraerEstado()` devuelve JSON de claves fijas
  (url, title, h1, navegación, botones, errores de consola).
- **Juez determinista de cierre**: 0 excepciones no capturadas, 0 violaciones
  no esperadas, misiones en verde; violación esperada (prueba negativa de
  guardarrails) distinguida de la inesperada.
- **Observabilidad**: historial tabulado por paso + capturas en /tmp.

Misiones (solo lectura, sin artefactos en DB — higiene de la casa): portada
renderiza con navegación completa; navegación REAL por botón al módulo Grupos
de Facebook; navegación al Centro de Cumplimiento Meta (pestaña Techos
multi-red); prueba negativa del guardarrail (navegación a terceros abortada);
estado estructurado; juicio final. Alcance: `TEST_BASE` únicamente.

## 6. Qué NO hacemos (decisión sala limpia)

- **No integrar browser-use como dependencia** de runtime ni de desarrollo:
  su motor 1.0 empuja su gateway/cloud por defecto, se mueve rápido (ellos
  mismos exigen pin exacto), es Python en un entregable Node/TS, y su caso de
  uso primario (operar la web de terceros con un navegador agéntico) es la
  categoría que nuestra §5.1 tiene bloqueada. Lo que vale no se importa: se
  re-implementa como patrón propio (hecho, §5).
- **No apuntar el arnés fuera de `TEST_BASE`**: la allowlist es de código, no
  de configuración.
- **No credenciales ni secretos en el agente de QA**: no hay nada que
  redactar; el patrón 8 queda registrado para el futuro y deliberadamente sin
  uso.

## 7. Backlog propuesto a partir del destripe (requiere decisión del operador)

- **P17 completo (opcional)**: planner LLM detrás de HITL para declarar
  misiones de QA en lenguaje natural contra nuestro panel (veredicto previo
  del motor: `REQUIERE_APROBACION`); el executor seguiría siendo el registro
  de acciones con guardarrails de este commit.
- Integrar la batería agéntica a la regresión certificada (sumaría sus checks
  al 199/199 tras la próxima ventana de certificación).
- Gotchas de QA destilados (patrón juez) en la memoria de QA del workspace.
- La superficie agéntica de lectura ya existe (`/llms.txt` v2-lite); este
  destripe la valida externamente: es exactamente lo que este ecosistema
  publica para que agentes como este sepan QUÉ pueden y qué no.
