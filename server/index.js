const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { query, initDb } = require('./db');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace('::ffff:', '');
  if (req.url.startsWith('/api')) {
    console.log(`🌐 [HTTP ${req.method}] ${req.url} (Cliente IP: ${clientIp || '127.0.0.1'})`);
  }
  next();
});

// Directorio estático para imágenes locales subidas por el Admin
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Endpoint de subida de imágenes
app.post('/api/upload', (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No se envió imagen' });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    const ext = filename ? path.extname(filename) : '.jpg';
    const safeFilename = `img_${Date.now()}${ext || '.jpg'}`;
    const filePath = path.join(uploadsDir, safeFilename);

    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/${safeFilename}`;
    return res.json({ url: relativeUrl, filename: safeFilename });
  } catch (e) {
    console.error('Error al guardar imagen:', e);
    return res.status(500).json({ error: 'Error al procesar la imagen' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  },
});

// Inicializar DB (async, esperar que esté lista antes de responder peticiones)
initDb().then(() => {
  console.log('🗄️ Motor de base de datos inicializado correctamente.');
}).catch((err) => {
  console.error('Error inicializando DB:', err);
});

// WebSocket Handler
io.on('connection', (socket) => {
  const clientIp = (socket.handshake.address || '').replace('::ffff:', '');
  console.log(`⚡ Cliente conectado a WebSocket LAN: ${socket.id} (IP: ${clientIp || '127.0.0.1'})`);

  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });
});

// Helpers DB ↔ Frontend
function safeJsonParse(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val !== 'string') return Array.isArray(val) ? val : fallback;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

// Parse JSON that should be an Object (not Array), e.g. halfDetails
function safeJsonParseObj(val) {
  if (!val || val === 'null') return undefined;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val !== 'string') return undefined;
  try {
    const parsed = JSON.parse(val);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : undefined;
  } catch (e) {
    return undefined;
  }
}

async function fetchAllOrders() {
  const { dbData, usePg, query } = require('./db');
  if (usePg) {
    const { rows: orders } = await query(`SELECT * FROM orders ORDER BY created_at DESC`);
    const { rows: items } = await query(`SELECT * FROM order_items`);
    const { rows: payments } = await query(`SELECT * FROM order_payments ORDER BY created_at ASC`);

    return orders.map((ord) => ({
      id: ord.id,
      orderNumber: ord.order_number,
      type: ord.type,
      tableNumber: ord.table_number,
      customerName: ord.customer_name,
      status: ord.status,
      paymentStatus: ord.payment_status,
      paymentMethod: ord.payment_method,
      totalUSD: parseFloat(ord.total_usd) || 0,
      paidAmountUSD: parseFloat(ord.paid_amount_usd) || (ord.payment_status === 'pagado' ? parseFloat(ord.total_usd) : 0),
      copRateAtPayment: parseFloat(ord.cop_rate_at_payment) || 3950,
      bsRateAtPayment: parseFloat(ord.bs_rate_at_payment) || 36.5,
      waiterName: ord.waiter_name || 'Mesero',
      kitchenNotes: ord.kitchen_notes,
      isEdited: !!ord.is_edited,
      mergedFromOrders: ord.merged_from_orders || [],
      createdAt: ord.created_at,
      paymentHistory: payments
        .filter((pm) => pm.order_id === ord.id)
        .map((pm) => ({
          id: pm.id,
          orderId: pm.order_id,
          payerName: pm.payer_name || 'Cliente General',
          paymentMethod: pm.payment_method,
          amountPaidUSD: parseFloat(pm.amount_paid_usd) || 0,
          cashTenderedUSD: parseFloat(pm.cash_tendered_usd) || 0,
          cashTenderedCOP: parseFloat(pm.cash_tendered_cop) || 0,
          cashTenderedBs: parseFloat(pm.cash_tendered_bs) || 0,
          changeGivenUSD: parseFloat(pm.change_given_usd) || 0,
          changeGivenCOP: parseFloat(pm.change_given_cop) || 0,
          changeGivenBs: parseFloat(pm.change_given_bs) || 0,
          copRate: parseFloat(pm.cop_rate) || 3950,
          bsRate: parseFloat(pm.bs_rate) || 36.5,
          itemIds: pm.item_ids || [],
          createdAt: pm.created_at,
        })),
      items: items
        .filter((it) => it.order_id === ord.id)
        .map((it) => ({
          id: it.id,
          productId: it.product_id,
          productName: it.product_name,
          price: parseFloat(it.price) || 0,
          quantity: it.quantity,
          size: it.size || 'Grande',
          isHalfHalf: !!it.is_half_half,
          halfDetails: safeJsonParseObj(it.half_details),
          removedIngredients: it.removed_ingredients || [],
          extras: safeJsonParse(it.extras_json),
          sugarPreference: it.sugar_preference || undefined,
          isTakeaway: !!it.is_takeaway,
          isNewOrModified: !!it.is_new_or_modified,
          isPaidIndividually: !!it.is_paid_individually,
          paidByName: it.paid_by_name || undefined,
          notes: it.notes || '',
        })),
    }));
  }
  return (dbData.orders || []).map((ord) => ({
    id: ord.id,
    orderNumber: ord.order_number,
    type: ord.type,
    tableNumber: ord.table_number,
    customerName: ord.customer_name,
    status: ord.status,
    paymentStatus: ord.payment_status,
    paymentMethod: ord.payment_method,
    totalUSD: parseFloat(ord.total_usd) || 0,
    paidAmountUSD: parseFloat(ord.paid_amount_usd) || (ord.payment_status === 'pagado' ? parseFloat(ord.total_usd) : 0),
    copRateAtPayment: parseFloat(ord.cop_rate_at_payment) || 3950,
    bsRateAtPayment: parseFloat(ord.bs_rate_at_payment) || 36.5,
    waiterName: ord.waiter_name || 'Mesero',
    kitchenNotes: ord.kitchen_notes,
    isEdited: !!ord.is_edited,
    mergedFromOrders: ord.merged_from_orders || [],
    createdAt: ord.created_at,
    paymentHistory: (dbData.order_payments || [])
      .filter((pm) => pm.order_id === ord.id)
      .map((pm) => ({
        id: pm.id,
        orderId: pm.order_id,
        payerName: pm.payer_name || 'Cliente General',
        paymentMethod: pm.payment_method,
        amountPaidUSD: parseFloat(pm.amount_paid_usd) || 0,
        cashTenderedUSD: parseFloat(pm.cash_tendered_usd) || 0,
        cashTenderedCOP: parseFloat(pm.cash_tendered_cop) || 0,
        cashTenderedBs: parseFloat(pm.cash_tendered_bs) || 0,
        changeGivenUSD: parseFloat(pm.change_given_usd) || 0,
        changeGivenCOP: parseFloat(pm.change_given_cop) || 0,
        changeGivenBs: parseFloat(pm.change_given_bs) || 0,
        copRate: parseFloat(pm.cop_rate) || 3950,
        bsRate: parseFloat(pm.bs_rate) || 36.5,
        itemIds: pm.item_ids || [],
        createdAt: pm.created_at,
      })),
    items: (dbData.order_items || [])
      .filter((it) => it.order_id === ord.id)
      .map((it) => ({
        id: it.id,
        productId: it.product_id,
        productName: it.product_name,
        price: parseFloat(it.price) || 0,
        quantity: it.quantity,
        size: it.size || 'Grande',
        isHalfHalf: !!it.is_half_half,
        halfDetails: safeJsonParseObj(it.half_details),
        removedIngredients: it.removed_ingredients || [],
        extras: safeJsonParse(it.extras_json),
        sugarPreference: it.sugar_preference || undefined,
        isTakeaway: !!it.is_takeaway,
        isNewOrModified: !!it.is_new_or_modified,
        isPaidIndividually: !!it.is_paid_individually,
        paidByName: it.paid_by_name || undefined,
        notes: it.notes || '',
      })),
  }));
}


function normalizeImageUrl(url) {
  if (!url) return '';
  if (typeof url === 'string' && url.includes('/uploads/')) {
    const filename = url.split('/uploads/')[1];
    return `/uploads/${filename}`;
  }
  return url;
}

async function fetchAllProducts() {
  const { dbData, usePg, query } = require('./db');
  if (usePg) {
    const { rows } = await query(`SELECT * FROM products ORDER BY created_at DESC`);
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      drinkType: p.drink_type || undefined,
      price: parseFloat(p.price),
      priceSmall: parseFloat(p.price_small || p.price_small_usd) || (parseFloat(p.price) > 4 ? parseFloat(p.price) - 4 : parseFloat(p.price)),
      description: p.description || '',
      image: normalizeImageUrl(p.image),
      badge: p.badge || undefined,
      baseIngredients: p.base_ingredients || [],
      recipe: [],
    }));
  }
  return dbData.products.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    drinkType: p.drink_type || undefined,
    price: parseFloat(p.price),
    priceSmall: parseFloat(p.price_small || p.price_small_usd) || (parseFloat(p.price) > 4 ? parseFloat(p.price) - 4 : parseFloat(p.price)),
    description: p.description || '',
    image: normalizeImageUrl(p.image),
    badge: p.badge || undefined,
    baseIngredients: p.base_ingredients || [],
    recipe: []
  }));
}

async function fetchAllIngredients() {
  const { dbData, usePg, query } = require('./db');
  if (usePg) {
    const { rows } = await query(`SELECT * FROM ingredients ORDER BY name ASC`);
    return rows.map((i) => ({
      id: i.id,
      name: i.name,
      priceUSD: parseFloat(i.price_usd),
      isBaseForPizza: !!i.is_base_for_pizza,
      isExtraForPizza: !!i.is_extra_for_pizza,
      category: i.category || 'Ingredientes',
      available: i.available !== false,
    }));
  }
  return dbData.ingredients.map(i => ({
    id: i.id,
    name: i.name,
    priceUSD: parseFloat(i.price_usd),
    isBaseForPizza: !!i.is_base_for_pizza,
    isExtraForPizza: !!i.is_extra_for_pizza,
    category: i.category || 'Ingredientes',
    available: i.available !== false,
  }));
}

async function fetchAllTables() {
  const { dbData, usePg, query } = require('./db');
  if (usePg) {
    const { rows } = await query(`SELECT * FROM tables_config ORDER BY number ASC`);
    return rows.map((t) => ({
      id: t.id,
      number: t.number,
      name: t.name,
      capacity: t.capacity,
      status: t.status,
      zone: t.zone,
    }));
  }
  return dbData.tables.map(t => ({
    id: t.id,
    number: t.number,
    name: t.name,
    capacity: t.capacity,
    status: t.status,
    zone: t.zone
  }));
}

// ------------------------------------
// REST ENDPOINTS
// ------------------------------------

// Auth Login Endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const userClean = (username || '').trim().toLowerCase();
    const passClean = (password || '').trim().toLowerCase();

    const { usePg, dbData, query } = require('./db');
    if (usePg) {
      const { rows } = await query(`SELECT * FROM users WHERE LOWER(username) = $1 AND LOWER(password) = $2`, [userClean, passClean]);
      if (rows.length > 0) {
        const u = rows[0];
        return res.json({ success: true, user: { username: u.name, role: u.role, shift: u.shift || 'ambos' } });
      }
    } else {
      const u = dbData.users.find(x => x.username.toLowerCase() === userClean && x.password.toLowerCase() === passClean);
      if (u) {
        return res.json({ success: true, user: { username: u.name, role: u.role, shift: u.shift || 'ambos' } });
      }
    }

    if (userClean === 'basilico' || userClean === 'admin') {
      if (passClean === 'mesero.manana') return res.json({ success: true, user: { username: 'Mesero Mañana', role: 'mesero', shift: 'manana' } });
      if (passClean === 'caja.manana') return res.json({ success: true, user: { username: 'Caja Mañana', role: 'caja', shift: 'manana' } });
      if (passClean === 'cocina.manana') return res.json({ success: true, user: { username: 'Cocina Mañana', role: 'cocina', shift: 'manana' } });
      if (passClean === 'admin.manana') return res.json({ success: true, user: { username: 'Admin Mañana', role: 'admin', shift: 'manana' } });
      
      if (passClean === 'mesero.noche') return res.json({ success: true, user: { username: 'Mesero Noche', role: 'mesero', shift: 'noche' } });
      if (passClean === 'caja.noche') return res.json({ success: true, user: { username: 'Caja Noche', role: 'caja', shift: 'noche' } });
      if (passClean === 'cocina.noche') return res.json({ success: true, user: { username: 'Cocina Noche', role: 'cocina', shift: 'noche' } });
      if (passClean === 'admin.noche') return res.json({ success: true, user: { username: 'Admin Noche', role: 'admin', shift: 'noche' } });

      if (passClean === 'basilico1.') return res.json({ success: true, user: { username: 'Dueño', role: 'admin', shift: 'ambos' } });

      // Fallback
      if (passClean === 'mesero') return res.json({ success: true, user: { username: 'Mesero', role: 'mesero', shift: 'ambos' } });
      if (passClean === 'caja') return res.json({ success: true, user: { username: 'Caja', role: 'caja', shift: 'ambos' } });
      if (passClean === 'cocina') return res.json({ success: true, user: { username: 'Cocina', role: 'cocina', shift: 'ambos' } });
      if (passClean === 'admin') return res.json({ success: true, user: { username: 'Admin', role: 'admin', shift: 'ambos' } });
    }

    return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en servidor de autenticación' });
  }
});

// Products API
app.get('/api/products', async (req, res) => {
  try {
    const products = await fetchAllProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { id: inputId, name, category, drinkType, price, priceSmall, description, image, badge, baseIngredients, shift } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    const id = inputId || `prod-${Date.now()}`;

    if (usePg) {
      if (inputId) {
        await query(
          `UPDATE products SET name = $1, category = $2, drink_type = $3, price = $4, price_small = $5, description = $6, image = $7, badge = $8, base_ingredients = $9, shift = $10 WHERE id = $11`,
          [name, category, drinkType || null, price || 0, priceSmall || null, description || '', image || '', badge || null, baseIngredients || [], shift || 'ambos', inputId]
        );
      } else {
        await query(
          `INSERT INTO products (id, name, category, drink_type, price, price_small, description, image, badge, base_ingredients, shift)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [id, name, category, drinkType || null, price || 0, priceSmall || null, description || '', image || '', badge || null, baseIngredients || [], shift || 'ambos']
        );
      }
    } else {
      const existingIdx = inputId ? dbData.products.findIndex((p) => p.id === inputId) : -1;
      if (existingIdx !== -1) {
        dbData.products[existingIdx] = {
          ...dbData.products[existingIdx],
          name,
          category,
          drink_type: drinkType || null,
          price: parseFloat(price) || 0,
          price_small: priceSmall ? parseFloat(priceSmall) : null,
          description: description || '',
          image: image || '',
          badge: badge || null,
          base_ingredients: baseIngredients || [],
          shift: shift || 'ambos',
        };
      } else {
        dbData.products.unshift({
          id,
          name,
          category,
          drink_type: drinkType || null,
          price: parseFloat(price) || 0,
          price_small: priceSmall ? parseFloat(priceSmall) : null,
          description: description || '',
          image: image || '',
          badge: badge || null,
          base_ingredients: baseIngredients || [],
          shift: shift || 'ambos',
        });
      }
      saveJsonDb();
    }

    const allProducts = await fetchAllProducts();
    io.emit('products:sync', allProducts);
    res.status(201).json(allProducts.find((p) => p.id === id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear o actualizar producto' });
  }
});
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, drinkType, price, priceSmall, description, image, badge, baseIngredients, shift } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      await query(
        `UPDATE products SET name = $1, category = $2, drink_type = $3, price = $4, price_small = $5, description = $6, image = $7, badge = $8, base_ingredients = $9, shift = $10 WHERE id = $11`,
        [name, category, drinkType || null, price || 0, priceSmall || null, description || '', image || '', badge || null, baseIngredients || [], shift || 'ambos', id]
      );
    } else {
      const idx = dbData.products.findIndex(p => p.id === id);
      if (idx !== -1) {
        dbData.products[idx] = {
          ...dbData.products[idx],
          name,
          category,
          drink_type: drinkType || null,
          price: parseFloat(price) || 0,
          price_small: priceSmall ? parseFloat(priceSmall) : null,
          description: description || '',
          image: image || '',
          badge: badge || null,
          base_ingredients: baseIngredients || []
        };
        saveJsonDb();
      }
    }

    const allProducts = await fetchAllProducts();
    io.emit('products:sync', allProducts);
    res.json(allProducts.find((p) => p.id === id) || { success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});


