'use strict';

// PostgreSQL embebido real (WASM), aislado de Supabase y sin credenciales.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { crearSesion, clienteTransaccional } = require('../conexion.js');
const { Agente_Analitico, Usuario } = require('../modelo.js');
const { iniciarPregunta, continuarPregunta } = require('../flujo.js');
const carpeta = path.join(__dirname, '../../Equipo01_DataMart_Parcial01');
const ddl = fs.readFileSync(path.join(carpeta, 'Equipo01_BDOO_DDL_Parcial01.sql'), 'utf8');
const migracion = fs.readFileSync(path.join(carpeta, 'Equipo01_BDOO_Migracion_Diagrama.sql'), 'utf8');
const anterior = fs.readFileSync(path.join(__dirname, 'fixtures/bdoo_anterior.sql'), 'utf8').replace(/^\uFEFF/, '');

test('BDOO nueva: sesión, paráfrasis, aclaración, consulta real P1, reglas heredadas y respuesta persistida', async () => {
  const p2 = new PGlite();
  const p1 = new PGlite();
  try {
    await p2.exec(ddl);
    await p1.exec(fs.readFileSync(path.join(carpeta, 'Equipo01_DataMart_DDL_Parcial01.sql'), 'utf8'));
    await p1.exec(fs.readFileSync(path.join(carpeta, 'Equipo01_DataMart_DML_Parcial01.sql'), 'utf8'));
    const clienteP2 = clienteTransaccional(p2, 'bdoo', 'public');
    const clienteDatos = clienteTransaccional(p1, 'datos', 'public');
    await assert.rejects(clienteDatos.query("INSERT INTO DimCanal (CodigoCanal_NK, TipoCanal) VALUES ('NO','No autorizado')"), /read.only/i);
    const ids = await crearSesion(clienteP2, { nombreUsuario: 'Gerencia', modelo: 'doble-gemini' });
    const ia = { modelo: 'doble-gemini', interpretar: async () => iniciarPregunta('¿Cuál fue el ingreso neto por mes?'),
      aclarar: async (s, r) => continuarPregunta(s, r) };
    const agente = new Agente_Analitico({ aa_id: ids.agenteId, interprete: ia,
      contexto: { clienteP2, clienteDatos, sesionId: ids.sesionId } });
    const pregunta = new Usuario(ids.usuarioId, 'Gerencia').hacer_pregunta('Muéstrame mis ingresos netos mensuales');
    const inicial = await agente.procesar_pregunta(pregunta);
    assert.equal(inicial.solicitud.estado, 'requiere_aclaracion');
    await assert.rejects(agente.responder(pregunta.pre_id), /no habilitada/);
    await agente.aclarar(pregunta.pre_id, 'octubre de 2025');
    const salida = await agente.responder(pregunta.pre_id);
    assert.equal(Number(salida.filas[0].ingreso_neto), 5580);
    const cadena = await p2.query(`SELECT p.pre_texto, c.ca_validacion, r.rc_datos_brutos, a.ra_explicacion
      FROM preguntas p JOIN consultas_analiticas c USING(pre_id)
      JOIN resultados_consultas r USING(ca_id) JOIN respuestas_agente a USING(rc_id)`);
    assert.equal(cadena.rows.length, 1);
    assert.equal(cadena.rows[0].pre_texto, pregunta.pre_texto);
    assert.equal(cadena.rows[0].ca_validacion, 'aprobada');
    assert.equal(cadena.rows[0].ra_explicacion, salida.respuesta_ejecutiva);
    for (const tabla of ['reglas_seguridad', 'reglas_sintaxis', 'reglas_respuesta']) {
      const r = await p2.query(`SELECT * FROM ${tabla}`);
      assert.equal(r.rows.length, 1);
      assert.equal(r.rows[0].rv_estado, 'aprobada');
    }
    assert.equal((await p2.query('SELECT * FROM fuentes_datos WHERE fd_tipo_dato IS NULL')).rows.length, 0);
    await assert.rejects(agente.responder(pregunta.pre_id), /ya tiene/);
    await assert.rejects(p2.query('INSERT INTO resultados_consultas (ca_id) VALUES ($1)', [salida.consulta_id_p2]), /unique/i);
    await assert.rejects(p2.query('DELETE FROM respuestas_agente'), /requiere exactamente/);
    await assert.rejects(p2.query('INSERT INTO reglas_seguridad (ca_id, rv_nombre, rv_nivel_acceso) VALUES (9999, $1, $2)', ['huerfana', 'SELECT']), /foreign key/i);
  } finally { await p2.close(); await p1.close(); }
});

test('migración conserva sesiones e interacciones anteriores y corrige el subtipo respuesta', async () => {
  const db = new PGlite();
  try {
    await db.exec(anterior);
    await db.exec(`INSERT INTO usuarios(nombre) VALUES ('Histórico');
      INSERT INTO sesiones(u_id) VALUES(1);
      INSERT INTO intenciones(int_nombre) VALUES ('analizar_ventas');
      INSERT INTO preguntas(pre_texto,ses_id,int_id) VALUES ('Pregunta histórica',1,1);
      INSERT INTO consultas_analiticas(pre_id,ca_sql) VALUES (1,'SELECT 1');
      INSERT INTO resultados_consultas(ca_id,rc_datos_brutos) VALUES(1,'[]');
      INSERT INTO respuestas_agente(rc_id,ra_explicacion) VALUES (1,'Respuesta histórica');`);
    await db.exec(migracion);
    assert.equal((await db.query('SELECT * FROM respuestas_agente')).rows[0].ra_explicacion, 'Respuesta histórica');
    assert.equal((await db.query('SELECT ca_validacion FROM consultas_analiticas')).rows[0].ca_validacion, 'aprobada');
    assert.ok((await db.query('SELECT aa_id FROM sesiones')).rows[0].aa_id);
    assert.equal((await db.query("SELECT to_regclass('reglas_respuesta') AS tabla")).rows[0].tabla, 'reglas_respuesta');
    await crearSesion(db, { nombreUsuario: 'Nuevo', modelo: 'Gemini' });
    assert.equal((await db.query('SELECT * FROM intenciones')).rows.length, 4);
  } finally { await db.close(); }
});
test('migración incompatible revierte cambios sin borrar registros', async () => {
  const db = new PGlite();
  try {
    await db.exec(anterior);
    await db.exec("INSERT INTO intenciones(int_nombre) VALUES ('duplicada'),('duplicada')");
    await assert.rejects(db.exec(migracion), /unique/i);
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT * FROM intenciones')).rows.length, 2);
    assert.equal((await db.query("SELECT to_regclass('reglas_repuesta') AS tabla")).rows[0].tabla, 'reglas_repuesta');
  } finally { await db.close(); }
});
