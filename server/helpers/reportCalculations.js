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
 * Determina de forma infalible si un producto es una bebida.
 * Utiliza límites de palabra (\b) para NUNCA clasificar una comida como Pepperoni
 * erróneamente como bebida (por la subcadena "ron").
 */
function isProductDrink(item, productsMap) {
  const rawName = (item?.productName || item?.name || '').trim();
  const nameLower = rawName.toLowerCase();
  const catLower = (item?.category || '').toLowerCase().trim();

  // Si explícitamente es pizza, NO puede ser bebida
  if (catLower.includes('pizza') || nameLower.includes('pizza')) return false;
  if (item?.isPizza || item?.isHalfHalf || item?.is_half_half || item?.halfDetails || item?.half_details) return false;

  // Si en el catálogo de productos es pizza, NO es bebida
  const prod = findProduct(rawName, productsMap);
  if (prod) {
    const prodCat = (prod.category || '').toLowerCase().trim();
    if (prodCat.includes('pizza')) return false;
    if (prodCat.includes('bebida') || prodCat.includes('drink') || prod.drink_type || prod.drinkType) return true;
    if (prodCat.includes('salsa') || prodCat.includes('entrada') || prodCat.includes('pasta') || prodCat.includes('especialidad')) return false;
  }

  // Categorías explícitas de bebida
  if (
    catLower.includes('bebida') ||
    catLower.includes('drink') ||
    catLower.includes('refresco') ||
    catLower.includes('jugo') ||
    catLower.includes('licor') ||
    catLower.includes('cerveza') ||
    catLower.includes('agua') ||
    catLower.includes('trago') ||
    catLower.includes('coctel') ||
    catLower.includes('cóctel') ||
    catLower.includes('vino') ||
    catLower.includes('café') ||
    catLower.includes('cafe') ||
    catLower.includes('malta') ||
    Boolean(item?.drinkType || item?.drink_type)
  ) {
    return true;
  }

  // Regex con palabra completa (\b) para bebidas comunes:
  const DRINK_WORD_REGEX = /\b(refresco|jugo|agua|cerveza|nestea|granizado|soda|malta|licor|ron|vodka|whisky|mojito|tequila|vino|coctel|cóctel|café|cafe|lipton|yukery|gatorade|coca[- ]?cola|pepsi|chinotto|frescolita|sprite|7up|postobon|colombiana)\b/i;
  if (DRINK_WORD_REGEX.test(nameLower)) {
    return true;
  }

  return false;
}

/**
 * Determina de forma infalible si un producto es una pizza.
 * Funciona tanto para pizzas del catálogo oficial como nuevas pizzas creadas.
 */
function isProductPizza(item, productsMap, shift) {
  const isMorning = shift === 'manana' || item?.shift === 'manana';
  if (isMorning) return false; // En turno mañana NUNCA hay pizzas

  const rawName = (item?.productName || item?.name || '').trim();
  const nameLower = rawName.toLowerCase();
  const catLower = (item?.category || '').toLowerCase().trim();

  // Si tiene categoría pizza o nombre incluye pizza
  if (catLower.includes('pizza') || nameLower.includes('pizza')) return true;
  if (item?.isPizza || item?.isHalfHalf || item?.is_half_half || item?.halfDetails || item?.half_details) return true;

  // Buscar en el catálogo oficial de productos
  const prod = findProduct(rawName, productsMap);
  if (prod) {
    const prodCat = (prod.category || '').toLowerCase().trim();
    if (prodCat.includes('pizza')) return true;
    if (prodCat.includes('bebida') || prodCat.includes('drink') || prod.drink_type || prod.drinkType) return false;
    if (prodCat.includes('salsa')) return false;
  }

  // En turno noche / pizzería: cualquier comida que no sea bebida, delivery o salsa es Pizza
  if (isProductDrink(item, productsMap)) return false;
  if (catLower.includes('delivery') || nameLower.includes('delivery')) return false;
  if (catLower.includes('salsa') || nameLower.includes('salsa')) return false;

  return true;
}

/**
 * Normaliza y limpia el nombre del producto quitando tamaños repetidos
 * y añadiendo el tamaño normalizado ÚNICAMENTE a las pizzas.
 * Si en noche una pizza no tiene tamaño especificado, por defecto asigna (Grande).
 */
function cleanItemName(productName, size, category, isPizza, shift, productsMap) {
  let clean = (productName || 'Item').trim();
  // 1. Quitar cualquier tamaño previo
  clean = clean.replace(/\s*\((grande|pequeña|pequena|mediana|familiar|estándar|estandar)\)/gi, '').trim();

  // 2. Quitar prefijo de mitad si venía embebido
  clean = clean.replace(/^pizza\s+1\/2\s+/i, 'Pizza ');

  // Si es turno mañana, nunca lleva tamaño
  if (shift === 'manana') {
    return clean;
  }

  // Comprobar si es pizza
  const isPizzaItem = isPizza || isProductPizza({ productName: clean, category }, productsMap, shift);
  if (isPizzaItem) {
    const s = size && size.trim() && size.trim() !== 'Estándar' ? size.trim() : 'Grande';
    const normSize = s.toLowerCase().includes('peque') ? 'Pequeña' : s.toLowerCase().includes('med') ? 'Mediana' : s.toLowerCase().includes('fam') ? 'Familiar' : 'Grande';
    return `${clean} (${normSize})`;
  }
  return clean;
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
 * Garantiza que toda pizza (nueva o existente) quede catalogada en "Pizzas"
 * y con su tamaño correspondiente (Grande o Pequeña).
 */
function resolveHalfAndHalfPizza(item, productsMap, baseUnitPrice, shift) {
  const isMorning = shift === 'manana' || item.shift === 'manana';
  if (isMorning) {
    const rawName = (item.productName || item.name || 'Producto').trim();
    const finalName = cleanItemName(rawName, undefined, item.category, false, 'manana', productsMap);
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
  const isPizza = isProductPizza(item, productsMap, shift);

  // Si no es mitad y mitad, devuelve el nombre con su tamaño si es pizza
  if (!isHH) {
    const rawName = (item.productName || item.name || 'Producto').trim();
    const finalName = isPizza ? cleanItemName(rawName, item.size, 'Pizzas', true, shift, productsMap) : rawName;
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

  const finalName = cleanItemName(officialDominantName, item.size, 'Pizzas', true, shift, productsMap);

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
  isProductPizza,
  isProductDrink,
};
