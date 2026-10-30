'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  crearPreguntaTrazada, aclararPreguntaTrazada, consultarPreguntaTrazada,
} = require('../trazabilidad.js');

function baseP2() {
  const estado = { preguntas: [], consultas: [], fuentes: [], reglas: [], resultados: [], respuestas: [] };
  let copia;
  const intenciones = new Map([
    ['analizar_ventas', 1], ['analizar_rentabilidad', 2],
    ['comparar_rentabilidad', 3], ['identificar_producto_mas_vendido', 4],
  ]);
  const cliente = { estado, sentencias: [], async query(sql, parametros = []) {
    this.sentencias.push({ sql, parametros });
    if (sql === 'BEGIN') { copia = structuredClone(estado); return {}; }
    if (sql === 'COMMIT') { copia = undefined; return {}; }
    if (sql === 'ROLLBACK') {
      for (const clave of Object.keys(estado)) estado[clave] = copia[clave];
      copia = undefined;
      return {};
    }
    if (sql.startsWith('SELECT int_id')) {
      return { rows: intenciones.has(parametros[0]) ? [{ int_id: intenciones.get(parametros[0]) }] : [] };
    }
    if (sql.startsWith('INSERT INTO preguntas')) {
      const [pre_texto, pre_filtro, ses_id, int_id] = parametros;
      if (ses_id !== 7) throw new Error('sesión inexistente');
      const pre_id = estado.preguntas.length + 1;
      estado.preguntas.push({ pre_id, pre_texto, pre_filtro, ses_id, int_id });
      return { rows: [{ pre_id }] };
    }
    if (sql.startsWith('SELECT pre_filtro')) {
      return { rows: estado.preguntas.filter((p) => p.pre_id === parametros[0] && p.ses_id === parametros[1]) };
    }
    if (sql.startsWith('UPDATE preguntas')) {
      const fila = estado.preguntas.find((p) => p.pre_id === parametros[1] && p.ses_id === parametros[2]);
      fila.pre_filtro = parametros[0];
      return { rowCount: 1 };
    }
    if (sql.startsWith('SELECT ca_id')) {
      return { rows: estado.consultas.filter((c) => c.pre_id === parametros[0]) };
    }
    if (sql.startsWith('INSERT INTO consultas_analiticas')) {
      const ca_id = estado.consultas.length + 1;
      estado.consultas.push({ ca_id, pre_id: parametros[0], ca_sql: parametros[1], ca_parametros: parametros[2] });
      return { rows: [{ ca_id }] };
    }
    if (sql.startsWith('INSERT INTO fuentes_datos')) {
      estado.fuentes.push(parametros);
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO reglas_validaciones')) {
      estado.reglas.push(parametros);
      return { rows: [] };
    }
    if (sql.startsWith('INSERT INTO resultados_consultas')) {
      const rc_id = estado.resultados.length + 1;
      estado.resultados.push({ rc_id, ca_id: parametros[0], datos: parametros[1], metadatos: parametros[2] });
      return { rows: [{ rc_id }] };
    }
    if (sql.startsWith('INSERT INTO respuestas_agente')) {
      const ra_id = estado.respuestas.length + 1;
      estado.respuestas.push({ ra_id, rc_id: parametros[0], explicacion: parametros[1] });
      return { rows: [{ ra_id }] };
    }
    throw new Error(`SQL P2 inesperado: ${sql}`);
  } };
  return cliente;
}

const contexto = (clienteP2, clienteDatos) => ({ clienteP2, clienteDatos, sesionId: 7 });

