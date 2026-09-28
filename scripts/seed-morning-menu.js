const { initDb, query, getClient } = require('../server/db');

async function seedMorningMenu() {
  console.log('🌅 INICIANDO CARGA DEL MENÚ DEL TURNO MAÑANA (100% MAYÚSCULAS)...');
  await initDb();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // 1. Asegurar que los productos y adicionales de la pizzería tengan shift = 'noche'
    await client.query("UPDATE products SET shift = 'noche' WHERE shift = 'ambos' OR shift IS NULL");
    await client.query("UPDATE ingredients SET shift = 'noche' WHERE shift = 'ambos' OR shift IS NULL");

    // 2. Limpiar productos e ingredientes previos de la mañana para recargar en limpio
    await client.query("DELETE FROM products WHERE shift = 'manana'");
    await client.query("DELETE FROM ingredients WHERE shift = 'manana'");

    // 3. ENTRADAS (6 productos)
    const entradas = [
      { id: 'm-ent-1', name: 'AREPITAS CON NATA', category: 'ENTRADAS', price: 4.0, desc: 'DELICIOSAS AREPITAS FRITAS ACOMPAÑADAS DE RICA NATA FRESCA.' },
      { id: 'm-ent-2', name: 'BRUSQUETAS DE TOMATES HORNEADOS Y PESTO', category: 'ENTRADAS', price: 4.0, desc: 'PAN TOSTADO ARTESANAL CON TOMATES HORNEADOS Y PESTO DE LA CASA.' },
      { id: 'm-ent-3', name: 'CANASTAS DE PLATANO', category: 'ENTRADAS', price: 4.0, desc: 'CANASTITAS DE PLÁTANO VERDE RELLENAS Y SAZONADAS AL ESTILO GOURMET.' },
      { id: 'm-ent-4', name: 'ENSALADA CAPRESSE', category: 'ENTRADAS', price: 4.0, desc: 'FRESCA ENSALADA CAPRESSE CON TOMATES FRESCOS, MOZZARELLA Y ALBAHACA.' },
      { id: 'm-ent-5', name: 'TOSTONES CON QUESO', category: 'ENTRADAS', price: 4.0, desc: 'CRUJIENTES TOSTONES DE PLÁTANO VERDE CORONADOS CON QUESO RALLADO FRESCO.' },
      { id: 'm-ent-6', name: 'POSTRE DEL DIA', category: 'ENTRADAS', price: 3.0, desc: 'EXQUISITA PORCIÓN DE POSTRE DULCE ARTESANAL DEL DÍA.' },
    ];

    // 4. PASTAS TRADICIONALES (6 productos)
    const pastas = [
      { id: 'm-pas-1', name: 'PASTA CARBONARA', category: 'PASTAS', price: 7.0, desc: 'CLÁSICA SALSA CARBONARA CREMOSA CON TOCINETA CROCANTE Y QUESO PARMESANO.' },
      { id: 'm-pas-2', name: 'PASTA FILETTO', category: 'PASTAS', price: 7.0, desc: 'PASTA AL DENTE EN TRADICIONAL SALSA FILETTO DE TOMATES Y FINAS HIERBAS.' },
      { id: 'm-pas-3', name: 'PASTA CHAMPINONES', category: 'PASTAS', price: 7.0, desc: 'PASTA EN CREMOSA SALSA BLANCA CON CHAMPIÑONES FRESCOS SALTEADOS.' },
      { id: 'm-pas-4', name: 'PASTA CUATRO QUESOS', category: 'PASTAS', price: 7.0, desc: 'EXQUISITA SALSA CREMOSA COMBINANDO CUATRO QUESOS SELECCIONADOS.' },
      { id: 'm-pas-5', name: 'PASTA PRIMAVERA', category: 'PASTAS', price: 7.0, desc: 'PASTA AL DENTE CON VEGETALES FRESCOS SALTEADOS EN ACEITE DE OLIVA.' },
      { id: 'm-pas-6', name: 'PASTA AMATRICIANNA', category: 'PASTAS', price: 7.0, desc: 'PASTA CON SALSA AMATRICIANA A BASE DE TOMATE, TOCINETA Y TOQUE PICANTE.' },
    ];

    // 5. ESPECIALIDADES Y PLATOS FUERTES (22 productos)
    const especialidades = [
      // Carnes de Res
      { id: 'm-esp-1', name: 'FILETE MIGNON EN SALSA DE VINO TINTO', category: 'ESPECIALIDADES', price: 11.0, desc: 'FILET MIGNON ENVUELTO EN TOCINETA REDUCIDO EN SALSA DE VINO TINTO.', base: ['CEBOLLA', 'CHAMPINONES', 'TOCINETA'] },
      { id: 'm-esp-2', name: 'LOMITO EN SALSA DE CHAMPINONES', category: 'ESPECIALIDADES', price: 11.0, desc: 'MEDALLÓN DE LOMITO TIERNO BAÑADO EN RICA SALSA DE CHAMPIÑONES FRESCOS.', base: ['CHAMPINONES', 'SALSA BLANCA'] },
      { id: 'm-esp-3', name: 'CARTOCCIO DE LOMITO', category: 'ESPECIALIDADES', price: 11.0, desc: 'LOMITO SELLADO AL HORNO EN PAPEL DE ALUMINIO CON PASTA Y QUESO FUNDIDO.', base: ['QUESO FUNDIDO', 'PASTA'] },
      { id: 'm-esp-4', name: 'LOMO SALTADO', category: 'ESPECIALIDADES', price: 11.0, desc: 'TRADICIONAL LOMO SALTADO CON CEBOLLA MORADA, TOMATE Y SALSA ESPECIAL.', base: ['CEBOLLA MORADA', 'TOMATE', 'SALSA ESPECIAL'] },
      { id: 'm-esp-5', name: 'WOK DE LOMITO CON CAMARONES', category: 'ESPECIALIDADES', price: 11.0, desc: 'TIRAS DE LOMITO Y CAMARONES SALTEADOS AL WOK CON VEGETALES FRESCOS.', base: ['VEGETALES FRESCOS'] },
      { id: 'm-esp-6', name: 'CHURRASCO DE SOLOMO', category: 'ESPECIALIDADES', price: 12.0, desc: 'CORTE GRUESO DE SOLOMO A LA PARRILLA EN SU PUNTO JUGOSO.' },
      { id: 'm-esp-7', name: 'PICADA MIXTA (POLLO, CARNE, CHORIZO)', category: 'ESPECIALIDADES', price: 12.0, desc: 'ABUNDANTE PICADA A LA PARRILLA CON POLLO, CARNE DE RES Y CHORIZO PARRILLERO.', base: ['POLLO', 'CARNE DE RES', 'CHORIZO'] },

      // Aves
      { id: 'm-esp-8', name: 'SUPREMA DE POLLO', category: 'ESPECIALIDADES', price: 10.0, desc: 'PECHUGA DE POLLO A LA PLANCHA DORADA CON SAZÓN ESPECIAL DE LA CASA.' },
      { id: 'm-esp-9', name: 'PECHUGA EN CHAMPINONES', category: 'ESPECIALIDADES', price: 10.0, desc: 'PECHUGA DE POLLO TIERNA EN SUAVE SALSA CREMOSA DE CHAMPIÑONES.', base: ['CHAMPINONES', 'SALSA CREMOSA'] },
      { id: 'm-esp-10', name: 'PECHUGA CAPRESSA', category: 'ESPECIALIDADES', price: 10.0, desc: 'PECHUGA A LA PLANCHA CORONADA CON TOMATE FRESCO, ALBAHACA Y MOZZARELLA.', base: ['TOMATE FRESCO', 'ALBAHACA', 'MOZZARELLA'] },
      { id: 'm-esp-11', name: 'MILANESA A LA PARMESANA', category: 'ESPECIALIDADES', price: 10.0, desc: 'MILANESA CRUJIENTE GRATINADA CON SALSA POMODORO Y QUESO MOZZARELLA.', base: ['SALSA POMODORO', 'QUESO MOZZARELLA'] },
      { id: 'm-esp-12', name: 'CORDOM BLEU', category: 'ESPECIALIDADES', price: 10.0, desc: 'PECHUGA RELLENA DE JAMÓN Y QUESO, EMPANIZADA Y DORADA AL PUNTO PERFECTO.', base: ['JAMON', 'QUESO'] },
      { id: 'm-esp-13', name: 'POLLO AGRIDULCE', category: 'ESPECIALIDADES', price: 10.0, desc: 'TROZOS DE PECHUGA SALTEADOS EN SALSA AGRIDULCE ORIENTAL Y PIMENTÓN.', base: ['PIMENTON', 'SALSA AGRIDULCE'] },
      { id: 'm-esp-14', name: 'TENDERS DE POLLO', category: 'ESPECIALIDADES', price: 7.0, desc: 'TIRAS DE PECHUGA DE POLLO EMPANIZADAS Y CRUJIENTES CON SALSA DE LA CASA.' },
      { id: 'm-esp-15', name: 'STROGONOF DE POLLO CON CAMARONES', category: 'ESPECIALIDADES', price: 11.0, desc: 'POLLO Y CAMARONES EN SALSA STROGONOFF CREMOSA CON CHAMPIÑONES.', base: ['CHAMPINONES', 'SALSA STROGONOFF'] },

      // Cerdo
      { id: 'm-esp-16', name: 'LOMO DE CERDO BBQ', category: 'ESPECIALIDADES', price: 11.0, desc: 'CORTE DE LOMO DE CERDO GLASEADO EN SALSA BARBACOA DE LA CASA.', base: ['SALSA BBQ'] },
      { id: 'm-esp-17', name: 'LOMO DE CERDO EN PINA', category: 'ESPECIALIDADES', price: 11.0, desc: 'JUGOSO LOMO DE CERDO EN SALSA AGRIDULCE DE PIÑA CARAMELIZADA.', base: ['PINA CARAMELIZADA'] },

      // Pescados y Mariscos
      { id: 'm-esp-18', name: 'FILET DE MERLUZA A LA MENIER', category: 'ESPECIALIDADES', price: 12.0, desc: 'MERLUZA DORADA EN SALSA MEUNIÈRE CLÁSICA DE MANTEQUILLA, LIMÓN Y PEREJIL.', base: ['MANTEQUILLA', 'LIMON', 'PEREJIL'] },
      { id: 'm-esp-19', name: 'FILET DE MERLUZA AL PAPILLOTE', category: 'ESPECIALIDADES', price: 12.0, desc: 'MERLUZA COCIDA AL VAPOR EN SU PROPIO JUGO CON FINOS VEGETALES.', base: ['VEGETALES'] },
      { id: 'm-esp-20', name: 'FILET DE MERLUZA GRATINADO', category: 'ESPECIALIDADES', price: 12.0, desc: 'FILET DE MERLUZA FRESCA CON SALSA BLANCA Y CUBIERTA DE QUESO GRATINADO.', base: ['SALSA BLANCA', 'QUESO GRATINADO'] },

      // Especiales al Horno
      { id: 'm-esp-21', name: 'PASTA PARMIGIANNA', category: 'ESPECIALIDADES', price: 10.0, desc: 'PASTA HORNEADA CON BERENJENA, SALSA POMODORO Y QUESO GRATINADO.', base: ['BERENJENA', 'SALSA POMODORO', 'QUESO GRATINADO'] },
      { id: 'm-esp-22', name: 'MACARRONES CON QUESO', category: 'ESPECIALIDADES', price: 7.0, desc: 'CLÁSICOS MACARRONES EN SALSA CREMOSA DE QUESO CHEDDAR Y MOZZARELLA.', base: ['QUESO CHEDDAR', 'MOZZARELLA'] },
    ];

    // 6. BEBIDAS DE LA MAÑANA (17 productos)
    const bebidas = [
      // Jugos Naturales ($2.00)
      { id: 'm-beb-1', name: 'JUGO DE FRESA', category: 'BEBIDAS', price: 2.0, drinkType: 'jugo', desc: 'JUGO NATURAL DE FRESA FRESCA CON OPCIÓN DE AZÚCAR.' },
      { id: 'm-beb-2', name: 'JUGO DE MORA', category: 'BEBIDAS', price: 2.0, drinkType: 'jugo', desc: 'JUGO NATURAL DE MORA SILVESTRE CON OPCIÓN DE AZÚCAR.' },
      { id: 'm-beb-3', name: 'JUGO DE PARCHITA', category: 'BEBIDAS', price: 2.0, drinkType: 'jugo', desc: 'JUGO NATURAL DE PARCHITA / MARACUYÁ REFRESCANTE.' },
      { id: 'm-beb-4', name: 'JUGO DE MANGO', category: 'BEBIDAS', price: 2.0, drinkType: 'jugo', desc: 'JUGO NATURAL DE MANGO DULCE SELECCIONADO.' },
      { id: 'm-beb-5', name: 'JUGO DE DURAZNO', category: 'BEBIDAS', price: 2.0, drinkType: 'jugo', desc: 'JUGO NATURAL DE DURAZNO SUAVE Y AROMÁTICO.' },
      { id: 'm-beb-6', name: 'JUGO DE GUANABANA', category: 'BEBIDAS', price: 2.0, drinkType: 'jugo', desc: 'JUGO NATURAL DE GUANÁBANA CREMOSA CON OPCIÓN DE AZÚCAR.' },

      // Merengadas Batidas con Leche ($3.00)
      { id: 'm-beb-7', name: 'MERENGADA DE FRESA', category: 'BEBIDAS', price: 3.0, drinkType: 'merengada', desc: 'MERENGADA CREMOSA BATIDA CON LECHE Y FRESAS FRESCAS.' },
      { id: 'm-beb-8', name: 'MERENGADA DE MORA', category: 'BEBIDAS', price: 3.0, drinkType: 'merengada', desc: 'MERENGADA CREMOSA BATIDA CON LECHE Y MORAS NATURALES.' },
      { id: 'm-beb-9', name: 'MERENGADA DE PARCHITA', category: 'BEBIDAS', price: 3.0, drinkType: 'merengada', desc: 'MERENGADA CREMOSA BATIDA CON LECHE Y PARCHITA FRESCA.' },
      { id: 'm-beb-10', name: 'MERENGADA DE MANGO', category: 'BEBIDAS', price: 3.0, drinkType: 'merengada', desc: 'MERENGADA CREMOSA BATIDA CON LECHE Y MANGO DULCE.' },
      { id: 'm-beb-11', name: 'MERENGADA DE DURAZNO', category: 'BEBIDAS', price: 3.0, drinkType: 'merengada', desc: 'MERENGADA CREMOSA BATIDA CON LECHE Y DURAZNO.' },
      { id: 'm-beb-12', name: 'MERENGADA DE GUANABANA', category: 'BEBIDAS', price: 3.0, drinkType: 'merengada', desc: 'MERENGADA CREMOSA BATIDA CON LECHE Y GUANÁBANA FRESCA.' },

      // Refrescos y Bebidas Frías
      { id: 'm-beb-13', name: 'REFRESCO DE BOTELLA', category: 'BEBIDAS', price: 1.0, drinkType: 'refresco', desc: 'REFRESCO DE BOTELLA SURTIDO (COCA-COLA, PEPSI, 7UP, FRESCOLITA, HIT).' },
      { id: 'm-beb-14', name: 'NESTEA HELADO', category: 'BEBIDAS', price: 1.0, drinkType: 'nestea', desc: 'TÉ NESTEA HELADO REFRESCANTE (LIMÓN O DURAZNO).' },
      { id: 'm-beb-15', name: 'AGUA MINERAL PURIFICADA', category: 'BEBIDAS', price: 1.0, drinkType: 'agua', desc: 'AGUA MINERAL PURIFICADA EMBOTELLADA.' },
      { id: 'm-beb-16', name: 'CERVEZA NACIONAL', category: 'BEBIDAS', price: 1.0, drinkType: 'cerveza', desc: 'CERVEZA NACIONAL BIEN FRÍA (POLAR PILSEN, LIGHT O SOLERA).' },
      { id: 'm-beb-17', name: 'REFRESCO FAMILIAR (2 LITROS)', category: 'BEBIDAS', price: 3.0, drinkType: 'refresco', desc: 'REFRESCO FAMILIAR DE 2 LITROS.' },
    ];

    const allMorningProducts = [...entradas, ...pastas, ...especialidades, ...bebidas];

    for (const p of allMorningProducts) {
      await client.query(
        `INSERT INTO products (id, name, category, drink_type, price, description, image, badge, base_ingredients, protein_count, default_proteins, flavors, shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, '{}', '{}', 'manana')`,
        [
          p.id,
          p.name.toUpperCase(),
          p.category.toUpperCase(),
          p.drinkType || null,
          p.price,
          (p.desc || '').toUpperCase(),
          '/logo_default.png',
          null,
          p.base || [],
        ]
      );
    }

    // 7. CONTORNOS Y GUARNICIONES (12 ítems como ingredientes con category: 'CONTORNOS' y shift = 'manana')
    const contornos = [
      { id: 'm-cnt-1', name: 'ARROZ', price: 1.0 },
      { id: 'm-cnt-2', name: 'PAPAS FRITAS', price: 1.0 },
      { id: 'm-cnt-3', name: 'PURE DE PAPAS', price: 1.0 },
      { id: 'm-cnt-4', name: 'TAJADAS', price: 1.0 },
      { id: 'm-cnt-5', name: 'TOSTONES', price: 1.0 },
      { id: 'm-cnt-6', name: 'ENSALADA DEL DIA', price: 1.0 },
      { id: 'm-cnt-7', name: 'PAN AL AJILLO', price: 1.0 },
      { id: 'm-cnt-8', name: 'VEGETALES SALTEADOS', price: 1.0 },
      { id: 'm-cnt-9', name: 'VEGETALES GRATINADOS', price: 1.5 },
      { id: 'm-cnt-10', name: 'LENTEJAS', price: 1.0 },
      { id: 'm-cnt-11', name: 'PASTA DEL DIA', price: 1.0 },
      { id: 'm-cnt-12', name: 'AREPAS FRITAS', price: 1.0 },
    ];

    for (const c of contornos) {
      await client.query(
        `INSERT INTO ingredients (id, name, ingredient_type, price_usd, is_base, is_extra, is_base_for_pizza, is_extra_for_pizza, category, available, shift)
         VALUES ($1, $2, 'adicional', $3, true, true, false, false, 'CONTORNOS', true, 'manana')`,
        [c.id, c.name.toUpperCase(), c.price]
      );
    }

    await client.query('COMMIT');
    console.log(`✅ MENÚ DE LA MAÑANA CARGADO EXITOSAMENTE:`);
    console.log(`   - ${allMorningProducts.length} Productos (Entradas, Pastas, Especialidades, Bebidas)`);
    console.log(`   - ${contornos.length} Contornos y Guarniciones`);
    console.log(`   - Todos registrados en shift: 'manana' y 100% en MAYÚSCULAS`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error al cargar menú de la mañana:', err);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

seedMorningMenu();
