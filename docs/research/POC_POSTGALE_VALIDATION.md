# POC de publicación: contrato interno → Postgale

> Estado: diseño ejecutable de validación; todavía no se han corrido pruebas contra una cuenta real.
> Alcance: una marca, una cuenta social autorizada, texto sin medios y entorno de prueba. No publicar en producción sin aprobación explícita del operador.

## Objetivo

Demostrar que `COMUNITI-MANAGER` puede publicar o programar una sola pieza mediante el contrato interno `publish_post` / `schedule_post`, traducir el resultado a un registro `Publication` y verificar su estado sin duplicar publicaciones.

## Hallazgos del código actual

Archivos inspeccionados:

- [executor.ts](../../app/src/lib/executor.ts)
- [registry.ts](../../app/src/lib/registry.ts)
- [contracts.ts](../../app/src/lib/contracts.ts)
- [schema.prisma](../../app/prisma/schema.prisma)

1. `restAdapter()` envía `payload` directamente como JSON. No hay un traductor explícito desde el contrato interno al cuerpo de Postgale.
2. `publish_post` y `schedule_post` apuntan a `POST /api/v1/posts`, pero el adaptador no fuerza `publishNow: true` en publicación inmediata ni valida `scheduledFor` en programación.
3. El registro declara `verify_publication` para Postgale, pero `ROUTES.POSTGALE` no tiene una ruta para ese contrato. La llamada terminaría en `CAPACITY_UNAVAILABLE`.
4. `computeStatus()` marca una integración como `CONNECTED` si existen las variables de entorno. Eso solo confirma configuración, no validez de credenciales, permisos o salud.
5. El resultado HTTP exitoso se devuelve como `OK` sin normalizar el identificador remoto ni confirmar el estado por objetivo/red. Un HTTP 2xx no demuestra por sí solo que el post ya esté publicado.

Documentación de referencia: https://postgale.com/docs/api/posts y https://postgale.com/docs/api.

## Contrato interno propuesto

Entrada para publicación inmediata:

```ts
{
  publicationId: string,
  content: string,
  accountId: string,
  network: string,
  platformSpecificData?: Record<string, unknown>
}
```

Entrada para programación:

```ts
{
  publicationId: string,
  content: string,
  accountId: string,
  network: string,
  scheduledFor: string, // ISO-8601 con zona horaria
  platformSpecificData?: Record<string, unknown>
}
```

El adaptador debe validar tipos, campos obligatorios y que `accountId` pertenezca a la marca/organización configurada antes de llamar al proveedor. La pertenencia no debe inferirse solo del texto del payload.

## Traducción al proveedor

Publicación inmediata: `POST /api/v1/posts`, con `content`, `publishNow: true` y `platforms: [{ accountId, platformSpecificData }]`.

Programación: `POST /api/v1/posts`, con `content`, `scheduledFor` en ISO-8601 y `platforms: [{ accountId, platformSpecificData }]`.

Cabeceras: `Authorization: Bearer …`, `Content-Type: application/json` y `x-request-id` estable. La clave de idempotencia debe derivarse de la publicación persistida, no generarse aleatoriamente en cada reintento.

Verificación: leer `GET /api/v1/posts/{id}` con el identificador del proveedor guardado. Normalizar el estado por objetivo: `PUBLISHED`, `SCHEDULED`, `PENDING_APPROVAL`, `FAILED` o `UNKNOWN`. No marcar `VERIFIED` solo por recibir HTTP 2xx en la creación.

## Criterios de aceptación

- [ ] Las variables ausentes producen estado `AWAITING_CREDENTIALS`, no `CONNECTED`.
- [ ] Credenciales inválidas se detectan mediante una llamada de lectura, por ejemplo `GET /api/v1/accounts`.
- [ ] `publish_post` añade `publishNow: true`; `schedule_post` exige una fecha futura ISO-8601 válida.
- [ ] Se rechazan entradas sin contenido, cuenta o red y fechas inválidas.
- [ ] Dos intentos con la misma clave producen un único objeto remoto.
- [ ] Un timeout después de enviar la solicitud no crea una nueva clave al reintentar.
- [ ] Un HTTP 2xx con estado `pending_approval` no se registra como publicación confirmada.
- [ ] `verify_publication` consulta el ID remoto y guarda estado, URL e ID de plataforma cuando estén disponibles.
- [ ] Errores 401/403 no se reintentan automáticamente; 429 y errores transitorios respetan `Retry-After` si está presente y aplican backoff limitado.
- [ ] Una publicación rechazada o no aprobada por el flujo interno no llega al proveedor.
- [ ] El registro de auditoría contiene marca, publicación, proveedor, clave de idempotencia, ID remoto, estado y motivo de error; nunca registra API keys.
- [ ] Las pruebas usan mocks HTTP; la prueba de integración real se limita a cuentas propias autorizadas y requiere confirmación humana antes de publicar.

## Secuencia de prueba

1. Pruebas unitarias del traductor y validadores, sin red.
2. Pruebas HTTP simuladas: 201, repetición idempotente, 400, 401, 403, 429, 500 y timeout ambiguo.
3. Prueba de lectura de cuentas con credenciales reales, sin publicar.
4. Prueba de programación en cuenta propia de prueba; verificar estado con GET.
5. Solo tras aprobación explícita: publicación de texto inocuo a una cuenta propia y verificación del ID/URL final.

## Regla de salida

La integración no se considera lista hasta que todos los criterios críticos pasen. La configuración de variables de entorno por sí sola no cuenta como prueba de conexión. No usar cuentas ajenas ni automatizar publicaciones en grupos de Facebook mediante rutas no oficiales.
