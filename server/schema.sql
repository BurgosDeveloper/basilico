-- Schema SQL para Basilico Pizzeria (PostgreSQL)

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL, -- mesero, caja, cocina, admin
  name VARCHAR(128) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Ingredientes (Catálogo único para Base de Pizza y/o Adicionales)
CREATE TABLE IF NOT EXISTS ingredients (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL UNIQUE,
  price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  is_base_for_pizza BOOLEAN DEFAULT TRUE,
  is_extra_for_pizza BOOLEAN DEFAULT TRUE,
  category VARCHAR(64) DEFAULT 'Ingredientes',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Productos (Pizzas, Bebidas)
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL, -- Pizzas, Bebidas
  drink_type VARCHAR(32), -- refresco, jugo, licor
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  description TEXT,
  image TEXT,
  badge VARCHAR(64),
  base_ingredients TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Mesas
CREATE TABLE IF NOT EXISTS tables_config (
  id VARCHAR(64) PRIMARY KEY,
  number INT NOT NULL UNIQUE,
  name VARCHAR(64) NOT NULL,
  capacity INT NOT NULL DEFAULT 2,
  status VARCHAR(32) NOT NULL DEFAULT 'libre',
  zone VARCHAR(64) NOT NULL DEFAULT 'Salón Principal'
);

-- 5. Tabla de Comandas / Órdenes
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) PRIMARY KEY,
  order_number VARCHAR(32) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'mesa', -- mesa, delivery, pickup
  table_number INT,
  customer_name VARCHAR(128),
  status VARCHAR(32) NOT NULL DEFAULT 'en_preparacion', -- en_preparacion, preparada, entregada, cancelado
  payment_status VARCHAR(32) NOT NULL DEFAULT 'no_pagado', -- no_pagado, pagado
  payment_method VARCHAR(32), -- Divisas, COP, Bs, Binance, Mixto
  total_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  cop_rate_at_payment NUMERIC(10, 2) DEFAULT 3950.00,
  bs_rate_at_payment NUMERIC(10, 2) DEFAULT 36.50,
  waiter_name VARCHAR(64) DEFAULT 'Mesero',
  kitchen_notes TEXT,
  is_edited BOOLEAN DEFAULT FALSE,
  paid_amount_usd NUMERIC(10, 2) DEFAULT 0.00,
  merged_from_orders TEXT[],
  payment_history_json JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Items de Comandas con todos los detalles de personalización
CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
  product_id VARCHAR(64) NOT NULL,
  product_name VARCHAR(128) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  size VARCHAR(32) DEFAULT 'Grande', -- Grande, Pequeña
  is_half_half BOOLEAN DEFAULT FALSE,
  half_details JSONB, -- { half1Name, half2Name }
  removed_ingredients TEXT[],
  extras_json JSONB,
  sugar_preference VARCHAR(32),
  is_takeaway BOOLEAN DEFAULT FALSE,
  is_new_or_modified BOOLEAN DEFAULT FALSE,
  is_paid_individually BOOLEAN DEFAULT FALSE,
  paid_by_name VARCHAR(128),
  notes TEXT
);

