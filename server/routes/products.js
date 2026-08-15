const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllProducts } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');

module.exports = function(io) {
  router.get('/', async (req, res) => {
    try {
      const products = await fetchAllProducts();
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener productos' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const { id: inputId, name, category, drinkType, price, priceSmall, description, image, badge, baseIngredients, shift } = req.body;
      const id = inputId || `prod-${Date.now()}`;

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

      const allProducts = await fetchAllProducts();
      io.emit('products:sync', allProducts);
      res.status(201).json(allProducts.find((p) => p.id === id));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al crear o actualizar producto' });
    }
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, category, drinkType, price, priceSmall, description, image, badge, baseIngredients, shift } = req.body;

      await query(
        `UPDATE products SET name = $1, category = $2, drink_type = $3, price = $4, price_small = $5, description = $6, image = $7, badge = $8, base_ingredients = $9, shift = $10 WHERE id = $11`,
        [name, category, drinkType || null, price || 0, priceSmall || null, description || '', image || '', badge || null, baseIngredients || [], shift || 'ambos', id]
      );

      const allProducts = await fetchAllProducts();
      io.emit('products:sync', allProducts);
      res.json(allProducts.find((p) => p.id === id) || { success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar producto' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM products WHERE id = $1`, [id]);
      const allProducts = await fetchAllProducts();
      io.emit('products:sync', allProducts);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar producto' });
    }
  });

  return router;
};
