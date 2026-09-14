# Estimador agéntico de copago y cobertura · Demo Panamá

Estado: alcance y frontera de pruebas confirmados por el usuario; listo para implementación.

## Problem Statement

Antes de atenderse, un paciente necesita entender qué consulta explorar, si su plan cubre al hospital y cuánto podría pagar. La información dispersa y las condiciones del seguro dificultan comparar alternativas.

El proyecto debe demostrar esta experiencia para confirmar la participación en un reto, con un plazo declarado de tres días. La versión inicial ya compara importes ficticios, pero selecciona especialidades mediante palabras clave y utiliza QVAC solo como redactor: todavía no constituye la conversación agéntica acordada.

## Solution

Una aplicación local en español para Panamá permite seleccionar un plan precargado y describir síntomas de un paciente ficticio. QVAC conduce la conversación, recoge el contexto que falte y consulta herramientas de cobertura y comparación. El paciente recibe una orientación de especialidad, un desglose del gasto estimado y opciones de hospitales de la red ordenadas por menor gasto.

El alcance incluye adultos, niños y embarazo. El agente hace como máximo cinco preguntas de seguimiento y se detiene antes cuando reúne información suficiente. Si persiste la incertidumbre, la explica y ofrece comparar una consulta inicial apropiada para la edad y el contexto. Ante una posible urgencia interrumpe los precios.

Todos los planes, hospitales, tarifas y ejemplos son ficticios y están identificados como tales. Los cálculos son deterministas; la IA nunca es la fuente de los importes. La inferencia funciona localmente con preferencia por GPU dedicada, luego integrada y finalmente CPU compatible.

## User Stories

1. Como participante del reto, quiero mostrar un recorrido completo para demostrar una solución funcional dentro del plazo disponible.
2. Como usuario de la demo, quiero identificar sus datos ficticios para distinguirla de una cotización real.
3. Como paciente ficticio, quiero seleccionar uno de dos planes precargados para consultar sus condiciones.
4. Como paciente ficticio, quiero ver copago, coaseguro y ausencia de deducible, límites y autorizaciones para entender el cálculo.
5. Como paciente ficticio, quiero describir mis molestias en español con mis propias palabras para iniciar la conversación.
6. Como usuario, quiero aportar la edad y el contexto relevantes para obtener una orientación adecuada al caso de demostración.
7. Como adulto, quiero explorar consultas ambulatorias dentro del catálogo disponible.
8. Como cuidador de un niño ficticio, quiero disponer de pediatría para comparar una consulta inicial.
9. Como paciente ficticia embarazada, quiero disponer de ginecología/obstetricia y considerar ese contexto en la orientación.
10. Como usuario, quiero que QVAC solicite únicamente información faltante para evitar preguntas repetitivas.
11. Como usuario, quiero recibir como máximo cinco preguntas de seguimiento para mantener breve la conversación.
12. Como usuario, quiero que el agente deje de preguntar en cuanto tenga información suficiente, aunque solo haya hecho tres preguntas o menos.
13. Como usuario, quiero que se expliquen las incertidumbres que persistan para entender los límites de la orientación.
14. Como usuario, quiero que se me ofrezca comparar una consulta inicial cuando no sea posible orientar con suficiente información.
15. Como usuario, quiero que una posible urgencia interrumpa la comparación económica en cualquier momento.
16. Como usuario, quiero ver la especialidad como orientación, sin confundirla con un diagnóstico definitivo.
17. Como paciente ficticio, quiero que el agente consulte las condiciones de mi plan para fundamentar su respuesta.
18. Como paciente ficticio, quiero comparar tres hospitales ficticios para conocer mis alternativas.
19. Como paciente ficticio, quiero distinguir hospitales dentro y fuera de red para entender dónde aplica la cobertura.
20. Como paciente ficticio, quiero ver primero el hospital de la red con menor gasto estimado para identificar la alternativa económica.
21. Como paciente ficticio, quiero ver tarifa, copago, coaseguro, aporte del seguro y gasto estimado para entender cada importe.
22. Como usuario, quiero que los importes estén expresados en USD y que los totales sean consistentes.
23. Como usuario, quiero saber que medicamentos, exámenes y procedimientos no forman parte de la estimación de consulta.
24. Como usuario, quiero que cambiar de plan invalide la comparación anterior para no interpretar resultados desactualizados.
25. Como usuario, quiero que las respuestas de la IA respeten los resultados de las herramientas para evitar precios o coberturas inventados.
26. Como usuario, quiero identificar si la respuesta proviene de QVAC o de las reglas de demostración.
27. Como usuario, quiero poder explorar las reglas si QVAC no está disponible, con esa limitación claramente indicada.
28. Como usuario, quiero que mis datos se procesen localmente y no se persistan como historial clínico.
29. Como participante, quiero ejecutar el proyecto en dispositivos distintos sin depender exclusivamente de una RTX 4070.
30. Como participante, quiero comprobar el estado de QVAC y la aceleración utilizada sin presentar una preferencia configurada como evidencia de uso real.

## Implementation Decisions

