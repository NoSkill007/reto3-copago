# Demo de copago para Panamá

Alcance confirmado: aplicación local en español, dos planes y tres hospitales ficticios, consultas ambulatorias, selección de plan precargado, orientación desde síntomas y comparación del gasto con desglose. IA local mediante QVAC, preferencia GPU dedicada, integrada y CPU según disponibilidad. Los datos son sintéticos, denominados en USD y no representan condiciones reales de Panamá.

Los importes los calcula código determinista en centavos. En red: copago limitado a la tarifa + coaseguro sobre el saldo; fuera de red: tarifa completa. No hay deducible, límite anual ni autorización previa en estos planes ficticios. Ordenar primero hospitales de la red por gasto. La consulta no incluye medicamentos, exámenes ni procedimientos.

La orientación de demostración usa un catálogo pequeño; las señales potencialmente urgentes bloquean precios. No es un sistema de triaje clínico validado. La indisponibilidad de QVAC se etiqueta explícitamente y permite explorar las reglas de la demo.

## Decisiones confirmadas en la entrevista

- El objetivo de entrega es confirmar la participación en el reto; el usuario dispone de tres días. No se ha proporcionado una rúbrica.
- QVAC debe conducir la conversación, solicitar datos faltantes y consultar herramientas de cobertura y comparación. Los cálculos monetarios siguen siendo deterministas y verificables.
- Se conservan para la demo el copago fijo más coaseguro y la ausencia de deducible, límites y autorizaciones. Estas condiciones deben ser visibles al consultar el plan.
- El alcance incluye adultos, niños y embarazo; no se limita a adultos.
- El agente formula como máximo cinco preguntas de seguimiento. Debe detener las preguntas y consultar cobertura en cuanto tenga información suficiente, aunque esto ocurra antes de la quinta.

- Se añaden pediatría y ginecología/obstetricia al catálogo, con tarifas ficticias en los tres hospitales. Todos los planes, hospitales, tarifas y casos de ejemplo deben ser ficticios.
- Si se agotan cinco preguntas sin información suficiente, explicar qué sigue incierto y ofrecer comparar una consulta inicial apropiada para la edad y el contexto, sin afirmar una especialidad definitiva.
- Ante una posible urgencia, interrumpir la comparación de precios, incluso si todavía no se agotaron las preguntas.

## Estado y límites de integración

QVAC conduce la conversación y elige las acciones permitidas; el cálculo de cobertura se mantiene determinista. Antes de QVAC, un guardarraíl de seguridad puede interrumpir una posible urgencia o solicitar una comprobación de señales de alarma ante fiebre infantil. Esta interrupción no es una orientación clínica ni un diagnóstico.

Los datos de beneficios siguen siendo sintéticos. Para convertir la estimación en una cotización vinculante faltan accesos autorizados a elegibilidad, red, proveedor, tipo de consulta, deducible, autorizaciones y vigencia de la póliza. La aplicación no debe afirmar que tiene esos datos ni ofrecer agendamiento hasta que exista esa integración.

La selección automática de GPU se configura sin main-gpu. El dispositivo real no puede deducirse de la disponibilidad de la API: verificar registros del runtime antes de afirmarlo.