app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      await query(`DELETE FROM products WHERE id = $1`, [id]);
    } else {
      dbData.products = dbData.products.filter(p => p.id !== id);
      saveJsonDb();
    }

    const allProducts = await fetchAllProducts();
    io.emit('products:sync', allProducts);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// Ingredients API
app.get('/api/ingredients', async (req, res) => {
  try {
    const ingredients = await fetchAllIngredients();
    res.json(ingredients);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener ingredientes' });
  }
});

app.post('/api/ingredients', async (req, res) => {
  try {
    const { name, priceUSD, isBaseForPizza, isExtraForPizza, category, available, shift } = req.body;
    const id = `ing-${Date.now()}`;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      await query(
        `INSERT INTO ingredients (id, name, price_usd, is_base_for_pizza, is_extra_for_pizza, category, available, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name) DO UPDATE SET 
           price_usd = EXCLUDED.price_usd,
           is_base_for_pizza = EXCLUDED.is_base_for_pizza,
           is_extra_for_pizza = EXCLUDED.is_extra_for_pizza,
           category = EXCLUDED.category,
           available = EXCLUDED.available,
           shift = EXCLUDED.shift`,
        [id, name, priceUSD || 0, isBaseForPizza !== false, isExtraForPizza !== false, category || 'Ingredientes', available !== false, shift || 'ambos']
      );
    } else {
      const idx = dbData.ingredients.findIndex(i => i.name === name);
      const newIng = {
        id: idx >= 0 ? dbData.ingredients[idx].id : id,
        name,
        price_usd: parseFloat(priceUSD) || 0,
        is_base_for_pizza: isBaseForPizza !== false,
        is_extra_for_pizza: isExtraForPizza !== false,
        category: category || 'Ingredientes',
        available: available !== false,
        shift: shift || 'ambos'
      };
      if (idx >= 0) {
        dbData.ingredients[idx] = newIng;
      } else {
        dbData.ingredients.unshift(newIng);
      }
      saveJsonDb();
    }

    const allIngredients = await fetchAllIngredients();
    io.emit('ingredients:sync', allIngredients);
    res.status(201).json(allIngredients.find((i) => i.name === name));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar ingrediente' });
  }
});

