# Conexión, Gemini y modelo de objetos

## Estado

El código conecta dos proyectos PostgreSQL independientes, normaliza preguntas con Gemini,
valida intenciones y parámetros con el intérprete local, ejecuta únicamente las siete plantillas
del catálogo y conserva las interacciones en P2. Las respuestas numéricas se redactan
localmente a partir de las filas reales; no se envían ventas ni credenciales al modelo.

La prueba `test:bdoo` usa dos instancias PostgreSQL embebidas PGlite: crea P1 y P2, carga
la semilla, consulta octubre de 2025 (ingreso neto 5580) y comprueba la cadena persistida,
las reglas heredadas y las restricciones. Gemini se simula en esta prueba: no demuestra
generación real ni acceso a Supabase.

## Preparación y ejecución

Requisitos: Node >=22, Python 3 y PostgreSQL/Supabase con los scripts correspondientes.
Desde esta carpeta:

```powershell
npm ci --ignore-scripts
# Solo si no existe .env: copiar .env.example a .env y completar localmente.
npm run check
npm start
```

La consola crea una sesión nueva y solicita preguntas y aclaraciones hasta `/salir`.
`/cancelar` abandona la pregunta en curso y conserva lo registrado para trazabilidad.
Una consulta ya ejecutada no se vuelve a ejecutar automáticamente: formular una pregunta
nueva si una interacción fallida requiere reintento.

## Configuración local

| Variable | Contenido |
| --- | --- |
| `GEMINI_API_KEY` | Clave habilitada para Gemini Developer API, solo en `.env`. |
| `GEMINI_MODEL` | Modelo accesible para la clave; valor inicial `gemini-3.5-flash-lite`. |
| `DATAMART_DATABASE_URL` | URI PostgreSQL del proyecto P1. |
| `BDOO_DATABASE_URL` | URI PostgreSQL del proyecto P2. |
| `DATAMART_SCHEMA`, `BDOO_SCHEMA` | Esquema real de las tablas, normalmente `public`. |
| `PGSSLROOTCERT` | Ruta opcional a la CA PEM descargada de Supabase, si Node no confía en ella. |
| `PGSSL` | `require` para Supabase; `disable` se admite exclusivamente con localhost. |
| `AGENTE_USUARIO` | Nombre que se registrará para la sesión de demostración. |
| `PYTHON_BIN` | Ruta o nombre del ejecutable Python. |

No desactivar la verificación de certificados. Los parámetros TLS del URI no reemplazan
la política explícita de verificación de `conexion.js`. Se aplican límites de conexión y consulta.
P1 activa `default_transaction_read_only`, pero también debe utilizar un usuario con permisos
SELECT en sus tablas. P2 necesita SELECT/INSERT/UPDATE y uso de las secuencias de identidad.
Para desplegar el DDL o la migración usar una cuenta administradora separada.

Los URI de ejemplo no contienen secretos:

```text
postgresql://USUARIO_POOLER:CONTRASENA_CODIFICADA@HOST_POOLER:5432/postgres
```

Obtener cada uno en el proyecto correspondiente, **Connect → Session pooler**. Copiar el
usuario completo mostrado por Supabase, incluido el sufijo del proyecto. No deducirlo a partir
del usuario de la conexión directa. Codificar caracteres especiales de contraseña para URI.
Una API key de Supabase no sustituye la contraseña PostgreSQL utilizada por `pg`.

El comprobador es de solo lectura: `npm run check -- bdoo`, `npm run check -- datos` y
`npm run check -- gemini` permiten aislar cada servicio. La comprobación de Gemini sí
consume una petición de generación. No aplica migraciones automáticamente.

## Persistencia según el diagrama

`modelo.js` implementa `Agente_Analitico`, `Usuario`, `Sesion`, `Pregunta`, `Intencion`,
`Consulta_Analitica`, `Fuente_Dato`, `Resultado_Consulta`, `Respuesta_Agente` y la jerarquía
`Regla_Validacion` → `Regla_Seguridad`, `Regla_Sintaxis`, `Regla_Respuesta`.

El agente coordina `procesar_pregunta`, `generar_sql`, `consultar_datamart` y
`sintetizar_respuesta`. `generar_sql` selecciona una plantilla autorizada y conserva sus
parámetros; `consultar_datamart` exige un objeto `Consulta_Analitica`.
Usuario construye preguntas, Sesion compone la conversación y Consulta compone fuentes
y reglas. La persistencia se realiza mediante el adaptador SQL, sin guardar ventas detalladas.
`fd_tipo_dato` se completa desde el contrato DDL P1 y las reglas específicas se guardan en
sus subtipos. Los tiempos de consulta se conservan en los metadatos de ejecución.

El almacenamiento es **objeto-relacional PostgreSQL**, con clases en la aplicación e
`INHERITS` para los subtipos de reglas. No se presenta como un motor BDOO nativo.
Las PK y FK se declaran explícitamente en los subtipos porque PostgreSQL no las hereda.

