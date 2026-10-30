'use strict';

// Fuentes revisadas junto con las siete plantillas del DQL de P1.
const DIMENSIONES = Object.freeze({
  ingreso_neto_mensual: [['DimTiempo', 'AnioMes'], ['DimTiempo', 'FechaCompleta']],
  ranking_margen_categorias: [['DimTiempo', 'FechaCompleta'], ['DimProducto', 'Categoria']],
  ranking_ticket_sucursales: [['DimTiempo', 'FechaCompleta'], ['DimSucursal', 'NombreSucursal']],
  mayor_caida_segmento: [['DimTiempo', 'FechaCompleta'], ['DimCliente', 'Segmento']],
  ranking_valor_canales: [['DimTiempo', 'FechaCompleta'], ['DimCanal', 'TipoCanal']],
  comparacion_margen_canales: [['DimTiempo', 'AnioMes'], ['DimCanal', 'TipoCanal']],
  lider_producto_categoria: [['DimTiempo', 'FechaCompleta'], ['DimProducto', 'Categoria'], ['DimProducto', 'NombreProducto']],
});

function fuentesDe(entrada) {
  return [
    ...entrada.camposFactVentas.map((atributo) => ['FactVentas', atributo]),
    ...DIMENSIONES[entrada.id],
  ];
}

module.exports = { fuentesDe };
