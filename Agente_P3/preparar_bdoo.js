'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { cargarEntorno, conectar } = require('./conexion.js');

async function main() {
  cargarEntorno();
  const cliente = await conectar('bdoo');
  try {
    const esquema = process.env.BDOO_SCHEMA || 'public';
    const columnas = (await cliente.query(`SELECT table_name,column_name,is_nullable,data_type
      FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position`, [esquema])).rows;
    const tablas = [...new Set(columnas.map((c) => c.table_name))];
    const resumen = [];
    for (const tabla of tablas) {
      if (!/^[a-z_][a-z0-9_]*$/.test(tabla)) continue;
      const conteo = await cliente.query(`SELECT count(*) AS cantidad FROM "${tabla}"`);
      resumen.push({ tabla, filas: Number(conteo.rows[0].cantidad) });
    }
    console.log(JSON.stringify({ esquema, tablas: resumen }, null, 2));
    if (process.argv[2] !== '--aplicar') {
      const restricciones = await cliente.query(`SELECT t.relname AS tabla,c.conname,
        pg_get_constraintdef(c.oid) AS regla FROM pg_constraint c
        JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=$1 ORDER BY t.relname,c.conname`, [esquema]);
      console.log(JSON.stringify({ columnas, restricciones: restricciones.rows }, null, 2));
      return;
    }
    const actualizada = columnas.some((c) => c.table_name === 'consultas_analiticas' && c.column_name === 'ca_validacion');
    if (actualizada) throw new Error('La BDOO ya contiene ca_validacion: revisar esquema antes de volver a migrar.');
    const archivo = tablas.includes('preguntas') ? 'Equipo01_BDOO_Migracion_Diagrama.sql' : 'Equipo01_BDOO_DDL_Parcial01.sql';
    const script = fs.readFileSync(path.join(__dirname, '../Equipo01_DataMart_Parcial01', archivo), 'utf8');
    const cuerpo = script.replace(/^BEGIN;\s*$/m, '').replace(/COMMIT;\s*$/, '');
    await cliente.query('BEGIN');
    try {
      await cliente.query(cuerpo);
      await cliente.query('COMMIT');
      console.log(`Aplicado: ${archivo}`);
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally { await cliente.end(); }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
