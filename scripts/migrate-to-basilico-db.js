const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const passwordsToTry = ['sdmaia1.', 'basilico1.', 'postgres', 'admin', 'root', ''];

async function getAdminPool() {
  for (const pass of passwordsToTry) {
    try {
      const p = new Pool({
        user: 'postgres',
        host: 'localhost',
        database: 'postgres',
        password: pass,
        port: 5432,
        connectionTimeoutMillis: 3000,
      });
      const client = await p.connect();
      client.release();
      console.log('✅ Conexión administrativa exitosa con contraseña de PostgreSQL');
      return { pool: p, password: pass };
    } catch (e) {
      // Intentar siguiente contraseña
    }
  }
  throw new Error('No se pudo conectar a PostgreSQL con ninguna contraseña.');
}

async function migrate() {
  console.log('🚀 Iniciando migración a base de datos "basilico"...');
  const { pool: adminPool, password: correctPassword } = await getAdminPool();

  // 1. Recrear la base de datos 'basilico' completamente vacía como solicitó el usuario
  console.log('📦 Recreando base de datos "basilico" desde cero...');
  try {
    await adminPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'basilico'
        AND pid <> pg_backend_pid();
    `);
    await adminPool.query('DROP DATABASE IF EXISTS "basilico"');
  } catch (e) {
    console.warn('Aviso al terminar conexiones:', e.message);
  }
  await adminPool.query('CREATE DATABASE "basilico"');
  console.log('✅ Base de datos "basilico" vacía creada con éxito.');
  await adminPool.end();

  // 2. Conectar a la base de datos 'basilico'
  const basilicoPool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'basilico',
    password: correctPassword,
    port: 5432,
  });

  const client = await basilicoPool.connect();

  console.log('🧹 Limpiando y creando esquema fresco en "basilico"...');

  // Crear tablas
  const schemaQueries = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      password VARCHAR(64) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'admin',
      name VARCHAR(128) NOT NULL,
      shift VARCHAR(32) DEFAULT 'ambos',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS ingredients (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      ingredient_type VARCHAR(32) DEFAULT 'adicional',
      price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      is_base BOOLEAN DEFAULT TRUE,
      is_extra BOOLEAN DEFAULT TRUE,
      is_base_for_pizza BOOLEAN DEFAULT TRUE,
      is_extra_for_pizza BOOLEAN DEFAULT TRUE,
      price_grande_completa NUMERIC(10, 2) DEFAULT 0.00,
      price_grande_mitad NUMERIC(10, 2) DEFAULT 0.00,
      price_pequena_completa NUMERIC(10, 2) DEFAULT 0.00,
      price_pequena_mitad NUMERIC(10, 2) DEFAULT 0.00,
      category VARCHAR(64) DEFAULT 'Ingredientes',
      available BOOLEAN DEFAULT TRUE,
      shift VARCHAR(32) DEFAULT 'ambos',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      category VARCHAR(64) NOT NULL DEFAULT 'Pizzas',
      drink_type VARCHAR(32),
      price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      price_small NUMERIC(10, 2),
      description TEXT,
      image TEXT,
      badge VARCHAR(64),
      base_ingredients TEXT[],
      protein_count INT DEFAULT 1,
      default_proteins TEXT[],
      flavors TEXT[],
      shift VARCHAR(32) DEFAULT 'ambos',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS tables_config (
      id VARCHAR(64) PRIMARY KEY,
      number INT NOT NULL UNIQUE,
      name VARCHAR(64) NOT NULL,
      capacity INT NOT NULL DEFAULT 4,
      status VARCHAR(32) NOT NULL DEFAULT 'libre',
      zone VARCHAR(64) NOT NULL DEFAULT 'Salón Principal'
    );`,

    `CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(64) PRIMARY KEY,
      order_number VARCHAR(32) NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'mesa',
      table_number INT,
      customer_name VARCHAR(128),
      status VARCHAR(32) NOT NULL DEFAULT 'en_preparacion',
      payment_status VARCHAR(32) NOT NULL DEFAULT 'no_pagado',
      payment_method VARCHAR(32),
      total_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      waiter_name VARCHAR(64) DEFAULT 'Mesero',
      kitchen_notes TEXT,
      is_edited BOOLEAN DEFAULT FALSE,
      cop_rate_at_payment NUMERIC(10, 2) DEFAULT 3950.00,
      bs_rate_at_payment NUMERIC(10, 2) DEFAULT 36.50,
      paid_amount_usd NUMERIC(10, 2) DEFAULT 0.00,
      merged_from_orders TEXT[],
      payment_history_json JSONB,
      delivery_fee_usd NUMERIC(10, 2) DEFAULT 0.00,
      notes TEXT,
      debtor_name VARCHAR(128),
      archived_at TIMESTAMP,
      shift VARCHAR(32) DEFAULT 'ambos',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS order_items (
      id VARCHAR(64) PRIMARY KEY,
      order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
      product_id VARCHAR(64) NOT NULL,
      product_name VARCHAR(128) NOT NULL,
      price NUMERIC(10, 2) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      removed_ingredients TEXT[],
      extras_json JSONB,
      sugar_preference VARCHAR(32),
      is_takeaway BOOLEAN DEFAULT FALSE,
      notes TEXT,
      size VARCHAR(32) DEFAULT 'Grande',
      is_half_half BOOLEAN DEFAULT FALSE,
      half_details JSONB,
      is_new_or_modified BOOLEAN DEFAULT FALSE,
      is_paid_individually BOOLEAN DEFAULT FALSE,
      paid_by_name VARCHAR(128),
      drink_type VARCHAR(32),
      category VARCHAR(64),
      proteins TEXT[],
      is_cut BOOLEAN DEFAULT FALSE,
      cut_preference VARCHAR(32) DEFAULT 'Entera',
      is_delivery BOOLEAN DEFAULT FALSE,
      flavor VARCHAR(64)
    );`,

    `CREATE TABLE IF NOT EXISTS order_payments (
      id VARCHAR(64) PRIMARY KEY,
      order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
      payer_name VARCHAR(128) DEFAULT 'Cliente General',
      payment_method VARCHAR(32) NOT NULL,
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
    );`,

    `CREATE TABLE IF NOT EXISTS caja_chica_apertura (
      id VARCHAR(64) PRIMARY KEY,
      usd_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      cop_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      shift VARCHAR(32) DEFAULT 'ambos',
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS caja_chica_transactions (
      id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(32) NOT NULL,
      amount_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      amount_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      amount_bs NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      payment_method VARCHAR(32) NOT NULL,
      description TEXT NOT NULL,
      order_id VARCHAR(64),
      cierre_id VARCHAR(64),
      shift VARCHAR(32) DEFAULT 'ambos',
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS caja_chica_cierres (
      id VARCHAR(64) PRIMARY KEY,
      opened_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      opened_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      total_sales_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      expected_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      expected_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      actual_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      actual_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      difference_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      difference_cop NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_by VARCHAR(64) DEFAULT 'Caja',
      notes TEXT,
      shift VARCHAR(32) DEFAULT 'ambos'
    );`,

    `CREATE TABLE IF NOT EXISTS exchange_rates (
      id INT PRIMARY KEY DEFAULT 1,
      cop_rate NUMERIC(10, 2) NOT NULL DEFAULT 3950.00,
      bs_rate NUMERIC(10, 2) NOT NULL DEFAULT 36.50
    );`,

    `CREATE TABLE IF NOT EXISTS shift_exchange_rates (
      shift VARCHAR(32) PRIMARY KEY,
      cop_rate NUMERIC(10, 2) NOT NULL,
      bs_rate NUMERIC(10, 2) NOT NULL,
      updated_by VARCHAR(128) NOT NULL DEFAULT 'Sistema',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS exchange_rate_history (
      id VARCHAR(64) PRIMARY KEY,
      shift VARCHAR(32) NOT NULL,
      cop_rate NUMERIC(10, 2) NOT NULL,
      bs_rate NUMERIC(10, 2) NOT NULL,
      changed_by VARCHAR(128) NOT NULL,
      changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS order_edits (
      id VARCHAR(64) PRIMARY KEY,
      order_id VARCHAR(64),
      order_number VARCHAR(32),
      edited_by VARCHAR(128) DEFAULT 'admin',
      edit_type VARCHAR(64) DEFAULT 'modificacion',
      edit_details TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,

    `CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  ];

  for (const q of schemaQueries) {
    await client.query(q);
  }

  // Limpiar catálogo de productos e ingredientes para cargar el menú nuevo oficial
  console.log('🗑️ Vaciando productos e ingredientes antiguos...');
  await client.query('TRUNCATE TABLE products CASCADE;');
  await client.query('TRUNCATE TABLE ingredients CASCADE;');

  // Insertar datos base
  console.log('🌱 Inicializando tasas, configuración y usuarios...');
  await client.query(`
    INSERT INTO exchange_rates (id, cop_rate, bs_rate) VALUES (1, 3950.00, 36.50) ON CONFLICT (id) DO NOTHING;
    INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('ambos', 3950.00, 36.50, 'Inicial Basilico') ON CONFLICT (shift) DO NOTHING;
    INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('manana', 3950.00, 36.50, 'Compatibilidad') ON CONFLICT (shift) DO NOTHING;
    INSERT INTO shift_exchange_rates (shift, cop_rate, bs_rate, updated_by) VALUES ('noche', 3950.00, 36.50, 'Compatibilidad') ON CONFLICT (shift) DO NOTHING;
    INSERT INTO system_settings (key, value) VALUES ('admin_pin', '1234') ON CONFLICT (key) DO NOTHING;

    INSERT INTO users (id, username, password, role, name, shift) VALUES
      ('u-admin', 'carlos', 'carloscrispys', 'admin', 'Carlos', 'ambos'),
      ('u-caja', 'cajeroa', 'cajero', 'caja', 'Cajero Principal', 'ambos'),
      ('u-mesero', 'mesero', 'mesero', 'mesero', 'Mesero Principal', 'ambos'),
      ('u-cocina', 'cocina', 'cocina', 'cocina', 'Jefe de Cocina', 'ambos')
      ON CONFLICT (username) DO NOTHING;

    INSERT INTO tables_config (id, number, name, capacity, status, zone) VALUES
      ('table-1', 1, 'Mesa #1', 4, 'libre', 'Salón Principal'),
      ('table-2', 2, 'Mesa #2', 4, 'libre', 'Salón Principal'),
      ('table-3', 3, 'Mesa #3', 2, 'libre', 'Salón Principal'),
      ('table-4', 4, 'Mesa #4', 4, 'libre', 'Salón Principal'),
      ('table-5', 5, 'Mesa #5', 2, 'libre', 'Salón Principal'),
      ('table-6', 6, 'Mesa #6', 4, 'libre', 'Salón Principal'),
      ('table-7', 7, 'Mesa #7', 2, 'libre', 'Salón Principal'),
      ('table-8', 8, 'Mesa #8', 6, 'libre', 'Salón Principal')
      ON CONFLICT (number) DO NOTHING;
  `);

  // ==========================================
  // 4. LISTA DE INGREDIENTES CONSOLIDADA
  // ==========================================
  console.log('🍕 Cargando lista de ingredientes consolidados (Bases y Adicionales con precios en 4 niveles)...');

  const ingredientsData = [
    // BASES Y SALSAS
    {
      id: 'ing-salsa-napolitana',
      name: 'Salsa Napolitana',
      type: 'base',
      price: 0,
      is_base: true,
      is_extra: false,
      gc: 0, gm: 0, pc: 0, pm: 0,
      cat: 'Salsas y Bases'
    },
    {
      id: 'ing-salsa-tomate',
      name: 'Salsa de Tomate',
      type: 'base',
      price: 0,
      is_base: true,
      is_extra: false,
      gc: 0, gm: 0, pc: 0, pm: 0,
      cat: 'Salsas y Bases'
    },
    {
      id: 'ing-crema-leche',
      name: 'Crema de Leche',
      type: 'adicional',
      price: 1.00,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Salsas y Bases'
    },
    {
      id: 'ing-cebolla-caramelizada',
      name: 'Cebolla Caramelizada',
      type: 'adicional',
      price: 1.00,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Salsas y Bases'
    },
    {
      id: 'ing-salsa-pesto',
      name: 'Salsa Pesto',
      type: 'adicional',
      price: 1.00,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Salsas y Bases'
    },

    // QUESOS
    {
      id: 'ing-queso-mozzarella',
      name: 'Queso Mozzarella',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Quesos'
    },
    {
      id: 'ing-queso-azul',
      name: 'Queso Azul',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Quesos'
    },
    {
      id: 'ing-queso-parmesano',
      name: 'Queso Parmesano',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Quesos'
    },
    {
      id: 'ing-queso-cheddar',
      name: 'Queso Cheddar',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Quesos'
    },
    {
      id: 'ing-queso-crema',
      name: 'Queso Crema',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Quesos'
    },

    // CARNES Y EMBUTIDOS
    {
      id: 'ing-jamon',
      name: 'Jamón',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-pepperoni',
      name: 'Pepperoni',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-tocineta',
      name: 'Tocineta',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-pollo',
      name: 'Pollo',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-carne-molida',
      name: 'Carne Molida',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-lomito',
      name: 'Lomito',
      type: 'adicional',
      price: 2.50,
      is_base: true,
      is_extra: true,
      gc: 2.50, gm: 1.25, pc: 2.00, pm: 1.00,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-longaniza',
      name: 'Longaniza',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-longaniza-ahumada',
      name: 'Longaniza Ahumada',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-lomo-ahumado',
      name: 'Lomo Ahumado',
      type: 'adicional',
      price: 2.50,
      is_base: true,
      is_extra: true,
      gc: 2.50, gm: 1.25, pc: 2.00, pm: 1.00,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-chorizo-espanol',
      name: 'Chorizo Español',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-salami',
      name: 'Salami',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-jamon-curado',
      name: 'Jamón Curado',
      type: 'adicional',
      price: 2.50,
      is_base: true,
      is_extra: true,
      gc: 2.50, gm: 1.25, pc: 2.00, pm: 1.00,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-fileto',
      name: 'Fileto',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },
    {
      id: 'ing-anchoas',
      name: 'Anchoas',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Carnes y Embutidos'
    },

    // VEGETALES, FRUTAS Y TOPPINGS
    {
      id: 'ing-champinones',
      name: 'Champiñones',
      type: 'adicional',
      price: 1.50,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-cebolla',
      name: 'Cebolla',
      type: 'adicional',
      price: 1.00,
      is_base: true,
      is_extra: true,
      gc: 1.00, gm: 0.50, pc: 0.75, pm: 0.40,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-pimenton',
      name: 'Pimentón',
      type: 'adicional',
      price: 1.00,
      is_base: true,
      is_extra: true,
      gc: 1.00, gm: 0.50, pc: 0.75, pm: 0.40,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-aceitunas-negras',
      name: 'Aceitunas Negras',
      type: 'adicional',
      price: 1.50,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-maiz',
      name: 'Maíz',
      type: 'adicional',
      price: 1.00,
      is_base: true,
      is_extra: true,
      gc: 1.00, gm: 0.50, pc: 0.75, pm: 0.40,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-rodajas-tomate',
      name: 'Rodajas de Tomate',
      type: 'adicional',
      price: 1.00,
      is_base: true,
      is_extra: true,
      gc: 1.00, gm: 0.50, pc: 0.75, pm: 0.40,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-tomates-secos',
      name: 'Tomates Secos',
      type: 'adicional',
      price: 2.00,
      is_base: true,
      is_extra: true,
      gc: 2.00, gm: 1.00, pc: 1.50, pm: 0.75,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-rucula',
      name: 'Rúcula',
      type: 'adicional',
      price: 1.50,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-pina',
      name: 'Piña',
      type: 'adicional',
      price: 1.50,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-pico-de-gallo',
      name: 'Pico de Gallo',
      type: 'adicional',
      price: 1.50,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-bocadillo',
      name: 'Bocadillo (Guayaba)',
      type: 'adicional',
      price: 1.50,
      is_base: true,
      is_extra: true,
      gc: 1.50, gm: 0.75, pc: 1.00, pm: 0.50,
      cat: 'Vegetales y Toppings'
    },
    {
      id: 'ing-oregano',
      name: 'Orégano',
      type: 'base',
      price: 0,
      is_base: true,
      is_extra: true,
      gc: 0, gm: 0, pc: 0, pm: 0,
      cat: 'Especias'
    }
  ];

  for (const ing of ingredientsData) {
    await client.query(
      `INSERT INTO ingredients (
        id, name, ingredient_type, price_usd, is_base, is_extra,
        is_base_for_pizza, is_extra_for_pizza,
        price_grande_completa, price_grande_mitad, price_pequena_completa, price_pequena_mitad,
        category, available, shift
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, 'ambos')`,
      [
        ing.id, ing.name, ing.type, ing.price, ing.is_base, ing.is_extra,
        ing.is_base, ing.is_extra,
        ing.gc, ing.gm, ing.pc, ing.pm,
        ing.cat
      ]
    );
  }

  // ==========================================
  // 1. BEBIDAS (8 productos)
  // ==========================================
  console.log('🥤 Cargando catálogo de Bebidas...');

  const bebidasData = [
    {
      id: 'prod-refresco-botella',
      name: 'REFRESCO DE BOTELLA',
      category: 'Bebidas',
      drink_type: 'refresco',
      price: 1.00,
      price_small: null,
      description: 'Refresco en botella personal bien frío.',
      flavors: ['Coca-Cola', 'Pepsi', '7Up / Chinotto', 'Frescolita', 'Hit Naranja', 'Hit Uva', 'Hit Manzana'],
      badge: null
    },
    {
      id: 'prod-nestea',
      name: 'NESTEA',
      category: 'Bebidas',
      drink_type: 'te',
      price: 1.00,
      price_small: null,
      description: 'Té frío Nestea bien frío.',
      flavors: ['Limón', 'Durazno'],
      badge: null
    },
    {
      id: 'prod-agua-mineral',
      name: 'AGUA MINERAL',
      category: 'Bebidas',
      drink_type: 'agua',
      price: 1.00,
      price_small: null,
      description: 'Agua mineral sin gas / fría.',
      flavors: null,
      badge: null
    },
    {
      id: 'prod-cerveza-nacional',
      name: 'CERVEZA NACIONAL',
      category: 'Bebidas',
      drink_type: 'cerveza',
      price: 1.00,
      price_small: null,
      description: 'Cerveza nacional bien fría.',
      flavors: ['Polar Pilsen (Negra)', 'Polar Light'],
      badge: null
    },
    {
      id: 'prod-jugo-natural',
      name: 'JUGO NATURAL',
      category: 'Bebidas',
      drink_type: 'jugo',
      price: 2.00,
      price_small: null,
      description: 'Jugo natural preparado al momento con fruta fresca.',
      flavors: ['Fresa', 'Mora', 'Parchita', 'Mango', 'Durazno', 'Guanábana'],
      badge: 'NATURAL'
    },
    {
      id: 'prod-merengada',
      name: 'MERENGADA',
      category: 'Bebidas',
      drink_type: 'merengada',
      price: 3.00,
      price_small: null,
      description: 'Merengada cremosa batida al momento.',
      flavors: ['Fresa', 'Mora', 'Parchita', 'Mango', 'Durazno', 'Guanábana', 'Oreo / Chocolate'],
      badge: 'ESPECIAL'
    },
    {
      id: 'prod-refresco-2l',
      name: 'REFRESCO (2 LITROS)',
      category: 'Bebidas',
      drink_type: 'refresco',
      price: 3.00,
      price_small: null,
      description: 'Refresco familiar 2 litros frío surtido.',
      flavors: ['Coca-Cola', 'Pepsi', '7Up', 'Frescolita'],
      badge: 'FAMILIAR'
    },
    {
      id: 'prod-postre-dia',
      name: 'POSTRE DEL DÍA',
      category: 'Bebidas',
      drink_type: 'postre',
      price: 3.00,
      price_small: null,
      description: 'Variedad de postres según disponibilidad del día.',
      flavors: null,
      badge: 'DULCE'
    }
  ];

  for (const b of bebidasData) {
    await client.query(
      `INSERT INTO products (
        id, name, category, drink_type, price, price_small, description, image, badge, base_ingredients, flavors, shift
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, '', $8, NULL, $9, 'ambos')`,
      [b.id, b.name, b.category, b.drink_type, b.price, b.price_small, b.description, b.badge, b.flavors]
    );
  }

  // ==========================================
  // 2. PIZZAS TRADICIONALES (12 pizzas)
  // ==========================================
  console.log('🍕 Cargando Pizzas Tradicionales...');

  const tradicionalesData = [
    {
      id: 'pizza-pepperoni',
      name: 'PEPPERONI',
      price_small: 7.00,
      price: 14.00,
      description: 'Salsa, queso mozzarella, pepperoni y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Pepperoni', 'Orégano'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-hawaiana',
      name: 'HAWAIANA',
      price_small: 6.00,
      price: 12.00,
      description: 'Salsa, queso mozzarella, jamón y piña.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón', 'Piña'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-cuatro-quesos',
      name: 'CUATRO QUESOS',
      price_small: 6.00,
      price: 12.00,
      description: 'Crema de leche, queso azul, queso mozzarella, queso parmesano y orégano.',
      base_ingredients: ['Crema de Leche', 'Queso Azul', 'Queso Mozzarella', 'Queso Parmesano', 'Orégano'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-champinones',
      name: 'CHAMPIÑONES',
      price_small: 6.00,
      price: 12.00,
      description: 'Salsa, queso mozzarella, jamón, champiñones y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón', 'Champiñones', 'Orégano'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-vegetariana',
      name: 'VEGETARIANA',
      price_small: 6.00,
      price: 12.00,
      description: 'Salsa, queso mozzarella, cebolla, pimentón, aceitunas negras, maíz, champiñones y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Cebolla', 'Pimentón', 'Aceitunas Negras', 'Maíz', 'Champiñones', 'Orégano'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-capresse',
      name: 'CAPRESSE',
      price_small: 6.00,
      price: 12.00,
      description: 'Salsa napolitana, queso, rodajas de tomate, anchoas y salsa pesto.',
      base_ingredients: ['Salsa Napolitana', 'Queso Mozzarella', 'Rodajas de Tomate', 'Anchoas', 'Salsa Pesto'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-combinato',
      name: 'COMBINATO',
      price_small: 7.00,
      price: 14.00,
      description: 'Salsa, queso mozzarella, jamón, pepperoni, maíz, cebolla y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón', 'Pepperoni', 'Maíz', 'Cebolla', 'Orégano'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-romana',
      name: 'ROMANA',
      price_small: 6.00,
      price: 12.00,
      description: 'Salsa, queso mozzarella, jamón y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón', 'Orégano'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-tropical',
      name: 'TROPICAL',
      price_small: 6.00,
      price: 12.00,
      description: 'Queso mozzarella y bocadillo.',
      base_ingredients: ['Queso Mozzarella', 'Bocadillo (Guayaba)'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-margarita',
      name: 'MARGARITA',
      price_small: 5.00,
      price: 10.00,
      description: 'Salsa napolitana, queso mozzarella.',
      base_ingredients: ['Salsa Napolitana', 'Queso Mozzarella'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-azteca',
      name: 'AZTECA',
      price_small: 6.00,
      price: 12.00,
      description: 'Salsa, queso mozzarella, pico de gallo, carne molida y queso cheddar.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Pico de Gallo', 'Carne Molida', 'Queso Cheddar'],
      badge: 'Tradicional'
    },
    {
      id: 'pizza-calzone',
      name: 'CALZONE',
      price_small: 7.00,
      price: 7.00,
      description: 'Salsa, queso mozzarella, jamón, champiñones, salami, pimentón y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón', 'Champiñones', 'Salami', 'Pimentón', 'Orégano'],
      badge: 'Tamaño Único'
    }
  ];

  for (const p of tradicionalesData) {
    await client.query(
      `INSERT INTO products (
        id, name, category, drink_type, price, price_small, description, image, badge, base_ingredients, shift
      ) VALUES ($1, $2, 'Pizzas', NULL, $3, $4, $5, '', $6, $7, 'ambos')`,
      [p.id, p.name, p.price, p.price_small, p.description, p.badge, p.base_ingredients]
    );
  }

  // ==========================================
  // 3. PIZZAS ESPECIALIDADES (12 pizzas)
  // ==========================================
  console.log('🍕 Cargando Pizzas Especialidades...');

  const especialidadesData = [
    {
      id: 'pizza-basilico-especial',
      name: 'BASILICO ESPECIAL',
      price_small: 7.00,
      price: 14.00,
      description: 'Salsa, queso mozzarella, jamón, champiñones, pimentón, salami, anchoas y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón', 'Champiñones', 'Pimentón', 'Salami', 'Anchoas', 'Orégano'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-granjera',
      name: 'GRANJERA',
      price_small: 7.00,
      price: 14.00,
      description: 'Salsa, queso mozzarella, jamón, pollo, maíz, tocineta y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón', 'Pollo', 'Maíz', 'Tocineta', 'Orégano'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-barbacoa',
      name: 'BARBACOA',
      price_small: 7.00,
      price: 14.00,
      description: 'Salsa, queso mozzarella, lomito, longaniza, lomo ahumado, pimentón y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Lomito', 'Longaniza', 'Lomo Ahumado', 'Pimentón', 'Orégano'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-rustica',
      name: 'RÚSTICA',
      price_small: 7.00,
      price: 14.00,
      description: 'Salsa, queso mozzarella, chorizo español, lomito, pimentón y cebolla.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Chorizo Español', 'Lomito', 'Pimentón', 'Cebolla'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-prosciutto',
      name: 'PROSCIUTTO',
      price_small: 7.00,
      price: 14.00,
      description: 'Crema de leche, queso mozzarella, jamón, lomo ahumado, tocineta, queso parmesano y orégano.',
      base_ingredients: ['Crema de Leche', 'Queso Mozzarella', 'Jamón', 'Lomo Ahumado', 'Tocineta', 'Queso Parmesano', 'Orégano'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-oviedo',
      name: 'OVIEDO',
      price_small: 7.00,
      price: 14.00,
      description: 'Salsa, queso mozzarella, tomates secos, parmesano, rucula, pesto y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Tomates Secos', 'Queso Parmesano', 'Rúcula', 'Salsa Pesto', 'Orégano'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-filetto',
      name: 'FILETTO',
      price_small: 6.00,
      price: 12.00,
      description: 'Salsa, queso mozzarella, tomates, fileto, pesto y queso parmesano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Rodajas de Tomate', 'Fileto', 'Salsa Pesto', 'Queso Parmesano'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-filadelfia',
      name: 'FILADELFIA',
      price_small: 7.00,
      price: 14.00,
      description: 'Cebolla caramelizada como base, queso mozzarella, tocineta, lomito y cheddar.',
      base_ingredients: ['Cebolla Caramelizada', 'Queso Mozzarella', 'Tocineta', 'Lomito', 'Queso Cheddar'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-iberia',
      name: 'IBERIA',
      price_small: 8.00,
      price: 16.00,
      description: 'Salsa, queso mozzarella, jamón curado, parmesano, salsa pesto, queso crema, rucula y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón Curado', 'Queso Parmesano', 'Salsa Pesto', 'Queso Crema', 'Rúcula', 'Orégano'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-alemana',
      name: 'ALEMANA',
      price_small: 8.00,
      price: 16.00,
      description: 'Salsa, queso mozzarella, longaniza ahumada, jamón, chorizo español, salami y orégano.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Longaniza Ahumada', 'Jamón', 'Chorizo Español', 'Salami', 'Orégano'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-cuatro-estaciones',
      name: 'CUATRO ESTACIONES',
      price_small: 7.00,
      price: 14.00,
      description: 'Salsa, queso, jamón, champiñones, salami y aceitunas negras.',
      base_ingredients: ['Salsa de Tomate', 'Queso Mozzarella', 'Jamón', 'Champiñones', 'Salami', 'Aceitunas Negras'],
      badge: 'Especialidad'
    },
    {
      id: 'pizza-cuatro-quesos-ahumada',
      name: 'CUATRO QUESOS AHUMADA',
      price_small: 7.00,
      price: 14.00,
      description: 'Crema de leche, queso mozzarella, queso azul, parmesano, longaniza y tocineta.',
      base_ingredients: ['Crema de Leche', 'Queso Mozzarella', 'Queso Azul', 'Queso Parmesano', 'Longaniza', 'Tocineta'],
      badge: 'Especialidad'
    }
  ];

  for (const p of especialidadesData) {
    await client.query(
      `INSERT INTO products (
        id, name, category, drink_type, price, price_small, description, image, badge, base_ingredients, shift
      ) VALUES ($1, $2, 'Pizzas', NULL, $3, $4, $5, '', $6, $7, 'ambos')`,
      [p.id, p.name, p.price, p.price_small, p.description, p.badge, p.base_ingredients]
    );
  }

  // 5. Verificaciones finales
  const totalProds = await client.query('SELECT count(*) FROM products');
  const totalIngs = await client.query('SELECT count(*) FROM ingredients');
  const totalTables = await client.query('SELECT count(*) FROM tables_config');
  const totalUsers = await client.query('SELECT count(*) FROM users');

  console.log('\n============================================================');
  console.log('🎉 MIGRACIÓN Y CARGA DE MENÚ A "basilico" COMPLETADA CON ÉXITO');
  console.log('============================================================');
  console.log(` • Base de datos activa: basilico`);
  console.log(` • Total Productos: ${totalProds.rows[0].count} (8 Bebidas + 12 Tradicionales + 12 Especialidades)`);
  console.log(` • Total Ingredientes: ${totalIngs.rows[0].count} (Bases y Adicionales con precios en 4 niveles)`);
  console.log(` • Total Mesas configuradas: ${totalTables.rows[0].count}`);
  console.log(` • Total Usuarios oficiales: ${totalUsers.rows[0].count}`);
  console.log('============================================================\n');

  client.release();
  await basilicoPool.end();

  // 6. Actualizar archivo .env con DB_NAME=basilico
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/DB_NAME=.*/g, 'DB_NAME=basilico');
    envContent = envContent.replace(/DB_PASSWORD=.*/g, `DB_PASSWORD=${correctPassword}`);
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('📝 Archivo .env actualizado con DB_NAME=basilico');
  }
}

migrate().catch((err) => {
  console.error('❌ Error durante la migración:', err);
  process.exit(1);
});