- Conservar la aplicación local existente, su catálogo sintético y su motor de cálculo; ampliar la conversación en lugar de reconstruir la demo.
- Ampliar el catálogo actual de medicina general, dermatología, gastroenterología y ortopedia con pediatría y ginecología/obstetricia. Incorporar tarifas sintéticas consistentes para los tres hospitales y ambos planes.
- Incorporar un coordinador conversacional respaldado por QVAC. Mantener estado transitorio del caso, plan seleccionado, contexto aportado, preguntas realizadas, incertidumbres y resultado de herramientas.
- El contrato externo debe distinguir entre solicitar información, ofrecer consulta inicial con incertidumbre, presentar comparación, interrumpir por posible urgencia y comunicar indisponibilidad. Validar las acciones propuestas por el modelo antes de ejecutarlas.
- Exponer al agente herramientas limitadas a consultar catálogo, cobertura y comparación. Admitir únicamente identificadores válidos del catálogo. Los resultados monetarios proceden exclusivamente del motor determinista.
- El límite de cinco preguntas se hace cumplir fuera del modelo. Una pregunta de seguimiento solicita un dato o aclaración: no se permite eludir el límite agrupando varias preguntas en un mensaje. La selección inicial de plan y la descripción inicial de síntomas no son preguntas de seguimiento.
- Reutilizar la información ya aportada. Recoger edad y contexto pertinente cuando hagan falta; no asumir una edad o embarazo ausentes. Si al agotar preguntas falta contexto indispensable, explicar esa limitación sin inventar una orientación adecuada.
- La interrupción por posible urgencia tiene prioridad sobre preguntas pendientes y resultados económicos. Retirar cualquier comparación anterior del caso al interrumpirlo. El detector actual de palabras clave es un punto de partida ilustrativo, no un triaje validado.
- Mantener importes en centavos. En red, limitar copago a la tarifa y aplicar el porcentaje de coaseguro sobre el saldo; redondear el coaseguro a centavos. El aporte del seguro es tarifa menos gasto del paciente. Fuera de red, el paciente paga la tarifa completa.
- Ordenar primero las opciones en red por gasto del paciente. Identificar aparte las opciones fuera de red; no presentarlas como cubiertas.
- Mostrar condiciones simplificadas del plan y carácter estimativo de la consulta. La respuesta del modelo no puede modificar ni completar tarifas ausentes.
- Mantener la conexión QVAC en loopback y las conversaciones transitorias. La descarga inicial del modelo requiere conectividad; la inferencia posterior usa los recursos locales disponibles.
- Conservar selección automática de GPU compatible sin fijarla a una marca o modelo. Verificar en cada entorno la compatibilidad y separar estado del modelo, preferencia de hardware y evidencia de dispositivo activo.
- Mantener el modo de reglas como alternativa explícita si QVAC falla; no presentarlo como conversación generada por IA.

## Testing Decisions

Frontera confirmada por el usuario: la API pública de conversación y estimación consumida por la interfaz. Probar recorridos completos mediante entradas y respuestas observables, no funciones privadas ni detalles del prompt.

- Cubrir indirectamente coordinador, herramientas, catálogo y motor de cálculo a través de esa frontera. Para las pruebas reproducibles, sustituir únicamente el servicio externo QVAC por respuestas controladas; usar herramientas y cálculo reales.
- Verificar parada temprana con información suficiente, continuidad cuando falte información y límite de cinco preguntas sin una sexta pregunta encubierta.
- Verificar adultos, niños y embarazo; información insuficiente y oferta de consulta inicial; posible urgencia inicial y sobrevenida que elimina los precios.
- Verificar plan inválido, especialidad inexistente, acción del modelo no permitida y respuesta malformada sin inventar una cotización.
- Verificar tarifas y red para las seis especialidades, orden económico dentro de red y consistencia del desglose.
- Ejemplos independientes de regresión: dermatología en La Ceiba con Esencial cuesta USD 25 (tarifa 65, copago 15, coaseguro 10, seguro 40); con Plus cuesta USD 15.50 (copago 10, coaseguro 5.50, seguro 49.50). Con Esencial, Jardines del Canal queda fuera de red y cuesta USD 95.
- Verificar caída y espera agotada de QVAC, identificación del modo de reglas y ausencia de conversaciones mezcladas entre casos.
- Complementar con un recorrido de navegador para validar preguntas, estados de carga, cambios de plan y resultados visibles, y una comprobación de integración con QVAC real. No exigir texto generado exacto como criterio de éxito.
- Comprobar hardware mediante diagnóstico del runtime y evidencia de inferencia. La disponibilidad de una API o la presencia de una GPU no prueban por sí solas que esté siendo usada.
- No existen pruebas automatizadas previas en el proyecto. Hay comprobaciones manuales de navegador, sintaxis, una respuesta real de QVAC y un proceso de inferencia observado en la RTX de la máquina utilizada. Usarlas como antecedentes, no como sustituto de la nueva suite ni como validación de otros dispositivos.

## Out of Scope

- Uso con pacientes reales, diagnóstico, triaje clínico validado o garantía de importe final.
- Pólizas, hospitales, tarifas, expedientes y credenciales reales.
- Integración con aseguradoras, pagos, citas o autorizaciones.
- Carga de pólizas PDF, voz, hospitalización, exámenes, medicamentos y procedimientos.
- Deducibles, límites anuales u otras condiciones ajenas a los planes simplificados acordados.
- IA en la nube, alojamiento público, cuentas de usuario e historial clínico persistente.
- Garantizar aceleración en hardware sin soporte del backend o sus controladores.

## Further Notes

La especificación describe la evolución pendiente además de conservar la funcionalidad existente; no afirma que el agente conversacional ya esté implementado. El modelo pequeño probado demuestra integración local, pero todavía debe evaluarse su capacidad para seguir el contrato agéntico. La elección del modelo debe respetar los recursos del dispositivo y no reducir silenciosamente el alcance acordado.

El plazo de tres días es el indicado por el usuario para confirmar participación, no un compromiso de uso clínico o despliegue productivo. No se ha recibido una rúbrica. Esta especificación está aprobada para publicarse como un issue ready-for-agent; la descomposición posterior en tickets corresponde a otra etapa.
