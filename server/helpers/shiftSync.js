const { fetchAllOrders, fetchAllTables, fetchAllProducts, fetchAllIngredients } = require('./fetchAll');

/**
 * Sincroniza las listas de comandas y mesas a los clientes conectados
 * asegurando aislamiento estricto por turno (manana vs noche vs ambos).
 */
async function syncOrdersAndTables(io, shift = null) {
  if (!io) return;
  try {
    if (!shift || shift === 'manana' || shift === 'ambos') {
      const [ordersM, tablesM] = await Promise.all([
        fetchAllOrders({ shift: 'manana' }),
        fetchAllTables({ shift: 'manana' })
      ]);
      io.to('shift:manana').emit('orders:sync', ordersM);
      io.to('shift:manana').emit('tables:sync', tablesM);
    }
    if (!shift || shift === 'noche' || shift === 'ambos') {
      const [ordersN, tablesN] = await Promise.all([
        fetchAllOrders({ shift: 'noche' }),
        fetchAllTables({ shift: 'noche' })
      ]);
      io.to('shift:noche').emit('orders:sync', ordersN);
      io.to('shift:noche').emit('tables:sync', tablesN);
    }
    const [ordersAll, tablesAll] = await Promise.all([
      fetchAllOrders({ shift: 'ambos' }),
      fetchAllTables({ shift: 'ambos' })
    ]);
    io.to('shift:ambos').emit('orders:sync', ordersAll);
    io.to('shift:ambos').emit('tables:sync', tablesAll);
  } catch (err) {
    console.error('⚠️ [SYNC ORDERS/TABLES ERROR]:', err.message);
  }
}

/**
 * Sincroniza productos a cada turno
 */
async function syncProducts(io) {
  if (!io) return;
  try {
    const [productsM, productsN, productsAll] = await Promise.all([
      fetchAllProducts({ shift: 'manana' }),
      fetchAllProducts({ shift: 'noche' }),
      fetchAllProducts({ shift: 'ambos' }),
    ]);
    io.to('shift:manana').emit('products:sync', productsM);
    io.to('shift:noche').emit('products:sync', productsN);
    io.to('shift:ambos').emit('products:sync', productsAll);
  } catch (err) {
    console.error('⚠️ [SYNC PRODUCTS ERROR]:', err.message);
  }
}

/**
 * Sincroniza ingredientes a cada turno
 */
async function syncIngredients(io) {
  if (!io) return;
  try {
    const [ingM, ingN, ingAll] = await Promise.all([
      fetchAllIngredients({ shift: 'manana' }),
      fetchAllIngredients({ shift: 'noche' }),
      fetchAllIngredients({ shift: 'ambos' }),
    ]);
    io.to('shift:manana').emit('ingredients:sync', ingM);
    io.to('shift:noche').emit('ingredients:sync', ingN);
    io.to('shift:ambos').emit('ingredients:sync', ingAll);
  } catch (err) {
    console.error('⚠️ [SYNC INGREDIENTS ERROR]:', err.message);
  }
}

/**
 * Emite un evento en tiempo real exclusivamente al turno correspondiente y a usuarios globales (ambos).
 */
function emitToShift(io, shift, event, data) {
  if (!io) return;
  const targetShift = (shift && shift !== 'ambos') ? shift : null;
  if (targetShift) {
    if (typeof io.to === 'function') {
      try {
        io.to(`shift:${targetShift}`).emit(event, data);
        io.to('shift:ambos').emit(event, data);
      } catch (e) {
        if (typeof io.emit === 'function') io.emit(event, data);
      }
    } else if (typeof io.emit === 'function') {
      io.emit(event, data);
    }
  } else if (typeof io.emit === 'function') {
    io.emit(event, data);
  }
}

module.exports = {
  syncOrdersAndTables,
  syncProducts,
  syncIngredients,
  emitToShift,
};
