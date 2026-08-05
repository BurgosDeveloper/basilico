const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const jsonDbPath = path.join(__dirname, 'db.json');

// Default initial state for JSON fallback
const defaultData = {
  users: [
    { id: 'u-admin-noche', username: 'basilico', password: 'admin.noche', role: 'admin', name: 'Administrador Noche', shift: 'noche' },
    { id: 'u-mesero-noche', username: 'basilico', password: 'mesero.noche', role: 'mesero', name: 'Mesero Noche', shift: 'noche' },
    { id: 'u-caja-noche', username: 'basilico', password: 'caja.noche', role: 'caja', name: 'Cajero Noche', shift: 'noche' },
    { id: 'u-cocina-noche', username: 'basilico', password: 'cocina.noche', role: 'cocina', name: 'Cocina Noche', shift: 'noche' },
    { id: 'u-admin-manana', username: 'basilico', password: 'admin.manana', role: 'admin', name: 'Administrador Mañana', shift: 'manana' },
    { id: 'u-mesero-manana', username: 'basilico', password: 'mesero.manana', role: 'mesero', name: 'Mesero Mañana', shift: 'manana' },
    { id: 'u-caja-manana', username: 'basilico', password: 'caja.manana', role: 'caja', name: 'Cajero Mañana', shift: 'manana' },
    { id: 'u-cocina-manana', username: 'basilico', password: 'cocina.manana', role: 'cocina', name: 'Cocina Mañana', shift: 'manana' },
    { id: 'u-admin-owner', username: 'basilico', password: 'basilico1.', role: 'admin', name: 'Dueño (Ambos)', shift: 'ambos' }
  ],
  ingredients: [
    { id: 'ing-1', name: 'Salsa de Tomate', price_usd: 1.00, is_base_for_pizza: true, is_extra_for_pizza: false, category: 'Salsas' },
    { id: 'ing-2', name: 'Queso Mozzarella', price_usd: 2.00, is_base_for_pizza: true, is_extra_for_pizza: true, category: 'Quesos' },
    { id: 'ing-3', name: 'Pepperoni Importado', price_usd: 2.50, is_base_for_pizza: true, is_extra_for_pizza: true, category: 'Carnes' },
    { id: 'ing-4', name: 'Albahaca Fresca', price_usd: 1.00, is_base_for_pizza: true, is_extra_for_pizza: false, category: 'Vegetales' },
    { id: 'ing-5', name: 'Orégano Silvestre', price_usd: 0.50, is_base_for_pizza: true, is_extra_for_pizza: false, category: 'Especias' },
    { id: 'ing-6', name: 'Tocineta Ahumada', price_usd: 2.00, is_base_for_pizza: true, is_extra_for_pizza: true, category: 'Carnes' },
    { id: 'ing-7', name: 'Champiñones Frescos', price_usd: 1.50, is_base_for_pizza: true, is_extra_for_pizza: true, category: 'Vegetales' },
    { id: 'ing-8', name: 'Orilla Rellena de Queso', price_usd: 3.00, is_base_for_pizza: false, is_extra_for_pizza: true, category: 'Orillas' },
    { id: 'ing-9', name: 'Salsa de Ajo Especial', price_usd: 1.00, is_base_for_pizza: false, is_extra_for_pizza: true, category: 'Salsas' }
  ],
  products: [
    {
      id: 'prod-1',
      name: 'Pizza Margherita Suprema',
      category: 'Pizzas',
      drink_type: null,
      price: 12.00,
      description: 'Salsa San Marzano, Mozzarella Fior di Latte, albahaca fresca y aceite de oliva.',
      image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80',
      badge: 'POPULAR',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Albahaca Fresca']
    },
    {
      id: 'prod-2',
      name: 'Pizza Pepperoni Especial',
      category: 'Pizzas',
      drink_type: null,
      price: 14.50,
      description: 'Doble capa de pepperoni crujiente, mozzarella fundida y orégano silvestre.',
      image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80',
      badge: 'FAVORITA',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Pepperoni Importado', 'Orégano Silvestre']
    },
    {
      id: 'prod-3',
      name: 'Pizza 4 Quesos Artesanal',
      category: 'Pizzas',
      drink_type: null,
      price: 16.00,
      description: 'Mezcla cremosa de Mozzarella, Gorgonzola, Parmesano y Fontina.',
      image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
      badge: null,
      base_ingredients: ['Queso Mozzarella']
    },
    {
      id: 'prod-4',
      name: 'Refresco 1.5L (Coca-Cola / Pepsi)',
      category: 'Bebidas',
      drink_type: 'refresco',
      price: 3.50,
      description: 'Botella de 1.5 litros bien fría.',
      image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80',
      badge: null,
      base_ingredients: null
    },
    {
      id: 'prod-5',
      name: 'Jugo Natural de Naranja / Maracuyá',
      category: 'Bebidas',
      drink_type: 'jugo',
      price: 3.00,
      description: 'Jugo de fruta 100% natural recién exprimido.',
      image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80',
      badge: null,
      base_ingredients: null
    },
    {
      id: 'prod-6',
      name: 'Tinto de Verano Helado',
      category: 'Bebidas',
      drink_type: 'licor',
      price: 4.50,
      description: 'Vino tinto con gaseosa de limón y rodajas de naranja.',
      image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=600&q=80',
      badge: null,
      base_ingredients: null
    }
  ],
  tables: [
    { id: 'table-1', number: 1, name: 'Mesa #1', capacity: 2, status: 'libre', zone: 'Salón Principal' },
    { id: 'table-2', number: 2, name: 'Mesa #2', capacity: 4, status: 'libre', zone: 'Salón Principal' },
    { id: 'table-3', number: 3, name: 'Mesa #3', capacity: 2, status: 'libre', zone: 'Salón Principal' },
    { id: 'table-4', number: 4, name: 'Mesa #4', capacity: 4, status: 'libre', zone: 'Salón Principal' },
    { id: 'table-5', number: 5, name: 'Mesa #5', capacity: 2, status: 'libre', zone: 'Salón Principal' },
    { id: 'table-6', number: 6, name: 'Mesa #6', capacity: 4, status: 'libre', zone: 'Salón Principal' },
    { id: 'table-7', number: 7, name: 'Mesa #7', capacity: 2, status: 'libre', zone: 'Salón Principal' },
    { id: 'table-8', number: 8, name: 'Mesa #8', capacity: 6, status: 'libre', zone: 'Salón Principal' }
  ],
  orders: [],
  order_items: [],
  caja_apertura: null,
  caja_transactions: [],
  caja_cierres: [],
  exchange_rates: { cop_rate: 3950.00, bs_rate: 36.50 }
};

