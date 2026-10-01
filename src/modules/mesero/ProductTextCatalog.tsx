import React from 'react';
import { Product, Ingredient } from '../../data/mockData';
import { IoSearch, IoClose } from 'react-icons/io5';
import { isDrinkProduct } from '../../utils/productClassifier';

interface ProductTextCatalogProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  exchangeRates?: { COP: number; Bs: number };
  salsas?: Ingredient[];
  onSelectSalsa?: (salsa: Ingredient) => void;
}

interface CategoryStyle {
  cardBg: string;
  cardBorder: string;
  cardHoverBg: string;
  cardHoverBorder: string;
  textColor: string;
  priceBadge: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  headerBadge: string;
  icon: string;
}

const STYLE_ENTRADAS: CategoryStyle = {
  cardBg: 'bg-emerald-50/70',
  cardBorder: 'border-emerald-200',
  cardHoverBg: 'hover:bg-emerald-100/80',
  cardHoverBorder: 'hover:border-emerald-400',
  textColor: 'text-emerald-950 group-hover:text-emerald-900',
  priceBadge: 'bg-emerald-100/90 text-emerald-950 border-emerald-300',
  headerBg: 'bg-emerald-100/80',
  headerBorder: 'border-emerald-300',
  headerText: 'text-emerald-950',
  headerBadge: 'bg-emerald-200/90 text-emerald-950',
  icon: '🥗',
};

const STYLE_PASTAS: CategoryStyle = {
  cardBg: 'bg-amber-50/70',
  cardBorder: 'border-amber-200',
  cardHoverBg: 'hover:bg-amber-100/80',
  cardHoverBorder: 'hover:border-amber-400',
  textColor: 'text-amber-950 group-hover:text-amber-900',
  priceBadge: 'bg-amber-100/90 text-amber-950 border-amber-300',
  headerBg: 'bg-amber-100/80',
  headerBorder: 'border-amber-300',
  headerText: 'text-amber-950',
  headerBadge: 'bg-amber-200/90 text-amber-950',
  icon: '🍝',
};

const STYLE_ESPECIALIDADES: CategoryStyle = {
  cardBg: 'bg-rose-50/70',
  cardBorder: 'border-rose-200',
  cardHoverBg: 'hover:bg-rose-100/80',
  cardHoverBorder: 'hover:border-rose-400',
  textColor: 'text-rose-950 group-hover:text-rose-900',
  priceBadge: 'bg-rose-100/90 text-rose-950 border-rose-300',
  headerBg: 'bg-rose-100/80',
  headerBorder: 'border-rose-300',
  headerText: 'text-rose-950',
  headerBadge: 'bg-rose-200/90 text-rose-950',
  icon: '🍽️',
};

const STYLE_BEBIDAS: CategoryStyle = {
  cardBg: 'bg-sky-50/70',
  cardBorder: 'border-sky-200',
  cardHoverBg: 'hover:bg-sky-100/80',
  cardHoverBorder: 'hover:border-sky-400',
  textColor: 'text-sky-950 group-hover:text-sky-900',
  priceBadge: 'bg-sky-100/90 text-sky-950 border-sky-300',
  headerBg: 'bg-sky-100/80',
  headerBorder: 'border-sky-300',
  headerText: 'text-sky-950',
  headerBadge: 'bg-sky-200/90 text-sky-950',
  icon: '🥤',
};

const STYLE_PIZZAS: CategoryStyle = {
  cardBg: 'bg-red-50/70',
  cardBorder: 'border-red-200',
  cardHoverBg: 'hover:bg-red-100/80',
  cardHoverBorder: 'hover:border-red-400',
  textColor: 'text-red-950 group-hover:text-red-900',
  priceBadge: 'bg-red-100/90 text-red-950 border-red-300',
  headerBg: 'bg-red-100/80',
  headerBorder: 'border-red-300',
  headerText: 'text-red-950',
  headerBadge: 'bg-red-200/90 text-red-950',
  icon: '🍕',
};

