# Agente de consultas del Data Mart (P3)

Este módulo interpreta las siete preguntas obligatorias, pide los datos que falten, selecciona **únicamente** consultas SQL parametrizadas del Data Mart de P1 y resume sus resultados con regla de cálculo, fuentes y advertencia SCD2 cuando corresponde. No genera SQL a partir del texto del usuario. Incluye un adaptador local de trazabilidad para el DDL de P2, **aún no probado en una base P2 real**. Las preguntas adicionales de P4 no están implementadas aquí.

## Primer recorrido

1. Leé [`interprete.md`](interprete.md) para conocer el recorrido completo previsto del agente. Las decisiones y los pendientes están en [`DECISIONES_Y_ESTADO_P3.md`](DECISIONES_Y_ESTADO_P3.md).
2. Revisá [`interprete.json`](interprete.json) para ver las siete preguntas y un ejemplo ya completado.
3. Ejecutá las pruebas sin base de datos desde la raíz del repositorio (Python y Node 20):

   ```text
   python -B -m unittest discover -s Agente_P3/tests -v
    node --test Agente_P3/tests/catalogo.test.js Agente_P3/tests/flujo.test.js Agente_P3/tests/respuesta.test.js Agente_P3/tests/trazabilidad.test.js
   ```

## Mapa de archivos

| Archivo | Para qué sirve |
| --- | --- |
| [`interprete.py`](interprete.py) | Reconoce preguntas y continúa aclaraciones; devuelve una solicitud estructurada, **sin consultar la base**. |
| [`interprete.json`](interprete.json) | Ejemplos de entrada/salida para verificar el contrato del intérprete; no contiene resultados de ventas. |
| [`interprete.md`](interprete.md) | Explica de forma narrativa el recorrido desde la pregunta hasta la respuesta y la trazabilidad prevista en P2. |
| [`DECISIONES_Y_ESTADO_P3.md`](DECISIONES_Y_ESTADO_P3.md) | Recoge criterios de negocio, discrepancias con P2 y validaciones aún pendientes. |
| [`catalogo.js`](catalogo.js) | Valida la solicitud, elige una de siete plantillas fijas del [DQL de P1](../Equipo01_DataMart_Parcial01/Equipo01_DataMart_DQL_Parcial01.sql) y prepara sus parámetros. |
| [`puente_interprete.py`](puente_interprete.py) | Intercambia JSON por entrada/salida estándar para comunicar Python con Node; no guarda sesiones. |
| [`flujo.js`](flujo.js) | Conecta intérprete y catálogo; ejecuta la consulta solo con un cliente PostgreSQL inyectado y una solicitud válida. |
| [`respuesta.js`](respuesta.js) | Redacta resultados de las siete consultas con el período y los filtros aplicables; informa resultados vacíos sin convertirlos en ceros. |
| [`trazabilidad.js`](trazabilidad.js) | Adaptador local que registra pregunta, aclaraciones, consulta autorizada, fuentes, validaciones, filas agregadas y respuesta en P2 mediante clientes inyectados. |
| [`TRAZABILIDAD_P2.md`](TRAZABILIDAD_P2.md) | Contrato de clientes y sesiones, correspondencia de tablas y límites de la integración P2. |
| [`Equipo01_DataMart_DML_P3_Incremental.sql`](Equipo01_DataMart_DML_P3_Incremental.sql) | Agrega datos de demostración P3 a una **base de pruebas previamente cargada con P1**, sin modificar sus cuatro ventas originales. No ejecutar junto al DML completo. |
| [`tests/`](tests/) | Pruebas del reconocimiento, aclaraciones, validación, respuestas y ejecución simulada; `test_dql_semillas.py` compara consultas y carga incremental en SQLite. |

## Prueba integral con PostgreSQL

[`tests/flujo.postgres.test.js`](tests/flujo.postgres.test.js) comprueba pregunta → aclaración → consulta real: para octubre de 2025 espera ingreso neto `5580.00` en la base de demostración. Es una prueba **separada** de las pruebas locales: no se omite silenciosamente si falta la conexión.

1. Ejecutá `npm ci --ignore-scripts` dentro de `Agente_P3/` para instalar `pg` según `package-lock.json`.
2. Configurá **localmente**, sin escribirlas en el repositorio, `PGHOST`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` con los valores de **Supabase → Connect → Session pooler**. `PGPORT` es opcional (por defecto, `5432`). No compartas la contraseña ni el URI de conexión en un chat o commit.
3. Ejecutá `npm run test:db` desde `Agente_P3/`.

La conexión usa TLS con verificación de certificado y la prueba inicia una transacción `READ ONLY` que cierra con `ROLLBACK`. Lo ideal sigue siendo una cuenta con permisos `SELECT`. No modifica políticas ni datos. Si la base no contiene exactamente la semilla de P1+P3, adaptá la cifra esperada en un entorno de prueba aislado, no en producción.

## Estado y límites

Las siete consultas fijas se ejecutaron en Supabase sobre los datos de demostración; los resultados esperados y las adaptaciones a P1 están en [`CAMBIOS_INTEGRACION_P3.md`](../Equipo01_DataMart_Parcial01/CAMBIOS_INTEGRACION_P3.md). La trazabilidad P2 solo tiene pruebas locales con dobles de base de datos. La prueba integral requiere configurar acceso PostgreSQL localmente y todavía no se ha ejecutado con una conexión real; sigue pendiente conciliar cifras con fuentes de P1. No agregar credenciales ni `opencode.json` al repositorio.
