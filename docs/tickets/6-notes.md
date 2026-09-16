# Notas de implementación para `docs/tickets/6.md`

## Estado de la entrega

Entregados y en `main`: paso 1 (catálogo a diez especialidades y cinco hospitales, commit `2ecba2a`) y paso 2 (arnés de evaluación en `eval/`, commit `26d1a40`).
El paso 3 (extracción y clasificación con su ADR) y el cambio de modelo a Qwen3-4B se entregaron después, en la sesión que documenta la sección "Paso 3 entregado" al final de este archivo.
Siguen sin tocarse el paso 4 (SQLite), el paso 5 (explicación) y el paso 6 (interfaz).
`npm run eval:extraction` corre contra QVAC real; con el Qwen3-1.7B de los pasos 1 y 2 midió 45% de precisión de orientación, 100% de cobertura de señales de alarma y 0/2 casos vagos que preguntaron en vez de adivinar, la línea base contra la que se compara el paso 3.

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

## Paso 3 entregado

Extracción y clasificación en producción, con el ADR en `docs/adr/0001-extraccion-y-clasificacion.md`.

`src/extraction.mjs` hace la única llamada por turno con `response_format` de tipo `json_schema`, y `src/classification.mjs` es la función pura que decide detener, preguntar o comparar.
`src/qvac.mjs` queda como transporte (`qvacStatus` y `chatCompletion`) sin decisión de acción.
`src/agent.mjs` es un orquestador delgado: extraer, clasificar, calcular, responder.
Desaparecen `src/orientation.mjs`, `src/safety.mjs` y `src/conversation.mjs`, y con ellos toda expresión regular de comprensión del lenguaje y la compuerta de seguridad de fiebre infantil, que ahora es una señal de alarma más.
`eval/extraction.mjs` y `eval/classify.mjs` se eliminan: `eval/run.mjs` importa los módulos de producción, así que la evaluación mide el código que el paciente usa.

El cambio de modelo de "Modelo e inferencia" se hizo aquí porque la calidad de la extracción depende de él.
`qvac.config.json` declara la constante `QWEN3_4B_INST_Q4_K_M` y `qvac.config.mjs` prefiere `.cache/models/Qwen3-4B-Q4_K_M.gguf` cuando existe, con `preload: true` porque esa forma no lo activa por omisión.
El GGUF local se copió a la caché y su SHA-256 coincide con el del registro.

`test/api.test.mjs` simula datos del caso en JSON en vez de líneas de enrutamiento, en la misma frontera pública.
`test/qvac-live.test.mjs` se reduce a humo.
Pendiente del paso 5: el respaldo a la plantilla cuando la explicación falla, que hoy no se puede probar porque la explicación sigue siendo la plantilla.

## Mediciones del paso 3

Con Qwen3-4B y el prompt de `src/extraction.mjs`, `npm run eval:extraction` mide:
precisión de orientación 100% (11/11), cobertura de señales de alarma 100% (8/8), turnos promedio hasta la comparación 1,00 y 1/2 casos vagos que preguntan en vez de adivinar.
La línea base antes del paso 3, con Qwen3-1.7B y el prompt de enrutamiento, era 45%, 100% y 0/2.

Estas cifras hay que leerlas con cuidado.
El conjunto es pequeño (once casos de orientación, ocho de señal de alarma, dos vagos) y el prompt se ajustó en la misma sesión mirando estos resultados, así que el 100% mide en parte el ajuste al conjunto y no solo la capacidad del modelo.
Los ejemplos del prompt se redactaron a propósito con molestias y palabras que no aparecen en `eval/dataset.mjs`, para que la medición no sea memoria del prompt; el texto de los alcances por especialidad y de las pistas de señal de alarma, en cambio, sí se afinó mirando los fallos.
Ampliar el conjunto es la forma de recuperar la señal.

El caso `vague-malestar-general` sigue fallando: "tengo un malestar general" se orienta a medicina general en vez de preguntar.
La palabra "general" aparece literalmente en la molestia y el modelo se ancla en ella.
Se dejó fallando a propósito: la forma de arreglarlo era citar la frase del conjunto en el prompt, que convertiría la medición en una tautología.

Dos hallazgos del camino, por si vuelven a aparecer:
El arreglo de `redFlags` con `enum` invita al modelo a enumerar los ocho valores en vez de seleccionar; se corrigió con ejemplos que muestran `[]` y con la instrucción de preguntarse si la persona necesita urgencias ahora mismo.
El alcance de `general` en el catálogo decía "sentirse mal en general", que coincide literalmente con la molestia vaga que debía producir null; el fallo estaba en la descripción del catálogo y no en el modelo.

`eval/run.mjs` tenía un error que impedía medir las correcciones: cortaba el recorrido en la primera comparación, así que el segundo mensaje del caso de corrección nunca se enviaba.
Ahora solo la señal de alarma es terminal, igual que en producción, y los turnos hasta la comparación registran la primera vez que se alcanza.

`QVAC_BASE_URL` se añadió a `src/qvac.mjs` para poder evaluar contra una instancia distinta de la que sirve la demo.

Pendientes: paso 4 (SQLite), paso 5 (explicación) y paso 6 (interfaz).
`public/app.js` solo perdió la rama de la compuerta de seguridad, que ya no puede ocurrir; el resto de la interfaz es trabajo del paso 6.
