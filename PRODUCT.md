# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pacientes en Panamá que, antes de ir a una consulta ambulatoria, quieren saber cuánto les tocará pagar.
Llegan con una molestia concreta y en lenguaje cotidiano ("me pica la piel", "mi hijo tiene fiebre"), sin conocer la terminología de su póliza.
Muchos consultan desde el teléfono y algunos están preocupados por la molestia misma.

## Stack

HTML y JavaScript sin framework, servidos por `server.mjs` desde `public/`.
Los estilos usan Tailwind CSS v4 como dependencia de desarrollo (`@tailwindcss/cli`): `src/styles/app.css` se compila a `public/style.css` con `scripts/css.mjs`, que `npm start` ejecuta y deja en modo watch.
Sin CDN en tiempo de ejecución: la demo corre localmente junto al runtime QVAC y debe funcionar sin red una vez instalada.
`public/style.css` es un artefacto generado y no se versiona.

## Product Purpose

Convertir una descripción de síntomas en lenguaje natural en dos respuestas comprensibles: qué especialidad corresponde consultar y cuánto costaría esa consulta en cada hospital de la red del plan.
El éxito es que el paciente entienda su gasto estimado y el porqué del desglose antes de pedir una cita, sin creer que recibió un diagnóstico ni una cotización vinculante.

## Positioning

La conversación la conduce un modelo que corre local (QVAC), mientras que todo cálculo monetario es determinista en centavos.
Esa separación permite orientación conversacional sin enviar síntomas a la nube y sin que el modelo invente precios.

## Operating Context

Aplicación local que se levanta con `npm start`: instala dependencias, arranca QVAC en el puerto 11435 y sirve la interfaz en `http://127.0.0.1:3000`.
El paciente elige un plan, describe su molestia con sus propias palabras y recibe una comparación de hospitales, normalmente en uno o dos turnos; el agente pregunta solo cuando no logra determinar la especialidad.
El arranque del asistente puede tardar y su estado (preparando, listo, no disponible) es visible en la interfaz.

## Capabilities and Constraints

- Dos planes ficticios: Istmo Esencial (copago $15 + 20% del saldo, red de 2 hospitales) e Istmo Plus (copago $10 + 10%, red de 3).
- Tres hospitales ficticios en Ciudad de Panamá: Bahía Clara (Bella Vista), La Ceiba (Betania), Jardines del Canal (Ancón).
- Seis especialidades: medicina general, dermatología, gastroenterología, ortopedia, pediatría, ginecología/obstetricia.
- Solo consulta ambulatoria inicial. No incluye medicamentos, exámenes ni procedimientos. Sin deducible, sin límite anual, sin autorización previa.
- En red: copago + coaseguro sobre el saldo. Fuera de red: tarifa completa. Los hospitales en red se ordenan por menor gasto.
- Una posible urgencia detiene siempre la comparación de precios. En fiebre infantil se pregunta primero por señales de alarma.
- Si el agente no puede dar una orientación válida, la interfaz muestra una recuperación sin precios; nunca precios sin orientación.
- Los casos viven solo en memoria, vencen a los 30 minutos y no se escriben en disco. No se piden datos personales.
- Interfaz en español de Panamá, moneda USD.

## Brand Commitments

Nombre actual "Claro · cuidado y cobertura" y voz en español de Panamá, cercana y sin jerga aseguradora.
El usuario autorizó reemplazar libremente la identidad visual; el verde no está descartado pero tampoco es obligatorio.
Terminología fija (ver `CONTEXT.md`): copago, coaseguro, gasto estimado del paciente, red, orientación de especialidad.
Evitar "gasto total" y "precio garantizado".

## Evidence on Hand

Todos los planes, hospitales, tarifas y casos de ejemplo son ficticios y deben etiquetarse como tales.
No existen clientes, testimonios, cifras de uso, integraciones con aseguradoras ni agendamiento: nada de eso puede afirmarse ni insinuarse.
Recorrido verificable: Istmo Esencial + picazón en la piel → La Ceiba, consulta $65, copago $15, coaseguro $10, paciente $25, seguro $40.

## Product Principles

- La seguridad interrumpe el precio: ante una posible urgencia no hay estimación, sin excepción.
- Explicar el número, no solo mostrarlo: el desglose es parte de la respuesta.
- Honestidad sobre lo ficticio y sobre los límites de la demo en todo momento visible.
- El paciente habla con sus palabras; la traducción a terminología de seguros es trabajo de la aplicación.
- Privacidad local: nada sale de la computadora, nada se guarda.

## Accessibility & Inclusion

Español claro, sin jerga.
La interfaz debe ser usable con teclado y lector de pantalla (estados en vivo para respuestas del asistente), legible en teléfono y con objetivos táctiles cómodos.
