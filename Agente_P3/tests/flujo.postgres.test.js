'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { cargarEntorno, conectar } = require('../conexion.js');
const { iniciarPregunta, continuarPregunta, consultarSolicitud } = require('../flujo.js');

test('pregunta, aclaración y consulta parametrizada contra PostgreSQL real', { timeout: 20000 }, async () => {
  cargarEntorno();
  const cliente = await conectar('datos');
  try {
    await cliente.query('BEGIN READ ONLY');

    const inicial = iniciarPregunta('¿Cuál fue el ingreso neto por mes?');
    assert.equal(inicial.estado, 'requiere_aclaracion');
    await assert.rejects(consultarSolicitud(inicial, cliente), /no habilitada/);

    const solicitud = continuarPregunta(inicial, 'octubre de 2025');
    assert.equal(solicitud.estado, 'interpretada');
    const resultado = await consultarSolicitud(solicitud, cliente);
    assert.equal(resultado.consulta_id, 'ingreso_neto_mensual');
    assert.equal(resultado.sin_registros, false);
    assert.equal(resultado.filas.length, 1);
    assert.equal(resultado.filas[0].mes, '2025-10');
    assert.equal(Number(resultado.filas[0].ingreso_neto), 5580);
  } finally {
    try {
      await cliente.query('ROLLBACK');
    } finally {
      await cliente.end();
    }
  }
});
