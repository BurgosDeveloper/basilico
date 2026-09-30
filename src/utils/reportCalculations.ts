// Utilidades para cálculo de nombres, tamaños y resolución de pizzas mitad y mitad en reportes

export function cleanItemName(
  productName: string,
  size?: string,
  category?: string,
  isPizza?: boolean
): string {
  let clean = (productName || 'Item').trim();
  // 1. Quitar cualquier tamaño previo
  clean = clean.replace(/\s*\((grande|pequeña|pequena|mediana|familiar|estándar|estandar)\)/gi, '').trim();

  // 2. Quitar prefijo de mitad si venía embebido
  clean = clean.replace(/^pizza\s+1\/2\s+/i, 'Pizza ');

  const catLower = (category || '').toLowerCase();
  const isPizzaItem = isPizza || catLower.includes('pizza') || clean.toLowerCase().includes('pizza');
  if (isPizzaItem) {
    const s = size && size.trim() ? size.trim() : 'Grande';
    const normSize = s.toLowerCase().includes('peque') ? 'Pequeña' : s.toLowerCase().includes('med') ? 'Mediana' : s.toLowerCase().includes('fam') ? 'Familiar' : 'Grande';
    return `${clean} (${normSize})`;
  }
  return clean;
}

export function findProduct(name: string, productsMap?: any[] | Record<string, any>): any | null {
  if (!name) return null;
  const search = name.trim().toLowerCase();
  const searchNoPizza = search.replace(/^pizza\s+/i, '').trim();

  let list: any[] = [];
  if (Array.isArray(productsMap) && productsMap.length > 0) {
    list = productsMap;
  } else if (productsMap && typeof productsMap === 'object') {
    list = Object.values(productsMap);
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

export function obtenerPrecioCarta(
  name: string,
  isSmall: boolean,
  productsMap?: any[] | Record<string, any>
): number {
  const prod = findProduct(name, productsMap);
  if (!prod) return 0;
  if (isSmall) {
    return Number(prod.priceSmall ?? prod.price_small ?? (Number(prod.price) > 4 ? Number(prod.price) - 4 : Number(prod.price) * 0.7));
  }
  return Number(prod.price || 0);
}

export interface ResolvedReportItem {
  name: string;
  category: string;
  isPizza: boolean;
  quantity: number;
  totalUSD: number;
}

export function resolveHalfAndHalfPizza(
  item: any,
  productsMap?: any[] | Record<string, any>,
  baseUnitPrice?: number
): ResolvedReportItem {
  const price = baseUnitPrice !== undefined ? baseUnitPrice : (Number(item.price) || 0);
  const isHH = !!(item.isHalfHalf || item.is_half_half || item.halfDetails || item.half_details);
  const isSmall = (item.size || '').toLowerCase().includes('peque');
  const catLower = (item.category || '').toLowerCase();
  const isPizza = catLower.includes('pizza') || (item.productName || item.name || '').toLowerCase().includes('pizza');

  // Si no es mitad y mitad, devuelve el nombre con su tamaño si es pizza
  if (!isHH) {
    const rawName = (item.productName || item.name || 'Producto').trim();
    const finalName = isPizza ? cleanItemName(rawName, item.size, 'Pizzas', true) : rawName;
    return {
      name: finalName,
      category: isPizza ? 'Pizzas' : (item.category || 'Sin categoría'),
      isPizza,
      quantity: Number(item.quantity) || 1,
      totalUSD: price * (Number(item.quantity) || 1),
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

  const finalName = cleanItemName(officialDominantName, item.size, 'Pizzas', true);

  return {
    name: finalName,
    category: 'Pizzas',
    isPizza: true,
    quantity: Number(item.quantity) || 1,
    totalUSD: price * (Number(item.quantity) || 1),
  };
}
