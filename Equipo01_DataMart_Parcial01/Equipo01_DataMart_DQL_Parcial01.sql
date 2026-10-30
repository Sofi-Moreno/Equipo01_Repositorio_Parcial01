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