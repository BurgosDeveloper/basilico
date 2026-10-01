const fs = require('fs');
const path = require('path');

let cachedSeedProducts = null;
function getSeedProducts() {
  if (cachedSeedProducts) return cachedSeedProducts;
  try {
    const catalogPath = path.join(__dirname, '../seed-catalog.json');
    if (fs.existsSync(catalogPath)) {
      const data = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      cachedSeedProducts = data.products || [];
    }
  } catch (e) {
    cachedSeedProducts = [];
  }
  return cachedSeedProducts || [];
}

/**
 * Normaliza y limpia el nombre del producto quitando tamaños repetidos
 * y añadiendo el tamaño normalizado ÚNICAMENTE a las pizzas.
 */
function cleanItemName(productName, size, category, isPizza, shift) {
  let clean = (productName || 'Item').trim();
  // 1. Quitar cualquier tamaño previo
  clean = clean.replace(/\s*\((grande|pequeña|pequena|mediana|familiar|estándar|estandar)\)/gi, '').trim();

  // 2. Quitar prefijo de mitad si venía embebido
  clean = clean.replace(/^pizza\s+1\/2\s+/i, 'Pizza ');

  // Si es turno mañana, nunca lleva tamaño
  if (shift === 'manana') {
    return clean;
  }

  const catLower = (category || '').toLowerCase();
  const isPizzaItem = isPizza || catLower.includes('pizza') || clean.toLowerCase().includes('pizza');
  if (isPizzaItem) {
    const s = size && size.trim() ? size.trim() : 'Grande';
    const normSize = s.toLowerCase().includes('peque') ? 'Pequeña' : s.toLowerCase().includes('med') ? 'Mediana' : s.toLowerCase().includes('fam') ? 'Familiar' : 'Grande';
    return `${clean} (${normSize})`;
  }
  return clean;
}

/**
 * Busca un producto en el mapa o lista de productos por nombre
 */
function findProduct(name, productsMap) {
  if (!name) return null;
  const search = name.trim().toLowerCase();
  const searchNoPizza = search.replace(/^pizza\s+/i, '').trim();

  let list = [];
  if (Array.isArray(productsMap) && productsMap.length > 0) {
    list = productsMap;
  } else if (productsMap && typeof productsMap === 'object') {
    list = Object.values(productsMap);
  }
  if (list.length === 0) {
    list = getSeedProducts();
  }

  // 1. Coincidencia exacta
  let found = list.find((p) => (p.name || '').trim().toLowerCase() === search);
  if (found) return found;

  // 2. Coincidencia sin prefijo "Pizza"
  found = list.find((p) => {
    const pClean = (p.name || '').trim().toLowerCase().replace(/^pizza\s+/i, '').trim();
    return pClean === searchNoPizza;
  });
  if (found) return found;

  // 3. Coincidencia parcial
  found = list.find((p) => {
    const pClean = (p.name || '').trim().toLowerCase().replace(/^pizza\s+/i, '').trim();
    return pClean.includes(searchNoPizza) || searchNoPizza.includes(pClean);
  });
  return found || null;
}

/**
 * Obtiene el precio oficial de carta de una pizza o mitad según el tamaño
 */
function obtenerPrecioCarta(name, isSmall, productsMap) {
  const prod = findProduct(name, productsMap);
  if (!prod) return 0;
  if (isSmall) {
    return Number(prod.priceSmall ?? prod.price_small ?? (Number(prod.price) > 4 ? Number(prod.price) - 4 : Number(prod.price) * 0.7));
  }
  return Number(prod.price || 0);
}

/**
 * Resuelve una pizza (incluyendo mitad y mitad) absorbiéndola contablemente
 * bajo el producto de mayor valor de carta para evitar mitades huérfanas.
 */
function resolveHalfAndHalfPizza(item, productsMap, baseUnitPrice, shift) {
  const isMorning = shift === 'manana' || item.shift === 'manana';
  if (isMorning) {
    const rawName = (item.productName || item.name || 'Producto').trim();
    const finalName = cleanItemName(rawName, undefined, item.category, false, 'manana');
    return {
      name: finalName,
      category: item.category || 'Platos',
      isPizza: false,
      quantity: Number(item.quantity) || 1,
      totalUSD: baseUnitPrice * (Number(item.quantity) || 1),
    };
  }

  const isHH = !!(item.isHalfHalf || item.is_half_half || item.halfDetails || item.half_details);
  const isSmall = (item.size || '').toLowerCase().includes('peque');
  const catLower = (item.category || '').toLowerCase();
  const isPizza = catLower.includes('pizza') || (item.productName || item.name || '').toLowerCase().includes('pizza');

  // Si no es mitad y mitad, devuelve el nombre con su tamaño si es pizza
  if (!isHH) {
    const rawName = (item.productName || item.name || 'Producto').trim();
    const finalName = isPizza ? cleanItemName(rawName, item.size, 'Pizzas', true, shift) : rawName;
    return {
      name: finalName,
      category: isPizza ? 'Pizzas' : (item.category || 'Sin categoría'),
      isPizza,
      quantity: Number(item.quantity) || 1,
      totalUSD: baseUnitPrice * (Number(item.quantity) || 1),
    };
  }

  // Si es Mitad y Mitad:
  let h1 = '';
  let h2 = '';
  let halfDetails = item.halfDetails || item.half_details;
  if (typeof halfDetails === 'string') {
    try { halfDetails = JSON.parse(halfDetails); } catch (e) {}
  }
  if (halfDetails) {
    h1 = (halfDetails.half1Name || halfDetails.half1_name || '').trim();
    h2 = (halfDetails.half2Name || halfDetails.half2_name || '').trim();
  }

  // Si no vinieron en halfDetails, extraer del formato "Pizza 1/2 A + 1/2 B"
  if (!h1 || !h2) {
    const rawName = (item.productName || item.name || '');
    const match = rawName.match(/1\/2\s+([^+]+)\s*\+\s*1\/2\s+([^(]+)/i);
    if (match) {
      h1 = match[1].trim();
      h2 = match[2].trim();
    }
  }

  const price1 = obtenerPrecioCarta(h1, isSmall, productsMap);
  const price2 = obtenerPrecioCarta(h2, isSmall, productsMap);

  // REGLA CLAVE: El nombre elegido es el de la mitad con MAYOR valor
  const chosenName = price2 > price1 ? h2 : h1;
  const dominantProd = findProduct(chosenName, productsMap);
  const officialDominantName = dominantProd ? dominantProd.name : (chosenName || item.productName || 'Pizza');

  const finalName = cleanItemName(officialDominantName, item.size, 'Pizzas', true, shift);

  return {
    name: finalName,
    category: 'Pizzas',
    isPizza: true,
    quantity: Number(item.quantity) || 1,
    totalUSD: baseUnitPrice * (Number(item.quantity) || 1),
  };
}

module.exports = {
  cleanItemName,
  findProduct,
  obtenerPrecioCarta,
  resolveHalfAndHalfPizza,
};