-- 6b. Tabla de Historial Desglosado de Pagos y Vueltos (Auditabilidad Total)
CREATE TABLE IF NOT EXISTS order_payments (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
  payer_name VARCHAR(128) DEFAULT 'Cliente General',
  payment_method VARCHAR(32) NOT NULL, -- Divisas, COP, Bs, Binance, Mixto
  amount_paid_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  cash_tendered_usd NUMERIC(10, 2) DEFAULT 0.00,
  cash_tendered_cop NUMERIC(12, 2) DEFAULT 0.00,
  cash_tendered_bs NUMERIC(12, 2) DEFAULT 0.00,
  change_given_usd NUMERIC(10, 2) DEFAULT 0.00,
  change_given_cop NUMERIC(12, 2) DEFAULT 0.00,
  change_given_bs NUMERIC(12, 2) DEFAULT 0.00,
  item_ids TEXT[],
  cop_rate NUMERIC(10, 2) DEFAULT 3950.00,
  bs_rate NUMERIC(10, 2) DEFAULT 36.50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN DE CONSULTAS
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_caja_tx_timestamp ON caja_chica_transactions(timestamp DESC);


-- 7. Apertura de Caja Chica
CREATE TABLE IF NOT EXISTS caja_chica_apertura (
  id VARCHAR(64) PRIMARY KEY,
  usd_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  cop_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Transacciones de Caja Chica (Egresos / Ingresos manuales)
CREATE TABLE IF NOT EXISTS caja_chica_transactions (
  id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(32) NOT NULL, -- ingreso, egreso
  amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  amount_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payment_method VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  order_id VARCHAR(64),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Cierres y Arqueos de Caja Chica (Reportes de Cierre)
CREATE TABLE IF NOT EXISTS caja_chica_cierres (
  id VARCHAR(64) PRIMARY KEY,
  opened_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  opened_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_sales_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  expected_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  actual_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  actual_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  difference_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_by VARCHAR(64) DEFAULT 'Caja',
  notes TEXT
);

-- 10. Tasas de Cambio
CREATE TABLE IF NOT EXISTS exchange_rates (
  id INT PRIMARY KEY DEFAULT 1,
  cop_rate NUMERIC(10, 2) NOT NULL DEFAULT 3950.00,
  bs_rate NUMERIC(10, 2) NOT NULL DEFAULT 36.50
);

-- Inserción Inicial de Tasas
INSERT INTO exchange_rates (id, cop_rate, bs_rate)
VALUES (1, 3950.00, 36.50)
ON CONFLICT (id) DO NOTHING;

-- Inserción Inicial de Usuarios del Sistema
INSERT INTO users (id, username, password, role, name) VALUES
('u-admin', 'admin', 'admin', 'admin', 'Administrador General'),
('u-mesero', 'basilico', 'mesero', 'mesero', 'Mesero Principal'),
('u-caja', 'basilico_caja', 'caja', 'caja', 'Cajero Principal'),
('u-cocina', 'basilico_cocina', 'cocina', 'cocina', 'Jefe de Cocina')
ON CONFLICT (username) DO NOTHING;

-- Inserción Inicial de Ingredientes (Base & Adicionales)
INSERT INTO ingredients (id, name, price_usd, is_base_for_pizza, is_extra_for_pizza, category) VALUES
('ing-1', 'Salsa de Tomate', 1.00, true, false, 'Salsas'),
('ing-2', 'Queso Mozzarella', 2.00, true, true, 'Quesos'),
('ing-3', 'Pepperoni Importado', 2.50, true, true, 'Carnes'),
('ing-4', 'Albahaca Fresca', 1.00, true, false, 'Vegetales'),
('ing-5', 'Orégano Silvestre', 0.50, true, false, 'Especias'),
('ing-6', 'Tocineta Ahumada', 2.00, true, true, 'Carnes'),
('ing-7', 'Champiñones Frescos', 1.50, true, true, 'Vegetales'),
('ing-8', 'Orilla Rellena de Queso', 3.00, false, true, 'Orillas'),
('ing-9', 'Salsa de Ajo Especial', 1.00, false, true, 'Salsas')
ON CONFLICT (name) DO NOTHING;

-- Inserción Inicial de Productos
INSERT INTO products (id, name, category, drink_type, price, description, image, badge, base_ingredients) VALUES
('prod-1', 'Pizza Margherita Suprema', 'Pizzas', NULL, 12.00, 'Salsa San Marzano, Mozzarella Fior di Latte, albahaca fresca y aceite de oliva.', 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80', 'POPULAR', ARRAY['Salsa de Tomate', 'Queso Mozzarella', 'Albahaca Fresca']),
('prod-2', 'Pizza Pepperoni Especial', 'Pizzas', NULL, 14.50, 'Doble capa de pepperoni crujiente, mozzarella fundida y orégano silvestre.', 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80', 'FAVORITA', ARRAY['Salsa de Tomate', 'Queso Mozzarella', 'Pepperoni Importado', 'Orégano Silvestre']),
('prod-3', 'Pizza 4 Quesos Artesanal', 'Pizzas', NULL, 16.00, 'Mezcla cremosa de Mozzarella, Gorgonzola, Parmesano y Fontina.', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80', NULL, ARRAY['Queso Mozzarella']),
('prod-4', 'Refresco 1.5L (Coca-Cola / Pepsi)', 'Bebidas', 'refresco', 3.50, 'Botella de 1.5 litros bien fría.', 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80', NULL, NULL),
('prod-5', 'Jugo Natural de Naranja / Maracuyá', 'Bebidas', 'jugo', 3.00, 'Jugo de fruta 100% natural recién exprimido.', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80', NULL, NULL),
('prod-6', 'Tinto de Verano Helado', 'Bebidas', 'licor', 4.50, 'Vino tinto con gaseosa de limón y rodajas de naranja.', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Inserción Inicial de Mesas
INSERT INTO tables_config (id, number, name, capacity, status, zone) VALUES
('table-1', 1, 'Mesa #1', 2, 'libre', 'Salón Principal'),
('table-2', 2, 'Mesa #2', 4, 'libre', 'Salón Principal'),
('table-3', 3, 'Mesa #3', 2, 'libre', 'Salón Principal'),
('table-4', 4, 'Mesa #4', 4, 'libre', 'Salón Principal'),
('table-5', 5, 'Mesa #5', 2, 'libre', 'Salón Principal'),
('table-6', 6, 'Mesa #6', 4, 'libre', 'Salón Principal'),
('table-7', 7, 'Mesa #7', 2, 'libre', 'Salón Principal'),
('table-8', 8, 'Mesa #8', 6, 'libre', 'Salón Principal')
ON CONFLICT (number) DO NOTHING;