test('pregunta y aclaración quedan en P2; solo una consulta autorizada accede a P1', async () => {
  const clienteP2 = baseP2();
  let consultasP1 = 0;
  const clienteDatos = { query: async (sql, parametros) => {
    consultasP1++;
    assert.match(sql, /SUM\(f\.MontoVenta - f\.MontoDescuento\)/);
    assert.deepEqual(parametros, ['2025-10-01', '2025-10-31']);
    return { rows: [{ mes: '2025-10', ingreso_neto: '5580.00' }] };
  } };
  const ctx = contexto(clienteP2, clienteDatos);
  const inicial = await crearPreguntaTrazada('¿Cuál fue el ingreso neto por mes?', ctx);
  assert.equal(inicial.solicitud.estado, 'requiere_aclaracion');
  assert.equal(clienteP2.estado.preguntas[0].int_id, 1);
  await assert.rejects(consultarPreguntaTrazada(inicial.pregunta_id, ctx), /no habilitada/);
  assert.equal(clienteP2.estado.consultas.length, 0);
  assert.equal(consultasP1, 0);

  const aclarada = await aclararPreguntaTrazada(inicial.pregunta_id, 'octubre de 2025', ctx);
  assert.equal(aclarada.solicitud.estado, 'interpretada');
  const salida = await consultarPreguntaTrazada(inicial.pregunta_id, ctx);
  assert.equal(consultasP1, 1);
  assert.equal(salida.respuesta_ejecutiva,
    'Período: 2025-10-01 a 2025-10-31. Ingreso neto por mes: 2025-10: 5580.00.');
  const db = clienteP2.estado;
  assert.deepEqual(JSON.parse(db.preguntas[0].pre_filtro).aclaraciones,
    [{ pregunta: '¿Qué período desea analizar?', respuesta: 'octubre de 2025' }]);
  assert.deepEqual(JSON.parse(db.consultas[0].ca_parametros),
    { consulta_id: 'ingreso_neto_mensual', valores: ['2025-10-01', '2025-10-31'] });
  assert.match(db.consultas[0].ca_sql, /^SELECT/);
  assert.deepEqual(db.fuentes, [
    [1, 'FactVentas', 'MontoVenta'], [1, 'FactVentas', 'MontoDescuento'],
    [1, 'DimTiempo', 'AnioMes'], [1, 'DimTiempo', 'FechaCompleta'],
  ]);
  assert.deepEqual(db.reglas.map((r) => [r[1], r[2]]),
    [['consulta_autorizada', 'aprobada'], ['consulta_p1', 'aprobada']]);
  assert.deepEqual(JSON.parse(db.resultados[0].datos), [{ mes: '2025-10', ingreso_neto: '5580.00' }]);
  assert.equal(JSON.parse(db.resultados[0].metadatos).cantidad_filas, 1);
  assert.equal(db.respuestas[0].explicacion, salida.respuesta_ejecutiva);
  assert.deepEqual([salida.pregunta_id, salida.consulta_id_p2, salida.resultado_id, salida.respuesta_id],
    [1, 1, 1, 1]);
  await assert.rejects(consultarPreguntaTrazada(1, ctx), /ya tiene una consulta/);
  assert.equal(consultasP1, 1);
});

test('una pregunta no admitida se conserva sin consulta ni acceso a P1; sesión ajena se rechaza', async () => {
  const clienteP2 = baseP2();
  const clienteDatos = { query: async () => { throw new Error('P1 no debería ser consultado'); } };
  const ctx = contexto(clienteP2, clienteDatos);
  const { pregunta_id } = await crearPreguntaTrazada('Eliminar todas las ventas', ctx);
  assert.equal(clienteP2.estado.preguntas[0].int_id, null);
  await assert.rejects(consultarPreguntaTrazada(pregunta_id, ctx), /no habilitada/);
  await assert.rejects(consultarPreguntaTrazada(pregunta_id, { ...ctx, sesionId: 8 }), /no pertenece/);
  assert.equal(clienteP2.estado.consultas.length, 0);
});

test('varias aclaraciones y resultado vacío no inventan hechos ni cifras', async () => {
  const clienteP2 = baseP2();
  const clienteDatos = { query: async () => ({ rows: [] }) };
  const ctx = contexto(clienteP2, clienteDatos);
  const { pregunta_id } = await crearPreguntaTrazada(
    '¿Qué producto lidera las ventas dentro de una categoría y periodo determinados?', ctx,
  );
  await aclararPreguntaTrazada(pregunta_id, 'octubre de 2025', ctx);
  await assert.rejects(consultarPreguntaTrazada(pregunta_id, ctx), /no habilitada/);
  await aclararPreguntaTrazada(pregunta_id, 'Electrónica', ctx);
  const salida = await consultarPreguntaTrazada(pregunta_id, ctx);
  assert.equal(salida.sin_registros, true);
  assert.deepEqual(JSON.parse(clienteP2.estado.resultados[0].datos), []);
  assert.equal(JSON.parse(clienteP2.estado.resultados[0].metadatos).sin_registros, true);
  assert.match(clienteP2.estado.respuestas[0].explicacion, /No se encontraron registros/);
  assert.equal(JSON.parse(clienteP2.estado.preguntas[0].pre_filtro).aclaraciones.length, 2);
});

