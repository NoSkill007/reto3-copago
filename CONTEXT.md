# Cobertura ambulatoria de demostración

Estimación del gasto de una consulta con planes y hospitales ficticios de Panamá.

## Language

**Copago**: Importe fijo que paga el paciente por una consulta cubierta.
_Avoid_: Gasto total

**Coaseguro**: Porcentaje a cargo del paciente sobre el saldo de la tarifa después del copago, según estos planes ficticios.

**Gasto estimado del paciente**: Suma del copago y el coaseguro en red; tarifa completa fuera de red. No es una cotización vinculante.
_Avoid_: Precio garantizado

**Red**: Conjunto de hospitales incluidos por un plan.

**Orientación de especialidad**: Sugerencia ilustrativa de la especialidad a consultar; no constituye un diagnóstico.

**Datos del caso**: Lo que el agente entendió de la conversación: especialidad, edad, embarazo, duración y señales de alarma.
Se derivan de la transcripción completa en cada turno y se reemplazan por completo; no se acumulan.
_Avoid_: Historial clínico

**Señal de alarma**: Indicio, descrito por el paciente con sus palabras, de que el caso necesita urgencias en vez de una comparación de precios.
Solo existen los ocho valores de la lista cerrada de `src/extraction.mjs`.
_Avoid_: Síntoma grave

**Agente de cobertura**: Asistente que conduce la conversación, solicita información faltante y consulta las herramientas de cobertura y comparación para ayudar al paciente a entender su gasto estimado.
