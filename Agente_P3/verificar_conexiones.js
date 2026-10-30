'use strict';

const { cargarEntorno, conectar } = require('./conexion.js');
const { InterpreteGemini } = require('./gemini.js');

async function main() {
  cargarEntorno();
  const solo = process.argv[2];
  let fallos = 0;
  for (const tipo of ['bdoo', 'datos']) {
    if (solo && solo !== tipo) continue;
    let cliente;
    try {
      cliente = await conectar(tipo);
      const tablas = tipo === 'datos' ? ['factventas', 'dimtiempo', 'dimproducto', 'dimcliente', 'dimcanal', 'dimsucursal', 'dimpromocion']
        : ['agentes_analiticos', 'usuarios', 'sesiones', 'intenciones', 'preguntas', 'consultas_analiticas',
          'fuentes_datos', 'reglas_validaciones', 'reglas_seguridad', 'reglas_sintaxis', 'reglas_respuesta', 'resultados_consultas', 'respuestas_agente'];
      const esquema = process.env[tipo === 'datos' ? 'DATAMART_SCHEMA' : 'BDOO_SCHEMA'] || 'public';
      const r = await cliente.query(`SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = ANY($2::text[])`, [esquema, tablas]);
      const faltantes = tablas.filter((t) => !r.rows.some((f) => f.table_name === t));
      if (faltantes.length) throw new Error(`Conexión disponible; faltan tablas: ${faltantes.join(', ')}.`);
      if (tipo === 'bdoo') {
        const columna = await cliente.query(`SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'consultas_analiticas' AND column_name = 'ca_validacion'`, [esquema]);
        if (!columna.rows.length) throw new Error('Conexión disponible; falta aplicar la migración BDOO.');
      }
      console.log(`${tipo}: conexión TLS y tablas disponibles.`);
    } catch (error) { console.error(`${tipo}: ${error.message}`); fallos++; }
    finally { await cliente?.end(); }
  }
  if (!solo || solo === 'gemini') {
    try {
      const ia = new InterpreteGemini({ apiKey: process.env.GEMINI_API_KEY, modelo: process.env.GEMINI_MODEL || undefined });
      const r = await ia.interpretar('Muéstrame el ingreso neto mensual en octubre de 2025');
      if (r.metrica !== 'ingreso_neto' || r.periodo.desde !== '2025-10-01') throw new Error('Interpretación inesperada.');
      console.log(`gemini: modelo ${ia.modelo} accesible e interpretación válida.`);
    } catch (error) { console.error(`gemini: ${error.message}`); fallos++; }
  }
  if (fallos) process.exitCode = 1;
}
if (require.main === module) main().catch(() => { console.error('No se pudo cargar la configuración local.'); process.exitCode = 1; });
module.exports = { main };
