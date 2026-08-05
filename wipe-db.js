const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'server', 'database.sqlite');
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
  db.run('DELETE FROM order_items;');
  db.run('DELETE FROM order_payments;');
  db.run('DELETE FROM orders;');
  db.run('DELETE FROM caja_chica_transactions;');
  db.run('DELETE FROM caja_chica;');
  db.run("DELETE FROM sqlite_sequence WHERE name IN ('order_items', 'order_payments', 'orders', 'caja_chica_transactions', 'caja_chica');");
});
db.close((err) => {
  if (err) console.error(err);
  else console.log('Vaciado completo y exitoso de la BD.');
});
