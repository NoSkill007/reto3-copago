# Claro · Estimador de copago

Demo local para Panamá con datos completamente ficticios. Requiere Node.js 22 o posterior.

## Ejecutar

```sh
npm start
```

Ese único comando instala las dependencias si faltan, inicia QVAC local en el puerto dedicado 11435 y levanta la aplicación en http://127.0.0.1:3000. La primera ejecución requiere conectividad y puede tardar mientras descarga el modelo; las siguientes reutilizan la caché. Si QVAC falla, la web permanece disponible y permite elegir explícitamente el modo de reglas.

Para iniciar solamente la interfaz durante desarrollo:

```sh
npm run start:web
```

Los diagnósticos avanzados siguen disponibles mediante `npm run qvac:doctor`. El modelo pequeño inicial sirve para comprobar la integración, no está validado clínicamente. No hay servicios de IA en la nube ni claves. Los casos permanecen solo en memoria, vencen tras 30 minutos de inactividad y no se guardan como historial clínico.

`qvac.config.json` solicita GPU y transferencia de capas a GPU. `qvac.config.mjs` lo carga y sitúa la caché de modelos dentro de `.cache/models` del proyecto. Al omitir `main-gpu`, QVAC prefiere dedicada y luego integrada. La compatibilidad depende del backend y los controladores; Windows requiere Vulkan 1.4 incluso para CPU. Si el runtime no arranca, ejecutar doctor y revisar los registros; no se interpreta una API disponible como prueba de aceleración. Para CPU explícita configurar `device: "cpu"` y `gpu_layers: 0`.

Fuentes: [servidor QVAC](https://docs.qvac.tether.io/cli/http-server/), [selección de GPU](https://docs.qvac.tether.io/addons/llm-llamacpp/), [requisitos](https://docs.qvac.tether.io/system-requirements/).

## Recorrido

Seleccionar Istmo Esencial, elegir picazón en la piel, enviar, contestar duración y enviar de nuevo. La Ceiba: consulta $65, copago $15, coaseguro $10, paciente $25, seguro $40. Istmo Plus reduce el gasto a $15.50. Probar «dolor de pecho» para ver la interrupción de la comparación.

El detector ilustrativo de palabras no descarta urgencias ni maneja todas las negaciones o expresiones. La demo no es apta para decisiones clínicas o cotizaciones reales. Ver `docs/demo-spec.md`.

## Verificación realizada

- Comprobación de sintaxis de servidor y cliente.
- Recorridos manuales de navegador: dermatología, urgencia sobrevenida, pediatría, embarazo e incertidumbre; pediatría y embarazo también se comprobaron mediante el modo de reglas explícito cuando QVAC no entregó una acción válida.
- Solicitud real a QVAC: respuesta identificada con `source: qvac`.
- `qvac doctor`: requisitos obligatorios aprobados; detectó AMD integrada y RTX 4070 Laptop.
- `nvidia-smi`: el proceso `bare.exe` de este proyecto apareció entre los procesos de cómputo de la RTX. Esto verifica esta máquina, no todos los dispositivos posibles.
- El texto «Tengo dolor de pecho» suspende la comparación en la interfaz.

`npm run check` y 45 pruebas automatizadas pasan, incluidas las seis especialidades, respuestas breves asociadas a la pregunta previa, aislamiento de casos, reintentos idempotentes y fallback de QVAC.

La revisión formal de especificación y estándares se hizo contra el punto de partida `3e14038`; los hallazgos materiales están incorporados.