Se aplica la cardinalidad 1:1 como máximo con `UNIQUE` y claves obligatorias entre pregunta,
consulta, resultado y respuesta. Al aprobar una consulta, un trigger diferido exige exactamente
un resultado y una respuesta en la misma transacción. Durante aclaraciones o errores esas
etapas todavía pueden no existir: exigirlas desde la recepción impediría registrar fallos.
La intención admite NULL exclusivamente por convenio para preguntas rechazadas o fuera de
alcance; el adaptador exige una intención existente para las preguntas analíticas reconocidas.
`aa_id` en Sesion vincula al agente que ejecutó la conversación, aunque el diagrama no dibuja
esa asociación. `ca_validacion` es un estado textual: pendiente, aprobada o fallida.

## Instalación nueva o migración

- **Base vacía:** ejecutar `Equipo01_BDOO_DDL_Parcial01.sql` en el esquema elegido.
- **BDOO con el DDL anterior:** ejecutar **una sola vez** `Equipo01_BDOO_Migracion_Diagrama.sql`.

La migración conserva registros y renombra `reglas_repuesta` a `reglas_respuesta`. Añade
cardinalidades, `ca_validacion`, claves en subtipos, intenciones únicas y vínculo de sesiones
al agente. Para sesiones antiguas sin agente registra una identidad histórica explícita.
Si encuentra duplicados, nulos o referencias incompatibles, falla y revierte la transacción:
revisar esos registros antes de reintentar; no los elimina ni escoge silenciosamente uno.
Un esquema remoto distinto al anterior requiere revisar sus diferencias antes de migrarlo.

## Pruebas y límites

```powershell
npm test
npm run test:bdoo
# Requiere P1 remoto con la semilla exacta; transacción READ ONLY y ROLLBACK:
npm run test:db
# Pruebas Python desde la raíz del repositorio:
Set-Location ..
python -B -m unittest discover -s Agente_P3/tests -v
```

Gemini usa GenerateContent con JSON Schema y un plazo de 60 segundos. El texto original y
la normalización se guardan para auditoría. El catálogo vuelve a validar la solicitud;
ningún SQL propuesto por el usuario o modelo se ejecuta. Una normalización de lenguaje es
probabilística: deben verificarse las paráfrasis usadas en la defensa y sus filtros.
No se ocultan los fallos del proveedor con respuestas numéricas inventadas.

La clave compartida fue aceptada al listar modelos. Las primeras peticiones de generación
con Flash 3.8 agotaron el tiempo de espera. Se eligió `gemini-3.5-flash-lite`, disponible
para la clave, y `npm run check -- gemini` completó una interpretación real válida de
ingreso neto mensual para octubre de 2025. Las aclaraciones explícitas se procesan primero
con el intérprete local para evitar que Gemini las reformule como preguntas completas.
El host directo de P2 publica IPv6 y no fue accesible mediante el cliente de esta máquina.
El Session pooler P2 en 5432 resuelve a IPv4 y acepta TCP, pero no respondió al SSLRequest.
El pooler de transacciones en **6543** sí respondió. Se configuró la CA pública oficial
`certs/prod-ca-2021.crt`, manteniendo verificación de certificado y hostname, y se conectó
a P2. Se inspeccionó el esquema public (13 tablas vacías), se aplicó la migración del diagrama
y se completó la verificación de tablas del comprobador. P1 también conecta con TLS verificado.

## Evidencia de la prueba remota completa

El 30 de octubre de 2026 se ejecutó `npm.cmd run demo:remota` con ambos proyectos reales.
Gemini interpretó «Muéstrame el ingreso neto por mes» y se solicitó el período; la aclaración
«octubre de 2025» habilitó la plantilla `ingreso_neto_mensual`. P1 devolvió **5580,00**,
coincidente con una consulta de control independiente. Una conexión nueva a P2 recuperó
la sesión **2**, pregunta **2**, consulta **1**, resultado **1** y respuesta **1**,
con fuentes, metadatos, parámetros y cinco validaciones aprobadas.

La evidencia completa está en `evidencias/verificacion_remota.json`.
La sesión 1 corresponde al primer intento que quedó pendiente por el fallo de normalización
de aclaraciones, corregido y cubierto por una prueba de regresión. Se conserva como historial.
Cada ejecución de `demo:remota` crea una sesión nueva y guarda evidencia en P2; no se debe
confundir con `check`, que solo consulta las bases. `node verificar_flujo_remoto.js --ultima`
permite inspeccionar la última pregunta de demostración sin insertar datos.

En el puerto 6543, cada consulta independiente se ejecuta en una transacción y aplica
`SET LOCAL search_path` y `SET LOCAL statement_timeout`. Las transacciones explícitas del
adaptador P2 mantienen ese contexto hasta COMMIT/ROLLBACK. P1 usa `BEGIN READ ONLY`.
No depender de SET de sesión en un pooler de transacciones ni compartir un cliente entre
interacciones simultáneas. El script `node preparar_bdoo.js` inspecciona el esquema;
`node preparar_bdoo.js --aplicar` aplica la instalación/migración una vez y rechaza repetirla
si ya detecta ca_validacion. Es una operación administrativa separada del inicio del agente.

La CA pública se obtuvo de
[descargas de Supabase](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt),
con huella SHA256 `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`.
La ruta relativa `PGSSLROOTCERT` se resuelve desde la carpeta Agente_P3.

Continúan fuera de esta integración las tres preguntas adicionales, la conciliación con
fuentes operacionales, la matriz final de pruebas, la bitácora y la presentación del parcial.

Referencias: [Gemini: salida estructurada](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)
y [Supabase: conexiones PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres).
