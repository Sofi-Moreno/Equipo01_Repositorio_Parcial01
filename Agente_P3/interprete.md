# Cómo funciona el agente analítico

Este documento explica el recorrido completo de una pregunta de negocio, desde que llega en lenguaje natural hasta que se entrega una respuesta respaldada por datos. Sirve como base para describir el agente en el informe del parcial. **El recorrido con P2 se presenta como diseño de integración**: hoy el prototipo interpreta, valida, consulta mediante un cliente inyectado y redacta respuestas, pero todavía no persiste la trazabilidad en P2. El estado verificable y las decisiones están en [Decisiones y estado de P3](DECISIONES_Y_ESTADO_P3.md).

## El recorrido en una mirada

```text
Pregunta del usuario
  → reconocer intención, métrica, dimensiones y período
  → pedir aclaraciones si faltan datos
  → validar y seleccionar una consulta SQL fija
  → consultar el Data Mart de P1
  → explicar el resultado sin inventar datos
  → registrar pregunta, validaciones, fuentes, resultado y respuesta en P2
```

**P1** responde las preguntas con hechos de ventas y dimensiones. **P3** comprende la solicitud, controla qué consulta se permite y redacta la respuesta. **P2**, al integrarse, conserva la historia de cómo se obtuvo esa respuesta; no reemplaza ni duplica los hechos de P1.

## 1. Entender la pregunta

El intérprete de [`interprete.py`](interprete.py) reconoce las siete familias de preguntas definidas para P3. No es un generador abierto de SQL: compara la pregunta con patrones admitidos, normaliza diferencias de escritura y produce una **solicitud estructurada**. Por ejemplo, «¿Cuáles son las cinco categorías con mayor margen bruto?» se convierte en intención de analizar rentabilidad, métrica de margen bruto, dimensión categoría, operación de ranking y límite de cinco resultados.

La solicitud contiene `estado`, `intencion`, `metrica`, `dimensiones`, `periodo`, `filtros`, `operacion`, `limite` y `aclaraciones_usuario`. [`interprete.json`](interprete.json) muestra ejemplos de esta salida: **son interpretaciones, no resultados de ventas**. La interpretación por sí sola nunca autoriza ejecutar SQL.

Si la pregunta no pertenece a las familias admitidas, se indica que está fuera de alcance. Una petición de modificar o borrar datos se rechaza: el agente solo admite análisis de lectura. «Mejor canal», sin una métrica concreta, puede motivar una aclaración, pero sus variantes adicionales todavía no tienen una consulta autorizada en el catálogo.

## 2. Pedir lo que falta

El agente no elige fechas ni filtros por su cuenta. Si falta el período, pregunta «¿Qué período desea analizar?». Para una caída entre períodos pide **dos rangos ordenados, anterior y actual, sin solapamiento**; para comparar canales pide dos canales distintos; para encontrar un producto líder pide la categoría. Una pregunta puede requerir más de una aclaración, atendida de a una por turno.

Una respuesta como «octubre de 2025» se convierte en el rango `2025-10-01` a `2025-10-31`. «Últimos tres meses disponibles» es un período simbólico válido: la consulta a P1 determina los meses que tienen ventas. Si el usuario no aclara de forma inequívoca, el agente vuelve a preguntar y **no consulta** el Data Mart.

[`flujo.js`](flujo.js) comunica cada turno de Node con el intérprete Python mediante [`puente_interprete.py`](puente_interprete.py). La solicitud actualizada se conserva entre turnos para poder continuar la conversación. En la integración completa, P2 asociaría estos turnos con la sesión y la pregunta original.

## 3. Autorizar una consulta, no inventarla

Cuando ya están los datos necesarios, [`catalogo.js`](catalogo.js) comprueba que la combinación de intención, métrica, dimensiones, período, filtros y límite coincide con **una de las siete consultas autorizadas**. También comprueba fechas y valores de filtro. Si algo no coincide, no prepara ni ejecuta SQL.