test('falla de P1 queda registrada sin resultado ni respuesta, sin filtrar mensaje sensible', async () => {
  const clienteP2 = baseP2();
  const clienteDatos = { query: async () => { throw new Error('contraseña privada'); } };
  const ctx = contexto(clienteP2, clienteDatos);
  const { pregunta_id } = await crearPreguntaTrazada('¿Cuál fue el ingreso neto por mes?', ctx);
  await aclararPreguntaTrazada(pregunta_id, 'octubre de 2025', ctx);
  await assert.rejects(consultarPreguntaTrazada(pregunta_id, ctx), /contraseña privada/);
  assert.deepEqual(clienteP2.estado.reglas.at(-1).slice(1, 3), ['consulta_p1', 'fallida']);
  assert.doesNotMatch(clienteP2.estado.reglas.at(-1)[3], /contraseña privada/);
  assert.equal(clienteP2.estado.resultados.length, 0);
  assert.equal(clienteP2.estado.respuestas.length, 0);
});

test('P2 revierte escrituras parciales; no se consulta P1 si falla su persistencia', async () => {
  const clienteP2 = baseP2();
  const ctx = contexto(clienteP2, { query: async () => { throw new Error('P1 no debería ser consultado'); } });
  const { pregunta_id } = await crearPreguntaTrazada('¿Cuál fue el ingreso neto por mes?', ctx);
  await aclararPreguntaTrazada(pregunta_id, 'octubre de 2025', ctx);
  const original = clienteP2.query.bind(clienteP2);
  clienteP2.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO fuentes_datos')) throw new Error('P2 no disponible');
    return original(sql, params);
  };
  await assert.rejects(consultarPreguntaTrazada(pregunta_id, ctx), /P2 no disponible/);
  assert.equal(clienteP2.estado.consultas.length, 0);
  assert.equal(clienteP2.estado.fuentes.length, 0);
});

test('una aclaración inválida queda pendiente y no habilita la consulta', async () => {
  const clienteP2 = baseP2();
  const ctx = contexto(clienteP2, { query: async () => { throw new Error('P1 no debería ser consultado'); } });
  const { pregunta_id } = await crearPreguntaTrazada('¿Cuál fue el ingreso neto por mes?', ctx);
  const { solicitud } = await aclararPreguntaTrazada(pregunta_id, 'algún mes', ctx);
  assert.equal(solicitud.estado, 'requiere_aclaracion');
  assert.match(solicitud.motivo, /período inequívoco/);
  await assert.rejects(consultarPreguntaTrazada(pregunta_id, ctx), /no habilitada/);
  assert.equal(clienteP2.estado.consultas.length, 0);
});

test('si P2 falla al guardar la respuesta se revierten resultado y validación final', async () => {
  const clienteP2 = baseP2();
  let consultasP1 = 0;
  const ctx = contexto(clienteP2, { query: async () => {
    consultasP1++;
    return { rows: [{ mes: '2025-10', ingreso_neto: '5580.00' }] };
  } });
  const { pregunta_id } = await crearPreguntaTrazada('¿Cuál fue el ingreso neto por mes?', ctx);
  await aclararPreguntaTrazada(pregunta_id, 'octubre de 2025', ctx);
  const original = clienteP2.query.bind(clienteP2);
  clienteP2.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO respuestas_agente')) throw new Error('P2 no pudo responder');
    return original(sql, params);
  };
  await assert.rejects(consultarPreguntaTrazada(pregunta_id, ctx), /P2 no pudo responder/);
  assert.equal(consultasP1, 1);
  assert.equal(clienteP2.estado.consultas.length, 1);
  assert.equal(clienteP2.estado.resultados.length, 0);
  assert.equal(clienteP2.estado.respuestas.length, 0);
  assert.deepEqual(clienteP2.estado.reglas.map((r) => r[1]), ['consulta_autorizada']);
});