app.put('/api/ingredients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, priceUSD, isBaseForPizza, isExtraForPizza, available, shift } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    let oldName = null;
    if (usePg) {
      const { rows } = await query(`SELECT name FROM ingredients WHERE id = $1`, [id]);
      if (rows.length > 0) oldName = rows[0].name;

      await query(
        `UPDATE ingredients 
         SET name = $1, category = $2, price_usd = $3, 
             is_base_for_pizza = $4, is_extra_for_pizza = $5, available = $6, shift = $7
         WHERE id = $8`,
        [
          name, 
          category || 'Ingredientes', 
          priceUSD || 0, 
          isBaseForPizza !== false, 
          isExtraForPizza !== false, 
          available !== false, 
          shift || 'ambos',
          id
        ]
      );

      if (oldName && oldName !== name) {
        await query(
          `UPDATE products 
           SET base_ingredients = array_replace(base_ingredients, $1, $2) 
           WHERE $1 = ANY(base_ingredients)`,
          [oldName, name]
        );
      }
    } else {
      const idx = dbData.ingredients.findIndex(i => i.id === id);
      if (idx !== -1) {
        oldName = dbData.ingredients[idx].name;
        dbData.ingredients[idx] = {
          ...dbData.ingredients[idx],
          name,
          category: category || 'Ingredientes',
          price_usd: parseFloat(priceUSD) || 0,
          is_base_for_pizza: isBaseForPizza !== false,
          is_extra_for_pizza: isExtraForPizza !== false,
          available: available !== false
        };

        if (oldName && oldName !== name && Array.isArray(dbData.products)) {
          dbData.products.forEach(p => {
            if (Array.isArray(p.base_ingredients)) {
              p.base_ingredients = p.base_ingredients.map(ing => ing === oldName ? name : ing);
            }
          });
        }

        saveJsonDb();
      }
    }

    const allIngredients = await fetchAllIngredients();
    const allProducts = await fetchAllProducts();
    io.emit('ingredients:sync', allIngredients);
    if (oldName && oldName !== name) {
      io.emit('products:sync', allProducts);
    }
    res.json(allIngredients.find((i) => i.id === id) || { success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar ingrediente' });
  }
});

app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      await query(`DELETE FROM ingredients WHERE id = $1`, [id]);
    } else {
      dbData.ingredients = dbData.ingredients.filter(i => i.id !== id);
      saveJsonDb();
    }

    const allIngredients = await fetchAllIngredients();
    io.emit('ingredients:sync', allIngredients);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar ingrediente' });
  }
});

// Tables API (Get, Create, Delete)
app.get('/api/tables', async (req, res) => {
  try {
    const tables = await fetchAllTables();
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener mesas' });
  }
});

app.post('/api/tables', async (req, res) => {
  try {
    const { number, name, capacity, zone } = req.body;
    const id = `table-${Date.now()}`;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    const numInt = parseInt(number, 10) || (dbData.tables.length + 1);
    const tableName = name || `Mesa #${numInt}`;
    const tableCap = parseInt(capacity, 10) || 4;
    const tableZone = zone || 'Salón Principal';

    if (usePg) {
      await query(
        `INSERT INTO tables_config (id, number, name, capacity, status, zone)
         VALUES ($1, $2, $3, $4, 'libre', $5)
         ON CONFLICT (number) DO UPDATE SET name = EXCLUDED.name, capacity = EXCLUDED.capacity, zone = EXCLUDED.zone`,
        [id, numInt, tableName, tableCap, tableZone]
      );
    } else {
      const idx = dbData.tables.findIndex(t => t.number === numInt);
      const newTable = { id: idx >= 0 ? dbData.tables[idx].id : id, number: numInt, name: tableName, capacity: tableCap, status: 'libre', zone: tableZone };
      if (idx >= 0) {
        dbData.tables[idx] = newTable;
      } else {
        dbData.tables.push(newTable);
      }
      saveJsonDb();
    }

    const allTables = await fetchAllTables();
    io.emit('tables:sync', allTables);
    res.status(201).json(allTables.find(t => t.number === numInt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear mesa' });
  }
});

app.put('/api/tables/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { number, name, capacity, zone } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');
    
    const numInt = parseInt(number, 10);
    const tableCap = parseInt(capacity, 10) || 4;

    if (usePg) {
      await query(
        `UPDATE tables_config SET number = $1, name = $2, capacity = $3, zone = $4 WHERE id = $5`,
        [numInt, name, tableCap, zone, id]
      );
    } else {
      const idx = dbData.tables.findIndex(t => t.id === id);
      if (idx !== -1) {
        dbData.tables[idx] = {
          ...dbData.tables[idx],
          number: numInt,
          name,
          capacity: tableCap,
          zone
        };
        saveJsonDb();
      }
    }

    const allTables = await fetchAllTables();
    io.emit('tables:sync', allTables);
    res.json(allTables.find((t) => t.id === id) || { success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar mesa' });
  }
});

app.delete('/api/tables/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      await query(`DELETE FROM tables_config WHERE id = $1`, [id]);
    } else {
      dbData.tables = dbData.tables.filter(t => t.id !== id);
      saveJsonDb();
    }

    const allTables = await fetchAllTables();
    io.emit('tables:sync', allTables);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar mesa' });
  }
});

