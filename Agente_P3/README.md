# Agente de consultas del Data Mart (P3)

Este módulo interpreta las siete preguntas obligatorias, pide los datos que falten y selecciona **únicamente** consultas SQL parametrizadas del Data Mart de P1. No genera SQL a partir del texto del usuario. Las respuestas ejecutivas, la persistencia con P2 y las preguntas adicionales de P4 no están implementadas aquí.

## Primer recorrido

1. Leé [`interprete.md`](interprete.md) para conocer el contrato, las aclaraciones y las reglas de negocio.
2. Revisá [`interprete.json`](interprete.json) para ver las siete preguntas y un ejemplo ya completado.
3. Ejecutá las pruebas desde la raíz del repositorio (Python y Node 20):

   ```text
   python -B -m unittest discover -s Agente_P3/tests -v
   node --test Agente_P3/tests/catalogo.test.js Agente_P3/tests/flujo.test.js
   ```

## Mapa de archivos

| Archivo | Para qué sirve |
| --- | --- |
| [`interprete.py`](interprete.py) | Reconoce preguntas y continúa aclaraciones; devuelve una solicitud estructurada, **sin consultar la base**. |
| [`interprete.json`](interprete.json) | Ejemplos de entrada/salida para verificar el contrato del intérprete; no contiene resultados de ventas. |
| [`interprete.md`](interprete.md) | Explica parámetros, criterios acordados y límites de la implementación. |
| [`catalogo.js`](catalogo.js) | Valida la solicitud, elige una de siete plantillas fijas del [DQL de P1](../Equipo01_DataMart_Parcial01/Equipo01_DataMart_DQL_Parcial01.sql) y prepara sus parámetros. |
| [`puente_interprete.py`](puente_interprete.py) | Intercambia JSON por entrada/salida estándar para comunicar Python con Node; no guarda sesiones. |
| [`flujo.js`](flujo.js) | Conecta intérprete y catálogo; ejecuta la consulta solo con un cliente PostgreSQL inyectado y una solicitud válida. |
| [`Equipo01_DataMart_DML_P3_Incremental.sql`](Equipo01_DataMart_DML_P3_Incremental.sql) | Agrega datos de demostración P3 a una **base de pruebas previamente cargada con P1**, sin modificar sus cuatro ventas originales. No ejecutar junto al DML completo. |
| [`tests/`](tests/) | Pruebas del reconocimiento, aclaraciones, validación y ejecución simulada; `test_dql_semillas.py` compara consultas y carga incremental en SQLite. |

## Estado y límites

Las siete consultas fijas se ejecutaron en Supabase sobre los datos de demostración; los resultados esperados y las adaptaciones a P1 están en [`CAMBIOS_INTEGRACION_P3.md`](../Equipo01_DataMart_Parcial01/CAMBIOS_INTEGRACION_P3.md). Sigue pendiente probar `flujo.js` de extremo a extremo con un cliente PostgreSQL real y conciliar cifras con fuentes de P1. No agregar credenciales ni `opencode.json` al repositorio.
