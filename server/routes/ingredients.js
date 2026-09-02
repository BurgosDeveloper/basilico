const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllIngredients, fetchAllProducts } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');

module.exports = function(io) {
  router.get('/', async (req, res) => {
    try {
      const ingredients = await fetchAllIngredients(req.user, req.query.shift);
      res.json(ingredients);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener ingredientes' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const {
        name,
        priceUSD,
        priceGrandeCompleta,
        priceGrandeMitad,
        pricePequenaCompleta,
        pricePequenaMitad,
        isBaseForPizza,
        isExtraForPizza,
        category,
        available,
        shift
      } = req.body;
      const id = `ing-${Date.now()}`;
      const targetShift = (shift === 'manana' || shift === 'noche') ? shift : (req.user?.shift === 'manana' ? 'manana' : 'noche');

      const pGrandeComp = priceGrandeCompleta !== undefined ? (parseFloat(priceGrandeCompleta) || 0) : (parseFloat(priceUSD) || 0);
      const pGrandeMit = priceGrandeMitad !== undefined ? (parseFloat(priceGrandeMitad) || 0) : (pGrandeComp > 0 ? pGrandeComp / 2 : 0);
      const pPequenaComp = pricePequenaCompleta !== undefined ? (parseFloat(pricePequenaCompleta) || 0) : (pGrandeComp > 0 ? pGrandeComp / 2 : 0);
      const pPequenaMit = pricePequenaMitad !== undefined ? (parseFloat(pricePequenaMitad) || 0) : (pPequenaComp > 0 ? pPequenaComp / 2 : 0);

      await query(
        `INSERT INTO ingredients (id, name, price_usd, price_grande_completa, price_grande_mitad, price_pequena_completa, price_pequena_mitad, is_base_for_pizza, is_extra_for_pizza, category, available, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          name,
          pGrandeComp,
          pGrandeComp,
          pGrandeMit,
          pPequenaComp,
          pPequenaMit,
          isBaseForPizza !== false,
          isExtraForPizza !== false,
          category || 'Ingredientes',
          available !== false,
          targetShift
        ]
      );

      const morningIngredients = await fetchAllIngredients(null, 'manana');
      const nightIngredients = await fetchAllIngredients(null, 'noche');
      const allIngredients = await fetchAllIngredients(null, 'ambos');
      io.to('shift:manana').emit('ingredients:sync', morningIngredients);
      io.to('shift:noche').emit('ingredients:sync', nightIngredients);
      io.to('shift:ambos').emit('ingredients:sync', allIngredients);

      const targetList = targetShift === 'manana' ? morningIngredients : nightIngredients;
      res.status(201).json(targetList.find((i) => i.name === name) || { id, name });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al guardar ingrediente' });
    }
  });

  router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        category,
        priceUSD,
        priceGrandeCompleta,
        priceGrandeMitad,
        pricePequenaCompleta,
        pricePequenaMitad,
        isBaseForPizza,
        isExtraForPizza,
        available,
        shift
      } = req.body;
      const targetShift = (shift === 'manana' || shift === 'noche') ? shift : (req.user?.shift === 'manana' ? 'manana' : 'noche');

      const pGrandeComp = priceGrandeCompleta !== undefined ? (parseFloat(priceGrandeCompleta) || 0) : (parseFloat(priceUSD) || 0);
      const pGrandeMit = priceGrandeMitad !== undefined ? (parseFloat(priceGrandeMitad) || 0) : (pGrandeComp > 0 ? pGrandeComp / 2 : 0);
      const pPequenaComp = pricePequenaCompleta !== undefined ? (parseFloat(pricePequenaCompleta) || 0) : (pGrandeComp > 0 ? pGrandeComp / 2 : 0);
      const pPequenaMit = pricePequenaMitad !== undefined ? (parseFloat(pricePequenaMitad) || 0) : (pPequenaComp > 0 ? pPequenaComp / 2 : 0);

      let oldName = null;
      const { rows } = await query(`SELECT name FROM ingredients WHERE id = $1`, [id]);
      if (rows.length > 0) oldName = rows[0].name;

      await query(
        `UPDATE ingredients 
         SET name = $1, category = $2, price_usd = $3, 
             price_grande_completa = $4, price_grande_mitad = $5,
             price_pequena_completa = $6, price_pequena_mitad = $7,
             is_base_for_pizza = $8, is_extra_for_pizza = $9, available = $10, shift = $11
         WHERE id = $12`,
        [
          name, 
          category || 'Ingredientes', 
          pGrandeComp, 
          pGrandeComp,
          pGrandeMit,
          pPequenaComp,
          pPequenaMit,
          isBaseForPizza !== false, 
          isExtraForPizza !== false, 
          available !== false, 
          targetShift,
          id
        ]
      );

      if (oldName && oldName !== name) {
        await query(
          `UPDATE products 
           SET base_ingredients = array_replace(base_ingredients, $1, $2) 
           WHERE $1 = ANY(base_ingredients) AND shift = $3`,
          [oldName, name, targetShift]
        );
      }

      const morningIngredients = await fetchAllIngredients(null, 'manana');
      const nightIngredients = await fetchAllIngredients(null, 'noche');
      const allIngredients = await fetchAllIngredients(null, 'ambos');
      io.to('shift:manana').emit('ingredients:sync', morningIngredients);
      io.to('shift:noche').emit('ingredients:sync', nightIngredients);
      io.to('shift:ambos').emit('ingredients:sync', allIngredients);

      if (oldName && oldName !== name) {
        const morningProducts = await fetchAllProducts(null, 'manana');
        const nightProducts = await fetchAllProducts(null, 'noche');
        const allProducts = await fetchAllProducts(null, 'ambos');
        io.to('shift:manana').emit('products:sync', morningProducts);
        io.to('shift:noche').emit('products:sync', nightProducts);
        io.to('shift:ambos').emit('products:sync', allProducts);
      }

      const targetList = targetShift === 'manana' ? morningIngredients : nightIngredients;
      res.json(targetList.find((i) => i.id === id) || { success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar ingrediente' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM ingredients WHERE id = $1`, [id]);
      
      const morningIngredients = await fetchAllIngredients(null, 'manana');
      const nightIngredients = await fetchAllIngredients(null, 'noche');
      const allIngredients = await fetchAllIngredients(null, 'ambos');
      io.to('shift:manana').emit('ingredients:sync', morningIngredients);
      io.to('shift:noche').emit('ingredients:sync', nightIngredients);
      io.to('shift:ambos').emit('ingredients:sync', allIngredients);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar ingrediente' });
    }
  });

  return router;
};
