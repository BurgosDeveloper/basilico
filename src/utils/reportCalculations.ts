// Utilidades para cálculo de nombres, tamaños y resolución de pizzas mitad y mitad en reportes

export interface ResolvedReportItem {
  name: string;
  category: string;
  isPizza: boolean;
  quantity: number;
  totalUSD: number;
}

/**
 * Busca un producto en el mapa o lista de productos por nombre
 */
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

/**
 * Determina de forma infalible si un producto es una bebida.
 * Utiliza límites de palabra (\b) para NUNCA clasificar una comida como Pepperoni
 * erróneamente como bebida (por la subcadena "ron").
 */
export function isProductDrink(item: any, productsMap?: any[] | Record<string, any>): boolean {
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
export function isProductPizza(item: any, productsMap?: any[] | Record<string, any>, shift?: string): boolean {
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
export function cleanItemName(
  productName: string,
  size?: string,
  category?: string,
  isPizza?: boolean,
  shift?: string,
  productsMap?: any[] | Record<string, any>
): string {
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

/**
 * Resuelve una pizza (incluyendo mitad y mitad) absorbiéndola contablemente
 * bajo el producto de mayor valor de carta para evitar mitades huérfanas.
 * Garantiza que toda pizza (nueva o existente) quede catalogada en "Pizzas"
 * y con su tamaño correspondiente (Grande o Pequeña).
 */
export function resolveHalfAndHalfPizza(
  item: any,
  productsMap?: any[] | Record<string, any>,
  baseUnitPrice?: number,
  shift?: string
): ResolvedReportItem {
  const price = baseUnitPrice !== undefined ? baseUnitPrice : (Number(item.price) || 0);
  const isMorning = shift === 'manana' || item.shift === 'manana';
  if (isMorning) {
    const rawName = (item.productName || item.name || 'Producto').trim();
    const finalName = cleanItemName(rawName, undefined, item.category, false, 'manana', productsMap);
    return {
      name: finalName,
      category: item.category || 'Platos',
      isPizza: false,
      quantity: Number(item.quantity) || 1,
      totalUSD: price * (Number(item.quantity) || 1),
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

  const finalName = cleanItemName(officialDominantName, item.size, 'Pizzas', true, shift, productsMap);

  return {
    name: finalName,
    category: 'Pizzas',
    isPizza: true,
    quantity: Number(item.quantity) || 1,
    totalUSD: price * (Number(item.quantity) || 1),
  };
}

export interface RobustoPizzaRow {
  name: string;
  size: 'Grande' | 'Pequeña' | string;
  quantity: number;
}

export interface RobustoMetrics {
  pizzasByType: RobustoPizzaRow[];
  totalPizzasGrandes: number;
  totalPizzasPequenas: number;
  totalBebidas: number;
  totalAdicionales: number;
  totalDeliverys: number;
  totalPickups: number;
  totalMesas: number;
  totalCreditos: number;
}

/**
 * Calcula las métricas exactas del Reporte Robusto (estricto turno noche, sin montos monetarios).
 */
export function calculateRobustoMetrics(data: any, productsMap?: any[] | null): RobustoMetrics {
  const sourceProducts = Array.isArray(productsMap)
    ? productsMap
    : (Array.isArray(data?.products) ? data.products : []);
  const nightProducts = sourceProducts.filter(
    (p: any) => !p.shift || p.shift === 'noche' || p.shift === 'ambos'
  );

  const pizzaMap = new Map<string, RobustoPizzaRow>();
  let totalPizzasGrandes = 0;
  let totalPizzasPequenas = 0;
  let totalBebidas = 0;
  let totalAdicionales = 0;

  for (const item of data?.items || []) {
    const itQty = Number(item.quantity) || 1;
    const rawPrice = Number(item.price) || 0;
    const catLower = String(item.category || '').toLowerCase();
    const rawNameLower = String(item.productName || item.name || '').toLowerCase();
    const isDeliveryItem = catLower.includes('delivery') || rawNameLower.includes('delivery');

    let extrasList: any[] = [];
    if (Array.isArray(item.extras)) extrasList = item.extras;
    else if (Array.isArray(item.extrasJson)) extrasList = item.extrasJson;
    else if (Array.isArray(item.extras_json)) extrasList = item.extras_json;
    else if (typeof (item.extrasJson || item.extras_json) === 'string') {
      try {
        const parsed = JSON.parse(item.extrasJson || item.extras_json);
        if (Array.isArray(parsed)) extrasList = parsed;
      } catch (e) {}
    }

    let paidExtrasUnitCost = 0;
    for (const extra of extrasList) {
      paidExtrasUnitCost += Number(extra?.price) || 0;
    }

    const baseUnitPrice = Math.max(0, rawPrice - paidExtrasUnitCost);
    const isPizza = !isDeliveryItem && isProductPizza(item, nightProducts, 'noche');
    const isDrink = !isDeliveryItem && !isPizza && isProductDrink(item, nightProducts);

    if (isPizza) {
      const resolved = resolveHalfAndHalfPizza(item, nightProducts, baseUnitPrice, 'noche');
      const key = resolved.name;
      const isSmall = key.toLowerCase().includes('(peque') || String(item.size || '').toLowerCase().includes('peque');
      const existing = pizzaMap.get(key) || {
        name: key,
        size: isSmall ? 'Pequeña' : 'Grande',
        quantity: 0,
      };
      existing.quantity += itQty;
      pizzaMap.set(key, existing);

      if (isSmall) totalPizzasPequenas += itQty;
      else totalPizzasGrandes += itQty;

      for (const extra of extrasList) {
        if (!extra) continue;
        const extraNameLower = String(extra.name || '').toLowerCase();
        const extraPrice = Number(extra.price) || 0;
        if ((extraPrice > 0 || extraNameLower.length > 0) && !extraNameLower.includes('gratis')) {
          totalAdicionales += itQty * (Number(extra.quantity) || 1);
        }
      }
    } else if (isDrink) {
      totalBebidas += itQty;
    } else if (!isDeliveryItem && (catLower.includes('adicional') || catLower === 'extras')) {
      totalAdicionales += itQty;
    }
  }

  const pizzasByType = Array.from(pizzaMap.values()).sort(
    (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)
  );

  let totalDeliverys = 0;
  let totalPickups = 0;
  let totalMesas = 0;
  let totalCreditos = 0;

  for (const ord of data?.orders || []) {
    if (!ord || ord.status === 'cancelado') continue;
    const ordType = String(ord.type || '').toLowerCase();
    const payStatus = String(ord.paymentStatus || ord.payment_status || '').toLowerCase();

    if (ordType === 'delivery') totalDeliverys += 1;
    else if (ordType === 'pickup' || ordType === 'llevar') totalPickups += 1;
    else if (ordType === 'mesa') totalMesas += 1;

    if (payStatus === 'credito') totalCreditos += 1;
  }

  return {
    pizzasByType,
    totalPizzasGrandes,
    totalPizzasPequenas,
    totalBebidas,
    totalAdicionales,
    totalDeliverys,
    totalPickups,
    totalMesas,
    totalCreditos,
  };
}