let usePg = false;
let pool = null;

function loadJsonDb() {
  if (!fs.existsSync(jsonDbPath)) {
    fs.writeFileSync(jsonDbPath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(jsonDbPath, 'utf8');
    const data = JSON.parse(raw);
    return { ...defaultData, ...data };
  } catch (e) {
    console.error('Error al leer db.json:', e);
    return defaultData;
  }
}

function saveJsonDb(data) {
  try {
    fs.writeFileSync(jsonDbPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error al guardar db.json:', e);
  }
}

let dbData = loadJsonDb();

async function tryPgPool(dbName, dbPassword) {
  const p = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: dbName,
    password: dbPassword,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    connectionTimeoutMillis: 3000,
  });
  const client = await p.connect();
  return { pool: p, client, dbName };
}

async function initDb() {
  const targetDbName = process.env.DB_NAME || 'basilico';
  const targetDbPass = process.env.DB_PASSWORD || 'basilico1.';

  let connectionObj = null;

  try {
    connectionObj = await tryPgPool(targetDbName, targetDbPass);
  } catch (err1) {
    // If database does not exist in PostgreSQL, attempt creating it automatically
    if (err1.message && err1.message.includes(`database "${targetDbName}" does not exist`)) {
      try {
        console.log(`ℹ️ La base de datos "${targetDbName}" no existe. Creándola automáticamente en PostgreSQL...`);
        const adminConn = await tryPgPool('postgres', targetDbPass);
        await adminConn.client.query(`CREATE DATABASE "${targetDbName}"`);
        adminConn.client.release();
        await adminConn.pool.end();
        connectionObj = await tryPgPool(targetDbName, targetDbPass);
      } catch (createErr) {
        console.warn(`⚠️ No se pudo crear la BD "${targetDbName}":`, createErr.message);
      }
    }

    // Fallback to legacy sdmaia credentials if primary target failed
    if (!connectionObj) {
      try {
        connectionObj = await tryPgPool('sdmaia', 'sdmaia1.');
      } catch (err2) {}
    }
  }

  if (connectionObj) {
    pool = connectionObj.pool;
    const client = connectionObj.client;
    console.log(`✅ Conectado exitosamente a PostgreSQL (${connectionObj.dbName})`);
    
    // Migraciones seguras para asegurar que existan todas las columnas e índices
    const migrationQueries = [
      `CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, password VARCHAR(64) NOT NULL, role VARCHAR(32) NOT NULL DEFAULT 'admin', name VARCHAR(128) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'admin';`,
      
      `CREATE TABLE IF NOT EXISTS ingredients (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL UNIQUE, price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, is_base_for_pizza BOOLEAN DEFAULT TRUE, is_extra_for_pizza BOOLEAN DEFAULT TRUE, category VARCHAR(64) DEFAULT 'Ingredientes', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_base_for_pizza BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS is_extra_for_pizza BOOLEAN DEFAULT TRUE;`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'Ingredientes';`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE;`,

      `CREATE TABLE IF NOT EXISTS products (id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, category VARCHAR(64) NOT NULL, drink_type VARCHAR(32), price NUMERIC(10, 2) NOT NULL DEFAULT 0.00, description TEXT, image TEXT, badge VARCHAR(64), base_ingredients TEXT[], created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS price_small NUMERIC(10, 2);`,

      `CREATE TABLE IF NOT EXISTS tables_config (id VARCHAR(64) PRIMARY KEY, number INT NOT NULL UNIQUE, name VARCHAR(64) NOT NULL, capacity INT NOT NULL DEFAULT 2, status VARCHAR(32) NOT NULL DEFAULT 'libre', zone VARCHAR(64) NOT NULL DEFAULT 'Salón Principal');`,

      `CREATE TABLE IF NOT EXISTS orders (id VARCHAR(64) PRIMARY KEY, order_number VARCHAR(32) NOT NULL, type VARCHAR(32) NOT NULL DEFAULT 'mesa', table_number INT, customer_name VARCHAR(128), status VARCHAR(32) NOT NULL DEFAULT 'en_preparacion', payment_status VARCHAR(32) NOT NULL DEFAULT 'no_pagado', payment_method VARCHAR(32), total_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, waiter_name VARCHAR(64) DEFAULT 'Mesero', kitchen_notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cop_rate_at_payment NUMERIC(10, 2) DEFAULT 3950.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS bs_rate_at_payment NUMERIC(10, 2) DEFAULT 36.50;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount_usd NUMERIC(10, 2) DEFAULT 0.00;`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS merged_from_orders TEXT[];`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_history_json JSONB;`,

      `CREATE TABLE IF NOT EXISTS order_items (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, product_id VARCHAR(64) NOT NULL, product_name VARCHAR(128) NOT NULL, price NUMERIC(10, 2) NOT NULL, quantity INT NOT NULL DEFAULT 1, removed_ingredients TEXT[], extras_json JSONB, sugar_preference VARCHAR(32), is_takeaway BOOLEAN DEFAULT FALSE, notes TEXT);`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS size VARCHAR(32) DEFAULT 'Grande';`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_half_half BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS half_details JSONB;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_new_or_modified BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_paid_individually BOOLEAN DEFAULT FALSE;`,
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS paid_by_name VARCHAR(128);`,

      `CREATE TABLE IF NOT EXISTS order_payments (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, payer_name VARCHAR(128) DEFAULT 'Cliente General', payment_method VARCHAR(32) NOT NULL, amount_paid_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, cash_tendered_usd NUMERIC(10, 2) DEFAULT 0.00, cash_tendered_cop NUMERIC(12, 2) DEFAULT 0.00, cash_tendered_bs NUMERIC(12, 2) DEFAULT 0.00, change_given_usd NUMERIC(10, 2) DEFAULT 0.00, change_given_cop NUMERIC(12, 2) DEFAULT 0.00, change_given_bs NUMERIC(12, 2) DEFAULT 0.00, item_ids TEXT[], cop_rate NUMERIC(10, 2) DEFAULT 3950.00, bs_rate NUMERIC(10, 2) DEFAULT 36.50, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS cash_tendered_bs NUMERIC(12, 2) DEFAULT 0.00;`,
      `ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS change_given_bs NUMERIC(12, 2) DEFAULT 0.00;`,

      `CREATE TABLE IF NOT EXISTS caja_chica_apertura (id VARCHAR(64) PRIMARY KEY, usd_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00, cop_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00, timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS caja_chica_transactions (id VARCHAR(64) PRIMARY KEY, type VARCHAR(32) NOT NULL, amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, amount_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, payment_method VARCHAR(32) NOT NULL, description TEXT NOT NULL, order_id VARCHAR(64), timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS caja_chica_cierres (id VARCHAR(64) PRIMARY KEY, opened_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, opened_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, total_sales_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, expected_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, actual_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, actual_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, difference_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_by VARCHAR(64) DEFAULT 'Caja', notes TEXT);`,
      `CREATE TABLE IF NOT EXISTS exchange_rates (id INT PRIMARY KEY DEFAULT 1, cop_rate NUMERIC(10, 2) NOT NULL DEFAULT 3950.00, bs_rate NUMERIC(10, 2) NOT NULL DEFAULT 36.50);`,

      `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_caja_tx_timestamp ON caja_chica_transactions(timestamp DESC);`,

      `ALTER TABLE users ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_apertura ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`
    ];

    for (const q of migrationQueries) {
      try { await client.query(q); } catch (e) { console.warn('Aviso migración PG:', e.message); }
    }

    client.release();
    usePg = true;
    console.log('✅ Base de datos PostgreSQL configurada y lista.');
  } else {
    console.warn('⚠️ No se detectó servicio PostgreSQL activo con las credenciales configuradas. Usando base de datos persistente JSON local (server/db.json)');
    usePg = false;
  }
}

module.exports = {
  initDb,
  get usePg() { return usePg; },
  get dbData() { return dbData; },
  saveJsonDb: () => saveJsonDb(dbData),
  query: async (text, params) => {
    if (usePg && pool) {
      return pool.query(text, params);
    }
    return { rows: [] };
  },
  getClient: async () => {
    if (usePg && pool) {
      return pool.connect();
    }
    return null;
  }
};


