-- ==============================================================================
-- CATÁLOGO DE CONSULTAS ANALÍTICAS (DQL) - COMPONENTE A (DATA MART)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Pregunta 1: ¿Cuál es el ingreso neto y margen bruto por segmento de cliente en el año 2026?
-- Lógica: Demuestra el correcto funcionamiento del SCD Tipo 2 agrupando por el 
-- segmento histórico al momento de la venta.
-- ------------------------------------------------------------------------------
SELECT 
    c.Segmento,
    SUM(f.MontoVenta) - SUM(f.MontoDescuento) AS IngresoNeto,
    (SUM(f.MontoVenta) - SUM(f.MontoDescuento)) - SUM(f.CostoTotal) AS MargenBruto
FROM FactVentas f
JOIN DimCliente c ON f.Sk_Dim_Cliente = c.Sk_Dim_Cliente
JOIN DimTiempo t ON f.Sk_Dim_Tiempo = t.Sk_Dim_Tiempo
WHERE t.Anio = 2026
GROUP BY c.Segmento
ORDER BY IngresoNeto DESC;

-- ------------------------------------------------------------------------------
-- Pregunta 2: ¿Cuál es el ticket promedio histórico y el total de transacciones por sucursal?
-- Lógica: Evita duplicar totales contando de forma distinta la dimensión degenerada 
-- NumeroTransaccion y protegiendo contra la división por cero.
-- ------------------------------------------------------------------------------
SELECT 
    s.NombreSucursal,
    COUNT(DISTINCT f.NumeroTransaccion) AS NumeroTransacciones,
    (SUM(f.MontoVenta) - SUM(f.MontoDescuento)) / NULLIF(COUNT(DISTINCT f.NumeroTransaccion), 0) AS TicketPromedio
FROM FactVentas f
JOIN DimSucursal s ON f.Sk_Dim_Sucursal = s.Sk_Dim_Sucursal
GROUP BY s.NombreSucursal
ORDER BY TicketPromedio DESC;

-- ------------------------------------------------------------------------------
-- Pregunta 3: ¿Cuáles son los 5 productos más rentables históricamente según su margen porcentual?
-- Lógica: Calcula el margen porcentual derivado a partir de métricas base aditivas, 
-- como dicta la regla del negocio.
-- ------------------------------------------------------------------------------
SELECT 
    p.NombreProducto,
    p.Categoria,
    (SUM(f.MontoVenta) - SUM(f.MontoDescuento)) AS IngresoNeto,
    ((SUM(f.MontoVenta) - SUM(f.MontoDescuento)) - SUM(f.CostoTotal)) AS MargenBruto,
    (((SUM(f.MontoVenta) - SUM(f.MontoDescuento)) - SUM(f.CostoTotal)) / NULLIF((SUM(f.MontoVenta) - SUM(f.MontoDescuento)), 0)) * 100 AS MargenPorcentual
FROM FactVentas f
JOIN DimProducto p ON f.Sk_Dim_Producto = p.Sk_Dim_Producto
GROUP BY p.NombreProducto, p.Categoria
ORDER BY MargenPorcentual DESC
LIMIT 5;

-- ------------------------------------------------------------------------------
-- Pregunta 4: ¿Cuál fue el ingreso neto total por canal de venta en los últimos 3 meses con ventas registradas?
-- Lógica: Filtro dinámico basado en los datos almacenados (AnioMes máximo), 
-- sin depender de la fecha actual del sistema.
-- ------------------------------------------------------------------------------
WITH UltimosMeses AS (
    SELECT DISTINCT AnioMes 
    FROM DimTiempo t
    JOIN FactVentas f ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
    ORDER BY AnioMes DESC
    LIMIT 3
)
SELECT 
    c.TipoCanal,
    t.AnioMes,
    SUM(f.MontoVenta) - SUM(f.MontoDescuento) AS IngresoNeto
