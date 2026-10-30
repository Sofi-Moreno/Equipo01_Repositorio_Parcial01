# Cambios en los entregables de P1 para integrar P3

Se conservó el esquema y las diez consultas demostrativas originales de P1. Los cambios siguientes permiten responder las siete preguntas obligatorias del agente sin construir SQL a partir del texto del usuario.

| Archivo | Cambio | Motivo |
| --- | --- | --- |
| `Equipo01_DataMart_DQL_Parcial01.sql` | Se añadieron siete consultas de lectura identificadas por los IDs de `catalogo.js`, con parámetros posicionales PostgreSQL (`$1`, `$2`, etc.). | Utilizar el período y los filtros interpretados por P3 sin fijar fechas en las consultas ni aceptar SQL del usuario. Se conservan las diez consultas originales como demostraciones independientes. |
| `Equipo01_DataMart_DML_Parcial01.sql` | Se separaron los miembros de promoción `Desconocido` (`-1`) y `Sin promoción` (`0`), y las ventas existentes sin promoción pasaron a referenciar `0`. | El informe de P1 los distingue, pero la carga original los confundía; la consulta de calidad original contaba como desconocidas las ventas normales sin promoción. |
| `Equipo01_DataMart_DML_Parcial01.sql` | Se agregaron cinco fechas con ventas (septiembre–noviembre de 2025 y agosto–septiembre de 2026), cuatro productos de categorías nuevas y un cliente VIP de ejemplo. | Cubrir cinco categorías en octubre de 2025, dos períodos comparables por segmento y los últimos tres meses con ventas: agosto, septiembre y octubre de 2026. |
| `Equipo01_DataMart_DML_Parcial01.sql` | Se añadieron tickets de muestra con ambos canales, segmentos y productos; se preservaron los originales, incluido el ticket de dos líneas. | Poder demostrar las siete preguntas, el conteo de tickets por transacción y una caída real de unidades entre octubre y noviembre de 2025. Febrero de 2024 permanece sin ventas como caso de resultado vacío. |

No se cambió el DDL ni el PDF de P1. Las nuevas consultas suponen **por ahora**: volumen = unidades; mayor caída = diferencia absoluta entre segmentos con datos en ambos períodos; valor de ventas y ventas por producto = ingreso neto; margen comparado = margen bruto monetario. P1 y el equipo deben ratificar esos criterios. La semilla es para demostración, no reemplaza una fuente operacional ni sus conciliaciones.

## Pendiente de P1 antes de considerar el Data Mart verificado

- Ejecutar los scripts completos en una instancia PostgreSQL limpia y comprobar los resultados de las siete consultas; aquí solo se hicieron comprobaciones locales sin servidor de base de datos.
- Entregar controles y conciliación contra fuentes que declara el informe; la restricción `UNIQUE (IdCliente_NK, FechaInicio)` del DDL no impide por sí sola vigencias SCD2 superpuestas.
- Acordar cómo se recarga la semilla sin duplicados y cómo se ajustan las secuencias de identidad tras insertar claves explícitas. Los `INSERT` de muestra no son una carga incremental idempotente.
