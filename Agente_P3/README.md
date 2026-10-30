# Agente de consultas del Data Mart (P3)

Este módulo interpreta las siete preguntas obligatorias, pide los datos que falten, selecciona **únicamente** consultas SQL parametrizadas del Data Mart de P1 y resume sus resultados con regla de cálculo, fuentes y advertencia SCD2 cuando corresponde. Gemini normaliza paráfrasis; el intérprete y catálogo locales validan lo que puede ejecutarse. Incluye consola interactiva, clases del modelo y persistencia P2. Ambos proyectos Supabase conectan con TLS verificado y se demostró una conversación completa con respuesta persistida. Las preguntas adicionales de P4 no están implementadas aquí.

## Ejecutar el agente

**Prueba remota completa verificada:** ambas bases conectan con TLS; Gemini y P1 respondieron ingreso neto de octubre de 2025 = **5580,00**. P2 conserva la sesión 2, pregunta 2, consulta 1, resultado 1 y respuesta 1, recuperados desde otra conexión. Ver [evidencia JSON](evidencias/verificacion_remota.json). `npm.cmd run demo:remota` repite la prueba e inserta una nueva sesión de demostración.

Seguir [Conexión, Gemini y modelo de objetos](CONEXION_Y_MODELO.md). Desde `Agente_P3`: `npm ci --ignore-scripts`, completar `.env` a partir de `.env.example`, preparar el esquema BDOO y ejecutar `npm run check` y `npm start`. Requiere Node >=22 y Python 3. El archivo `.env` está excluido de Git.

## Primer recorrido

1. Leé [`interprete.md`](interprete.md) para conocer el recorrido completo previsto del agente. Las decisiones y los pendientes están en [`DECISIONES_Y_ESTADO_P3.md`](DECISIONES_Y_ESTADO_P3.md).
2. Revisá [`interprete.json`](interprete.json) para ver las siete preguntas y un ejemplo ya completado.
3. Ejecutá las pruebas sin servicios externos desde la raíz del repositorio (Python y Node >=22):

   ```text
   python -B -m unittest discover -s Agente_P3/tests -v
   npm --prefix Agente_P3 test
   npm --prefix Agente_P3 run test:bdoo
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
2. Configurá **localmente** `DATAMART_DATABASE_URL` y `DATAMART_SCHEMA` en `.env` con los valores de **Supabase → Connect → Session pooler**. No subas la contraseña ni el URI a Git.
3. Ejecutá `npm run test:db` desde `Agente_P3/`.

La conexión usa TLS con verificación de certificado y la prueba inicia una transacción `READ ONLY` que cierra con `ROLLBACK`. Lo ideal sigue siendo una cuenta con permisos `SELECT`. No modifica políticas ni datos. Si la base no contiene exactamente la semilla de P1+P3, adaptá la cifra esperada en un entorno de prueba aislado, no en producción.

## Estado y límites

Las siete consultas fijas se ejecutaron previamente en Supabase sobre los datos de demostración según [`CAMBIOS_INTEGRACION_P3.md`](../Equipo01_DataMart_Parcial01/CAMBIOS_INTEGRACION_P3.md). Las pruebas locales validan la migración y persistencia con PostgreSQL embebido (PGlite). Además se completó una conversación con Gemini y ambos proyectos Supabase reales, conciliada mediante otra consulta a P1 y recuperada desde una nueva conexión a P2. Esa demostración no sustituye la matriz de todas las preguntas ni la conciliación con fuentes operacionales de P1. No agregar credenciales ni `opencode.json` al repositorio.
