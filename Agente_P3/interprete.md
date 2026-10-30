# Interpretación de preguntas: decisiones del equipo

Este documento explica el contrato entre el intérprete Python, el catálogo JavaScript y el Data Mart de P1. Las siete preguntas obligatorias y un ejemplo adicional con octubre de 2025 están en [`interprete.json`](interprete.json). Ninguno de los ejemplos es una respuesta del Data Mart: son resultados **del intérprete**, previos a cualquier consulta.

## Qué pregunta el agente al usuario

Solo solicita información que el usuario puede precisar sobre su análisis:

| Dato faltante | Casos del JSON | Aclaración esperada |
| --- | --- | --- |
| Período no indicado | 1, 2, 3, 5 y 7 | «¿Qué período desea analizar?» |
| Dos períodos de comparación | 4 | «¿Qué dos períodos desea comparar?» |
| Dos canales concretos | 6 | «¿Cuáles dos canales desea comparar?» |
| Categoría concreta | 7 | «¿Qué categoría desea analizar?» |

**Política de período:** si falta o no se puede determinar de forma inequívoca, pedir aclaración; no elegir el último mes por defecto. «Últimos tres meses disponibles» (caso 6) sí especifica un período simbólico: el Data Mart resolverá los tres meses con datos, y la respuesta deberá mostrar cuáles fueron. Si la petición contiene un período contradictorio o incompleto, también se pide aclaración. Una pregunta puede tener varias aclaraciones pendientes, pero el diálogo puede pedirlas de una en una.

## Criterios de negocio del Data Mart

P1 define `MontoVenta` como bruto, ingreso neto como `SUM(MontoVenta - MontoDescuento)`, margen bruto como `SUM(MontoVenta - MontoDescuento - CostoTotal)` y ticket promedio como ingreso neto dividido por `COUNT(DISTINCT NumeroTransaccion)`. El DDL incluye esa transacción y el nombre real del producto es `DimProducto.NombreProducto`.

El usuario ratificó estos criterios para las siete preguntas:

| Pregunta | Regla aplicada |
| --- | --- |
| Mayor reducción por segmento | Volumen = `SUM(CantidadVendida)` por segmento histórico SCD2. Caída = `100 × (unidades anteriores − unidades actuales) / unidades anteriores`. Solo se comparan segmentos con ventas en ambos períodos y base anterior positiva; solo se muestran caídas positivas. Se devuelven **todos** los segmentos empatados en el mayor porcentaje. Sin registros actuales no equivale a cero. |
| Mayor valor de ventas por canal | Ingreso neto = `SUM(MontoVenta - MontoDescuento)`. |
| Comparación de margen entre canales | Importe de margen bruto = `SUM(MontoVenta - MontoDescuento - CostoTotal)`, no porcentaje. |
| Producto líder en una categoría | Mayor `SUM(CantidadVendida)` dentro de la categoría y el período pedidos; no mayor ingreso neto. |

Los últimos tres meses son los tres meses distintos con alguna venta; combinaciones mes/canal sin registros no se rellenan con cero. Las siete consultas se comprobaron contra la semilla en Supabase; sigue pendiente la conciliación con fuentes de P1 y la prueba integral del puente Node con PostgreSQL.

P2 conserva las interacciones y su evidencia en la BDOO; `interprete.json` no sustituye esa persistencia.

## Contrato uniforme de `interprete.json`

Cada entrada de `casos` tiene `pregunta` y `salida_esperada`. La salida usa siempre los mismos campos:

- `estado`: `interpretada`, `requiere_aclaracion`, `fuera_de_alcance` o `rechazada`. `interpretada` significa que la solicitud está completa, no que ya se haya ejecutado SQL.
- `intencion`, `metrica`, `operacion` y `limite`: códigos estables; `limite` es `null` cuando no corresponde. `volumen_compra`, `valor_ventas` y `ventas_producto` son nombres lógicos cuyas reglas están arriba. Para la caída por segmento, `limite: 1` indica **primer puesto con todos los empates**, no una única fila.
- `dimensiones`: arreglo de pares `entidad`/`nivel`, también cuando hay una sola dimensión. En el caso 6 incluye tiempo y canal.
- `periodo`: objeto con `tipo`: `no_especificado`, `comparacion_periodos`, `ultimos_meses_disponibles` o `rango_fechas`. Una comparación contiene dos períodos ordenados (`anterior`, `actual`); un rango explícito usa `desde` y `hasta` con fechas ISO. `no_especificado` nunca autoriza ejecutar una consulta.
- `filtros`: objeto, vacío (`{}`) si no se pidió ningún filtro; en comparaciones puede contener listas. Un valor `null` o lista vacía indica que el filtro es necesario pero aún no fue proporcionado.
- `aclaraciones_usuario`: arreglo de preguntas que se pueden formular al usuario.
- `pendientes_equipo`: arreglo de bloqueos, vacío para las siete consultas que ahora tienen plantilla; la conciliación con fuentes de P1 sigue pendiente.
- `listo_para_consulta`: en la salida Python permanece `false`; solo el catálogo decide si puede prepararse SQL fijo tras validar todos los parámetros. El ejemplo completo de octubre de 2025 ya puede prepararse, pero no representa una consulta ejecutada.

Para el caso 4, `comparar_periodos_y_ordenar_caida` compara `CantidadVendida` por segmento histórico en dos rangos ordenados. El resultado incluye `valor_anterior`, `valor_actual` y `caida_porcentual` (de 0 a 100 si las ventas actuales son positivas), y puede contener varias filas empatadas en la mayor caída. Un segmento sin ventas en cualquiera de los períodos queda fuera; si no hay caídas comparables, el resultado queda vacío. Para el caso 7, el resultado incluye `producto` y `unidades_vendidas`.

