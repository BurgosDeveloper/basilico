const { query, initDb } = require('../server/db');

async function check() {
  await initDb();
  const res = await query('SELECT category, count(*) FROM products GROUP BY category');
  console.log('Categories:', res.rows);
  const all = await query('SELECT id, name, category, price, flavors FROM products ORDER BY name ASC');
  console.log('Products:', all.rows);
  process.exit(0);
}

check();
