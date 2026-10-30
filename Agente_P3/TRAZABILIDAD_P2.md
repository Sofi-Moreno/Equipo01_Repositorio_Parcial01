# Integración local de trazabilidad P3 → P2

[`trazabilidad.js`](trazabilidad.js) conecta las etapas del agente con las tablas del [DDL de P2](../Equipo01_DataMart_Parcial01/Equipo01_BDOO_DDL_Parcial01.sql), sin insertar hechos en P1. Se prueba con clientes simulados y PostgreSQL embebido. [Conexión y modelo](CONEXION_Y_MODELO.md) describe la integración actual con las clases del diagrama y la migración, ya aplicada en P2 Supabase con conexión TLS verificada. Falta completar P1 para demostrar una conversación con ambos proyectos remotos.

## Requisitos para usarlo

- P2 crea previamente una fila en `sesiones` y mantiene **exactamente una** fila en `intenciones` por cada nombre lógico usado por el intérprete (`analizar_ventas`, `analizar_rentabilidad`, `comparar_rentabilidad`, `identificar_producto_mas_vendido`). El adaptador recibe `sesionId`; no crea usuarios, sesiones ni intenciones.
- La consola nueva sí prepara usuario, agente, sesión e intenciones mediante `crearSesion` antes de llamar al adaptador. La clase `Agente_Analitico` inyecta Gemini y persiste también las reglas específicas y el estado de aprobación.
- `clienteP2` es un cliente PostgreSQL **dedicado durante cada operación** con permisos de lectura y escritura sobre las tablas P2; no se comparte simultáneamente entre solicitudes. `clienteDatos` es **otro cliente**, con permisos `SELECT` sobre P1. No usar la cuenta de solo lectura de P1 para escribir en P2.
- Las tablas del DDL P2 deben existir en la base P2 antes de ejecutar el adaptador. No se aplican automáticamente a Supabase.

```javascript
const {
  crearPreguntaTrazada, aclararPreguntaTrazada, consultarPreguntaTrazada,
} = require('./trazabilidad.js');

const contexto = { clienteP2, clienteDatos, sesionId: 7 }; // Sesión P2 ya creada.
const { pregunta_id, solicitud } = await crearPreguntaTrazada('¿Cuál fue el ingreso neto por mes?', contexto);
// solicitud.estado === 'requiere_aclaracion': todavía no se consulta P1.
await aclararPreguntaTrazada(pregunta_id, 'octubre de 2025', contexto);
const salida = await consultarPreguntaTrazada(pregunta_id, contexto);
// salida contiene respuesta_ejecutiva, filas e IDs de la cadena de trazabilidad.
```

## Correspondencia de etapas

| Momento | Registro en P2 | Contenido |
| --- | --- | --- |
| Pregunta inicial | `preguntas`, vinculada a `sesiones` e `intenciones` si se reconoció | Texto original; `pre_filtro` guarda JSON con la solicitud interpretada y un historial de aclaraciones. Una pregunta rechazada o fuera de alcance se conserva sin `int_id` ni consulta SQL. |
| Cada aclaración | Actualización de `preguntas.pre_filtro` | Pregunta de aclaración, respuesta del usuario y nueva solicitud; se comprueba `pre_id` y `ses_id` antes de modificarla. Una respuesta insuficiente permanece pendiente. |
| Consulta autorizada | `consultas_analiticas`, `fuentes_datos`, `reglas_validaciones` | SQL fijo del catálogo, parámetros como JSON con ID de plantilla, tablas/atributos previstos en el DQL, y validación `consulta_autorizada = aprobada`. Si falta un dato o el catálogo rechaza la solicitud, no se crea una consulta ni se llama a P1. |
| Ejecución y respuesta | `reglas_validaciones`, `resultados_consultas`, `respuestas_agente` | Estado de la consulta P1; `rc_datos_brutos` contiene **solo filas agregadas devueltas**, `rc_metadatos` contiene período, filtros, regla, campos de hechos, cantidad de filas y marca de vacío; la explicación vincula el resultado con la respuesta ejecutiva. |

`fuentes_datos` enumera los atributos de `FactVentas` y las dimensiones definidos para cada una de las siete plantillas. La respuesta usa esa misma lista desde [`fuentes.js`](fuentes.js). El adaptador básico deja `fd_tipo_dato` sin completar; la integración del modelo lo completa a partir del contrato DDL de P1 y registra las reglas heredadas. Las columnas `pre_filtro`, `ca_parametros`, `rc_datos_brutos` y `rc_metadatos` siguen siendo `TEXT` y guardan JSON serializado.

## Fallos y garantías

- Cada etapa de escritura se confirma en una transacción P2 o se revierte; no se mantiene una transacción P2 abierta durante la lectura de P1. **No hay una transacción distribuida** entre P1 y P2.
- Si falla la consulta o la redacción, queda la pregunta, la consulta autorizada y una regla `consulta_p1 = fallida` con mensaje genérico; no se fabrica un resultado ni una respuesta. Si falla la escritura final en P2, se revierte esa escritura, pero la consulta previa y el acceso a P1 ya sucedieron: el llamador recibe el error.
- Para una pregunta con `consultas_analiticas` ya registrada se bloquea una segunda ejecución automática: no se finge idempotencia ni se duplican registros. Reintentos y estados de recuperación requieren un acuerdo con P2.
- Los datos originales de P1, las políticas de acceso y el DDL P2 no se modifican. La prueba PostgreSQL real y la confirmación de cardinalidades e interfaz con el equipo P2 siguen pendientes.

Verificación local: `npm test` en `Agente_P3/` ejecuta también [`tests/trazabilidad.test.js`](tests/trazabilidad.test.js), con clientes simulados para aclaraciones, acceso por sesión, resultados vacíos, fallos y reversión de escrituras.