FROM FactVentas f
JOIN DimCanal c ON f.Sk_Dim_Canal = c.Sk_Dim_Canal
JOIN DimTiempo t ON f.Sk_Dim_Tiempo = t.Sk_Dim_Tiempo
WHERE t.AnioMes IN (SELECT AnioMes FROM UltimosMeses)
GROUP BY c.TipoCanal, t.AnioMes
ORDER BY t.AnioMes DESC, IngresoNeto DESC;

-- ------------------------------------------------------------------------------
-- Pregunta 5: ¿Cuál es el porcentaje de descuento global aplicado sobre el monto de venta bruto, por tipo de promoción?
-- Lógica: Relaciona montos aditivos e incluye miembros 'Sin promoción'.
-- ------------------------------------------------------------------------------
SELECT 
    pr.TipoPromocion,
    SUM(f.MontoDescuento) AS DescuentoTotal,
    SUM(f.MontoVenta) AS VentaBrutaTotal,
    (SUM(f.MontoDescuento) / NULLIF(SUM(f.MontoVenta), 0)) * 100 AS PorcentajeDescuentoGlobal
FROM FactVentas f
JOIN DimPromocion pr ON f.Sk_Dim_Promocion = pr.Sk_Dim_Promocion
GROUP BY pr.TipoPromocion
ORDER BY PorcentajeDescuentoGlobal DESC;

-- ------------------------------------------------------------------------------
-- Pregunta 6: ¿Cuántos clientes únicos reales han comprado en cada sucursal?
-- Lógica: Cuenta IdCliente_NK (clave natural) en lugar de la clave sustituta, 
-- evitando contar dos veces al mismo cliente si tiene historia en SCD Tipo 2.
-- ------------------------------------------------------------------------------
SELECT 
    s.NombreSucursal,
    COUNT(DISTINCT c.IdCliente_NK) AS ClientesUnicos
FROM FactVentas f
JOIN DimSucursal s ON f.Sk_Dim_Sucursal = s.Sk_Dim_Sucursal
JOIN DimCliente c ON f.Sk_Dim_Cliente = c.Sk_Dim_Cliente
GROUP BY s.NombreSucursal
ORDER BY ClientesUnicos DESC;

-- ------------------------------------------------------------------------------
-- Pregunta 7: ¿Cuál es la distribución del ingreso neto haciendo drill-down geográfico?
-- Lógica: Uso de la jerarquía de la dimensión sucursal (Pais -> Region -> Ciudad).
-- ------------------------------------------------------------------------------
SELECT 
    s.Pais,
    s.Region,
    s.Ciudad,
    s.NombreSucursal,
    SUM(f.MontoVenta) - SUM(f.MontoDescuento) AS IngresoNeto
FROM FactVentas f
JOIN DimSucursal s ON f.Sk_Dim_Sucursal = s.Sk_Dim_Sucursal
GROUP BY s.Pais, s.Region, s.Ciudad, s.NombreSucursal
ORDER BY s.Pais, s.Region, IngresoNeto DESC;

-- ------------------------------------------------------------------------------
-- Pregunta 8: ¿Qué día de la semana genera mayor volumen de unidades vendidas?
-- Lógica: Agrupación descriptiva sobre la dimensión tiempo.
-- ------------------------------------------------------------------------------
SELECT 
    t.DiaSemana,
    SUM(f.CantidadVendida) AS UnidadesTotales
FROM FactVentas f
JOIN DimTiempo t ON f.Sk_Dim_Tiempo = t.Sk_Dim_Tiempo
GROUP BY t.DiaSemana
ORDER BY UnidadesTotales DESC;

-- ------------------------------------------------------------------------------
-- Pregunta 9: ¿Qué porcentaje de las líneas de venta está asociado a valores "Desconocido" (-1)?
-- Lógica: Validación de calidad de datos para medir la fiabilidad de las dimensiones.
-- ------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS TotalLineas,
    SUM(CASE WHEN f.Sk_Dim_Tiempo = -1 OR f.Sk_Dim_Cliente = -1 OR f.Sk_Dim_Producto = -1 
                  OR f.Sk_Dim_Sucursal = -1 OR f.Sk_Dim_Canal = -1 OR f.Sk_Dim_Promocion = -1 
             THEN 1 ELSE 0 END) AS LineasConDesconocidos,
    (SUM(CASE WHEN f.Sk_Dim_Tiempo = -1 OR f.Sk_Dim_Cliente = -1 OR f.Sk_Dim_Producto = -1 
                   OR f.Sk_Dim_Sucursal = -1 OR f.Sk_Dim_Canal = -1 OR f.Sk_Dim_Promocion = -1 
              THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)) AS PorcentajeDesconocidos
