# Notas de implementación para `docs/tickets/6.md`

Hechos verificados leyendo `node_modules` durante el diseño del ticket 6.
No son decisiones: son cosas comprobadas que costarían tiempo volver a derivar.
Cada una cita dónde se comprobó, para que se pueda revalidar si QVAC cambia de versión.

Versiones en las que se comprobó: `@qvac/cli ^0.13.0`, `@qvac/inference` instalado como dependencia transitiva, Node 22.

## Carga del modelo sin descargar

`resolveModelPathInner` en `node_modules/@qvac/inference/dist/handlers/load-model/resolve.js` decide el origen del modelo por la forma del `src`.

Un `src` **sin barra** llega a `resolveLocalOrCachedFile` (líneas 22 a 43), que lo une al directorio de caché configurado y lo devuelve tal cual si el archivo existe.
No hay descarga, no hay llamada al registro y **no hay verificación de suma**.

Un `src` **con barra** se trata como ruta del sistema de archivos y se usa literalmente (líneas 216 a 225).

Ambos caminos evitan la descarga.
El de filename escueto es preferible porque mantiene la ruta absoluta fuera del repositorio.

## El GGUF local es el artefacto del registro

Archivo local:
`/home/jwhoami/Development/projects/personal/decentralized-ai-hackathon/tracks/track-3/models/Qwen3-4B-Q4_K_M.gguf`

`sha256sum` del archivo local:
`7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`

`QWEN3_4B_INST_Q4_K_M.sha256Checksum` en el registro:
`7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`

Tamaño en ambos: `2497280256` bytes.
Son los mismos pesos, así que copiar el archivo no implica ninguna diferencia de calidad frente a descargarlo.

Cuidado con el homónimo: existe también `QWEN3_4B_Q4_K_M` (sin `INST`) con tamaño `2497281312`, que **no** corresponde a este archivo.

## Configuración resultante

Copiar el GGUF a `.cache/models/` del proyecto, que es el `cacheDirectory` que ya fija `qvac.config.mjs`.

Forma explícita para el archivo local, en `serve.models.copago`:

```json
{ "type": "llm", "src": "Qwen3-4B-Q4_K_M.gguf", "config": { "device": "gpu", "gpu_layers": 999, "ctx_size": 4096, "verbosity": 2 }, "preload": true }
```

Forma por constante, para un clon nuevo con caché vacía:

```json
{ "model": "QWEN3_4B_INST_Q4_K_M", "default": true, "config": { "device": "gpu", "gpu_layers": 999, "ctx_size": 4096, "verbosity": 2 } }
```

`qvac.config.mjs` elige entre las dos según exista o no `.cache/models/Qwen3-4B-Q4_K_M.gguf`.
Ese archivo ya es un módulo real que condiciona la configuración por `QVAC_DEVICE`, así que el cambio encaja donde ya hay lógica equivalente.

Detalle a no olvidar: `preload` vale `true` por omisión en la forma por constante y `false` en la forma explícita con `src`.
Si se usa la forma explícita conviene fijar `preload: true` o el primer mensaje del paciente paga el arranque en frío.

## `type: "llm"`

`ENDPOINT_CATEGORY` en `node_modules/@qvac/cli/dist/serve/core/config/endpoint-category.js` mapea el tipo de modelo a la categoría de ruta.
`llm` y `llamacpp-completion` mapean ambos a `chat`.

`llm` es el valor de `addon` de todas las constantes Qwen del registro, y `llamacpp-completion` es el de `engine`.
Usar `llm` mantiene la coherencia con lo que el registro declara.

## Nombre de archivo en caché del registro

Solo hace falta si la ruta de filename escueto falla y conviene sembrar la caché como si QVAC la hubiera llenado.

`downloadModelFromHyperdrive` en `node_modules/@qvac/inference/dist/handlers/load-model/hyperdrive.js:531` construye el nombre así:

```
sha256(registryPath).slice(0, 16) + '_' + basename(registryPath)
```

Comprobado contra el archivo del modelo anterior que ya estaba en caché:
`registryPath` de `QWEN3_1_7B_INST_Q4` produce `f7cce66406dee646_Qwen3-1.7B-Q4_0.gguf`, que es exactamente el archivo presente.

Para `QWEN3_4B_INST_Q4_K_M`, cuyo `registryPath` es
`qvac_models_compiled/ggml/Qwen3-4B/2025-06-27/Qwen3-4B-Q4_K_M.gguf`,
el nombre esperado es:

```
6dea07e2f9342ff3_Qwen3-4B-Q4_K_M.gguf
```

Advertencia: la derivación se verificó con un modelo de origen `hf`, y este es de origen `s3`.
Por esa vía `validateCachedFile` sí comprueba tamaño y suma, que en este caso coinciden.

## Salida estructurada por gramática

`/v1/chat/completions` acepta `response_format` en tres formas, definidas en
`node_modules/@qvac/cli/dist/serve/extensions/openai/schemas/common.js:16-28`:
`{ type: 'text' }`, `{ type: 'json_object' }` y `{ type: 'json_schema', json_schema: { name?, schema } }`.

No es una sugerencia en el prompt.
`completion-stream.js:220-221` en `node_modules/@qvac/inference/dist/plugins/builtin/llamacpp-completion/ops/` extrae el esquema y lo entrega al addon como restricción de generación por petición.

Restricción conocida: `response_format` distinto de `text` no se puede combinar con `tools`, y la ruta responde `400 invalid_response_format` (`extensions/openai/routes/chat.js:34-38`).
Esto no afecta al ticket 6, que no usa `tools`.

Trampa documental: `node_modules/@qvac/cli/docs/serve/openai.md:196` lista `response_format` entre los parámetros ignorados.
Esa sección describe la ruta heredada `/v1/completions`, no `/v1/chat/completions`.
Conviene no dar marcha atrás en el diseño por leer esa línea fuera de contexto.

## Presupuesto de memoria

GPU disponible: NVIDIA RTX 4050 Laptop, 6141 MiB.
RAM del equipo: 30 GiB.

Qwen3-4B Q4_K_M ocupa 2,4 GB y cabe descargado por completo a GPU con `ctx_size: 4096`.

Los otros GGUF del mismo directorio son Qwen3-8B (4,7 GB) y Qwen3.5-9B (5,3 GB).
Ambos quedan demasiado ajustados o directamente no caben junto al compositor de escritorio, y se descartaron por eso, no por calidad.

## Superficie HTTP actual

Las rutas viven en `src/app.mjs`: `GET /api/catalog`, `GET /api/status`, `POST /api/case` y `POST /api/case/message`.

`test/api.test.mjs` levanta el servidor real con `createServer()` en un puerto efímero y sustituye `globalThis.fetch` solo para las URL que apuntan a `http://127.0.0.1:11435`.
Esa es la frontera de prueba confirmada del ticket 6.
Lo único que cambia es el contenido simulado: de líneas de enrutamiento a datos del caso en JSON.
