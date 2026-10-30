# Decisiones y estado de la integración P3

Este documento reúne criterios de negocio, cambios de diseño y límites de la implementación. Para explicar el funcionamiento de extremo a extremo sin mezclarlo con decisiones pendientes, leer [Cómo funciona el agente analítico](interprete.md).

**Actualización de integración:** [Conexión y modelo](CONEXION_Y_MODELO.md) documenta
la consola, Gemini, clases y migración actuales. El DDL ya contiene `agentes_analiticos`,
`ca_validacion`, claves y restricciones 1:1. La persistencia y la migración se probaron
con PostgreSQL embebido; Gemini completó una interpretación real. P2 ya conecta a Supabase
por el pooler de transacciones 6543 con CA verificada y recibió la migración del diagrama.
P1 también conecta con TLS verificado. La prueba remota completa respondió 5580,00 para
octubre de 2025 y recuperó la cadena persistida desde otra conexión P2 (sesión 2, pregunta 2,
consulta 1, resultado 1, respuesta 1). Evidencia: `evidencias/verificacion_remota.json`.

## Criterios aplicados a las siete preguntas

| Pregunta | Criterio |
| --- | --- |
| Ingreso neto por mes | `SUM(MontoVenta - MontoDescuento)` por mes dentro del período solicitado. |
| Categorías con mayor margen bruto | `SUM(MontoVenta - MontoDescuento - CostoTotal)`; el límite solicitado debe estar entre 1 y 20. |
| Sucursal con mayor ticket promedio | Ingreso neto dividido por `COUNT(DISTINCT NumeroTransaccion)`. |
| Mayor reducción por segmento | Volumen = `SUM(CantidadVendida)` por segmento histórico SCD2. Caída porcentual positiva entre períodos ordenados; solo se comparan segmentos con ventas en ambos períodos, con base anterior positiva. Se incluyen todos los empatados en el primer puesto. |
| Canal con mayor valor de ventas | Valor = ingreso neto, no importe bruto. |
| Margen de dos canales en los últimos tres meses | Se compara el **importe** del margen bruto, no su porcentaje. Los meses son los tres distintos con ventas; no se agregan combinaciones mes/canal sin registros. |
| Producto líder dentro de una categoría | Mayor `SUM(CantidadVendida)` en categoría y período solicitados, no mayor ingreso. |

Los nombres de columnas se toman del esquema P1; por ejemplo, `DimProducto.NombreProducto` y `FactVentas.NumeroTransaccion`. El canal físico conserva el valor `Tienda Física` del Data Mart; «Físico» solo se admite como alias de entrada. No se supone que un resultado vacío equivale a cero ni se inventa la moneda.

**Interpretación SCD2:** el [informe del parcial](../Equipo01_Informe_Parcial01.pdf), página 8, advierte que una caída por segmento histórico también puede deberse a migración de clientes entre segmentos. La respuesta ejecutiva incluye esta advertencia incluso cuando no hay segmentos comparables; no atribuye la caída a los mismos clientes.

## Decisiones técnicas y cambios

- La pregunta no se convierte directamente en SQL. [`interprete.py`](interprete.py) identifica la solicitud; [`catalogo.js`](catalogo.js) autoriza solo siete plantillas parametrizadas extraídas del [DQL de P1](../Equipo01_DataMart_Parcial01/Equipo01_DataMart_DQL_Parcial01.sql). La operación `generar_sql()` descrita por P2 se interpreta como selección de una plantilla, no generación libre.
- [`flujo.js`](flujo.js) conecta Python y Node y admite un cliente PostgreSQL inyectado. [`respuesta.js`](respuesta.js) resume las filas devueltas y presenta período, filtros aplicables, ID de plantilla, regla de cálculo y fuentes revisadas; el resultado estructurado conserva período, filtros y datos. [`fuentes.js`](fuentes.js) comparte las fuentes por plantilla con la persistencia P2. `interprete.json` contiene solicitudes esperadas, **no resultados consultados**.
- La carga [incremental de P3](Equipo01_DataMart_DML_P3_Incremental.sql) incorpora datos de demostración sin sustituir los cuatro hechos originales de P1. El detalle de cambios al DQL y la semilla de pruebas está en [Cambios de integración P3](../Equipo01_DataMart_Parcial01/CAMBIOS_INTEGRACION_P3.md).
- El adaptador [`trazabilidad.js`](trazabilidad.js) enlaza pregunta → intención → SQL y parámetros → fuentes/validaciones → filas agregadas y metadatos → respuesta sobre el DDL actual de P2, con clientes inyectados y pruebas locales. P2 registra el proceso, no duplica la tabla de hechos del Data Mart. Ver [contrato de trazabilidad](TRAZABILIDAD_P2.md).

## Qué falta para afirmar que el recorrido está completo

| Área | Estado / decisión pendiente |
| --- | --- |
| P1 y respuestas | Las siete plantillas se probaron sobre la semilla en Supabase; el intérprete y las respuestas tienen pruebas locales. La respuesta usa la misma lista de fuentes por plantilla que el adaptador P2 e incluye la advertencia SCD2. Esto verifica consistencia de catálogo y pruebas locales, no demuestra una ejecución Node → PostgreSQL ni auditoría independiente de cada fila en P1. |
| P2 | Clases, DDL y migración alineados con el diagrama recibido. Migración aplicada a Supabase sobre las tablas vacías verificadas. Pruebas en PostgreSQL embebido cubren persistencia, herencia y cardinalidades. El informe PDF aún debe actualizarse. |
| Prueba integral | Validada con Gemini y ambos proyectos Supabase: pregunta → aclaración → lectura P1 → respuesta → persistencia P2. Ingreso neto octubre de 2025 = 5580,00, conciliado mediante consulta independiente. La relectura desde otra conexión confirma la persistencia. Esto no sustituye la conciliación con las fuentes operacionales ni la matriz de todas las preguntas. |
| Alcance | Las variantes de «mejor canal» no están en las siete consultas autorizadas. Las tres preguntas adicionales se reservaron para P4. |

No se deben presentar el DDL, el diagrama ni las consultas ejecutadas por separado como prueba de una BDOO operativa de extremo a extremo. Tampoco se modificaron las políticas de acceso de P1.
