# Cambios en los entregables de P1 para integrar P3

Se conservó el esquema y las diez consultas demostrativas originales de P1. Los cambios siguientes permiten responder las siete preguntas obligatorias del agente sin construir SQL a partir del texto del usuario.

| Archivo | Cambio | Motivo |
| --- | --- | --- |
| `Equipo01_DataMart_DQL_Parcial01.sql` | Se añadieron siete consultas de lectura identificadas por los IDs de `catalogo.js`, con parámetros posicionales PostgreSQL (`$1`, `$2`, etc.). La caída por segmento se calcula en porcentaje y devuelve todos los empates; el producto líder se determina por unidades vendidas. | Utilizar el período y los filtros interpretados por P3 sin fijar fechas ni aceptar SQL del usuario, y respetar las decisiones de negocio acordadas. Se conservan las diez consultas originales como demostraciones independientes. |
| `Equipo01_DataMart_DML_Parcial01.sql` | Se separaron los miembros de promoción `Desconocido` (`-1`) y `Sin promoción` (`0`), y las ventas existentes sin promoción pasaron a referenciar `0`. | El informe de P1 los distingue, pero la carga original los confundía; la consulta de calidad original contaba como desconocidas las ventas normales sin promoción. |
| `Equipo01_DataMart_DML_Parcial01.sql` | Se agregaron cinco fechas con ventas (septiembre–noviembre de 2025 y agosto–septiembre de 2026), cuatro productos de categorías nuevas y un cliente VIP de ejemplo. | Cubrir cinco categorías en octubre de 2025, dos períodos comparables por segmento y los últimos tres meses con ventas: agosto, septiembre y octubre de 2026. |
| `Equipo01_DataMart_DML_Parcial01.sql` | Se añadieron tickets de muestra con ambos canales, segmentos y productos; se preservaron los originales, incluido el ticket de dos líneas. | Poder demostrar las siete preguntas, el conteo de tickets por transacción y una caída real de unidades entre octubre y noviembre de 2025. Febrero de 2024 permanece sin ventas como caso de resultado vacío. |
| `Equipo01_DataMart_DML_P3_Incremental.sql` | Se separó la carga adicional de P3 para una instancia ya cargada con el DML original de P1; no modifica sus cuatro hechos ni su promoción `-1`. | Permitir probar en Supabase sin repetir `INSERT` originales que colisionarían con las claves existentes. Las nuevas ventas sin promoción usan `0`; la conciliación de las originales permanece pendiente de P1. |

No se cambió el DDL ni el PDF de P1. El usuario definió volumen = unidades por segmento histórico SCD2; mayor caída = porcentaje positivo entre segmentos con ventas en ambos períodos, incluidos todos los empates; valor de ventas por canal = ingreso neto; margen entre canales = importe de margen bruto; producto líder = mayor cantidad de unidades vendidas. `limite: 1` en la comparación de segmentos indica primer puesto **con empates**. La semilla es para demostración, no reemplaza una fuente operacional ni sus conciliaciones; falta contrastar las decisiones y los resultados con P1 en PostgreSQL.

En el repositorio real se conservó `Tienda Física` como nombre de canal de P1; el intérprete admite `Físico` como forma de preguntarlo y enlaza el valor físico `Tienda Física`. La carga incremental agrega datos P3 sin cambiar las cuatro ventas ya existentes en Supabase.

## Pendiente de P1 antes de considerar el Data Mart verificado

- Ejecutar los scripts completos en una instancia PostgreSQL limpia y comprobar los resultados de las siete consultas; aquí solo se hicieron comprobaciones locales sin servidor de base de datos.
- Entregar controles y conciliación contra fuentes que declara el informe; la restricción `UNIQUE (IdCliente_NK, FechaInicio)` del DDL no impide por sí sola vigencias SCD2 superpuestas.
- Acordar cómo se recarga la semilla sin duplicados y cómo se ajustan las secuencias de identidad tras insertar claves explícitas. El DML completo no es una carga incremental idempotente; el archivo incremental solo omite conflictos de claves existentes y no gestiona las secuencias.

Para una base de pruebas que ya contiene **solo la carga original P1**, usar `Equipo01_DataMart_DML_P3_Incremental.sql`, no el DML completo. Tras ejecutarlo, el último `SELECT` debe devolver 19 hechos (15 nuevos) y siete líneas en octubre de 2025. No ejecutar sin comprobar primero que las claves de muestra estén libres; `ON CONFLICT` evita duplicados al repetirlo, pero no corrige registros existentes con claves coincidentes y contenido distinto.