Para una solicitud válida, recupera el bloque SQL fijo correspondiente del [DQL de P1](../Equipo01_DataMart_Parcial01/Equipo01_DataMart_DQL_Parcial01.sql) y entrega por separado los parámetros. Así, fechas, categoría, canales y límite se enlazan a la consulta; las palabras del usuario no se insertan como instrucciones SQL. El `generar_sql()` del diagrama de P2 debe entenderse en este agente como **seleccionar y parametrizar una plantilla revisada**, no escribir SQL libre.

La validación indica que una consulta *puede* ejecutarse; todavía no significa que haya datos o que la respuesta sea correcta.

## 4. Consultar P1 y explicar el resultado

`consultarYResponder(solicitud, cliente)` de [`flujo.js`](flujo.js) ejecuta la consulta autorizada con un cliente PostgreSQL inyectado y entrega tanto las filas como `respuesta_ejecutiva`. La respuesta se construye en [`respuesta.js`](respuesta.js) a partir del período, los filtros y los valores efectivamente devueltos por P1. No vuelve a consultar ni sustituye la evidencia estructurada por texto.

Según la pregunta, el agente puede presentar una serie mensual, un ranking, una comparación por canales, una caída entre dos períodos o un producto líder. La respuesta identifica el período y los valores obtenidos. Si la consulta no devuelve filas, indica **ausencia de registros**, no ventas iguales a cero. Tampoco rellena con ceros combinaciones mes/canal sin ventas ni asigna una moneda que P1 no especifica. En la comparación de segmentos, una disminución puede reflejar cambios de clasificación histórica SCD2 y no necesariamente menor compra de los mismos clientes; esa advertencia está prevista para incorporarse a la respuesta ejecutiva.

**Ejemplo de recorrido:** el usuario pregunta «¿Cuál fue el ingreso neto por mes?»; el intérprete pide el período; el usuario aclara «octubre de 2025»; el catálogo valida la solicitud y selecciona la consulta mensual de ingreso neto; P1 devuelve las filas del mes; el agente responde con el rango consultado y el importe obtenido. El ejemplo explica el orden de operaciones: la cifra solo puede venir de P1, nunca de la pregunta ni de un ejemplo del intérprete.

## 5. Conservar la trazabilidad en P2 (integración prevista)

El [informe del parcial](../Equipo01_Informe_Parcial01.pdf) describe el modelo de objetos y el flujo de P2; el [DDL disponible](../Equipo01_DataMart_Parcial01/Equipo01_BDOO_DDL_Parcial01.sql) ofrece tablas para registrar sus etapas. En el recorrido completo, la sesión y la pregunta se vinculan con su intención; la consulta queda asociada a la plantilla SQL y sus parámetros; las validaciones y las fuentes identifican qué se comprobó y qué tablas y atributos se usaron; el resultado guarda las filas y metadatos; la respuesta final queda ligada al resultado.

```text
usuarios → sesiones → preguntas → consultas_analiticas
                         ↘ intenciones   ├→ fuentes_datos
                                         ├→ reglas_validaciones
                                         └→ resultados_consultas → respuestas_agente
```

Este registro permitiría reconstruir **qué preguntó el usuario, qué se entendió, qué consulta se autorizó, con qué parámetros y fuentes, qué devolvió P1 y qué se respondió**. También permitiría distinguir una aclaración pendiente, una consulta rechazada y un resultado vacío de una respuesta respaldada por datos. La interfaz de persistencia y los puntos exactos donde guardar cada evento requieren acordar el contrato definitivo con P2; el prototipo actual todavía no escribe en estas tablas.

## Para redactar el informe

> El agente interpreta preguntas de ventas dentro de un conjunto controlado, solicita los datos faltantes y valida la solicitud antes de seleccionar una consulta SQL fija y parametrizada. El Data Mart de P1 proporciona los resultados; el agente los convierte en una respuesta comprensible sin completar valores inexistentes. El diseño de P2 permite conservar la pregunta, su intención, las validaciones y fuentes, la consulta, el resultado y la respuesta para auditar todo el recorrido. La persistencia de esa trazabilidad es una integración prevista, no una funcionalidad verificada del prototipo actual.

Los criterios de cálculo, las diferencias entre el diagrama de P2 y su DDL, y las pruebas pendientes se detallan en [Decisiones y estado de P3](DECISIONES_Y_ESTADO_P3.md).
