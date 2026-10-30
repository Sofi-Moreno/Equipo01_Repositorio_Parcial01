'use strict';

// Prueba explícita: consulta P1 en READ ONLY y guarda UNA interacción real en P2.
// Cada ejecución crea una nueva sesión de demostración; no elimina la evidencia.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cargarEntorno, conectar, crearSesion } = require('./conexion.js');
const { InterpreteGemini } = require('./gemini.js');
const { Agente_Analitico, Usuario, Sesion } = require('./modelo.js');

async function main() {
  cargarEntorno();
  let datos; let p2; let verificacion;
  try {
    datos = await conectar('datos');
    p2 = await conectar('bdoo');
    if (process.argv.includes('--ultima')) {
      const ultima = await p2.query(`SELECT s.ses_id,p.pre_id,p.pre_texto,p.pre_filtro
        FROM sesiones s JOIN usuarios u USING(u_id) JOIN preguntas p USING(ses_id)
        WHERE u.nombre=$1 ORDER BY s.ses_id DESC,p.pre_id DESC LIMIT 1`, ['Verificación de integración remota']);
      console.log(JSON.stringify(ultima.rows, null, 2));
      return;
    }
    const ia = new InterpreteGemini({ apiKey: process.env.GEMINI_API_KEY,
      modelo: process.env.GEMINI_MODEL || undefined });
    const ids = await crearSesion(p2, { nombreUsuario: 'Verificación de integración remota', modelo: ia.modelo });
    const agente = new Agente_Analitico({ aa_id: ids.agenteId, interprete: ia,
      contexto: { clienteP2: p2, clienteDatos: datos, sesionId: ids.sesionId } });
    const usuario = new Usuario(ids.usuarioId, 'Verificación de integración remota');
    const sesion = new Sesion(ids.sesionId, usuario, agente);
    const pregunta = usuario.hacer_pregunta('Muéstrame el ingreso neto por mes');
    sesion.agregar(pregunta);
    const inicial = await agente.procesar_pregunta(pregunta);
    assert.equal(inicial.solicitud.estado, 'requiere_aclaracion');
    const aclarada = await agente.aclarar(pregunta.pre_id, 'octubre de 2025');
    assert.equal(aclarada.solicitud.estado, 'interpretada');
    const salida = await agente.responder(pregunta.pre_id);
    assert.equal(salida.consulta_id, 'ingreso_neto_mensual');

    // Conciliación independiente del valor mensual con P1 real.
    const control = await datos.query(`SELECT SUM(f.MontoVenta-f.MontoDescuento) AS ingreso_neto
      FROM FactVentas f JOIN DimTiempo t ON t.Sk_Dim_Tiempo=f.Sk_Dim_Tiempo
      WHERE t.FechaCompleta BETWEEN $1::date AND $2::date`, ['2025-10-01', '2025-10-31']);
    if (control.rows[0].ingreso_neto === null) assert.equal(salida.sin_registros, true);
    else {
      assert.equal(salida.filas.length, 1);
      assert.equal(salida.filas[0].mes, '2025-10');
      assert.equal(salida.filas[0].ingreso_neto, control.rows[0].ingreso_neto);
    }

    // Reabrir P2 para demostrar que las escrituras quedaron confirmadas.
    await p2.end(); p2 = null;
    verificacion = await conectar('bdoo');
    const cadena = await verificacion.query(`SELECT s.ses_id,p.pre_id,p.pre_texto,p.pre_filtro,
      i.int_nombre,c.ca_id,c.ca_sql,c.ca_parametros,c.ca_validacion,
      r.rc_id,r.rc_datos_brutos,r.rc_metadatos,a.ra_id,a.ra_explicacion
      FROM sesiones s JOIN preguntas p USING(ses_id) JOIN intenciones i USING(int_id)
      JOIN consultas_analiticas c USING(pre_id) JOIN resultados_consultas r USING(ca_id)
      JOIN respuestas_agente a USING(rc_id) WHERE s.ses_id=$1 AND p.pre_id=$2`, [ids.sesionId, pregunta.pre_id]);
    assert.equal(cadena.rows.length, 1);
    const registro = cadena.rows[0];
    assert.equal(registro.pre_texto, pregunta.pre_texto);
    assert.equal(registro.int_nombre, 'analizar_ventas');
    assert.equal(registro.ca_validacion, 'aprobada');
    assert.equal(registro.ra_id, salida.respuesta_id);
    assert.equal(registro.ra_explicacion, salida.respuesta_ejecutiva);
    assert.deepEqual(JSON.parse(registro.rc_datos_brutos), salida.filas);
    assert.deepEqual(JSON.parse(registro.ca_parametros).valores, ['2025-10-01', '2025-10-31']);
    assert.equal(JSON.parse(registro.pre_filtro).aclaraciones.length, 1);
    const reglas = (await verificacion.query(`SELECT rv_nombre,rv_estado,tableoid::regclass::text AS subtipo
      FROM reglas_validaciones WHERE ca_id=$1 ORDER BY rv_nombre`, [registro.ca_id])).rows;
    for (const nombre of ['consulta_autorizada', 'consulta_p1', 'seguridad_lectura', 'sintaxis_catalogo', 'respuesta_con_evidencia']) {
      assert.ok(reglas.some((r) => r.rv_nombre === nombre && r.rv_estado === 'aprobada'), `Falta validación: ${nombre}`);
    }
    const fuentes = (await verificacion.query(`SELECT fd_nombre_tabla,fd_atributo,fd_tipo_dato
      FROM fuentes_datos WHERE ca_id=$1 ORDER BY fd_nombre_tabla,fd_atributo`, [registro.ca_id])).rows;
    assert.ok(fuentes.length > 0 && fuentes.every((f) => f.fd_tipo_dato));
    const evidencia = { fecha_utc: new Date().toISOString(), estado: 'verificado',
      modelo: ia.modelo, sesion_id: ids.sesionId, pregunta_id: registro.pre_id,
      consulta_id_p2: registro.ca_id, resultado_id: registro.rc_id, respuesta_id: registro.ra_id,
      pregunta: registro.pre_texto, aclaracion: 'octubre de 2025',
      intencion: registro.int_nombre, consulta: salida.consulta_id,
      parametros: JSON.parse(registro.ca_parametros), sql: registro.ca_sql,
      filas: salida.filas, control_independiente_p1: control.rows[0],
      historial: JSON.parse(registro.pre_filtro), metadatos: JSON.parse(registro.rc_metadatos),
      reglas, fuentes, respuesta: registro.ra_explicacion,
      persistencia_comprobada_desde_otra_conexion: true };
    const carpeta = path.join(__dirname, 'evidencias');
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, 'verificacion_remota.json'), JSON.stringify(evidencia, null, 2) + '\n');
    console.log(JSON.stringify(evidencia, null, 2));
  } finally {
    await Promise.allSettled([datos?.end(), p2?.end(), verificacion?.end()]);
  }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
