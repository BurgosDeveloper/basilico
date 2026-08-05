const db = require('../server/db');

async function cleanDatabase() {
  console.log('🧹 Iniciando limpieza completa de comandas en la base de datos...');

  try {
    await db.initDb();

    if (db.usePg) {
      // Delete in correct order respecting foreign keys
      const tables = [
        'order_payments',
        'order_items',
        'orders',
        'caja_chica_transactions',
        'caja_chica_cierres',
        'caja_chica_apertura'
      ];

      for (const table of tables) {
        try {
          const result = await db.query(`DELETE FROM ${table}`);
          console.log(`  ✅ ${table}: ${result.rowCount} filas eliminadas`);
        } catch (e) {
          console.log(`  ⚠️ ${table}: ${e.message}`);
        }
      }

      // Reset tables to libre
      try {
        await db.query("UPDATE tables_config SET status = 'libre'");
        console.log('  ✅ Mesas reseteadas a libre');
      } catch (e) {
        console.log('  ⚠️ tables_config:', e.message);
      }

      // Verify
      const r = await db.query('SELECT COUNT(*) as cnt FROM orders');
      const r2 = await db.query('SELECT COUNT(*) as cnt FROM order_items');
      console.log(`\n  📊 Verificación: ${r.rows[0].cnt} órdenes, ${r2.rows[0].cnt} items en PostgreSQL`);
      console.log('✅ Base de datos PostgreSQL limpiada exitosamente.');
    }

    // Clean JSON local
    if (db.dbData) {
      db.dbData.orders = [];
      db.dbData.order_items = [];
      db.dbData.order_payments = [];
      db.dbData.order_sequence = 0;
      db.dbData.caja_transactions = [];
      db.dbData.caja_chica_transactions = [];
      db.dbData.caja_chica_cierres = [];
      db.dbData.caja_apertura = null;
      if (Array.isArray(db.dbData.tables)) {
        db.dbData.tables.forEach((t) => {
          t.status = 'libre';
          t.current_order_id = null;
        });
      }
      db.saveJsonDb();
      console.log('✅ Archivo db.json local limpiado exitosamente.');
    }
  } catch (err) {
    console.error('Error al limpiar base de datos:', err);
  } finally {
    process.exit(0);
  }
}

cleanDatabase();
