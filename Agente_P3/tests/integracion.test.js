'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { InterpreteGemini } = require('../gemini.js');
const { configuracion, conectar, clienteTransaccional } = require('../conexion.js');
const { Usuario, Sesion, Consulta_Analitica, Agente_Analitico, Regla_Validacion,
  Regla_Seguridad, Regla_Sintaxis, Regla_Respuesta } = require('../modelo.js');
const { iniciarPregunta } = require('../flujo.js');

function respuesta(texto) {
  return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP',
    content: { parts: [{ text: JSON.stringify({ texto_normalizado: texto }) }] } }] }) };
}
test('Gemini normaliza una paráfrasis y el catálogo conserva SQL fijo y parámetros', async () => {
  let peticion;
  const ia = new InterpreteGemini({ apiKey: 'clave-prueba', fetchImpl: async (url, opciones) => {
    peticion = opciones;
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com\//);
    return respuesta('¿Cuál fue el ingreso neto por mes en octubre de 2025?');
  } });
  const solicitud = await ia.interpretar('Dame los ingresos netos mensuales de octubre de 2025');
  const consulta = new Consulta_Analitica(solicitud);
  assert.deepEqual(consulta.ca_parametros, ['2025-10-01', '2025-10-31']);
  assert.match(consulta.ca_sql, /SUM\(f.MontoVenta - f.MontoDescuento\)/);
  assert.equal(peticion.headers['x-goog-api-key'], 'clave-prueba');
  assert.equal(JSON.parse(peticion.body).generationConfig.responseMimeType, 'application/json');
  assert.equal(solicitud.interpretacion_ia.texto_original, 'Dame los ingresos netos mensuales de octubre de 2025');
});
test('no se consulta Gemini ante una operación destructiva ni se acepta SQL del modelo', async () => {
  let llamadas = 0;
  const ia = new InterpreteGemini({ apiKey: 'prueba', fetchImpl: async () => {
    llamadas++; return respuesta('SELECT * FROM secretos;');
  } });
  assert.equal((await ia.interpretar('Elimina todas las ventas')).estado, 'rechazada');
  assert.equal(llamadas, 0);
  const desconocida = await ia.interpretar('Pregunta no reconocida');
  assert.throws(() => new Consulta_Analitica(desconocida), /fuera de alcance/);
});
test('Gemini informa clave rechazada, timeout, JSON truncado y bloqueo sin filtrar secretos', async () => {
  for (const fetchImpl of [
    async () => ({ ok: false, status: 400 }),
    async () => { throw new Error('clave-privada'); },
    async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) }),
    async () => ({ ok: true, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) }),
  ]) {
    const ia = new InterpreteGemini({ apiKey: 'clave-privada', fetchImpl });
    await assert.rejects(ia.interpretar('Muéstrame ingresos'), (e) => !e.message.includes('clave-privada'));
  }
});
test('aclaración Gemini conserva el contexto y no autoriza la ejecución sin año', async () => {
  const ia = new InterpreteGemini({ apiKey: 'prueba', fetchImpl: async () => respuesta('octubre') });
  const solicitud = await ia.aclarar(iniciarPregunta('¿Cuál fue el ingreso neto por mes?'), 'octubre');
  assert.equal(solicitud.estado, 'requiere_aclaracion');
  assert.throws(() => new Consulta_Analitica(solicitud), /aclaraciones/);
});