const STYLE_SALSAS: CategoryStyle = {
  cardBg: 'bg-amber-50/70',
  cardBorder: 'border-amber-200',
  cardHoverBg: 'hover:bg-amber-100/80',
  cardHoverBorder: 'hover:border-amber-400',
  textColor: 'text-amber-950 group-hover:text-amber-900',
  priceBadge: 'bg-amber-100/90 text-amber-950 border-amber-300',
  headerBg: 'bg-amber-100/80',
  headerBorder: 'border-amber-300',
  headerText: 'text-amber-950',
  headerBadge: 'bg-amber-200/90 text-amber-950',
  icon: '🥣',
};

function getProductNameFontSize(name: string): string {
  const clean = (name || '').trim();
  const len = clean.length;
  const words = clean.split(/\s+/).filter(Boolean);
  const maxWordLen = words.reduce((max, w) => Math.max(max, w.length), 0);

  // Muy largo: palabras de 11+ letras o nombre total de 22+ letras
  if (maxWordLen >= 11 || len >= 22) {
    return 'text-[9.5px] sm:text-[10.5px] leading-[1.15]';
  }
  // Moderado largo: palabras de 9-10 letras o nombre de 14+ letras
  if (maxWordLen >= 9 || len >= 14) {
    return 'text-[10.5px] sm:text-[11.5px] leading-[1.2]';
  }
  // Ligeramente largo: palabras de 8 letras o nombre de 10+ letras
  if (maxWordLen >= 8 || len >= 10) {
    return 'text-[11px] sm:text-xs leading-tight';
  }
  // Corto (6-7 letras)
  return 'text-xs sm:text-sm leading-tight';
}