FROM FactVentas f;

-- ------------------------------------------------------------------------------
-- Pregunta 10: ¿Cuál es la evolución mensual del costo total durante el año 2026?
-- Lógica: Ordenamiento cronológico explícito (NumeroMes) de métricas base.
-- ------------------------------------------------------------------------------
SELECT 
    t.NumeroMes,
    t.Mes,
    SUM(f.CostoTotal) AS CostoTotalMensual
FROM FactVentas f
JOIN DimTiempo t ON f.Sk_Dim_Tiempo = t.Sk_Dim_Tiempo
WHERE t.Anio = 2026
GROUP BY t.NumeroMes, t.Mes
ORDER BY t.NumeroMes;

-- ============================================================================== 
-- CONSULTAS DEL AGENTE P3 (PostgreSQL, parametros posicionales $1, $2, ...)
-- Solo se ejecutan tras validar la solicitud y resolver las aclaraciones.
-- Los bloques BEGIN/END son la lista cerrada que lee catalogo.js: no interpolar
-- preguntas, nombres de columnas ni valores del usuario en el SQL.
-- Un resultado vacio indica ausencia de registros, nunca importe cero.
-- ============================================================================== 

-- BEGIN QUERY ingreso_neto_mensual
-- $1 desde (DATE), $2 hasta (DATE); intervalo inclusivo.
SELECT t.AnioMes AS mes,
       SUM(f.MontoVenta - f.MontoDescuento) AS ingreso_neto
FROM FactVentas f
JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
WHERE t.FechaCompleta BETWEEN $1::date AND $2::date
GROUP BY t.AnioMes
ORDER BY t.AnioMes;
-- END QUERY ingreso_neto_mensual

-- BEGIN QUERY ranking_margen_categorias
-- $1 desde (DATE), $2 hasta (DATE), $3 cantidad de categorias (1..20).
SELECT p.Categoria AS categoria,
       SUM(f.MontoVenta - f.MontoDescuento - f.CostoTotal) AS margen_bruto
FROM FactVentas f
JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
JOIN DimProducto p ON p.Sk_Dim_Producto = f.Sk_Dim_Producto
WHERE t.FechaCompleta BETWEEN $1::date AND $2::date
GROUP BY p.Categoria
ORDER BY margen_bruto DESC, p.Categoria
LIMIT $3;
-- END QUERY ranking_margen_categorias

-- BEGIN QUERY ranking_ticket_sucursales
-- $1 desde (DATE), $2 hasta (DATE); transacciones, no lineas.
SELECT s.NombreSucursal AS sucursal,
       SUM(f.MontoVenta - f.MontoDescuento)
           / NULLIF(COUNT(DISTINCT f.NumeroTransaccion), 0) AS ticket_promedio
FROM FactVentas f
JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
JOIN DimSucursal s ON s.Sk_Dim_Sucursal = f.Sk_Dim_Sucursal
WHERE t.FechaCompleta BETWEEN $1::date AND $2::date
GROUP BY s.Sk_Dim_Sucursal, s.NombreSucursal
ORDER BY ticket_promedio DESC, s.NombreSucursal
LIMIT 1;
-- END QUERY ranking_ticket_sucursales

