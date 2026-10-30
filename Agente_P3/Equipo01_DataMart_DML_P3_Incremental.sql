-- Semilla incremental P3 para una base ya cargada con el DML original de P1.
-- Ejecutar en una base de pruebas; al repetirla, omite claves primarias existentes.
-- No modifica los hechos de P1 ni la promoción -1. No ejecutar el DML completo otra vez.
BEGIN;

INSERT INTO DimPromocion (Sk_Dim_Promocion, CodigoPromocion_NK, NombrePromocion, TipoPromocion)
VALUES (0, 'SIN_PROMO', 'Sin promoción', 'Sin promoción')
ON CONFLICT (Sk_Dim_Promocion) DO NOTHING;

INSERT INTO DimTiempo (Sk_Dim_Tiempo, FechaCompleta, DiaSemana, NumeroMes, Mes, AnioMes, Trimestre, Anio) VALUES
(20250915, '2025-09-15', 'Lunes', 9, 'Septiembre', '2025-09', 'Q3', 2025),
(20251015, '2025-10-15', 'Miércoles', 10, 'Octubre', '2025-10', 'Q4', 2025),
(20251115, '2025-11-15', 'Sábado', 11, 'Noviembre', '2025-11', 'Q4', 2025),
(20260815, '2026-08-15', 'Sábado', 8, 'Agosto', '2026-08', 'Q3', 2026),
(20260915, '2026-09-15', 'Martes', 9, 'Septiembre', '2026-09', 'Q3', 2026)
ON CONFLICT (Sk_Dim_Tiempo) DO NOTHING;

INSERT INTO DimProducto (Sk_Dim_Producto, CodigoProducto_NK, NombreProducto, Subcategoria, Categoria, Marca) VALUES
(3, 'PROD003', 'Lámpara de mesa', 'Iluminación', 'Hogar', 'CasaDemo'),
(4, 'PROD004', 'Camiseta básica', 'Ropa casual', 'Ropa', 'ModaDemo'),
(5, 'PROD005', 'Balón de fútbol', 'Accesorios', 'Deportes', 'SportDemo'),
(6, 'PROD006', 'Café molido', 'Bebidas', 'Alimentos', 'SaborDemo')
ON CONFLICT (Sk_Dim_Producto) DO NOTHING;

INSERT INTO DimCliente (Sk_Dim_Cliente, IdCliente_NK, NombreCompleto, Genero, Segmento, FechaInicio, FechaFin, EsActual)
VALUES (4, 'CLI003', 'Cliente de ejemplo', 'No especificado', 'VIP', '2024-01-01', '9999-12-31', true)
ON CONFLICT (Sk_Dim_Cliente) DO NOTHING;

INSERT INTO FactVentas (Sk_Dim_Tiempo, Sk_Dim_Cliente, Sk_Dim_Producto, Sk_Dim_Sucursal, Sk_Dim_Canal, Sk_Dim_Promocion, NumeroTransaccion, NumeroLinea, CantidadVendida, MontoVenta, MontoDescuento, CostoTotal) VALUES
(20250915, 2, 1, 1, 1, 0, 'TXN-2001', 1, 8, 12000.00, 0.00, 8000.00),
(20250915, 4, 2, 2, 2, 0, 'TXN-2006', 1, 2, 1600.00, 0.00, 1000.00),
(20251015, 2, 1, 1, 1, 0, 'TXN-2002', 1, 2, 3000.00, 200.00, 2000.00),
(20251015, 2, 3, 1, 1, 0, 'TXN-2002', 2, 1, 500.00, 0.00, 200.00),
(20251015, 2, 4, 1, 1, 0, 'TXN-2003', 1, 1, 100.00, 0.00, 50.00),
(20251015, 2, 5, 2, 2, 0, 'TXN-2004', 1, 1, 300.00, 0.00, 120.00),
(20251015, 2, 6, 2, 2, 0, 'TXN-2005', 1, 1, 80.00, 0.00, 40.00),
(20251015, 2, 2, 2, 2, 0, 'TXN-2007', 1, 1, 800.00, 0.00, 500.00),
(20251015, 4, 3, 2, 2, 0, 'TXN-2008', 1, 2, 1000.00, 0.00, 400.00),
(20251115, 2, 4, 1, 1, 0, 'TXN-2009', 1, 1, 100.00, 0.00, 50.00),
(20251115, 4, 2, 2, 2, 0, 'TXN-2010', 1, 2, 1600.00, 0.00, 1000.00),
(20260815, 3, 2, 2, 2, 1, 'TXN-2011', 1, 1, 800.00, 80.00, 500.00),
(20260815, 1, 3, 1, 1, 0, 'TXN-2012', 1, 1, 500.00, 0.00, 200.00),
(20260915, 3, 2, 2, 2, 1, 'TXN-2013', 1, 1, 800.00, 80.00, 500.00),
(20260915, 1, 1, 1, 1, 0, 'TXN-2014', 1, 1, 1500.00, 0.00, 1000.00)
ON CONFLICT (NumeroTransaccion, NumeroLinea) DO NOTHING;

COMMIT;

-- Si solo había cuatro hechos de P1: total_filas = 19, filas_p3 = 15
-- y filas_octubre_2025 = 7. Cualquier diferencia requiere revisión.
SELECT COUNT(*) AS total_filas,
       COUNT(*) FILTER (WHERE f.NumeroTransaccion LIKE 'TXN-20%') AS filas_p3,
       COUNT(*) FILTER (WHERE t.AnioMes = '2025-10') AS filas_octubre_2025
FROM FactVentas f
JOIN DimTiempo t ON t.Sk_Dim_Tiempo = f.Sk_Dim_Tiempo;
