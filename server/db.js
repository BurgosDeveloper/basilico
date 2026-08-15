const { Pool } = require('pg');

let pool = null;

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
    if (err1.message && err1.message.includes(`database "${targetDbName}" does not exist`)) {
      try {
        console.log(`ℹ️ La base de datos "${targetDbName}" no existe. Creándola automáticamente en PostgreSQL...`);
        const adminConn = await tryPgPool('postgres', targetDbPass);
        await adminConn.client.query(`CREATE DATABASE "${targetDbName}"`);
        adminConn.client.release();
        await adminConn.pool.end();
        connectionObj = await tryPgPool(targetDbName, targetDbPass);
      } catch (createErr) {
        console.error(`⚠️ No se pudo crear la BD "${targetDbName}":`, createErr.message);
        process.exit(1);
      }
    }

    if (!connectionObj) {
      try {
        connectionObj = await tryPgPool('sdmaia', 'sdmaia1.');
      } catch (err2) {
        console.error('Fatal: Could not connect to PostgreSQL database.', err2.message);
        process.exit(1);
      }
    }
  }

  if (connectionObj) {
    pool = connectionObj.pool;
    const client = connectionObj.client;
    console.log(`✅ Conectado exitosamente a PostgreSQL (${connectionObj.dbName})`);
    
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
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_usd NUMERIC(10, 2) DEFAULT 0.00;`,

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
      `CREATE TABLE IF NOT EXISTS caja_chica_transactions (id VARCHAR(64) PRIMARY KEY, type VARCHAR(32) NOT NULL, amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, amount_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00, payment_method VARCHAR(32) NOT NULL, description TEXT NOT NULL, order_id VARCHAR(64), timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS caja_chica_cierres (id VARCHAR(64) PRIMARY KEY, opened_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, opened_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, total_sales_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, expected_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, expected_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, actual_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, actual_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, difference_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00, difference_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00, closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_by VARCHAR(64) DEFAULT 'Caja', notes TEXT);`,
      `CREATE TABLE IF NOT EXISTS exchange_rates (id INT PRIMARY KEY DEFAULT 1, cop_rate NUMERIC(10, 2) NOT NULL DEFAULT 3950.00, bs_rate NUMERIC(10, 2) NOT NULL DEFAULT 36.50);`,
        `CREATE TABLE IF NOT EXISTS shift_exchange_rates (shift VARCHAR(32) PRIMARY KEY, cop_rate NUMERIC(10, 2) NOT NULL, bs_rate NUMERIC(10, 2) NOT NULL, updated_by VARCHAR(128) NOT NULL DEFAULT 'Sistema', updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
        `CREATE TABLE IF NOT EXISTS exchange_rate_history (id VARCHAR(64) PRIMARY KEY, shift VARCHAR(32) NOT NULL, cop_rate NUMERIC(10, 2) NOT NULL, bs_rate NUMERIC(10, 2) NOT NULL, changed_by VARCHAR(128) NOT NULL, changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`,

      `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);`,
      `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);`,
      `CREATE INDEX IF NOT EXISTS idx_caja_tx_timestamp ON caja_chica_transactions(timestamp DESC);`,
        `CREATE INDEX IF NOT EXISTS idx_exchange_rate_history_shift_changed_at ON exchange_rate_history(shift, changed_at DESC);`,

      `ALTER TABLE users ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_apertura ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_transactions ADD COLUMN IF NOT EXISTS amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS shift VARCHAR(32) DEFAULT 'ambos';`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS expected_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,
      `ALTER TABLE caja_chica_cierres ADD COLUMN IF NOT EXISTS difference_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00;`,

      `INSERT INTO exchange_rates (id, cop_rate, bs_rate) VALUES (1, 3950.00, 36.50) ON CONFLICT (id) DO NOTHING;`,
        `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by)
         SELECT 'manana', cop_rate, bs_rate, 'Migración inicial' FROM exchange_rates WHERE id = 1
         ON CONFLICT (shift) DO NOTHING;`,
        `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by)
         SELECT 'noche', cop_rate, bs_rate, 'Migración inicial' FROM exchange_rates WHERE id = 1
         ON CONFLICT (shift) DO NOTHING;`,
        `INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by)
         SELECT 'ambos', cop_rate, bs_rate, 'Migración inicial' FROM exchange_rates WHERE id = 1
         ON CONFLICT (shift) DO NOTHING;`,
      `INSERT INTO tables_config (id, number, name, capacity, status, zone) VALUES
        ('table-1', 1, 'Mesa #1', 2, 'libre', 'Salón Principal'),
        ('table-2', 2, 'Mesa #2', 4, 'libre', 'Salón Principal'),
        ('table-3', 3, 'Mesa #3', 2, 'libre', 'Salón Principal'),
        ('table-4', 4, 'Mesa #4', 4, 'libre', 'Salón Principal'),
        ('table-5', 5, 'Mesa #5', 2, 'libre', 'Salón Principal'),
        ('table-6', 6, 'Mesa #6', 4, 'libre', 'Salón Principal'),
        ('table-7', 7, 'Mesa #7', 2, 'libre', 'Salón Principal'),
        ('table-8', 8, 'Mesa #8', 6, 'libre', 'Salón Principal')
        ON CONFLICT DO NOTHING;`,
      `CREATE TABLE IF NOT EXISTS order_edits (id VARCHAR(64) PRIMARY KEY, order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE, order_number VARCHAR(32), edited_by VARCHAR(128) DEFAULT 'admin', edit_type VARCHAR(64) DEFAULT 'modificacion', edit_details TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE INDEX IF NOT EXISTS idx_order_edits_created_at ON order_edits(created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_order_edits_order_id ON order_edits(order_id);`,
    ];

    for (const q of migrationQueries) {
      try { await client.query(q); } catch (e) { console.warn('Aviso migración PG:', e.message); }
    }

    client.release();
    console.log('✅ Base de datos PostgreSQL configurada y lista.');
  }
}

module.exports = {
  initDb,
  query: async (text, params) => {
    if (pool) {
      return pool.query(text, params);
    }
    throw new Error('Database pool not initialized.');
  },
  getClient: async () => {
    if (pool) {
      return pool.connect();
    }
    throw new Error('Database pool not initialized.');
  }
};