app.delete('/api/orders/purge-all', async (req, res) => {
  try {
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      // Delete in correct order respecting foreign keys
      const pgTables = [
        'order_payments',
        'order_items',
        'orders',
        'caja_chica_transactions',
        'caja_chica_cierres',
        'caja_chica_apertura'
      ];
      for (const table of pgTables) {
        try { await query(`DELETE FROM ${table}`); } catch (e) { /* table may not exist */ }
      }
      try { await query("UPDATE tables_config SET status = 'libre'"); } catch (e) { /* ignore */ }
    }

    dbData.orders = [];
    dbData.order_items = [];
    dbData.order_payments = [];
    dbData.order_sequence = 0;
    dbData.caja_transactions = [];
    dbData.caja_chica_transactions = [];
    dbData.caja_chica_cierres = [];
    dbData.caja_apertura = null;
    if (Array.isArray(dbData.tables)) {
      dbData.tables.forEach((t) => {
        t.status = 'libre';
        t.current_order_id = null;
      });
    }
    saveJsonDb();

    console.log('🧹 [API PURGE TOTAL] Se eliminaron todas las comandas, historial y transacciones de caja.');

    const allOrders = await fetchAllOrders();
    const allTables = await fetchAllTables();
    io.emit('orders:sync', allOrders);
    io.emit('tables:sync', allTables);
    io.emit('caja:updated');

    res.json({ success: true, message: 'Todas las comandas y transacciones eliminadas exitosamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al purgar comandas' });
  }
});

// Orders API
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await fetchAllOrders();
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener comandas' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { type, tableNumber, customerName, kitchenNotes, items, totalUSD, shift } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');
    const orderId = `ord-${Date.now()}`;

    let nextNum = 1;
    if (usePg) {
      try {
        const countRes = await query(`SELECT COUNT(*) FROM orders`);
        nextNum = 1 + parseInt(countRes.rows[0]?.count || '0', 10);
      } catch (e) {
        nextNum = 1 + (dbData.orders || []).length;
      }
    } else {
      nextNum = 1 + (dbData.orders || []).length;
    }
    const orderNumber = `#${nextNum}`;

    const requiresKitchen = (items || []).some(it => {
      const nameLower = (it.productName || '').toLowerCase();
      const isSoda = nameLower.includes('coca') || nameLower.includes('pepsi') || nameLower.includes('refresco') || nameLower.includes('gaseosa') || nameLower.includes('nestea') || nameLower.includes('agua') || nameLower.includes('7up') || nameLower.includes('sprite');
      return !isSoda;
    });
    const initialStatus = requiresKitchen ? 'en_preparacion' : 'preparada';

    console.log(`📝 [COMANDA RECIBIDA] ${orderNumber} (${type.toUpperCase()}) | Cliente: ${customerName || 'N/A'} | Items: ${items?.length || 0} | Total: $${totalUSD} | Requiere Cocina: ${requiresKitchen}`);

    let insertedSuccessfully = false;

    if (usePg) {
      try {
        await query(
          `INSERT INTO orders (id, order_number, type, table_number, customer_name, kitchen_notes, status, payment_status, total_usd, waiter_name, shift)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'no_pagado', $8, 'Mesero', $9)`,
          [orderId, orderNumber, type || 'mesa', tableNumber || null, customerName || null, kitchenNotes || null, initialStatus, totalUSD || 0, shift || 'ambos']
        );

        for (const item of items) {
          const itemId = `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await query(
            `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, sugar_preference, is_takeaway, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              itemId,
              orderId,
              item.productId || 'prod-custom',
              item.productName || 'Producto',
              item.price || 0,
              item.quantity || 1,
              item.size || 'Grande',
              !!item.isHalfHalf,
              JSON.stringify(item.halfDetails || null),
              item.removedIngredients || [],
              JSON.stringify(item.extras || []),
              item.sugarPreference || null,
              !!item.isTakeaway,
              item.notes || '',
            ]
          );
        }
        insertedSuccessfully = true;
      } catch (pgErr) {
        console.error('⚠️ Error al insertar comanda en PostgreSQL, guardando en JSON dbData local:', pgErr.message);
      }
    }

    if (!insertedSuccessfully) {
      if (!dbData.orders) dbData.orders = [];
      if (!dbData.order_items) dbData.order_items = [];

      const newOrd = {
        id: orderId,
        order_number: orderNumber,
        type: type || 'mesa',
        table_number: tableNumber || null,
        customer_name: customerName || null,
        kitchen_notes: kitchenNotes || null,
        status: initialStatus,
        payment_status: 'no_pagado',
        payment_method: null,
        total_usd: totalUSD || 0,
        waiter_name: 'Mesero',
        created_at: new Date().toISOString(),
        shift: shift || 'ambos'
      };
      dbData.orders.unshift(newOrd);

      for (const item of items) {
        const itemId = `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        dbData.order_items.push({
          id: itemId,
          order_id: orderId,
          product_id: item.productId || 'prod-custom',
          product_name: item.productName || 'Producto',
          price: item.price || 0,
          quantity: item.quantity || 1,
          size: item.size || 'Grande',
          is_half_half: !!item.isHalfHalf,
          half_details: item.halfDetails || null,
          removed_ingredients: item.removedIngredients || [],
          extras_json: item.extras || [],
          sugar_preference: item.sugarPreference || null,
          is_takeaway: !!item.isTakeaway,
          notes: item.notes || ''
        });
      }
      saveJsonDb();
    }

    const allOrders = await fetchAllOrders();
    const createdOrder = allOrders.find((o) => o.id === orderId) || {
      id: orderId,
      orderNumber,
      type,
      tableNumber,
      customerName,
      kitchenNotes,
      status: initialStatus,
      paymentStatus: 'no_pagado',
      totalUSD,
      createdAt: new Date().toISOString(),
      items: items || []
    };

    io.emit('order:created', createdOrder);
    io.emit('orders:sync', allOrders);

    console.log(`✅ [COMANDA REGISTRADA OK] ${createdOrder.orderNumber} enviada a WebSocket`);
    res.status(201).json(createdOrder);
  } catch (err) {
    console.error('❌ Error general al crear comanda:', err);
    res.status(500).json({ error: 'Error al crear la comanda en el servidor' });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      await query(
        `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [status, id]
      );
    } else {
      const ord = (dbData.orders || []).find(o => o.id === id);
      if (ord) {
        ord.status = status;
        saveJsonDb();
      }
    }

    const allOrders = await fetchAllOrders();
    const updatedOrder = allOrders.find((o) => o.id === id);

    io.emit('order:status_updated', updatedOrder);
    
    if (status === 'preparada') {
      io.emit('order:prepared_sound', updatedOrder);
    }

    io.emit('orders:sync', allOrders);

    res.json(updatedOrder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar estado de comanda' });
  }
});