## Continuar una aclaración

`continuar_aclaracion(solicitud, respuesta)` recibe la salida de `interpretar` y resuelve **solo la primera** pregunta de `aclaraciones_usuario`. Devuelve una nueva solicitud sin modificar la anterior; hay que conservar esa salida para el siguiente turno. Si la respuesta no basta, mantiene la aclaración y añade `motivo` para explicar cómo reintentar. No guarda sesiones ni reemplaza la persistencia de P2.

```python
from interprete import continuar_aclaracion, interpretar

solicitud = interpretar("¿Qué producto lidera las ventas dentro de una categoría y periodo determinados?")
while solicitud["aclaraciones_usuario"]:
    print(solicitud["aclaraciones_usuario"][0])
    solicitud = continuar_aclaracion(solicitud, input("> "))
    if "motivo" in solicitud:
        print(solicitud["motivo"])

print(solicitud)
```

Ejemplos de respuestas: `octubre de 2025`, luego `Electrónica`; para comparar segmentos, `octubre de 2025 y noviembre de 2025` (anterior y actual, sin solapamiento); para dos canales, `Tienda Física y E-commerce` (también se reconoce `Físico`). Solo estos dos canales aparecen en el DML de P1. «Mejor canal» sigue pidiendo un criterio y período, pero sus cuatro variantes no forman parte de las siete consultas autorizadas: siguen sin poder prepararse hasta ampliar el catálogo.

## Catálogo y consultas fijas

[`catalogo.js`](catalogo.js) contiene las siete consultas obligatorias, los campos reales de `FactVentas` y las reglas de cálculo. `seleccionarConsulta(solicitud)` devuelve un ID o `null`; `validarConsulta(solicitud)` valida el contrato; `prepararConsulta(solicitud)` obtiene exclusivamente el bloque fijo correspondiente del [DQL de P1](../Equipo01_DataMart_Parcial01/Equipo01_DataMart_DQL_Parcial01.sql) con sus parámetros. [`flujo.js`](flujo.js) conecta ambos runtimes mediante [`puente_interprete.py`](puente_interprete.py) y acepta un cliente PostgreSQL inyectado para ejecutar el SQL **solo después de validar**.

```javascript
const { iniciarPregunta, continuarPregunta, prepararConsulta } = require('./flujo.js');
let solicitud = iniciarPregunta('¿Cuáles son las cinco categorías con mayor margen bruto?');
// Si falta el período, prepararConsulta(solicitud).sql === null.
solicitud = continuarPregunta(solicitud, 'octubre de 2025');
console.log(prepararConsulta(solicitud).parametros); // Fechas ISO y límite, sin interpolar SQL.
```

El catálogo verifica forma y parámetros, **no** la existencia de filas en una base de datos. `listo_para_consulta: true` en la validación significa que existe una plantilla parametrizada admisible; no prueba que los scripts hayan corrido o que la cifra sea correcta. `consultarSolicitud(solicitud, cliente)` requiere un cliente con `query(sql, parametros)` y credenciales de **solo lectura**. Las siete plantillas se ejecutaron en Supabase con datos de prueba, pero falta probar el recorrido completo desde `flujo.js` con un cliente PostgreSQL real. Para verificar la lógica local desde la raíz: `node --test Agente_P3/tests/catalogo.test.js Agente_P3/tests/flujo.test.js` (Node 20) y `python -B -m unittest discover -s Agente_P3/tests -v`.

Para conectarlo a un PostgreSQL ya cargado con el DDL/DML, instala `pg` (`npm install pg`) y usa las variables de entorno estándar `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` de una cuenta que solo tenga permisos `SELECT`:

```javascript
const { Client } = require('pg');
const { iniciarPregunta, continuarPregunta, consultarSolicitud } = require('./flujo.js');

async function consultar() {
  const cliente = new Client();
  await cliente.connect();
  try {
    let solicitud = iniciarPregunta('¿Cuál fue el ingreso neto por mes?');
    solicitud = continuarPregunta(solicitud, 'octubre de 2025');
    return await consultarSolicitud(solicitud, cliente);
  } finally {
    await cliente.end();
  }
}
```

El puente Python/Node lanza un proceso por turno: es suficiente para el prototipo, no equivale a sesiones persistentes ni a una respuesta ejecutiva terminada.

## Antes de conectar el Data Mart

El intérprete de reglas está en [`interprete.py`](interprete.py). Para probarlo sin dependencias externas desde la raíz, ejecuta `python -B -m unittest discover -s Agente_P3/tests -v`. También puedes pasar una pregunta a `python -B Agente_P3/interprete.py "¿Cuáles fueron las 5 categorias con mayor margen bruto en el mes de octubre de 2025?"`. Solo reconoce las formas de pregunta implementadas; lo que no reconoce se declara fuera de alcance, sin construir SQL.

1. Conciliar los resultados de prueba en PostgreSQL con las fuentes reales de P1; la ejecución de las siete consultas sobre la semilla ya se verificó en Supabase.
2. Confirmar con P2 el registro de pregunta, interpretación, consulta, resultado, validaciones y respuesta.
3. Completar el formateo de respuestas ejecutivas con evidencia y el tratamiento de los casos fuera del catálogo (por ejemplo, las variantes de «mejor canal»); P4 se ocupa de la matriz de pruebas del enunciado.
