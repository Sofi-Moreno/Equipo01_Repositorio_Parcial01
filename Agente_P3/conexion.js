'use strict';

const fs = require('node:fs');
const path = require('node:path');

function cargarEntorno() {
  const archivo = path.join(__dirname, '.env');
  if (fs.existsSync(archivo)) process.loadEnvFile(archivo);
}

function identificador(nombre) {
  if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) throw new Error('Nombre de esquema inválido.');
  return `"${nombre}"`;
}

function configuracion(tipo, env = process.env) {
  const prefijo = tipo === 'datos' ? 'DATAMART' : 'BDOO';
  const cadena = env[`${prefijo}_DATABASE_URL`];
  if (!cadena) throw new Error(`Falta ${prefijo}_DATABASE_URL en Agente_P3/.env.`);
  let url;
  try { url = new URL(cadena); } catch { throw new Error(`${prefijo}_DATABASE_URL inválido.`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Se requiere un URI PostgreSQL.');
  // Evitar que sslmode en el URI sustituya la configuración explícita de TLS de pg.
  for (const clave of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(clave);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (env.PGSSL === 'disable' && !local) throw new Error('TLS solo puede desactivarse para PostgreSQL local.');
  return { connectionString: url.toString(),
    ssl: env.PGSSL === 'disable' && local ? false : {
      rejectUnauthorized: true,
      ...(env.PGSSLROOTCERT ? { ca: fs.readFileSync(path.resolve(__dirname, env.PGSSLROOTCERT), 'utf8') } : {}),
    },
    connectionTimeoutMillis: 10000, query_timeout: 15000,
    application_name: `equipo01_${prefijo.toLowerCase()}`,
  };
}

// En el pooler de transacciones (6543), SET de sesión no se conserva entre
// transacciones. Cada operación aplica su contexto con SET LOCAL y P1 READ ONLY.
function clienteTransaccional(cliente, tipo, esquema) {
  let enTransaccion = false;
  async function contextoLocal() {
    await cliente.query(`SET LOCAL search_path TO ${identificador(esquema)}, pg_catalog`);
    await cliente.query("SET LOCAL statement_timeout TO '15s'");
  }
  async function comenzar(sql) {
    await cliente.query(tipo === 'datos' ? 'BEGIN READ ONLY' : sql);
    enTransaccion = true;
    try { await contextoLocal(); }
    catch (error) { await cliente.query('ROLLBACK'); enTransaccion = false; throw error; }
  }
  return {
    async query(sql, parametros) {
      if (typeof sql !== 'string') throw new TypeError('Se requiere SQL como texto.');
      const orden = sql.trim().replace(/;$/, '').trim();
      if (/^BEGIN(?:\s|$)/i.test(orden)) {
        if (enTransaccion) throw new Error('Ya existe una transacción activa.');
        await comenzar(sql); return { rows: [] };
      }
      if (/^(COMMIT|ROLLBACK)$/i.test(orden)) {
        try { return await cliente.query(sql); } finally { enTransaccion = false; }
      }
      if (enTransaccion) return cliente.query(sql, parametros);
      await comenzar('BEGIN');
      try {
        const resultado = await cliente.query(sql, parametros);
        await cliente.query('COMMIT');
        return resultado;
      } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { enTransaccion = false; }
    },
    end: () => cliente.end(),
  };
}

async function conectar(tipo, { env = process.env, Client } = {}) {
  const PgClient = Client || require('pg').Client;
  const config = configuracion(tipo, env);
  const cliente = new PgClient(config);
  try {
    await cliente.connect();
    const esquema = env[tipo === 'datos' ? 'DATAMART_SCHEMA' : 'BDOO_SCHEMA'] || 'public';
    identificador(esquema);
    if (new URL(config.connectionString).port === '6543') {
      return clienteTransaccional(cliente, tipo, esquema);
    }
    await cliente.query(`SET search_path TO ${identificador(esquema)}, pg_catalog`);
    await cliente.query("SET statement_timeout TO '15s'");
    if (tipo === 'datos') await cliente.query('SET default_transaction_read_only TO on');
    return cliente;
  } catch (error) {
    await cliente.end().catch(() => {});
    const codigos = { ENOTFOUND: 'No se pudo resolver el host.', ENETUNREACH: 'Red no disponible; revise IPv6 o Session pooler.',
      ETIMEDOUT: 'Se agotó el tiempo de conexión; revise acceso al puerto PostgreSQL.',
      '28P01': 'Usuario o contraseña inválidos.', '3D000': 'La base no existe.',
      SELF_SIGNED_CERT_IN_CHAIN: 'Configure PGSSLROOTCERT con el certificado de Supabase.' };
    const detalle = codigos[error.code] || (/timeout/i.test(error.message || '')
      ? 'Se agotó el tiempo de conexión antes de completar la negociación PostgreSQL/TLS.'
      : 'Revise host, puerto, TLS y acceso de red.');
    throw new Error(`No se pudo conectar ${tipo === 'datos' ? 'Data Mart' : 'BDOO'}. ${detalle}`);
  }
}

async function crearSesion(cliente, { nombreUsuario, modelo }) {
  if (!nombreUsuario?.trim()) throw new Error('Se requiere un nombre de usuario.');
  await cliente.query('BEGIN');
  try {
    const intenciones = ['analizar_ventas', 'analizar_rentabilidad', 'comparar_rentabilidad', 'identificar_producto_mas_vendido'];
    for (const nombre of intenciones) {
      await cliente.query('INSERT INTO intenciones (int_nombre) VALUES ($1) ON CONFLICT (int_nombre) DO NOTHING', [nombre]);
    }
    const usuario = await cliente.query('INSERT INTO usuarios (nombre) VALUES ($1) RETURNING u_id', [nombreUsuario.trim()]);
    const agente = await cliente.query(
      'INSERT INTO agentes_analiticos (aa_nombre, aa_plataforma, aa_modelo) VALUES ($1, $2, $3) RETURNING aa_id',
      ['Agente analítico Equipo 01', 'Gemini API', modelo]);
    const sesion = await cliente.query('INSERT INTO sesiones (u_id, aa_id) VALUES ($1, $2) RETURNING ses_id',
      [usuario.rows[0].u_id, agente.rows[0].aa_id]);
    await cliente.query('COMMIT');
    return { sesionId: sesion.rows[0].ses_id, usuarioId: usuario.rows[0].u_id, agenteId: agente.rows[0].aa_id };
  } catch {
    await cliente.query('ROLLBACK');
    throw new Error('No se pudo crear la sesión. Verifique el DDL o migración BDOO y los permisos de escritura.');
  }
}

module.exports = { cargarEntorno, configuracion, conectar, crearSesion, identificador, clienteTransaccional };
