const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://postgres:sdmaia1.@localhost:5432/sdmaia'
});

async function wipeDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🧹 Eliminando registros (órdenes, transacciones, etc) en PG (sdmaia)...');
    
    await client.query('TRUNCATE TABLE caja_chica_transactions RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE caja_chica_apertura RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE caja_chica_cierres RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE TABLE orders RESTART IDENTITY CASCADE');
    
    console.log('✅ Base de datos PG limpiada correctamente. Se mantuvieron usuarios, productos, mesas, ingredientes y tasas.');
    await client.query('COMMIT');
  } catch (err) {
    console.error('❌ Error al limpiar DB:', err);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    pool.end();
  }
}

wipeDb();
