# Claro · Estimador de copago

Demo local para Panamá con datos completamente ficticios. Requiere Node.js 22 o posterior.

## Ejecutar

```sh
npm start
```

Ese único comando instala las dependencias si faltan, inicia QVAC local en el puerto dedicado 11435 y levanta la aplicación en http://127.0.0.1:3000. La primera ejecución requiere conectividad y puede tardar mientras descarga el modelo; las siguientes reutilizan la caché. Espera hasta 95 segundos por el worker y, si el intento GPU falla, prueba una vez en CPU. Si la respuesta del agente tiene un formato inválido, la aplicación le pide una corrección automática una vez antes de detener la orientación; nunca muestra precios sin una orientación válida.

Para iniciar solamente la interfaz durante desarrollo:

```sh
npm run start:web
```

Los diagnósticos avanzados siguen disponibles mediante `npm run qvac:doctor`. El modelo pequeño inicial sirve para comprobar la integración, no está validado clínicamente. No hay servicios de IA en la nube ni claves. Los casos permanecen solo en memoria, vencen tras 30 minutos de inactividad y no se guardan como historial clínico.

## Seguridad y límites de la demo

- Una posible urgencia detiene siempre la estimación. En menores de 12 años con fiebre, la aplicación pregunta primero por señales de alarma; una respuesta afirmativa bloquea precios y recomienda urgencias. No diagnostica ni sustituye la atención médica.
- La estimación muestra cuándo fue generada, su tipo de consulta y exclusiones. Incluye únicamente una consulta ambulatoria inicial ficticia; no confirma cobertura ni garantiza pago.
- La selección de hospital es un siguiente paso informativo. La demo no está conectada a agendas, geolocalización ni sistemas de beneficios.
- No ingreses nombres, números de póliza, cédula u otros datos personales.

Para operar con beneficios reales se necesita un adaptador autorizado por aseguradora/hospital que consulte elegibilidad vigente, red, proveedor, tipo de visita, deducible acumulado, autorizaciones y fecha de atención. Hasta contar con ese acceso, todos los planes, tarifas y hospitales permanecen marcados como ficticios.

`qvac.config.json` concede 90 segundos al handshake RPC. `qvac.config.mjs` solicita GPU primero y el lanzador usa `QVAC_DEVICE=cpu` con `gpu_layers: 0` para el único reintento CPU; la caché queda dentro de `.cache/models`. La compatibilidad depende del backend y los controladores; Windows requiere Vulkan 1.4 incluso para CPU. Si el runtime no arranca, ejecutar `npm run qvac:doctor -- --deep --verbose` y revisar los registros; una API disponible no prueba aceleración.

Fuentes: [servidor QVAC](https://docs.qvac.tether.io/cli/http-server/), [selección de GPU](https://docs.qvac.tether.io/addons/llm-llamacpp/), [requisitos](https://docs.qvac.tether.io/system-requirements/).

## Recorrido

Seleccionar Istmo Esencial y describir la molestia con palabras propias: «tengo unas ronchas rojas que me pican mucho en el brazo desde ayer». La Ceiba: consulta $65, copago $15, coaseguro $10, paciente $25, seguro $40. Istmo Plus reduce el gasto a $15.50. Probar «mi hijo tiene fiebre y vomita cada 30 minutos» para ver la interrupción de la comparación por señal de alarma.

El modelo local extrae las señales de alarma del lenguaje del paciente, pero no descarta urgencias. La demo no es apta para decisiones clínicas o cotizaciones reales. Ver `docs/demo-spec.md`.

## Verificación realizada

- Comprobación de sintaxis de servidor y cliente.
- `npm run eval:extraction` contra Qwen3-4B: precisión de orientación 100% (14/14), cobertura de señales de alarma 100% (8/8) y un turno promedio hasta la comparación. Ver las advertencias sobre el tamaño del conjunto en `docs/tickets/6-notes.md`.
- Prueba de humo `QVAC_LIVE_TEST=1 npm run test:qvac:live` contra el modelo local, en verde.
- Los recorridos manuales de navegador son anteriores al cambio de modelo y de extracción; hay que repetirlos.

`npm run check` y las pruebas automatizadas cubren las diez especialidades, la detención por señal de alarma y su precedencia, la pregunta de seguimiento redactada por el modelo, la corrección de un dato en un turno posterior, el aislamiento de casos, los reintentos idempotentes y el fallback sin precios. Para comprobar que un turno real llega hasta el modelo, con `npm start` activo ejecuta `$env:QVAC_LIVE_TEST=1; npm run test:qvac:live` en PowerShell. Esa prueba es humo opcional: la calidad del modelo la mide la evaluación de extracción.

## Evaluación de extracción

Con `npm start` (o `npm run qvac:start`) activo, `npm run eval:extraction` mide contra QVAC real qué tan bien orienta el sistema: precisión de especialidad, cobertura de señales de alarma y turnos promedio hasta la comparación, sobre un conjunto etiquetado en `eval/dataset.mjs`. No tiene umbral de aprobación, no participa en `npm test` y sus números dependen del modelo activo en `qvac.config.json`.

Las señales de alarma pediátricas usadas por la demo se basan en orientación pública de la [OMS](https://www.who.int/publications/i/item/9789241510219) y los [signos de emergencia en niños de CDC](https://www.cdc.gov/flu/signs-symptoms/). Son un guardarraíl conservador, no una guía clínica completa.

La revisión formal de especificación y estándares se hizo contra el punto de partida `3e14038`; los hallazgos materiales están incorporados.