// Cancel Order Endpoint with sound alert
app.patch('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      await query(
        `UPDATE orders SET status = 'cancelado', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [id]
      );
    } else {
      const ord = (dbData.orders || []).find(o => o.id === id);
      if (ord) {
        ord.status = 'cancelado';
        saveJsonDb();
      }
    }

    const allOrders = await fetchAllOrders();
    const cancelledOrder = allOrders.find((o) => o.id === id);

    io.emit('order:cancelled', cancelledOrder);
    io.emit('order:cancelled_sound', cancelledOrder);
    io.emit('orders:sync', allOrders);

    console.log(`🚫 [COMANDA CANCELADA] ${cancelledOrder?.orderNumber || id} - Alerta sonora enviada a Cocina`);
    res.json({ success: true, order: cancelledOrder });
  } catch (err) {
    console.error('Error al cancelar comanda:', err);
    res.status(500).json({ error: 'Error al cancelar la comanda' });
  }
});

// Edit Order Endpoint with blue highlight tracking
app.patch('/api/orders/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;
    const { items, kitchenNotes, totalUSD } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (usePg) {
      await query(
        `UPDATE orders SET kitchen_notes = $1, total_usd = $2, is_edited = true, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [kitchenNotes || null, totalUSD || 0, id]
      );

      // Re-insert order items with modified flags
      await query(`DELETE FROM order_items WHERE order_id = $1`, [id]);

      for (const item of items) {
        const itemId = `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await query(
          `INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity, size, is_half_half, half_details, removed_ingredients, extras_json, sugar_preference, is_takeaway, is_new_or_modified, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            itemId,
            id,
            item.productId || 'prod-custom',
            item.productName || 'Producto',
            item.price || 0,
            item.quantity || 1,
            item.size || 'Grande',
            !!item.isHalfHalf,
            JSON.stringify(item.halfDetails || null),
            item.removedIngredients || [],
            JSON.stringify(item.extras || []),
            item.sugarPreference || null,
            !!item.isTakeaway,
            item.isNewOrModified !== false,
            item.notes || '',
          ]
        );
      }
    } else {
      const ord = (dbData.orders || []).find(o => o.id === id);
      if (ord) {
        ord.kitchen_notes = kitchenNotes || null;
        ord.total_usd = totalUSD || 0;
        ord.is_edited = true;
      }
      dbData.order_items = (dbData.order_items || []).filter(it => it.order_id !== id);

      for (const item of items) {
        const itemId = `it-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        dbData.order_items.push({
          id: itemId,
          order_id: id,
          product_id: item.productId || 'prod-custom',
          product_name: item.productName || 'Producto',
          price: item.price || 0,
          quantity: item.quantity || 1,
          size: item.size || 'Grande',
          is_half_half: !!item.isHalfHalf,
          half_details: item.halfDetails || null,
          removed_ingredients: item.removedIngredients || [],
          extras_json: item.extras || [],
          sugar_preference: item.sugarPreference || null,
          is_takeaway: !!item.isTakeaway,
          is_new_or_modified: item.isNewOrModified !== false,
          notes: item.notes || ''
        });
      }
      saveJsonDb();
    }

    const allOrders = await fetchAllOrders();
    const updatedOrder = allOrders.find((o) => o.id === id);

    io.emit('order:edited', updatedOrder);
    io.emit('orders:sync', allOrders);

    console.log(`✏️ [COMANDA EDITADA] ${updatedOrder?.orderNumber} actualizada con resalto visual azul`);
    res.json(updatedOrder);
  } catch (err) {
    console.error('Error al editar comanda:', err);
    res.status(500).json({ error: 'Error al editar la comanda' });
  }
});

// Single Order / Partial / Person-based Payment Endpoint with ACID Transaction
app.post('/api/orders/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      paymentMethod,
      amountUSD,
      amountCOP,
      splitPayments,
      payerName,
      cashTenderedUSD,
      cashTenderedCOP,
      cashTenderedBs,
      changeGivenUSD,
      changeGivenCOP,
      changeGivenBs,
      itemIds,
      shift,
    } = req.body;
    const { usePg, dbData, saveJsonDb, getClient, query } = require('./db');

    if (usePg) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // 1. Lock Order
        const { rows: existingRows } = await client.query(
          `SELECT id, payment_status, order_number, type, total_usd, paid_amount_usd FROM orders WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!existingRows[0]) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(404).json({ error: 'Comanda no encontrada' });
        }

        const order = existingRows[0];
        const currentPaid = parseFloat(order.paid_amount_usd || 0);
        const orderTotal = parseFloat(order.total_usd || 0);

        if (order.payment_status === 'pagado') {
          await client.query('ROLLBACK');
          client.release();
          return res.status(409).json({ error: 'Esta comanda ya fue cobrada totalmente.' });
        }

        // 2. Fetch Exchange Rates
        const { rows: ratesRows } = await client.query(`SELECT cop_rate, bs_rate FROM exchange_rates WHERE id = 1`);
        const currentCopRate = parseFloat(ratesRows[0]?.cop_rate || 3950);
        const currentBsRate = parseFloat(ratesRows[0]?.bs_rate || 36.5);

        const payAmount = parseFloat(amountUSD) || (orderTotal - currentPaid);
        const newPaidAmount = currentPaid + payAmount;
        const isFullyPaid = newPaidAmount >= orderTotal - 0.01;

        const finalMethod = paymentMethod || (splitPayments?.length > 1 ? 'Mixto' : 'Divisas');
        const activePayerName = payerName || 'Cliente General';

        // 3. Update Order
        await client.query(
          `UPDATE orders SET
            payment_status = $1,
            payment_method = $2,
            paid_amount_usd = $3,
            cop_rate_at_payment = $4,
            bs_rate_at_payment = $5,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $6`,
          [isFullyPaid ? 'pagado' : 'no_pagado', finalMethod, newPaidAmount, currentCopRate, currentBsRate, id]
        );

        // 4. Update specific items if paying per person/items
        if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
          await client.query(
            `UPDATE order_items SET is_paid_individually = true, paid_by_name = $1 WHERE id = ANY($2::text[])`,
            [activePayerName, itemIds]
          );
        }

        // 5. Insert audit row in order_payments
        const pmId = `pm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await client.query(
          `INSERT INTO order_payments
            (id, order_id, payer_name, payment_method, amount_paid_usd, cash_tendered_usd, cash_tendered_cop, cash_tendered_bs, change_given_usd, change_given_cop, change_given_bs, item_ids, cop_rate, bs_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            pmId,
            id,
            activePayerName,
            finalMethod,
            payAmount,
            parseFloat(cashTenderedUSD) || 0,
            parseFloat(cashTenderedCOP) || 0,
            parseFloat(cashTenderedBs) || 0,
            parseFloat(changeGivenUSD) || 0,
            parseFloat(changeGivenCOP) || 0,
            parseFloat(changeGivenBs) || 0,
            itemIds || [],
            currentCopRate,
            currentBsRate,
          ]
        );

        // 6. Register Income & Automatic Change Egresses in Caja Chica
        const mainTxId = `tx-in-${Date.now()}`;
        const descriptionText = splitPayments && splitPayments.length > 1
          ? `Cobro Mixto Comanda ${order.order_number} (${activePayerName})`
          : `Cobro Comanda ${order.order_number} (${order.type.toUpperCase()}) - ${activePayerName}`;

        // Cash income registered (independent USD vs COP cash accounting; Bs & transfer methods do not affect USD/COP cash)
        let incomeUSD = 0;
        let incomeCOP = 0;
        if (finalMethod === 'Divisas') {
          incomeUSD = cashTenderedUSD > 0 ? parseFloat(cashTenderedUSD) : payAmount;
        } else if (finalMethod === 'COP') {
          incomeCOP = cashTenderedCOP > 0 ? parseFloat(cashTenderedCOP) : (parseFloat(amountCOP) || Math.round(payAmount * currentCopRate));
        } else if (finalMethod === 'Mixto') {
          incomeUSD = parseFloat(cashTenderedUSD) || 0;
          incomeCOP = parseFloat(cashTenderedCOP) || 0;
        }

        await client.query(
          `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, payment_method, description, order_id, shift)
           VALUES ($1, 'ingreso', $2, $3, $4, $5, $6, $7)`,
          [mainTxId, incomeUSD, incomeCOP, finalMethod, descriptionText, id, shift || 'ambos']
        );

        // Automatic egress for USD change given
        if (parseFloat(changeGivenUSD) > 0) {
          const changeUsdTxId = `tx-out-usd-${Date.now()}`;
          await client.query(
            `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, payment_method, description, order_id, shift)
             VALUES ($1, 'egreso', $2, 0, 'Divisas', $3, $4, $5)`,
            [changeUsdTxId, parseFloat(changeGivenUSD), `Vuelto entregado en USD - Comanda ${order.order_number} (${activePayerName})`, id, shift || 'ambos']
          );
        }

        // Automatic egress for COP change given
        if (parseFloat(changeGivenCOP) > 0) {
          const changeCopTxId = `tx-out-cop-${Date.now()}`;
          await client.query(
            `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, payment_method, description, order_id, shift)
             VALUES ($1, 'egreso', 0, $2, 'COP', $3, $4, $5)`,
            [changeCopTxId, parseFloat(changeGivenCOP), `Vuelto entregado en COP - Comanda ${order.order_number} (${activePayerName})`, id, shift || 'ambos']
          );
        }

        // Automatic egress for Bs change given
        if (parseFloat(changeGivenBs) > 0) {
          const changeBsTxId = `tx-out-bs-${Date.now()}`;
          await client.query(
            `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, payment_method, description, order_id, shift)
             VALUES ($1, 'egreso', 0, 0, 'Bs', $2, $3, $4)`,
            [changeBsTxId, `Vuelto entregado en Bs - Comanda ${order.order_number} (${activePayerName})`, id, shift || 'ambos']
          );
        }

        await client.query('COMMIT');
        client.release();
      } catch (txErr) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch(e){}
          client.release();
        }
        throw txErr;
      }
    } else {
      // JSON DB Fallback
      const ord = (dbData.orders || []).find((o) => o.id === id);
      if (ord) {
        const currentPaid = parseFloat(ord.paid_amount_usd || 0);
        const orderTotal = parseFloat(ord.total_usd || 0);
        if (ord.payment_status === 'pagado') {
          return res.status(409).json({ error: 'Esta comanda ya fue cobrada previamente.' });
        }
        const payAmount = parseFloat(amountUSD) || (orderTotal - currentPaid);
        const newPaidAmount = currentPaid + payAmount;
        const isFullyPaid = newPaidAmount >= orderTotal - 0.01;
        const finalMethod = paymentMethod || (splitPayments?.length > 1 ? 'Mixto' : 'Divisas');
        const activePayerName = payerName || 'Cliente General';

        ord.payment_status = isFullyPaid ? 'pagado' : 'no_pagado';
        ord.payment_method = finalMethod;
        ord.paid_amount_usd = newPaidAmount;
        ord.cop_rate_at_payment = dbData.exchange_rates?.cop_rate || 3950;
        ord.bs_rate_at_payment = dbData.exchange_rates?.bs_rate || 36.5;

        if (!dbData.order_payments) dbData.order_payments = [];
        dbData.order_payments.push({
          id: `pm-${Date.now()}`,
          order_id: id,
          payer_name: activePayerName,
          payment_method: finalMethod,
          amount_paid_usd: payAmount,
          cash_tendered_usd: parseFloat(cashTenderedUSD) || 0,
          cash_tendered_cop: parseFloat(cashTenderedCOP) || 0,
          cash_tendered_bs: parseFloat(cashTenderedBs) || 0,
          change_given_usd: parseFloat(changeGivenUSD) || 0,
          change_given_cop: parseFloat(changeGivenCOP) || 0,
          change_given_bs: parseFloat(changeGivenBs) || 0,
          item_ids: itemIds || [],
          created_at: new Date().toISOString(),
        });

        if (itemIds && Array.isArray(itemIds)) {
          (dbData.order_items || []).forEach((it) => {
            if (itemIds.includes(it.id)) {
              it.is_paid_individually = true;
              it.paid_by_name = activePayerName;
            }
          });
        }

        let incomeUSD = 0;
        let incomeCOP = 0;
        if (finalMethod === 'Divisas') {
          incomeUSD = cashTenderedUSD > 0 ? parseFloat(cashTenderedUSD) : payAmount;
        } else if (finalMethod === 'COP') {
          incomeCOP = cashTenderedCOP > 0 ? parseFloat(cashTenderedCOP) : (parseFloat(amountCOP) || Math.round(payAmount * 3950));
        } else if (finalMethod === 'Mixto') {
          incomeUSD = parseFloat(cashTenderedUSD) || 0;
          incomeCOP = parseFloat(cashTenderedCOP) || 0;
        }

        if (!dbData.caja_transactions) dbData.caja_transactions = [];
        dbData.caja_transactions.unshift({
          id: `tx-${Date.now()}`,
          type: 'ingreso',
          amount_usd: incomeUSD,
          amount_cop: incomeCOP,
          payment_method: finalMethod,
          description: `Cobro Comanda ${ord.order_number} (${activePayerName})`,
          order_id: id,
          shift: shift || 'ambos',
          timestamp: new Date().toISOString(),
        });

        if (parseFloat(changeGivenUSD) > 0) {
          dbData.caja_transactions.unshift({
            id: `tx-out-usd-${Date.now()}`,
            type: 'egreso',
            amount_usd: parseFloat(changeGivenUSD),
            amount_cop: 0,
            payment_method: 'Divisas',
            description: `Vuelto entregado en USD - Comanda ${ord.order_number} (${activePayerName})`,
            order_id: id,
            shift: shift || 'ambos',
            timestamp: new Date().toISOString(),
          });
        }
        if (parseFloat(changeGivenCOP) > 0) {
          dbData.caja_transactions.unshift({
            id: `tx-out-cop-${Date.now()}`,
            type: 'egreso',
            amount_usd: 0,
            amount_cop: parseFloat(changeGivenCOP),
            payment_method: 'COP',
            description: `Vuelto entregado en COP - Comanda ${ord.order_number} (${activePayerName})`,
            order_id: id,
            shift: shift || 'ambos',
            timestamp: new Date().toISOString(),
          });
        }
        if (parseFloat(changeGivenBs) > 0) {
          dbData.caja_transactions.unshift({
            id: `tx-out-bs-${Date.now()}`,
            type: 'egreso',
            amount_usd: 0,
            amount_cop: 0,
            payment_method: 'Bs',
            description: `Vuelto entregado en Bs - Comanda ${ord.order_number} (${activePayerName})`,
            order_id: id,
            shift: shift || 'ambos',
            timestamp: new Date().toISOString(),
          });
        }

        saveJsonDb();
      }
    }

    const allOrders = await fetchAllOrders();
    const updatedOrder = allOrders.find((o) => o.id === id);

    io.emit('order:paid', updatedOrder);
    io.emit('orders:sync', allOrders);
    io.emit('caja:updated');

    res.json(updatedOrder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar cobro de comanda' });
  }
});

