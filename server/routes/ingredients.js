const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllIngredients, fetchAllProducts } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');

module.exports = function(io) {
  router.get('/', async (req, res) => {
    try {
      const ingredients = await fetchAllIngredients();
      res.json(ingredients);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener ingredientes' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const { name, priceUSD, isBaseForPizza, isExtraForPizza, category, available, shift } = req.body;
      const id = `ing-${Date.now()}`;

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

      const allIngredients = await fetchAllIngredients();
      io.emit('ingredients:sync', allIngredients);
      res.status(201).json(allIngredients.find((i) => i.name === name));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al guardar ingrediente' });
    }
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, category, priceUSD, isBaseForPizza, isExtraForPizza, available, shift } = req.body;

      let oldName = null;
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

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM ingredients WHERE id = $1`, [id]);
      
      const allIngredients = await fetchAllIngredients();
      io.emit('ingredients:sync', allIngredients);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar ingrediente' });
    }
  });

  return router;
};
