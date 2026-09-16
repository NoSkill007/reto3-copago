# ADR 0001: Extracción más clasificación determinista, no un bucle de agente con herramientas

Fecha: 2026-09-15
Estado: aceptado
Ámbito: `src/extraction.mjs`, `src/classification.mjs`, `src/agent.mjs`

## Contexto

El agente de cobertura tiene que entender la molestia que el paciente describe en sus propias palabras, decidir si hay una señal de alarma, y llegar a una comparación de gasto estimado entre hospitales.

La forma de moda para esto es un bucle de agente: el modelo recibe un catálogo de herramientas, decide cuál llamar, lee el resultado y vuelve a decidir hasta que se declara satisfecho.
La implementación anterior era una versión reducida de eso: el modelo elegía una de cuatro acciones (`COMPARE`, `ASK`, `CATALOG`, `COVERAGE`) en una línea de texto, y el orquestador ejecutaba hasta tres pasos de herramienta por turno.
Toda la comprensión del lenguaje vivía en expresiones regulares y todo el texto que el paciente leía era una plantilla fija.

El modelo local es un Qwen3-4B cuantizado a Q4_K_M, corriendo en una GPU de portátil de 6 GB.

## Decisión

Un turno del paciente ejecuta exactamente **una** llamada de extracción al modelo, y ninguna decisión de control.

1. **Extracción.** La llamada recibe la transcripción completa y devuelve los datos del caso en JSON, con la forma garantizada por gramática vía `response_format: { type: 'json_schema' }`.
   Los datos del caso se reemplazan por completo en cada turno; nunca se fusionan con los del turno anterior.
2. **Clasificación.** Una función pura sobre esos datos, sin entrada ni salida, decide detener, preguntar o comparar.
   Su orden es obligatorio: primero señales de alarma, después la especialidad faltante, después comparar.
3. **Herramientas.** El orquestador llama al catálogo y al cálculo directamente, porque ya sabe qué necesita.
   El modelo nunca elige una herramienta.
4. **Explicación.** Una segunda llamada, solo en el turno final, redacta la prosa con las cifras ya calculadas delante.
   Copia números; no los genera.

El modelo aporta comprensión del lenguaje.
El código aporta control y aritmética.

## Razones

**El bucle no tiene nada que decidir.** Con un solo plan y una sola comparación, la secuencia de herramientas es fija: consultar el catálogo y calcular.
Pedirle al modelo que la descubra cada turno paga latencia y varianza por una decisión que no existe.

**Cada paso del bucle es una oportunidad de fallar.** Un modelo de cuatro mil millones de parámetros acierta la elección de acción con una probabilidad menor que uno; tres pasos multiplican ese riesgo.
La versión anterior agotaba su presupuesto de pasos y terminaba en un mensaje de recuperación sin orientación ni precios, que es exactamente el fallo que el paciente no perdona.

**Una función pura se puede razonar sin ejecutar el modelo.** El orden "señal de alarma antes que pregunta" es la regla de seguridad más importante del sistema: un niño con una convulsión no puede recibir un cuestionario.
Con la decisión en el prompt, esa garantía depende de que el modelo la respete; con la decisión en código, está fijada.
El peor error posible de este sistema es ofrecer una especialidad donde correspondía una detención, y ese error ahora es inalcanzable por construcción.

**Reemplazar los datos del caso completos elimina la contabilidad de estado.** No hay campos "ya preguntados" ni "ya respondidos" que mantener sincronizados.
Una corrección del paciente ("perdón, tiene 4 años, no 14") funciona sin código adicional, porque el modelo vuelve a derivar todo desde la conversación entera.

**La gramática hace imposible el JSON malformado, no improbable.** QVAC traduce el esquema a una restricción de generación real por petición, así que no hace falta lógica de recuperación de parseo ni reintentos por formato.
Se conserva una validación semántica, porque la gramática garantiza la forma y no que un identificador de especialidad siga existiendo en el catálogo; cada campo inválido degrada a nulo o a arreglo vacío, nunca a excepción.

**El cálculo monetario nunca toca el modelo.** Sigue siendo cien por ciento determinista en centavos, en `src/estimate.mjs`.
Es la afirmación central frente a un juez: los precios no son alucinables.

## Consecuencias

La latencia por turno es una llamada de extracción, más una de explicación solo en el turno final.
Es un número sobre el que se puede razonar, no una distribución.

El modelo pierde toda capacidad de iniciativa.
Si la comparación necesitara en el futuro una secuencia de herramientas que dependa de los datos, habría que volver a abrir esta decisión; hoy no la necesita.

La calidad de la orientación pasa a depender enteramente de la extracción, así que hace falta medirla: `npm run eval:extraction` reporta precisión de orientación, cobertura de señales de alarma y turnos hasta la comparación contra el modelo real, sin umbral de aprobación y sin papel en `npm test`.

Una regla vuelve al código: el umbral pediátrico.
El modelo extrae la edad corregida sin problema, pero conserva la especialidad del síntoma en vez de derivar pediatría, así que "menor de doce años es pediatría" se aplica en `classify` sobre el entero ya extraído.
El prompt sigue pidiéndola, porque una especialidad correcta a la primera ahorra la corrección; la garantía, sin embargo, está en la función pura.
Es el mismo criterio que el resto del ADR: el modelo entiende lenguaje, el código aplica reglas.

La comprensión del lenguaje por expresiones regulares desaparece, con ella los módulos `src/orientation.mjs`, `src/safety.mjs` y `src/conversation.mjs`, y con ellos el fallo que motivó el cambio: un vómito descrito como "cada 30 minutos" ahora cuenta igual que uno descrito como "vomita todo".