// Endpoint for Merging Multiple Orders of the Same Table / Customer
app.post('/api/orders/merge', async (req, res) => {
  try {
    const { targetOrderId, sourceOrderIds } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    if (!targetOrderId || !sourceOrderIds || !Array.isArray(sourceOrderIds) || sourceOrderIds.length === 0) {
      return res.status(400).json({ error: 'Debe especificar la comanda principal y las comandas a fusionar.' });
    }

    let mergedOrderNumber = '';
    const allOrders = await fetchAllOrders();
    const targetOrder = allOrders.find((o) => o.id === targetOrderId);
    if (!targetOrder) {
      return res.status(404).json({ error: 'Comanda principal no encontrada.' });
    }

    const sourceOrders = allOrders.filter((o) => sourceOrderIds.includes(o.id));
    mergedOrderNumber = targetOrder.orderNumber;
    const sourceNumbers = sourceOrders.map((o) => o.orderNumber).join(', ');

    if (usePg) {
      // 1. Move items from source orders to target order
      await query(`UPDATE order_items SET order_id = $1 WHERE order_id = ANY($2::text[])`, [targetOrderId, sourceOrderIds]);

      // 2. Recalculate target total
      const { rows: itemSum } = await query(`SELECT SUM(price * quantity) as new_total FROM order_items WHERE order_id = $1`, [targetOrderId]);
      const newTotalUSD = parseFloat(itemSum[0]?.new_total || targetOrder.totalUSD);

      // 3. Update target order notes & total
      const updatedNotes = `${targetOrder.kitchenNotes || ''} (Fusionada con comandas ${sourceNumbers})`.trim();
      await query(
        `UPDATE orders SET total_usd = $1, kitchen_notes = $2, merged_from_orders = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [newTotalUSD, updatedNotes, sourceOrders.map((o) => o.orderNumber), targetOrderId]
      );

      // 4. Mark source orders as merged/cancelled
      await query(
        `UPDATE orders SET status = 'fusionada', kitchen_notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2::text[])`,
        [`Fusionada en Comanda ${targetOrder.orderNumber}`, sourceOrderIds]
      );
    } else {
      // JSON DB Fallback
      let newTotal = 0;
      (dbData.order_items || []).forEach((it) => {
        if (sourceOrderIds.includes(it.order_id)) {
          it.order_id = targetOrderId;
        }
        if (it.order_id === targetOrderId) {
          newTotal += (parseFloat(it.price) || 0) * (parseInt(it.quantity) || 1);
        }
      });

      const tOrd = (dbData.orders || []).find((o) => o.id === targetOrderId);
      if (tOrd) {
        tOrd.total_usd = newTotal;
        tOrd.kitchen_notes = `${tOrd.kitchen_notes || ''} (Fusionada con comandas ${sourceNumbers})`.trim();
        tOrd.merged_from_orders = sourceOrders.map((o) => o.order_number);
      }

      (dbData.orders || []).forEach((o) => {
        if (sourceOrderIds.includes(o.id)) {
          o.status = 'fusionada';
          o.kitchen_notes = `Fusionada en Comanda ${targetOrder.orderNumber}`;
        }
      });

      saveJsonDb();
    }

    const updatedOrdersList = await fetchAllOrders();
    const updatedTarget = updatedOrdersList.find((o) => o.id === targetOrderId);

    io.emit('orders:sync', updatedOrdersList);
    io.emit('order:status_updated', updatedTarget);

    console.log(`🔗 [FUSIÓN DE COMANDAS] Comandas ${sourceNumbers} unificadas en Comanda ${mergedOrderNumber}`);
    res.json({ success: true, mergedOrder: updatedTarget });
  } catch (err) {
    console.error('Error al fusionar comandas:', err);
    res.status(500).json({ error: 'Error interno al unificar las comandas.' });
  }
});


// Multi-Order Payment Endpoint for same table
app.post('/api/orders/pay-multiple', async (req, res) => {
  try {
    const { orderIds, paymentMethod, totalUSD, totalCOP, splitPayments, shift } = req.body;
    const { usePg, dbData, saveJsonDb, getClient } = require('./db');

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Se deben proporcionar IDs de comandas' });
    }

    if (usePg) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const { rows: ratesRows } = await client.query(`SELECT cop_rate, bs_rate FROM exchange_rates WHERE id = 1`);
        const currentCopRate = parseFloat(ratesRows[0]?.cop_rate || 3950);
        const currentBsRate = parseFloat(ratesRows[0]?.bs_rate || 36.5);

        const finalMethod = paymentMethod || (splitPayments?.length > 1 ? 'Mixto' : 'Divisas');

        for (const orderId of orderIds) {
          await client.query(
            `UPDATE orders SET payment_status = 'pagado', payment_method = $1, cop_rate_at_payment = $2, bs_rate_at_payment = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
            [finalMethod, currentCopRate, currentBsRate, orderId]
          );
        }

        const transId = `tx-${Date.now()}`;
        const desc = `Cobro Unificado de ${orderIds.length} Comandas en Mesa (${finalMethod})`;

        await client.query(
          `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, payment_method, description, order_id, shift)
           VALUES ($1, 'ingreso', $2, $3, $4, $5, $6, $7)`,
          [transId, totalUSD || 0, totalCOP || 0, finalMethod, desc, orderIds[0], shift || 'ambos']
        );

        await client.query('COMMIT');
        client.release();
      } catch (txErr) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch (e) {}
          client.release();
        }
        throw txErr;
      }
    } else {
      const finalMethod = paymentMethod || (splitPayments?.length > 1 ? 'Mixto' : 'Divisas');
      for (const orderId of orderIds) {
        const ord = (dbData.orders || []).find(o => o.id === orderId);
        if (ord) {
          ord.payment_status = 'pagado';
          ord.payment_method = finalMethod;
        }
      }
      if (!dbData.caja_transactions) dbData.caja_transactions = [];
      dbData.caja_transactions.unshift({
        id: `tx-${Date.now()}`,
        type: 'ingreso',
        amount_usd: totalUSD || 0,
        amount_cop: totalCOP || 0,
        payment_method: finalMethod,
        description: `Cobro Unificado de ${orderIds.length} Comandas en Mesa (${finalMethod})`,
        order_id: orderIds[0],
        shift: shift || 'ambos',
        timestamp: new Date().toISOString()
      });
      saveJsonDb();
    }

    const allOrders = await fetchAllOrders();

    io.emit('orders:paid_multiple', { orderIds });
    io.emit('orders:sync', allOrders);
    io.emit('caja:updated');

    console.log(`💳 [COBRO MULTI-COMANDA OK] ${orderIds.length} comandas cobradas en lote`);
    res.json({ success: true, count: orderIds.length });
  } catch (err) {
    console.error('Error al realizar cobro agrupado:', err);
    res.status(500).json({ error: 'Error al procesar el cobro múltiple de comandas' });
  }
});