-- BEGIN QUERY mayor_caida_segmento
-- $1/$2 anterior, $3/$4 actual; volumen = unidades vendidas (SCD2 historico).
-- Solo segmentos con ventas en ambos periodos y base anterior positiva.
-- Caida porcentual positiva; se devuelven todos los empatados en el primer puesto.
WITH anterior AS (
    SELECT c.Segmento, SUM(f.CantidadVendida) AS unidades
    FROM FactVentas f
    JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
    JOIN DimCliente c ON c.Sk_Dim_Cliente = f.Sk_Dim_Cliente
    WHERE t.FechaCompleta BETWEEN $1::date AND $2::date
    GROUP BY c.Segmento
), actual AS (
    SELECT c.Segmento, SUM(f.CantidadVendida) AS unidades
    FROM FactVentas f
    JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
    JOIN DimCliente c ON c.Sk_Dim_Cliente = f.Sk_Dim_Cliente
    WHERE t.FechaCompleta BETWEEN $3::date AND $4::date
    GROUP BY c.Segmento
), caidas AS (
    SELECT a.Segmento AS segmento,
           a.unidades AS valor_anterior, b.unidades AS valor_actual,
           100.0 * (a.unidades - b.unidades) / NULLIF(a.unidades, 0) AS caida_porcentual
    FROM anterior a
    JOIN actual b ON b.Segmento = a.Segmento
    WHERE a.unidades > 0 AND a.unidades > b.unidades
), posiciones AS (
    SELECT caidas.*, DENSE_RANK() OVER (ORDER BY caida_porcentual DESC) AS posicion
    FROM caidas
)
SELECT segmento, valor_anterior, valor_actual, caida_porcentual
FROM posiciones
WHERE posicion = 1
ORDER BY segmento;
-- END QUERY mayor_caida_segmento

-- BEGIN QUERY ranking_valor_canales
-- $1 desde (DATE), $2 hasta (DATE); valor de ventas = ingreso neto.
SELECT c.TipoCanal AS canal,
       SUM(f.MontoVenta - f.MontoDescuento) AS valor_ventas
FROM FactVentas f
JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
JOIN DimCanal c ON c.Sk_Dim_Canal = f.Sk_Dim_Canal
WHERE t.FechaCompleta BETWEEN $1::date AND $2::date
GROUP BY c.Sk_Dim_Canal, c.TipoCanal
ORDER BY valor_ventas DESC, c.TipoCanal
LIMIT 1;
-- END QUERY ranking_valor_canales

-- BEGIN QUERY comparacion_margen_canales
-- $1/$2 son los dos canales; meses = ultimos tres distintos CON ventas.
-- No rellenar combinaciones mes/canal sin ventas con cero.
WITH ultimos_meses AS (
    SELECT DISTINCT t.AnioMes
    FROM FactVentas f
    JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
    ORDER BY t.AnioMes DESC
    LIMIT 3
)
SELECT t.AnioMes AS mes, c.TipoCanal AS canal,
       SUM(f.MontoVenta - f.MontoDescuento - f.CostoTotal) AS margen
FROM FactVentas f
JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
JOIN DimCanal c ON c.Sk_Dim_Canal = f.Sk_Dim_Canal
JOIN ultimos_meses u ON u.AnioMes = t.AnioMes
WHERE c.TipoCanal IN ($1, $2)
GROUP BY t.AnioMes, c.Sk_Dim_Canal, c.TipoCanal
ORDER BY t.AnioMes, c.TipoCanal;
-- END QUERY comparacion_margen_canales

-- BEGIN QUERY lider_producto_categoria
-- $1 desde (DATE), $2 hasta (DATE), $3 categoria normalizada sin acentos.
-- Producto lider = mayor cantidad de unidades vendidas en la categoria y periodo.
SELECT p.NombreProducto AS producto,
       SUM(f.CantidadVendida) AS unidades_vendidas
FROM FactVentas f
JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo
JOIN DimProducto p ON p.Sk_Dim_Producto = f.Sk_Dim_Producto
WHERE t.FechaCompleta BETWEEN $1::date AND $2::date
  AND lower(translate(p.Categoria, 'ÁÉÍÓÚÜáéíóúü', 'AEIOUUaeiouu')) = $3
GROUP BY p.Sk_Dim_Producto, p.NombreProducto
ORDER BY unidades_vendidas DESC, p.NombreProducto
LIMIT 1;
-- END QUERY lider_producto_categoria
