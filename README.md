# Claro · Estimador de copago

Demo local para Panamá con datos completamente ficticios. Requiere Node.js 22 o posterior.

## Ejecutar

```sh
npm start
```

Abrir http://127.0.0.1:3000. La interfaz y el cálculo no requieren instalar dependencias. Sin QVAC se muestra explícitamente «Reglas de demo».

## Activar QVAC local

```sh
npm run qvac:install
npm run qvac:doctor
npm run qvac:start
```

Mantener QVAC y la aplicación abiertos en terminales distintas. El primer inicio descarga el modelo; después se reutiliza su caché. El modelo pequeño inicial sirve para comprobar la integración, no está validado clínicamente. No hay servicios de IA en la nube ni claves. No se guardan síntomas.

`qvac.config.json` solicita GPU y transferencia de capas a GPU. `qvac.config.mjs` lo carga y sitúa la caché de modelos dentro de `.cache/models` del proyecto. Al omitir `main-gpu`, QVAC prefiere dedicada y luego integrada. La compatibilidad depende del backend y los controladores; Windows requiere Vulkan 1.4 incluso para CPU. Si el runtime no arranca, ejecutar doctor y revisar los registros; no se interpreta una API disponible como prueba de aceleración. Para CPU explícita configurar `device: "cpu"` y `gpu_layers: 0`.

Fuentes: [servidor QVAC](https://docs.qvac.tether.io/cli/http-server/), [selección de GPU](https://docs.qvac.tether.io/addons/llm-llamacpp/), [requisitos](https://docs.qvac.tether.io/system-requirements/).

## Recorrido

Seleccionar Istmo Esencial, elegir picazón en la piel, enviar, contestar duración y enviar de nuevo. La Ceiba: consulta $65, copago $15, coaseguro $10, paciente $25, seguro $40. Istmo Plus reduce el gasto a $15.50. Probar «dolor de pecho» para ver la interrupción de la comparación.

El detector ilustrativo de palabras no descarta urgencias ni maneja todas las negaciones o expresiones. La demo no es apta para decisiones clínicas o cotizaciones reales. Ver `docs/demo-spec.md`.

## Verificación realizada

- Comprobación de sintaxis de servidor y cliente.
- Recorrido manual de navegador: selección de plan, pregunta de duración y desglose de dermatología.
- Solicitud real a QVAC: respuesta identificada con `source: qvac`.
- `qvac doctor`: requisitos obligatorios aprobados; detectó AMD integrada y RTX 4070 Laptop.
- `nvidia-smi`: el proceso `bare.exe` de este proyecto apareció entre los procesos de cómputo de la RTX. Esto verifica esta máquina, no todos los dispositivos posibles.
- El texto «Tengo dolor de pecho» suspende la comparación en la interfaz.

Las pruebas automatizadas y la revisión formal están pendientes de confirmar sus interfaces y punto de comparación.