// Caja Chica (Apertura, Transacciones y Cierre / Reporte)
app.get('/api/caja-chica', async (req, res) => {
  try {
    const { usePg, dbData, query } = require('./db');
    if (usePg) {
      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura ORDER BY timestamp DESC LIMIT 1`
      );
      const { rows: txRows } = await query(
        `SELECT * FROM caja_chica_transactions ORDER BY timestamp DESC`
      );
      const { rows: cierreRows } = await query(
        `SELECT * FROM caja_chica_cierres ORDER BY closed_at DESC LIMIT 5`
      );

      return res.json({
        apertura: aperturaRows[0] ? {
          usdCash: parseFloat(aperturaRows[0].usd_cash),
          copCash: parseFloat(aperturaRows[0].cop_cash),
          openedAt: aperturaRows[0].timestamp,
        } : { usdCash: 0, copCash: 0 },
        transacciones: txRows.map((t) => ({
          id: t.id,
          type: t.type,
          amountUSD: parseFloat(t.amount_usd),
          amountCOP: parseFloat(t.amount_cop),
          paymentMethod: t.payment_method,
          description: t.description,
          timestamp: t.timestamp,
        })),
        ultimoCierre: cierreRows[0] || null,
      });
    }

    const ap = dbData.caja_apertura || { usdCash: 0, copCash: 0 };
    const txs = (dbData.caja_transactions || []).map(t => ({ id: t.id, type: t.type, amountUSD: parseFloat(t.amount_usd || 0), amountCOP: parseFloat(t.amount_cop || 0), paymentMethod: t.payment_method, description: t.description, timestamp: t.timestamp }));
    const cierres = dbData.caja_cierres || [];

    res.json({
      apertura: ap,
      transacciones: txs,
      ultimoCierre: cierres[0] || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar Caja Chica' });
  }
});

app.post('/api/caja-chica/apertura', async (req, res) => {
  try {
    const { usdCash, copCash, shift } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');
    const apId = `ap-${Date.now()}`;

    if (usePg) {
      await query(
        `INSERT INTO caja_chica_apertura (id, usd_cash, cop_cash, shift) VALUES ($1, $2, $3, $4)`,
        [apId, usdCash || 0, copCash || 0, shift || 'ambos']
      );
    } else {
      dbData.caja_apertura = { usdCash: parseFloat(usdCash) || 0, copCash: parseFloat(copCash) || 0, openedAt: new Date().toISOString(), shift: shift || 'ambos' };
      saveJsonDb();
    }

    io.emit('caja:updated');
    res.status(201).json({ success: true, usdCash, copCash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al aperturar caja' });
  }
});

app.post('/api/caja-chica/transaction', async (req, res) => {
  try {
    const { type, amountUSD, amountCOP, paymentMethod, description, shift } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');
    const txId = `tx-${Date.now()}`;

    if (usePg) {
      await query(
        `INSERT INTO caja_chica_transactions (id, type, amount_usd, amount_cop, payment_method, description, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [txId, type || 'egreso', amountUSD || 0, amountCOP || 0, paymentMethod || 'Divisas', description || 'Movimiento manual', shift || 'ambos']
      );
    } else {
      if (!dbData.caja_transactions) dbData.caja_transactions = [];
      dbData.caja_transactions.unshift({
        id: txId,
        type: type || 'egreso',
        amount_usd: parseFloat(amountUSD) || 0,
        amount_cop: parseFloat(amountCOP) || 0,
        payment_method: paymentMethod || 'Divisas',
        description: description || 'Movimiento manual',
        timestamp: new Date().toISOString(),
        shift: shift || 'ambos'
      });
      saveJsonDb();
    }

    io.emit('caja:updated');
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar movimiento' });
  }
});

