# Claro · Estimador de copago

Demo local para Panamá con datos completamente ficticios. Requiere Node.js 22 o posterior.

## Ejecutar

```sh
npm start
```

Ese único comando instala las dependencias si faltan, inicia QVAC local en el puerto dedicado 11435 y levanta la aplicación en http://127.0.0.1:3000. La primera ejecución requiere conectividad y puede tardar mientras descarga el modelo; las siguientes reutilizan la caché. Espera hasta 95 segundos por el worker y, si el intento GPU falla, prueba una vez en CPU. Si QVAC falla o su respuesta no pasa validación, la web no orienta ni muestra precios: permite reintentar QVAC.

Para iniciar solamente la interfaz durante desarrollo:

```sh
npm run start:web
```

Los diagnósticos avanzados siguen disponibles mediante `npm run qvac:doctor`. El modelo pequeño inicial sirve para comprobar la integración, no está validado clínicamente. No hay servicios de IA en la nube ni claves. Los casos permanecen solo en memoria, vencen tras 30 minutos de inactividad y no se guardan como historial clínico.

`qvac.config.json` concede 90 segundos al handshake RPC. `qvac.config.mjs` solicita GPU primero y el lanzador usa `QVAC_DEVICE=cpu` con `gpu_layers: 0` para el único reintento CPU; la caché queda dentro de `.cache/models`. La compatibilidad depende del backend y los controladores; Windows requiere Vulkan 1.4 incluso para CPU. Si el runtime no arranca, ejecutar `npm run qvac:doctor -- --deep --verbose` y revisar los registros; una API disponible no prueba aceleración.

Fuentes: [servidor QVAC](https://docs.qvac.tether.io/cli/http-server/), [selección de GPU](https://docs.qvac.tether.io/addons/llm-llamacpp/), [requisitos](https://docs.qvac.tether.io/system-requirements/).

## Recorrido

Seleccionar Istmo Esencial, elegir picazón en la piel, enviar, contestar duración y enviar de nuevo. La Ceiba: consulta $65, copago $15, coaseguro $10, paciente $25, seguro $40. Istmo Plus reduce el gasto a $15.50. Probar «dolor de pecho» para ver la interrupción de la comparación.

El detector ilustrativo de palabras no descarta urgencias ni maneja todas las negaciones o expresiones. La demo no es apta para decisiones clínicas o cotizaciones reales. Ver `docs/demo-spec.md`.

## Verificación realizada

- Comprobación de sintaxis de servidor y cliente.
- Recorridos manuales de navegador: dermatología, urgencia sobrevenida, pediatría, embarazo e incertidumbre. La orientación de especialidad depende exclusivamente de QVAC.
- Una validación previa observó una respuesta con `source: qvac` y un proceso `bare.exe` en la RTX; se debe repetir después de cualquier cambio de modelo, driver o configuración.
- El texto «Tengo dolor de pecho» suspende la comparación en la interfaz.

`npm run check` y 38 pruebas automatizadas pasan, incluidas las seis especialidades, preguntas estructuradas por QVAC, aislamiento de casos, reintentos idempotentes y fallback sin precios.

La revisión formal de especificación y estándares se hizo contra el punto de partida `3e14038`; los hallazgos materiales están incorporados.