test('una aclaración explícita se resuelve sin que Gemini la convierta en otra pregunta', async () => {
  const ia = new InterpreteGemini({ apiKey: 'prueba', fetchImpl: async () => {
    throw new Error('No debe solicitarse una reformulación para un período explícito');
  } });
  const solicitud = await ia.aclarar(iniciarPregunta('¿Cuál fue el ingreso neto por mes?'), 'octubre de 2025');
  assert.equal(solicitud.estado, 'interpretada');
  assert.equal(solicitud.periodo.desde, '2025-10-01');
  assert.equal(solicitud.aclaracion_interpretada.proveedor, 'interprete_local');
});
test('conexiones separadas, TLS verificado y lectura forzada en el Data Mart', async () => {
  const env = { DATAMART_DATABASE_URL: 'postgresql://lector:clave@db.example.com/postgres?sslmode=no-verify',
    BDOO_DATABASE_URL: 'postgresql://auditor:clave@other.example.com/postgres', DATAMART_SCHEMA: 'analitica' };
  const config = configuracion('datos', env);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.doesNotMatch(config.connectionString, /sslmode/);
  assert.notEqual(config.connectionString, configuracion('bdoo', env).connectionString);
  class Cliente {
    constructor() { this.sql = []; }
    async connect() {}
    async query(sql) { this.sql.push(sql); return { rows: [] }; }
    async end() { this.cerrado = true; }
  }
  const cliente = await conectar('datos', { env, Client: Cliente });
  assert.match(cliente.sql[0], /"analitica"/);
  assert.ok(cliente.sql.includes('SET default_transaction_read_only TO on'));
  const bdoo = await conectar('bdoo', { env, Client: Cliente });
  assert.ok(!bdoo.sql.includes('SET default_transaction_read_only TO on'));
  assert.throws(() => configuracion('datos', { ...env, PGSSL: 'disable' }), /TLS/);
  await assert.rejects(conectar('datos', { env: { ...env, DATAMART_SCHEMA: 'public; DROP TABLE usuarios' }, Client: Cliente }), /No se pudo conectar/);
});
test('objetos componen sesiones y aplican los métodos del agente y reglas heredadas', async () => {
  const usuario = new Usuario(1, 'Gerencia');
  const agente = new Agente_Analitico({ aa_id: 1, interprete: { modelo: 'prueba' }, contexto: {} });
  const sesion = new Sesion(1, usuario, agente);
  const pregunta = usuario.hacer_pregunta('¿Cuál fue el ingreso neto por mes en octubre de 2025?');
  sesion.agregar(pregunta);
  assert.equal(pregunta.sesion, sesion);
  const consulta = agente.generar_sql(iniciarPregunta(pregunta.pre_texto));
  const resultado = await agente.consultar_datamart(consulta, { query: async () => ({ rows: [{ mes: '2025-10', ingreso_neto: '5580.00' }] }) });
  assert.match(agente.sintetizar_respuesta(resultado), /5[.,]?580/);
  assert.equal(consulta.ca_validacion, 'aprobada');
  for (const regla of [new Regla_Seguridad(), new Regla_Sintaxis(), new Regla_Respuesta()]) {
    assert.ok(regla instanceof Regla_Validacion);
  }
  assert.throws(() => agente.consultar_datamart('DROP TABLE ventas'), /autorizada/);
  assert.throws(() => { agente.aa_nombre = ''; }, /inválido/);
});

test('pooler 6543 conserva contexto por transacción y protege P1 con READ ONLY', async () => {
  const llamadas = [];
  const raw = { query: async (sql) => { llamadas.push(sql); return { rows: [{ valor: 1 }] }; }, end: async () => {} };
  const datos = clienteTransaccional(raw, 'datos', 'analitica');
  await datos.query('SELECT 1');
  assert.deepEqual(llamadas, ['BEGIN READ ONLY', 'SET LOCAL search_path TO "analitica", pg_catalog',
    "SET LOCAL statement_timeout TO '15s'", 'SELECT 1', 'COMMIT']);
  llamadas.length = 0;
  const p2 = clienteTransaccional(raw, 'bdoo', 'public');
  await p2.query('BEGIN');
  await p2.query('INSERT INTO usuarios(nombre) VALUES ($1)', ['Gerencia']);
  await p2.query('COMMIT');
  assert.equal(llamadas.filter((s) => s === 'BEGIN').length, 1);
  assert.equal(llamadas.at(-1), 'COMMIT');
  const fallos = [];
  const roto = clienteTransaccional({ query: async (s) => {
    fallos.push(s); if (s === 'SELECT error') throw new Error('fallo'); return { rows: [] };
  } }, 'bdoo', 'public');
  await assert.rejects(roto.query('SELECT error'), /fallo/);
  assert.equal(fallos.at(-1), 'ROLLBACK');
  await roto.query('SELECT 1');
  assert.equal(fallos.at(-1), 'COMMIT');
});
