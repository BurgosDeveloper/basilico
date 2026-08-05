const db = require('../server/db');

(async () => {
  await db.initDb();
  console.log('usePg:', db.usePg);
  
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
        console.log(`✅ Deleted all from ${table} (${result.rowCount} rows)`);
      } catch (e) {
        console.log(`⚠️ Skip ${table}: ${e.message}`);
      }
    }
    
    // Reset tables to libre
    try {
      await db.query("UPDATE tables_config SET status = 'libre'");
      console.log('✅ All tables reset to libre');
    } catch (e) {
      console.log('⚠️ Skip tables_config:', e.message);
    }
    
    // Verify
    const r = await db.query('SELECT COUNT(*) as cnt FROM orders');
    console.log('\n=== VERIFICATION ===');
    console.log('Orders remaining in PostgreSQL:', r.rows[0].cnt);
    const r2 = await db.query('SELECT COUNT(*) as cnt FROM order_items');
    console.log('Order items remaining in PostgreSQL:', r2.rows[0].cnt);
  }
  
  // Also clean JSON
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
      db.dbData.tables.forEach(t => {
        t.status = 'libre';
        t.current_order_id = null;
      });
    }
    db.saveJsonDb();
    console.log('✅ db.json cleaned');
  }
  
  process.exit(0);
})();
