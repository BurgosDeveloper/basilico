const { initDb, getClient } = require('../server/db');
const { postCompletedOrderCashMovements } = require('../server/helpers/cashLedger');

async function reconcileCashLedger() {
  await initDb();
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { rows: orders } = await client.query(
      `SELECT id FROM orders
       WHERE status = 'entregada' AND payment_status = 'pagado'
       ORDER BY created_at ASC`
    );

    let postedOrders = 0;
    let removedOrders = 0;
    for (const order of orders) {
      const result = await postCompletedOrderCashMovements(client, order.id);
      if (result.posted) postedOrders += 1;
      if (result.removed) removedOrders += 1;
    }
    await client.query('COMMIT');
    console.log(`Reconciliación terminada: ${orders.length} comandas revisadas, ${postedOrders} actualizadas, ${removedOrders} movimientos obsoletos eliminados.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

reconcileCashLedger()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error reconciliando los movimientos de caja:', error);
    process.exit(1);
  });