export const ProductTextCatalog: React.FC<ProductTextCatalogProps> = ({
  products,
  onSelectProduct,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  salsas = [],
  onSelectSalsa,
}) => {
  const isMorning = products.some((p) => p.shift === 'manana' || p.category === 'ESPECIALIDADES' || p.category === 'PASTAS');

  // Categorías fijas según turno
  const filterCategories = isMorning
    ? ['Todas', 'Entradas', 'Pastas', 'Especialidades', 'Bebidas']
    : ['Todas', 'Pizzas', 'Bebidas', 'Salsas'];

  // Coincidencia de búsqueda
  const matchesSearch = (product: Product): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      product.name.toLowerCase().includes(q) ||
      (product.description && product.description.toLowerCase().includes(q)) ||
      (product.baseIngredients && product.baseIngredients.some((ing) => ing.toLowerCase().includes(q)))
    );
  };

  const matchesSearchSalsa = (salsa: Ingredient): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return salsa.name.toLowerCase().includes(q);
  };

  const selCat = selectedCategory.toUpperCase();

  // Filtrado de productos para la Mañana por categorías individuales
  const morningEntradas = isMorning
    ? products
        .filter((p) => !isDrinkProduct(p) && (p.category || '').toUpperCase().includes('ENTRADA'))
        .filter(matchesSearch)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    : [];

  const morningPastas = isMorning
    ? products
        .filter((p) => !isDrinkProduct(p) && (p.category || '').toUpperCase().includes('PASTA'))
        .filter(matchesSearch)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    : [];

  const morningEspecialidades = isMorning
    ? products
        .filter((p) => !isDrinkProduct(p) && (p.category || '').toUpperCase().includes('ESPECIALIDAD'))
        .filter(matchesSearch)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    : [];

  const morningOtrasComidas = isMorning
    ? products
        .filter(
          (p) =>
            !isDrinkProduct(p) &&
            !(p.category || '').toUpperCase().includes('ENTRADA') &&
            !(p.category || '').toUpperCase().includes('PASTA') &&
            !(p.category || '').toUpperCase().includes('ESPECIALIDAD')
        )
        .filter(matchesSearch)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    : [];

  // Productos de Noche (Pizzas y Comidas)
  const nightPizzas = !isMorning
    ? products
        .filter((p) => !isDrinkProduct(p))
        .filter(matchesSearch)
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    : [];

  // Bebidas (ambos turnos)
  const drinkProducts = products
    .filter((p) => isDrinkProduct(p))
    .filter(matchesSearch)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  // Salsas (turno noche)
  const salsaProducts = (!isMorning ? salsas || [] : [])
    .filter((s) => s.ingredientType === 'salsa' || s.category === 'Salsas')
    .filter((s) => s.available !== false)
    .filter(matchesSearchSalsa)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

  // Determinar visibilidad de secciones según filtro seleccionado
  const showEntradas = isMorning && (selCat === 'TODAS' || selCat === 'ENTRADAS') && morningEntradas.length > 0;
  const showPastas = isMorning && (selCat === 'TODAS' || selCat === 'PASTAS') && morningPastas.length > 0;
  const showEspecialidades = isMorning && (selCat === 'TODAS' || selCat === 'ESPECIALIDADES') && morningEspecialidades.length > 0;
  const showOtras = isMorning && selCat === 'TODAS' && morningOtrasComidas.length > 0;
  const showDrinks = (selCat === 'TODAS' || selCat === 'BEBIDAS') && drinkProducts.length > 0;
  const showNightPizzas = !isMorning && (selCat === 'TODAS' || selCat === 'PIZZAS' || selCat === 'COMIDAS') && nightPizzas.length > 0;
  const showSalsas = !isMorning && (selCat === 'TODAS' || selCat === 'SALSAS') && salsaProducts.length > 0;

  const totalVisibleCount =
    (showEntradas ? morningEntradas.length : 0) +
    (showPastas ? morningPastas.length : 0) +
    (showEspecialidades ? morningEspecialidades.length : 0) +
    (showOtras ? morningOtrasComidas.length : 0) +
    (showDrinks ? drinkProducts.length : 0) +
    (showNightPizzas ? nightPizzas.length : 0) +
    (showSalsas ? salsaProducts.length : 0);

  // Componente de Sección Compacta
  const renderProductSection = (
    title: string,
    style: CategoryStyle,
    items: Product[],
    subtitle?: string
  ) => {
    if (items.length === 0) return null;
    return (
      <div key={title} className="space-y-1.5">
        {/* Encabezado Compacto */}
        <div
          className={`flex items-center justify-between px-3 py-1.5 rounded-xl border ${style.headerBg} ${style.headerBorder} ${style.headerText} select-none`}
        >
          <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm tracking-wide uppercase">
            <span className="text-base">{style.icon}</span>
            <span>{title}</span>
            {subtitle && (
              <span className="text-[10px] sm:text-xs font-semibold opacity-75 hidden sm:inline uppercase">
                ({subtitle})
              </span>
            )}
          </div>
          <span
            className={`text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full ${style.headerBadge} uppercase`}
          >
            {items.length} {items.length === 1 ? 'ÍTEM' : 'ÍTEMS'}
          </span>
        </div>

        {/* Grilla Responsiva: 4 a 5 ítems por fila en pantallas estándar y tablets */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5">
          {items.map((product) => {
            const priceUSD = Number(product.price) || 0;
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelectProduct(product)}
                className={`w-full flex flex-row items-center justify-between px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-xl border transition-all duration-150 min-h-[50px] sm:min-h-[54px] shadow-2xs hover:shadow-xs group active:scale-[0.98] cursor-pointer text-left ${style.cardBg} ${style.cardBorder} ${style.cardHoverBg} ${style.cardHoverBorder}`}
                title={`${product.name.toUpperCase()} - $${priceUSD.toFixed(2)} USD`}
              >
                {/* Lado Izquierdo: SOLO el nombre del producto, dinámicamente ajustado para 1, 2 o más líneas sin cortarse */}
                <span
                  className={`font-black uppercase flex-1 min-w-0 pr-1 break-words [overflow-wrap:anywhere] line-clamp-3 text-left ${getProductNameFontSize(product.name)} ${style.textColor}`}
                >
                  {product.name.toUpperCase()}
                </span>
                {/* Lado Derecho: SIEMPRE el precio en $, optimizado para no restar espacio al nombre */}
                <span
                  className={`font-black text-[11px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-lg border shrink-0 whitespace-nowrap shadow-2xs text-right ${style.priceBadge}`}
                >
                  ${priceUSD.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Barra Superior: Buscador y Chips de Filtrado */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-200 shrink-0">
        {/* Input de Búsqueda */}
        <div className="relative flex-1 min-w-[160px]">
          <IoSearch className="absolute left-3 top-2.5 text-gray-400 text-sm" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              isMorning
                ? 'Buscar plato, bebida o ingrediente...'
                : 'Buscar pizza, salsa, bebida...'
            }
            className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-gray-50 border border-gray-300 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 font-bold"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-2 text-gray-400 hover:text-black cursor-pointer p-0.5"
            >
              <IoClose className="text-sm" />
            </button>
          )}
        </div>

        {/* Chips de Categorías */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
          {filterCategories.map((cat) => {
            const isSelected = selCat === cat.toUpperCase();
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap transition-all cursor-pointer text-center uppercase ${
                  isSelected
                    ? 'bg-green-500 text-black border-2 border-green-600 shadow-xs scale-[1.02]'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-transparent'
                }`}
              >
                {cat.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* LISTADO DE SECCIONES CON TARJETAS RECTANGULARES COMPACTAS */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 scrollbar-thin">
        {totalVisibleCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-gray-400 text-xs sm:text-sm font-bold uppercase">
            <p>NO SE ENCONTRARON PRODUCTOS PARA "{searchQuery.toUpperCase()}"</p>
          </div>
        ) : (
          <>
            {/* TURNO MAÑANA: Separación por colores para Entradas, Pastas, Especialidades y Bebidas */}
            {showEntradas &&
              renderProductSection('ENTRADAS', STYLE_ENTRADAS, morningEntradas, 'Verde Esmeralda')}

            {showPastas &&
              renderProductSection('PASTAS', STYLE_PASTAS, morningPastas, 'Ámbar Cálido')}

            {showEspecialidades &&
              renderProductSection('ESPECIALIDADES', STYLE_ESPECIALIDADES, morningEspecialidades, 'Rojo Rubí')}

            {showOtras &&
              renderProductSection('OTROS PLATOS', STYLE_ESPECIALIDADES, morningOtrasComidas)}

            {/* TURNO NOCHE: Pizzas y Comidas (Rojo Pizzería Cálido) */}
            {showNightPizzas &&
              renderProductSection('PIZZAS Y COMIDAS', STYLE_PIZZAS, nightPizzas)}

            {/* BEBIDAS: Ambos turnos (Azul Cielo) */}
            {showDrinks &&
              renderProductSection('BEBIDAS', STYLE_BEBIDAS, drinkProducts, 'Refrescos, Aguas, Cervezas')}

            {/* TURNO NOCHE: Salsas (Ámbar Miel) */}
            {showSalsas && salsaProducts.length > 0 && (
              <div key="SALSAS" className="space-y-1.5">
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-xl border ${STYLE_SALSAS.headerBg} ${STYLE_SALSAS.headerBorder} ${STYLE_SALSAS.headerText} select-none`}>
                  <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm tracking-wide uppercase">
                    <span className="text-base">{STYLE_SALSAS.icon}</span>
                    <span>SALSAS</span>
                    <span className="text-[10px] sm:text-xs font-semibold opacity-75 hidden sm:inline uppercase">
                      (Porciones para cocina - $0.00)
                    </span>
                  </div>
                  <span className={`text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full ${STYLE_SALSAS.headerBadge} uppercase`}>
                    {salsaProducts.length} {salsaProducts.length === 1 ? 'ÍTEM' : 'ÍTEMS'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5">
                  {salsaProducts.map((salsa) => (
                    <button
                      key={salsa.id}
                      type="button"
                      onClick={() => onSelectSalsa && onSelectSalsa(salsa)}
                      className={`w-full flex flex-row items-center justify-between px-2 py-1.5 sm:px-2.5 sm:py-2 rounded-xl border transition-all duration-150 min-h-[50px] sm:min-h-[54px] shadow-2xs hover:shadow-xs group active:scale-[0.98] cursor-pointer text-left ${STYLE_SALSAS.cardBg} ${STYLE_SALSAS.cardBorder} ${STYLE_SALSAS.cardHoverBg} ${STYLE_SALSAS.cardHoverBorder}`}
                      title={`${salsa.name.toUpperCase()} - Clic para agregar directo a la comanda (+1)`}
                    >
                      <span
                        className={`font-black uppercase flex-1 min-w-0 pr-1 break-words [overflow-wrap:anywhere] line-clamp-3 text-left ${getProductNameFontSize(salsa.name)} ${STYLE_SALSAS.textColor}`}
                      >
                        {salsa.name.toUpperCase()}
                      </span>
                      <span className={`font-black text-[11px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-lg border shrink-0 whitespace-nowrap shadow-2xs text-right ${STYLE_SALSAS.priceBadge}`}>
                        $0.00
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