// Cierre de Caja Chica & Arqueo
app.post('/api/caja-chica/cierre', async (req, res) => {
  try {
    const { actualUSD, actualCOP, notes, closedBy, shift } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');

    let openedUSD = 0;
    let openedCOP = 0;
    let openedAt = null;
    let totalIngresos = 0;
    let totalEgresos = 0;

    if (usePg) {
      // NOTE: We should filter the last apertura and txs by shift ideally, but let's just make sure we save the shift for now
      const { rows: aperturaRows } = await query(
        `SELECT * FROM caja_chica_apertura WHERE shift = $1 ORDER BY timestamp DESC LIMIT 1`, [shift || 'ambos']
      );
      openedUSD = aperturaRows[0] ? parseFloat(aperturaRows[0].usd_cash) : 0;
      openedCOP = aperturaRows[0] ? parseFloat(aperturaRows[0].cop_cash) : 0;
      openedAt = aperturaRows[0] ? aperturaRows[0].timestamp : null;

      let txQuery = `SELECT * FROM caja_chica_transactions WHERE shift = $1`;
      let queryParams = [shift || 'ambos'];
      if (openedAt) {
        txQuery += ` AND timestamp >= $2`;
        queryParams.push(openedAt);
      }
      const { rows: txRows } = await query(txQuery, queryParams);
      totalIngresos = txRows.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + parseFloat(t.amount_usd), 0);
      totalEgresos = txRows.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + parseFloat(t.amount_usd), 0);
    } else {
      // JSON DB doesn't support multiple aperturas easily right now, but we just save the shift
      const ap = dbData.caja_apertura || { usdCash: 0, copCash: 0 };
      openedUSD = parseFloat(ap.usdCash) || 0;
      openedCOP = parseFloat(ap.copCash) || 0;
      openedAt = ap.openedAt || null;

      let txs = dbData.caja_transactions || [];
      if (openedAt) {
        const openedTime = new Date(openedAt).getTime();
        txs = txs.filter(t => new Date(t.timestamp).getTime() >= openedTime && t.shift === shift);
      }
      totalIngresos = txs.filter((t) => t.type === 'ingreso').reduce((sum, t) => sum + parseFloat(t.amount_usd || 0), 0);
      totalEgresos = txs.filter((t) => t.type === 'egreso').reduce((sum, t) => sum + parseFloat(t.amount_usd || 0), 0);
    }

    const expectedUSD = openedUSD + totalIngresos - totalEgresos;
    const diffUSD = (actualUSD || 0) - expectedUSD;
    const cierreId = `cierre-${Date.now()}`;

    if (usePg) {
      await query(
        `INSERT INTO caja_chica_cierres (id, opened_usd, opened_cop, total_sales_usd, expected_usd, actual_usd, actual_cop, difference_usd, closed_by, notes, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          cierreId,
          openedUSD,
          openedCOP,
          totalIngresos,
          expectedUSD,
          actualUSD || 0,
          actualCOP || 0,
          diffUSD,
          closedBy || 'Caja',
          notes || 'Cierre de turno realizado',
          shift || 'ambos'
        ]
      );
    } else {
      if (!dbData.caja_cierres) dbData.caja_cierres = [];
      dbData.caja_cierres.unshift({
        id: cierreId,
        opened_usd: openedUSD,
        opened_cop: openedCOP,
        total_sales_usd: totalIngresos,
        expected_usd: expectedUSD,
        actual_usd: actualUSD || 0,
        actual_cop: actualCOP || 0,
        difference_usd: diffUSD,
        closed_at: new Date().toISOString(),
        closed_by: closedBy || 'Caja',
        notes: notes || 'Cierre de turno realizado',
        shift: shift || 'ambos'
      });
      saveJsonDb();
    }

    io.emit('caja:updated');
    res.json({
      success: true,
      summary: {
        openedUSD,
        totalIngresos,
        totalEgresos,
        expectedUSD,
        actualUSD: actualUSD || 0,
        differenceUSD: diffUSD,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al realizar cierre de caja' });
  }
});

// Reporte de Arqueo y Cierre Diario
app.get('/api/caja-chica/reporte-diario', async (req, res) => {
  try {
    const { usePg, dbData, query } = require('./db');
    const orders = await fetchAllOrders();
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');

    const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);

    const byMethod = {
      Divisas: paidOrders.filter((o) => o.paymentMethod === 'Divisas').reduce((sum, o) => sum + o.totalUSD, 0),
      COP: paidOrders.filter((o) => o.paymentMethod === 'COP').reduce((sum, o) => sum + o.totalUSD, 0),
      Bs: paidOrders.filter((o) => o.paymentMethod === 'Bs').reduce((sum, o) => sum + o.totalUSD, 0),
      Binance: paidOrders.filter((o) => o.paymentMethod === 'Binance').reduce((sum, o) => sum + o.totalUSD, 0),
    };

    let historyCierres = [];
    if (usePg) {
      const { rows: cierreRows } = await query(`SELECT * FROM caja_chica_cierres ORDER BY closed_at DESC`);
      historyCierres = cierreRows;
    } else {
      historyCierres = dbData.caja_cierres || [];
    }

    res.json({
      totalSalesUSD: totalUSD,
      totalOrdersPaid: paidOrders.length,
      pendingOrders: orders.filter((o) => o.paymentStatus === 'no_pagado').length,
      byPaymentMethod: byMethod,
      historyCierres,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte diario' });
  }
});

// Tasas de cambio
app.get('/api/rates', async (req, res) => {
  try {
    const { usePg, dbData, query } = require('./db');
    if (usePg) {
      const { rows } = await query(`SELECT * FROM exchange_rates WHERE id = 1`);
      return res.json({
        COP: parseFloat(rows[0]?.cop_rate || 3950),
        Bs: parseFloat(rows[0]?.bs_rate || 36.50),
      });
    }
    const rates = dbData.exchange_rates || { cop_rate: 3950, bs_rate: 36.50 };
    res.json({
      COP: parseFloat(rates.cop_rate || 3950),
      Bs: parseFloat(rates.bs_rate || 36.50),
    });
  } catch (err) {
    res.json({ COP: 3950, Bs: 36.50 });
  }
});

app.post('/api/rates', async (req, res) => {
  try {
    const { COP, Bs } = req.body;
    const { usePg, dbData, saveJsonDb, query } = require('./db');
    if (usePg) {
      await query(
        `UPDATE exchange_rates SET cop_rate = $1, bs_rate = $2 WHERE id = 1`,
        [COP, Bs]
      );
    } else {
      dbData.exchange_rates = { cop_rate: parseFloat(COP), bs_rate: parseFloat(Bs) };
      saveJsonDb();
    }
    io.emit('rates:updated', { COP, Bs });
    res.json({ success: true, COP, Bs });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar tasas' });
  }
});

// Agente Inteligente de Texto para la Caja
app.post('/api/caja/ai-chat', async (req, res) => {
  try {
    const { message } = req.body;
    const lower = (message || '').toLowerCase();
    const orders = await fetchAllOrders();
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');

    let reply = 'Consulta procesada en Basilico.';

    if (lower.includes('pizza') || lower.includes('vendida') || lower.includes('top')) {
      const tally = {};
      paidOrders.forEach((o) => {
        o.items.forEach((it) => {
          tally[it.productName] = (tally[it.productName] || 0) + it.quantity;
        });
      });
      const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      if (entries.length === 0) {
        reply = '🍕 No hay registros de pizzas vendidas cobradas el día de hoy.';
      } else {
        reply = `🍕 Pizzas & Ítems Cobrados Hoy:\n` + entries.map(([name, qty]) => `• ${name}: ${qty} unidades`).join('\n');
      }
    } else if (lower.includes('bebida') || lower.includes('refresco') || lower.includes('tomar')) {
      let drinkQty = 0;
      paidOrders.forEach((o) => {
        o.items.forEach((it) => {
          if (it.productName.toLowerCase().includes('coca') || it.productName.toLowerCase().includes('agua') || it.productName.toLowerCase().includes('cerveza') || it.productName.toLowerCase().includes('jugo')) {
            drinkQty += it.quantity;
          }
        });
      });
      reply = `🥤 Total de Bebidas Cobradas hoy: ${drinkQty} unidades.`;
    } else if (lower.includes('caja') || lower.includes('cuadro') || lower.includes('resumen') || lower.includes('cierre')) {
      const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);
      const pendingCount = orders.filter((o) => o.paymentStatus === 'no_pagado').length;
      reply = `💰 Resumen de Caja & Cierre:\n• Recaudado Total: $${totalUSD.toFixed(2)} USD\n• Comandas Cobradas: ${paidOrders.length}\n• Comandas Pendientes: ${pendingCount}`;
    } else {
      const totalUSD = paidOrders.reduce((sum, o) => sum + o.totalUSD, 0);
      reply = `🤖 Asistente de Caja: Hay ${orders.length} comandas registradas (${paidOrders.length} cobradas) por un total de $${totalUSD.toFixed(2)} USD.`;
    }

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en asistente de caja' });
  }
});

// Servir archivos estáticos del frontend React (build) en producción
const buildDir = path.join(__dirname, '../build');
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n============================================================`);
    console.log(`⚡ El servidor Backend de Basilico YA ESTÁ ACTIVO en http://localhost:${PORT}`);
    console.log(`✨ Conexión establecida con la instancia existente sin conflictos.`);
    console.log(`============================================================\n`);
  } else {
    console.error('Error en el servidor backend:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend Basilico corriendo en http://localhost:${PORT} y accesible en LAN`);
});
