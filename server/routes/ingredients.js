const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { fetchAllIngredients, fetchAllProducts } = require('../helpers/fetchAll');
const { requireRole } = require('../helpers/sessionAuth');
const { syncIngredients, syncProducts } = require('../helpers/shiftSync');

module.exports = function(io) {
  router.get('/', async (req, res) => {
    try {
      const ingredients = await fetchAllIngredients(req.user);
      res.json(ingredients);
    } catch (err) {
      res.status(500).json({ error: 'Error al obtener ingredientes' });
    }
  });

  router.post('/', requireRole('admin'), async (req, res) => {
    try {
      const {
        name,
        ingredientType,
        priceUSD,
        priceGrandeCompleta,
        priceGrandeMitad,
        pricePequenaCompleta,
        pricePequenaMitad,
        isBase,
        isExtra,
        category,
        available,
        shift,
      } = req.body;
      const id = `ing-${Date.now()}`;
      const upperName = (name || '').trim().toUpperCase();
      const finalType = ingredientType || (category === 'Salsas' ? 'salsa' : (category === 'Gratis' ? 'gratis' : (category === 'Adicionales' ? 'adicional' : (isBase ? 'base' : 'adicional'))));
      const parsedPriceUSD = priceUSD !== undefined ? (parseFloat(priceUSD) || 0) : (parseFloat(priceGrandeCompleta) || 0);
      const finalPrice = (finalType === 'gratis' || finalType === 'base') ? 0 : parsedPriceUSD;
      const finalIsBase = finalType === 'base' || finalType === 'proteina' || isBase === true;
      const finalIsExtra = finalType === 'adicional' || finalType === 'gratis' || finalType === 'salsa' || isExtra === true;
      const finalCategory = category || (finalType === 'salsa' ? 'Salsas' : (finalType === 'gratis' ? 'Gratis' : (finalType === 'proteina' ? 'Proteínas' : (finalType === 'base' ? 'Ingredientes Base' : 'Adicionales'))));
      const ingShift = shift || (req.user?.shift && req.user.shift !== 'ambos' ? req.user.shift : 'noche');

      const gc = priceGrandeCompleta !== undefined ? (parseFloat(priceGrandeCompleta) || 0) : finalPrice;
      const gm = priceGrandeMitad !== undefined ? (parseFloat(priceGrandeMitad) || 0) : (gc > 0 ? Number((gc / 2).toFixed(2)) : 0);
      const pc = pricePequenaCompleta !== undefined ? (parseFloat(pricePequenaCompleta) || 0) : (gc > 0 ? Number((gc / 2).toFixed(2)) : 0);
      const pm = pricePequenaMitad !== undefined ? (parseFloat(pricePequenaMitad) || 0) : (pc > 0 ? Number((pc / 2).toFixed(2)) : 0);

      await query(
        `INSERT INTO ingredients (
           id, name, ingredient_type, price_usd, 
           price_grande_completa, price_grande_mitad, price_pequena_completa, price_pequena_mitad,
           is_base, is_extra, is_base_for_pizza, is_extra_for_pizza, category, available, shift
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id,
          upperName,
          finalType,
          finalPrice,
          gc,
          gm,
          pc,
          pm,
          finalIsBase,
          finalIsExtra,
          finalIsBase,
          finalIsExtra,
          finalCategory,
          available !== false,
          ingShift,
        ]
      );

      await syncIngredients(io);
      const userIngredients = await fetchAllIngredients(req.user);
      res.status(201).json(userIngredients.find((i) => i.name === upperName) || { id, name: upperName });
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
        ingredientType,
        category,
        priceUSD,
        priceGrandeCompleta,
        priceGrandeMitad,
        pricePequenaCompleta,
        pricePequenaMitad,
        isBase,
        isExtra,
        available,
        shift,
      } = req.body;

      const upperName = (name || '').trim().toUpperCase();
      const finalType = ingredientType || (category === 'Salsas' ? 'salsa' : (category === 'Gratis' ? 'gratis' : (category === 'Adicionales' ? 'adicional' : (isBase ? 'base' : 'adicional'))));
      const parsedPriceUSD = priceUSD !== undefined ? (parseFloat(priceUSD) || 0) : (parseFloat(priceGrandeCompleta) || 0);
      const finalPrice = (finalType === 'gratis' || finalType === 'base') ? 0 : parsedPriceUSD;
      const finalIsBase = finalType === 'base' || finalType === 'proteina' || isBase === true;
      const finalIsExtra = finalType === 'adicional' || finalType === 'gratis' || finalType === 'salsa' || isExtra === true;

      let oldRecord = null;
      const { rows } = await query(`SELECT name, shift, category FROM ingredients WHERE id = $1`, [id]);
      if (rows.length > 0) oldRecord = rows[0];
      const oldName = oldRecord?.name;
      const ingShift = shift || oldRecord?.shift || (req.user?.shift && req.user.shift !== 'ambos' ? req.user.shift : 'noche');
      const finalCategory = category || oldRecord?.category || (finalType === 'salsa' ? 'Salsas' : (finalType === 'gratis' ? 'Gratis' : (finalType === 'proteina' ? 'Proteínas' : (finalType === 'base' ? 'Ingredientes Base' : 'Adicionales'))));

      const gc = priceGrandeCompleta !== undefined ? (parseFloat(priceGrandeCompleta) || 0) : finalPrice;
      const gm = priceGrandeMitad !== undefined ? (parseFloat(priceGrandeMitad) || 0) : (gc > 0 ? Number((gc / 2).toFixed(2)) : 0);
      const pc = pricePequenaCompleta !== undefined ? (parseFloat(pricePequenaCompleta) || 0) : (gc > 0 ? Number((gc / 2).toFixed(2)) : 0);
      const pm = pricePequenaMitad !== undefined ? (parseFloat(pricePequenaMitad) || 0) : (pc > 0 ? Number((pc / 2).toFixed(2)) : 0);

      await query(
        `UPDATE ingredients 
         SET name = $1, ingredient_type = $2, category = $3, price_usd = $4, 
             price_grande_completa = $5, price_grande_mitad = $6, price_pequena_completa = $7, price_pequena_mitad = $8,
             is_base = $9, is_extra = $10, is_base_for_pizza = $11, is_extra_for_pizza = $12, available = $13, shift = $14
         WHERE id = $15`,
        [
          upperName, 
          finalType,
          finalCategory, 
          finalPrice,
          gc,
          gm,
          pc,
          pm,
          finalIsBase,
          finalIsExtra,
          finalIsBase,
          finalIsExtra,
          available !== false, 
          ingShift,
          id
        ]
      );

      if (oldName && oldName !== upperName) {
        await query(
          `UPDATE products 
           SET base_ingredients = array_replace(base_ingredients, $1, $2),
               default_proteins = array_replace(default_proteins, $1, $2)
           WHERE $1 = ANY(base_ingredients) OR $1 = ANY(default_proteins)`,
          [oldName, upperName]
        );
      }

      await syncIngredients(io);
      if (oldName && oldName !== upperName) {
        await syncProducts(io);
      }
      const userIngredients = await fetchAllIngredients(req.user);
      res.json(userIngredients.find((i) => i.id === id) || { success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar ingrediente' });
    }
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM ingredients WHERE id = $1`, [id]);
      await syncIngredients(io);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Error al eliminar ingrediente' });
    }
  });

  return router;
};
