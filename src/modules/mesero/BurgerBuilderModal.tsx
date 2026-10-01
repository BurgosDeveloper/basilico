import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, Ingredient, BurgerUnitConfig, OrderItem, HalfDetails } from '../../data/mockData';
import { getIngredientExtraPrice } from '../../utils/pizzaPricing';
import { roundCOP } from '../../utils/currencyRounding';
import { getCleanItemNote } from '../../utils/burgerProteins';
import {
  IoClose,
  IoAdd,
  IoRemove,
  IoCheckmark,
  IoCloseCircle,
  IoChevronDown,
  IoChevronUp,
  IoCopyOutline,
  IoRefreshOutline,
} from 'react-icons/io5';

// Constantes y fallbacks de compatibilidad
export const AVAILABLE_BURGER_PROTEINS = [
  { id: 'queso_mozzarella', name: 'QUESO MOZZARELLA', icon: '🧀' },
  { id: 'pepperoni', name: 'PEPPERONI', icon: '🍕' },
  { id: 'jamon', name: 'JAMÓN', icon: '🥓' },
  { id: 'tocineta', name: 'TOCINETA', icon: '🥓' },
  { id: 'pollo', name: 'POLLO', icon: '🍗' },
  { id: 'lomito', name: 'LOMITO', icon: '🥩' },
];

export const STRICT_FREE_TOPPINGS: { id: string; name: string }[] = [];

export interface PizzaHalfDetail {
  flavor: string;
  baseIngredients: string[];
  removedIngredients: string[];
  selectedPaidExtras: { name: string; price: number; quantity?: number; unitPrice?: number; category?: string }[];
}

export interface BurgerOrderConfirmationItem {
  burger: Product;
  quantity: number;
  size: 'Grande' | 'Pequeña';
  isHalfHalf: boolean;
  halfDetails?: HalfDetails;
  proteins?: string[];
  removedIngredients: string[];
  extras: Array<{ name: string; price: number; quantity?: number; unitPrice?: number; category?: string }>;
  isTakeaway: boolean;
  isDelivery?: boolean;
  isCut: boolean;
  cutPreference?: 'Entera' | 'Picada';
  notes?: string;
  finalPrice: number;
}

interface BurgerBuilderModalProps {
  burger: Product | null;
  availableExtras: Ingredient[];
  availableProteins?: Ingredient[];
  availableFreeToppings?: Ingredient[];
  availablePizzas?: Product[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]) => void;
  defaultTakeaway?: boolean;
  defaultDelivery?: boolean;
  exchangeRates?: { COP: number; Bs: number };
  inline?: boolean;
  initialEditItem?: OrderItem | null;
}

/**
 * Obtiene el precio base de una pizza según su tamaño.
 */
function getPizzaBasePrice(product: Product, size: 'Grande' | 'Pequeña'): number {
  if (size === 'Pequeña') {
    if (product.priceSmall !== undefined && product.priceSmall !== null && Number(product.priceSmall) > 0) {
      return Number(product.priceSmall);
    }
    const largePrice = Number(product.price) || 0;
    return largePrice > 4 ? largePrice - 4 : Number((largePrice * 0.6).toFixed(2));
  }
  return Number(product.price) || 0;
}

/**
 * Recalcula dinámicamente los precios de los adicionales al cambiar de tamaño o mitad
 */
function recalculateExtrasForSize(
  extras: { name: string; price: number; quantity?: number; unitPrice?: number }[],
  newSize: 'Grande' | 'Pequeña',
  isHalf: boolean,
  availableExtras: Ingredient[]
) {
  return extras.map((e) => {
    const ing = availableExtras.find(
      (a) => a.name.toLowerCase().trim() === e.name.toLowerCase().trim()
    );
    const unitPrice = getIngredientExtraPrice(ing, newSize, isHalf);
    const quantity = e.quantity || 1;
    return {
      name: e.name,
      unitPrice,
      price: unitPrice * quantity,
      quantity,
    };
  });
}

/**
 * Crea la configuración inicial de una pizza
 */
const createInitialUnitConfig = (
  unitIndex: number,
  burger: Product,
  defaultTakeaway: boolean,
  defaultDelivery: boolean = false,
  availablePizzas: Product[] = []
): BurgerUnitConfig => {
  const isMorningItem = burger.shift === 'manana' || (!burger.category?.toLowerCase().includes('pizza') && burger.shift !== 'noche');
  const initialSize: 'Grande' | 'Pequeña' = 'Grande';
  const otherPizza = availablePizzas.find((p) => p.id !== burger.id && (p.category || '').toLowerCase().includes('pizza')) || burger;
  const baseIngredients = burger.baseIngredients && burger.baseIngredients.length > 0
    ? burger.baseIngredients
    : (isMorningItem ? [] : ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano']);

  const otherBaseIngredients = otherPizza.baseIngredients && otherPizza.baseIngredients.length > 0
    ? otherPizza.baseIngredients
    : ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano'];

  return {
    unitIndex,
    size: initialSize,
    isHalfHalf: false,
    removedIngredients: [],
    selectedPaidExtras: [],
    half1: {
      flavor: burger.name,
      baseIngredients: [...baseIngredients],
      removedIngredients: [],
      selectedPaidExtras: [],
    },
    half2: {
      flavor: otherPizza.name,
      baseIngredients: [...otherBaseIngredients],
      removedIngredients: [],
      selectedPaidExtras: [],
    },
    activeHalf: 0,
    isTakeaway: defaultTakeaway && !defaultDelivery,
    isDelivery: defaultDelivery,
    isCut: false,
    cutPreference: 'Entera',
    notes: '',
    subtotalUSD: isMorningItem ? (Number(burger.price) || 0) : getPizzaBasePrice(burger, initialSize),
    proteins: [],
    selectedFreeToppings: [],
  };
};

/**
 * Crea la configuración a partir de un ítem existente a editar
 */
const createEditUnitConfig = (
  unitIndex: number,
  burger: Product,
  item: OrderItem,
  availablePizzas: Product[] = []
): BurgerUnitConfig => {
  const initialSize: 'Grande' | 'Pequeña' = (item.size as 'Grande' | 'Pequeña') || 'Grande';
  const isHalfHalf = Boolean(item.isHalfHalf);

  const allExtras = Array.isArray(item.extras) ? item.extras : [];
  const paidExtras = allExtras
    .filter((e) => Number(e.price) > 0)
    .map((e) => {
      const cleanName = (e.name || '').replace(/^\+?\s*(ADD|EXTRA):?\s*/i, '').trim();
      const match = cleanName.match(/^(\d+)x\s*(.*)$/i);
      const quantity = e.quantity || (match ? parseInt(match[1], 10) : 1);
      const name = match ? match[2].trim() : cleanName;
      const totalPrice = Number(e.price);
      const unitPrice = e.unitPrice || (quantity > 0 ? totalPrice / quantity : totalPrice);
      return { name, price: totalPrice, unitPrice, quantity };
    });

  const h1Name = item.halfDetails?.half1Name || burger.name;
  const p1 = availablePizzas.find((p) => p.name.toUpperCase() === h1Name.toUpperCase()) || burger;

  const h2Name = item.halfDetails?.half2Name || availablePizzas.find((p) => p.id !== burger.id)?.name || burger.name;
  const p2 = availablePizzas.find((p) => p.name.toUpperCase() === h2Name.toUpperCase()) || p1;

  const h1Extras = (item.halfDetails?.half1Extras || []).map((e) => ({
    name: e.name,
    price: Number(e.price) || 0,
    unitPrice: e.unitPrice || (Number(e.price) || 0),
    quantity: e.quantity || 1,
  }));

  const h2Extras = (item.halfDetails?.half2Extras || []).map((e) => ({
    name: e.name,
    price: Number(e.price) || 0,
    unitPrice: e.unitPrice || (Number(e.price) || 0),
    quantity: e.quantity || 1,
  }));

  const baseIngredients = burger.baseIngredients && burger.baseIngredients.length > 0
    ? burger.baseIngredients
    : ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano'];

  return {
    unitIndex,
    size: initialSize,
    isHalfHalf,
    removedIngredients: item.removedIngredients || [],
    selectedPaidExtras: isHalfHalf ? [] : paidExtras,
    half1: {
      flavor: h1Name,
      baseIngredients: p1.baseIngredients || baseIngredients,
      removedIngredients: item.halfDetails?.half1Removed || [],
      selectedPaidExtras: h1Extras,
    },
    half2: {
      flavor: h2Name,
      baseIngredients: p2.baseIngredients || baseIngredients,
      removedIngredients: item.halfDetails?.half2Removed || [],
      selectedPaidExtras: h2Extras,
    },
    activeHalf: 0,
    isTakeaway: !!item.isTakeaway && !item.isDelivery,
    isDelivery: !!item.isDelivery,
    isCut: !!item.isCut || item.cutPreference === 'Picada',
    cutPreference: item.cutPreference || (item.isCut ? 'Picada' : 'Entera'),
    notes: getCleanItemNote(item.notes) || '',
    subtotalUSD: item.price || burger.price || 0,
    proteins: [],
    selectedFreeToppings: [],
  };
};

function areUnitsIdentical(a: BurgerUnitConfig, b: BurgerUnitConfig): boolean {
  if (a.size !== b.size) return false;
  if (Boolean(a.isHalfHalf) !== Boolean(b.isHalfHalf)) return false;
  if (Boolean(a.isTakeaway) !== Boolean(b.isTakeaway)) return false;
  if (Boolean(a.isDelivery) !== Boolean(b.isDelivery)) return false;
  if (a.isCut !== b.isCut) return false;
  if (a.cutPreference !== b.cutPreference) return false;
  if (getCleanItemNote(a.notes) !== getCleanItemNote(b.notes)) return false;

  if (!a.isHalfHalf) {
    const aRem = [...a.removedIngredients].sort().join('|');
    const bRem = [...b.removedIngredients].sort().join('|');
    if (aRem !== bRem) return false;

    const aPaid = (a.selectedPaidExtras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    const bPaid = (b.selectedPaidExtras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    if (aPaid !== bPaid) return false;
  } else {
    if (a.half1?.flavor !== b.half1?.flavor) return false;
    if (a.half2?.flavor !== b.half2?.flavor) return false;

    const aH1Rem = [...(a.half1?.removedIngredients || [])].sort().join('|');
    const bH1Rem = [...(b.half1?.removedIngredients || [])].sort().join('|');
    if (aH1Rem !== bH1Rem) return false;

    const aH2Rem = [...(a.half2?.removedIngredients || [])].sort().join('|');
    const bH2Rem = [...(b.half2?.removedIngredients || [])].sort().join('|');
    if (aH2Rem !== bH2Rem) return false;

    const aH1Paid = (a.half1?.selectedPaidExtras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    const bH1Paid = (b.half1?.selectedPaidExtras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    if (aH1Paid !== bH1Paid) return false;

    const aH2Paid = (a.half2?.selectedPaidExtras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    const bH2Paid = (b.half2?.selectedPaidExtras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    if (aH2Paid !== bH2Paid) return false;
  }

  return true;
}

export const BurgerBuilderModal: React.FC<BurgerBuilderModalProps> = ({
  burger,
  availableExtras,
  availablePizzas = [],
  isOpen,
  onClose,
  onConfirm,
  defaultTakeaway = false,
  defaultDelivery = false,
  exchangeRates = { COP: 3950, Bs: 36.5 },
  inline = false,
  initialEditItem,
}) => {
  const [units, setUnits] = useState<BurgerUnitConfig[]>([]);
  const [activeUnitIndex, setActiveUnitIndex] = useState<number>(0);
  const [showExtrasPanel, setShowExtrasPanel] = useState<boolean>(false);
  const [showHalfExtrasPanel, setShowHalfExtrasPanel] = useState<boolean>(false);
  const [copyToast, setCopyToast] = useState<string>('');

  // Catálogo completo de pizzas disponibles para selección de sabores en Mitad y Mitad
  const effectivePizzas = useMemo(() => {
    if (availablePizzas && availablePizzas.length > 0) {
      return availablePizzas;
    }
    return burger ? [burger] : [];
  }, [availablePizzas, burger]);

  // Ref de control para inicialización
  const activePizzaIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && burger) {
      const activeKey = initialEditItem ? `edit-${initialEditItem.id}` : `create-${burger.id}`;
      if (activePizzaIdRef.current !== activeKey) {
        activePizzaIdRef.current = activeKey;
        if (initialEditItem) {
          const qty = Math.max(1, initialEditItem.quantity || 1);
          const editUnits: BurgerUnitConfig[] = [];
          for (let i = 0; i < qty; i++) {
            editUnits.push(createEditUnitConfig(i, burger, initialEditItem, effectivePizzas));
          }
          setUnits(editUnits);
        } else {
          setUnits([createInitialUnitConfig(0, burger, defaultTakeaway, defaultDelivery, effectivePizzas)]);
        }
        setActiveUnitIndex(0);
        setCopyToast('');
      }
    } else if (!isOpen) {
      activePizzaIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, burger?.id, initialEditItem?.id, effectivePizzas]);

  const isMorning = Boolean(
    burger?.shift === 'manana' ||
    (burger?.category && ['ENTRADAS', 'PASTAS', 'ESPECIALIDADES'].includes(burger.category.toUpperCase())) ||
    (!burger?.category?.toLowerCase().includes('pizza') && burger?.shift !== 'noche')
  );

  // Lista de adicionales pagos válidos (contornos para turno mañana, toppings para pizza en la noche)
  const paidExtrasList = useMemo(() => {
    if (isMorning) {
      return availableExtras.filter((extra) => {
        const isNotGratis = extra.ingredientType !== 'gratis' && extra.category?.toLowerCase() !== 'gratis';
        const isContorno = extra.category?.toUpperCase() === 'CONTORNOS' || extra.shift === 'manana';
        return isNotGratis && (isContorno || (!extra.shift && extra.category?.toUpperCase() !== 'PIZZA'));
      });
    }
    return availableExtras.filter((extra) => {
      const isExtraAllowed = extra.isExtraForPizza !== false && extra.isExtra !== false && extra.shift !== 'manana';
      const isNotGratis = extra.ingredientType !== 'gratis' && extra.category?.toLowerCase() !== 'gratis';
      return isExtraAllowed && isNotGratis;
    });
  }, [availableExtras, isMorning]);

  if (!isOpen || !burger || units.length === 0) return null;

  const currentUnit = units[activeUnitIndex] || units[0];

  // Helper para modificar la unidad activa
  const updateCurrentUnit = (updater: (prev: BurgerUnitConfig) => BurgerUnitConfig) => {
    setUnits((prev) =>
      prev.map((u, idx) => (idx === activeUnitIndex ? updater(u) : u))
    );
  };

  // Alternar tamaño de la pizza (Grande <-> Pequeña) y recalcular todos sus adicionales
  const handleToggleSize = (newSize: 'Grande' | 'Pequeña') => {
    if (currentUnit.size === newSize) return;
    updateCurrentUnit((prev) => {
      const updatedCompletaExtras = recalculateExtrasForSize(
        prev.selectedPaidExtras,
        newSize,
        false,
        availableExtras
      );
      const updatedH1Extras = recalculateExtrasForSize(
        prev.half1?.selectedPaidExtras || [],
        newSize,
        true,
        availableExtras
      );
      const updatedH2Extras = recalculateExtrasForSize(
        prev.half2?.selectedPaidExtras || [],
        newSize,
        true,
        availableExtras
      );

      return {
        ...prev,
        size: newSize,
        selectedPaidExtras: updatedCompletaExtras,
        half1: {
          ...prev.half1!,
          selectedPaidExtras: updatedH1Extras,
        },
        half2: {
          ...prev.half2!,
          selectedPaidExtras: updatedH2Extras,
        },
      };
    });
  };

  // Alternar formato (Completa <-> Mitad y Mitad)
  const handleToggleFormat = (isHalf: boolean) => {
    if (currentUnit.isHalfHalf === isHalf) return;
    updateCurrentUnit((prev) => {
      if (isHalf) {
        // Al pasar a Mitad y Mitad:
        // La 1ra mitad hereda la configuración de la pizza completa si estaba vacía
        const h1Extras = prev.half1?.selectedPaidExtras.length
          ? prev.half1.selectedPaidExtras
          : recalculateExtrasForSize(prev.selectedPaidExtras, prev.size || 'Grande', true, availableExtras);

        return {
          ...prev,
          isHalfHalf: true,
          activeHalf: 0,
          half1: {
            flavor: prev.half1?.flavor || burger.name,
            baseIngredients: prev.half1?.baseIngredients || burger.baseIngredients || ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano'],
            removedIngredients: prev.half1?.removedIngredients.length ? prev.half1.removedIngredients : [...prev.removedIngredients],
            selectedPaidExtras: h1Extras,
          },
        };
      } else {
        // Al pasar a Completa:
        const completaExtras = recalculateExtrasForSize(
          prev.half1?.selectedPaidExtras || prev.selectedPaidExtras,
          prev.size || 'Grande',
          false,
          availableExtras
        );
        return {
          ...prev,
          isHalfHalf: false,
          selectedPaidExtras: completaExtras,
          removedIngredients: prev.half1?.removedIngredients || prev.removedIngredients,
        };
      }
    });
  };

  // Manejo de Cantidad de Pizzas
  const handleIncreaseQuantity = () => {
    setUnits((prev) => {
      const nextIndex = prev.length;
      const source = prev[activeUnitIndex] || prev[0];
      const newUnit: BurgerUnitConfig = {
        ...source,
        unitIndex: nextIndex,
        removedIngredients: [...source.removedIngredients],
        selectedPaidExtras: source.selectedPaidExtras.map((e) => ({ ...e })),
        half1: {
          ...source.half1!,
          baseIngredients: [...source.half1!.baseIngredients],
          removedIngredients: [...source.half1!.removedIngredients],
          selectedPaidExtras: source.half1!.selectedPaidExtras.map((e) => ({ ...e })),
        },
        half2: {
          ...source.half2!,
          baseIngredients: [...source.half2!.baseIngredients],
          removedIngredients: [...source.half2!.removedIngredients],
          selectedPaidExtras: source.half2!.selectedPaidExtras.map((e) => ({ ...e })),
        },
      };
      return [...prev, newUnit];
    });
    setActiveUnitIndex(units.length);
  };

  const handleDecreaseQuantity = () => {
    if (units.length <= 1) return;
    setUnits((prev) => prev.slice(0, prev.length - 1));
    if (activeUnitIndex >= units.length - 1) {
      setActiveUnitIndex(Math.max(0, units.length - 2));
    }
  };

  // Copiar configuración activa a todas las demás
  const handleCopyActiveToAll = () => {
    const active = units[activeUnitIndex];
    if (!active) return;
    setUnits((prev) =>
      prev.map((u, idx) =>
        idx === activeUnitIndex
          ? u
          : {
              ...active,
              unitIndex: idx,
              removedIngredients: [...active.removedIngredients],
              selectedPaidExtras: active.selectedPaidExtras.map((e) => ({ ...e })),
              half1: {
                ...active.half1!,
                baseIngredients: [...active.half1!.baseIngredients],
                removedIngredients: [...active.half1!.removedIngredients],
                selectedPaidExtras: active.half1!.selectedPaidExtras.map((e) => ({ ...e })),
              },
              half2: {
                ...active.half2!,
                baseIngredients: [...active.half2!.baseIngredients],
                removedIngredients: [...active.half2!.removedIngredients],
                selectedPaidExtras: active.half2!.selectedPaidExtras.map((e) => ({ ...e })),
              },
            }
      )
    );
    setCopyToast(`¡Personalización de #${activeUnitIndex + 1} copiada a las ${units.length} pizzas!`);
    setTimeout(() => setCopyToast(''), 2500);
  };

  // Resetear unidad activa a valores iniciales
  const handleResetCurrentUnit = () => {
    if (!burger) return;
    const fresh = createInitialUnitConfig(activeUnitIndex, burger, defaultTakeaway, defaultDelivery, effectivePizzas);
    updateCurrentUnit(() => fresh);
    setCopyToast(`Pizza #${activeUnitIndex + 1} restablecida a su receta base.`);
    setTimeout(() => setCopyToast(''), 2000);
  };

  // Manejo de Sabor para Mitades en Mitad y Mitad
  const handleSelectHalfFlavor = (halfIndex: 0 | 1, pizza: Product) => {
    updateCurrentUnit((prev) => {
      const targetHalfKey = halfIndex === 0 ? 'half1' : 'half2';
      const existingHalf = prev[targetHalfKey]!;
      const baseIngredients = pizza.baseIngredients && pizza.baseIngredients.length > 0
        ? pizza.baseIngredients
        : ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano'];

      return {
        ...prev,
        [targetHalfKey]: {
          ...existingHalf,
          flavor: pizza.name,
          baseIngredients: [...baseIngredients],
          removedIngredients: [], // Reiniciar exclusiones para la nueva receta
        },
      };
    });
  };

  // Toggle para remover ingredientes base ("SIN ...")
  const toggleRemoveBase = (ingName: string, halfIndex?: 0 | 1) => {
    updateCurrentUnit((prev) => {
      if (prev.isHalfHalf && halfIndex !== undefined) {
        const targetHalfKey = halfIndex === 0 ? 'half1' : 'half2';
        const targetHalf = prev[targetHalfKey]!;
        const alreadyRemoved = targetHalf.removedIngredients.some(
          (i) => i.toLowerCase().trim() === ingName.toLowerCase().trim()
        );
        const updatedRemoved = alreadyRemoved
          ? targetHalf.removedIngredients.filter((i) => i.toLowerCase().trim() !== ingName.toLowerCase().trim())
          : [...targetHalf.removedIngredients, ingName];

        return {
          ...prev,
          [targetHalfKey]: {
            ...targetHalf,
            removedIngredients: updatedRemoved,
          },
        };
      } else {
        const alreadyRemoved = prev.removedIngredients.some(
          (i) => i.toLowerCase().trim() === ingName.toLowerCase().trim()
        );
        const updatedRemoved = alreadyRemoved
          ? prev.removedIngredients.filter((i) => i.toLowerCase().trim() !== ingName.toLowerCase().trim())
          : [...prev.removedIngredients, ingName];

        return {
          ...prev,
          removedIngredients: updatedRemoved,
        };
      }
    });
  };

  // Toggle de Adicional con Costo (+ ADD / CONTORNO)
  const togglePaidExtra = (extraIng: Ingredient, halfIndex?: 0 | 1) => {
    const isHalf = Boolean(currentUnit.isHalfHalf);
    const unitPrice = isMorning
      ? (Number(extraIng.priceUSD) || 1.0)
      : getIngredientExtraPrice(extraIng, currentUnit.size, isHalf);

    updateCurrentUnit((prev) => {
      if (prev.isHalfHalf && halfIndex !== undefined) {
        const targetHalfKey = halfIndex === 0 ? 'half1' : 'half2';
        const targetHalf = prev[targetHalfKey]!;
        const existingIndex = targetHalf.selectedPaidExtras.findIndex(
          (e) => e.name.toLowerCase().trim() === extraIng.name.toLowerCase().trim()
        );

        if (existingIndex === -1) {
          return {
            ...prev,
            [targetHalfKey]: {
              ...targetHalf,
              selectedPaidExtras: [
                ...targetHalf.selectedPaidExtras,
                { name: extraIng.name, price: unitPrice, unitPrice, quantity: 1, category: extraIng.category },
              ],
            },
          };
        }

        const existing = targetHalf.selectedPaidExtras[existingIndex];
        const currentQty = existing.quantity || 1;

        if (currentQty < 3) {
          const nextQty = currentQty + 1;
          const updated = [...targetHalf.selectedPaidExtras];
          updated[existingIndex] = {
            ...existing,
            quantity: nextQty,
            unitPrice,
            price: unitPrice * nextQty,
            category: extraIng.category || existing.category,
          };
          return {
            ...prev,
            [targetHalfKey]: {
              ...targetHalf,
              selectedPaidExtras: updated,
            },
          };
        }

        return {
          ...prev,
          [targetHalfKey]: {
            ...targetHalf,
            selectedPaidExtras: targetHalf.selectedPaidExtras.filter((_, idx) => idx !== existingIndex),
          },
        };
      } else {
        const existingIndex = prev.selectedPaidExtras.findIndex(
          (e) => e.name.toLowerCase().trim() === extraIng.name.toLowerCase().trim()
        );

        if (existingIndex === -1) {
          return {
            ...prev,
            selectedPaidExtras: [
              ...prev.selectedPaidExtras,
              { name: extraIng.name, price: unitPrice, unitPrice, quantity: 1, category: extraIng.category || (isMorning ? 'CONTORNOS' : undefined) },
            ],
          };
        }

        const existing = prev.selectedPaidExtras[existingIndex];
        const currentQty = existing.quantity || 1;

        if (currentQty < 3) {
          const nextQty = currentQty + 1;
          const updated = [...prev.selectedPaidExtras];
          updated[existingIndex] = {
            ...existing,
            quantity: nextQty,
            unitPrice,
            price: unitPrice * nextQty,
            category: extraIng.category || existing.category || (isMorning ? 'CONTORNOS' : undefined),
          };
          return {
            ...prev,
            selectedPaidExtras: updated,
          };
        }

        return {
          ...prev,
          selectedPaidExtras: prev.selectedPaidExtras.filter((_, idx) => idx !== existingIndex),
        };
      }
    });
  };

  // Quitar adicional directamente
  const removePaidExtra = (extraName: string, halfIndex?: 0 | 1) => {
    updateCurrentUnit((prev) => {
      if (prev.isHalfHalf && halfIndex !== undefined) {
        const targetHalfKey = halfIndex === 0 ? 'half1' : 'half2';
        const targetHalf = prev[targetHalfKey]!;
        return {
          ...prev,
          [targetHalfKey]: {
            ...targetHalf,
            selectedPaidExtras: targetHalf.selectedPaidExtras.filter(
              (e) => e.name.toLowerCase().trim() !== extraName.toLowerCase().trim()
            ),
          },
        };
      } else {
        return {
          ...prev,
          selectedPaidExtras: prev.selectedPaidExtras.filter(
            (e) => e.name.toLowerCase().trim() !== extraName.toLowerCase().trim()
          ),
        };
      }
    });
  };

  // Cálculos Financieros de la Unidad Activa
  const currentUnitSize = currentUnit.size || 'Grande';
  let currentUnitBasePrice = 0;
  let currentUnitExtrasTotal = 0;

  if (currentUnit.isHalfHalf && currentUnit.half1 && currentUnit.half2) {
    const p1 = effectivePizzas.find((p) => p.name.toUpperCase() === currentUnit.half1.flavor.toUpperCase()) || burger;
    const p2 = effectivePizzas.find((p) => p.name.toUpperCase() === currentUnit.half2.flavor.toUpperCase()) || burger;
    const p1Base = getPizzaBasePrice(p1, currentUnitSize);
    const p2Base = getPizzaBasePrice(p2, currentUnitSize);
    // En Mitad y Mitad el precio base es el mayor de ambas mitades
    currentUnitBasePrice = Math.max(p1Base, p2Base);
    const h1Sum = currentUnit.half1.selectedPaidExtras.reduce((s, e) => s + e.price, 0);
    const h2Sum = currentUnit.half2.selectedPaidExtras.reduce((s, e) => s + e.price, 0);
    currentUnitExtrasTotal = h1Sum + h2Sum;
  } else {
    currentUnitBasePrice = isMorning ? (Number(burger.price) || 0) : getPizzaBasePrice(burger, currentUnitSize);
    currentUnitExtrasTotal = currentUnit.selectedPaidExtras.reduce((sum, e) => sum + e.price, 0);
  }

  const currentUnitPrice = currentUnitBasePrice + currentUnitExtrasTotal;

  // Gran Total de todas las unidades seleccionadas
  const grandTotalPrice = units.reduce((total, u) => {
    const uSize = u.size || 'Grande';
    let uBase = 0;
    let uExtras = 0;

    if (u.isHalfHalf && u.half1 && u.half2) {
      const p1 = effectivePizzas.find((p) => p.name.toUpperCase() === u.half1.flavor.toUpperCase()) || burger;
      const p2 = effectivePizzas.find((p) => p.name.toUpperCase() === u.half2.flavor.toUpperCase()) || burger;
      uBase = Math.max(getPizzaBasePrice(p1, uSize), getPizzaBasePrice(p2, uSize));
      uExtras = u.half1.selectedPaidExtras.reduce((s, e) => s + e.price, 0) + u.half2.selectedPaidExtras.reduce((s, e) => s + e.price, 0);
    } else {
      uBase = isMorning ? (Number(burger.price) || 0) : getPizzaBasePrice(burger, uSize);
      uExtras = u.selectedPaidExtras.reduce((s, e) => s + e.price, 0);
    }

    return total + (uBase + uExtras);
  }, 0);

  const copRate = exchangeRates?.COP || 3950;
  const bsRate = exchangeRates?.Bs || 36.5;

  // Guardar y confirmar pedido
  const handleSave = () => {
    if (!burger || units.length === 0) return;

    // Agrupar unidades idénticas
    const groups: { unit: BurgerUnitConfig; quantity: number }[] = [];
    for (const u of units) {
      const match = groups.find((g) => areUnitsIdentical(g.unit, u));
      if (match) {
        match.quantity += 1;
      } else {
        groups.push({ unit: u, quantity: 1 });
      }
    }

    const itemsToEmit: BurgerOrderConfirmationItem[] = groups.map(({ unit: u, quantity }) => {
      const uSize = u.size || 'Grande';
      const userNote = getCleanItemNote(u.notes);

      if (u.isHalfHalf && u.half1 && u.half2) {
        const p1 = effectivePizzas.find((p) => p.name.toUpperCase() === u.half1.flavor.toUpperCase()) || burger;
        const p2 = effectivePizzas.find((p) => p.name.toUpperCase() === u.half2.flavor.toUpperCase()) || burger;
        const basePrice = Math.max(getPizzaBasePrice(p1, uSize), getPizzaBasePrice(p2, uSize));
        const h1Extras = u.half1.selectedPaidExtras;
        const h2Extras = u.half2.selectedPaidExtras;
        const extrasCost = h1Extras.reduce((s, e) => s + e.price, 0) + h2Extras.reduce((s, e) => s + e.price, 0);
        const finalPrice = basePrice + extrasCost;

        // Adicionales unificados con tag de mitad para reportes contables
        const combinedExtras = [
          ...h1Extras.map((e) => ({
            ...e,
            name: `(1ra Mitad) ${e.name}`,
          })),
          ...h2Extras.map((e) => ({
            ...e,
            name: `(2da Mitad) ${e.name}`,
          })),
        ];

        const halfDetails: HalfDetails = {
          half1Name: u.half1.flavor,
          half2Name: u.half2.flavor,
          half1Removed: u.half1.removedIngredients,
          half2Removed: u.half2.removedIngredients,
          half1Extras: u.half1.selectedPaidExtras,
          half2Extras: u.half2.selectedPaidExtras,
        };

        return {
          burger,
          quantity,
          size: isMorning ? undefined : uSize,
          isHalfHalf: true,
          halfDetails,
          removedIngredients: [] as string[],
          extras: combinedExtras,
          isTakeaway: Boolean(u.isTakeaway),
          isDelivery: Boolean(u.isDelivery),
          isCut: u.isCut,
          cutPreference: u.cutPreference,
          notes: userNote || undefined,
          finalPrice,
        };
      } else {
        const basePrice = isMorning ? (Number(burger.price) || 0) : getPizzaBasePrice(burger, uSize);
        const extrasCost = u.selectedPaidExtras.reduce((s, e) => s + e.price, 0);
        const finalPrice = basePrice + extrasCost;

        return {
          burger,
          quantity,
          size: isMorning ? undefined : uSize,
          isHalfHalf: false,
          removedIngredients: u.removedIngredients,
          extras: u.selectedPaidExtras,
          isTakeaway: Boolean(u.isTakeaway),
          isDelivery: Boolean(u.isDelivery),
          isCut: false,
          cutPreference: isMorning ? undefined : u.cutPreference,
          notes: userNote || undefined,
          finalPrice,
        };
      }
    });

    if (itemsToEmit.length === 1) {
      onConfirm(itemsToEmit[0]);
    } else {
      onConfirm(itemsToEmit);
    }

    onClose();
  };

  // Datos para renderizar la mitad activa o la pizza completa
  const activeHalfIndex = currentUnit.activeHalf ?? 0;
  const currentHalf = activeHalfIndex === 0 ? currentUnit.half1! : currentUnit.half2!;

  const modalContent = (
    <div className={inline ? "flex flex-col h-full bg-stone-100 text-gray-900 w-full overflow-hidden select-none" : "fixed inset-0 z-[100] flex flex-col bg-stone-100 text-gray-900 w-full h-full max-h-screen overflow-hidden select-none"}>
      {/* 1. TOP HEADER (CORTE COMPACTO Y CLARO CON IDENTIDAD BASILICO) */}
      <header className={`bg-white text-gray-900 ${inline ? 'px-3.5 py-2' : 'px-4 sm:px-6 py-3'} flex items-center justify-between border-b-2 ${isMorning ? 'border-amber-500' : 'border-green-500'} shrink-0 shadow-xs`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={inline ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl"}>
            {isMorning ? '🍽️' : '🍕'}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`${inline ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'} font-black text-gray-950 tracking-wide flex items-center gap-2`}>
                {initialEditItem && (
                  <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-lg font-black tracking-wider uppercase shadow-xs">
                    ✏️ Editando
                  </span>
                )}
                <span>
                  {isMorning
                    ? `PERSONALIZACIÓN DE PLATO - ${burger.name.toUpperCase()}`
                    : (currentUnit.isHalfHalf && currentUnit.half1 && currentUnit.half2
                        ? `${currentUnit.half1.flavor} / ${currentUnit.half2.flavor}`
                        : burger.name.toUpperCase())}
                </span>
              </h2>

              {isMorning ? (
                <span className="bg-amber-400 text-black text-xs sm:text-sm px-2.5 py-0.5 rounded-xl font-black shadow-xs border border-amber-500 uppercase">
                  🍽️ {burger.category?.toUpperCase() || 'PLATO'}
                </span>
              ) : (
                <>
                  <span className="bg-green-500 text-black text-xs sm:text-sm px-2.5 py-0.5 rounded-xl font-black shadow-xs border border-green-600">
                    🍕 {currentUnit.size === 'Pequeña' ? 'PEQUEÑA' : 'GRANDE'}
                  </span>

                  <span className={`text-xs sm:text-sm px-2.5 py-0.5 rounded-xl font-black shadow-xs border ${
                    currentUnit.isHalfHalf
                      ? 'bg-amber-400 text-black border-amber-500'
                      : 'bg-stone-800 text-white border-stone-900'
                  }`}>
                    {currentUnit.isHalfHalf ? '🌓 MITAD Y MITAD' : '🍕 COMPLETA'}
                  </span>
                </>
              )}

              {units.length > 1 && (
                <span className="bg-stone-900 text-white text-xs sm:text-sm px-2.5 py-0.5 rounded-xl font-black uppercase">
                  {units.length} {isMorning ? 'PLATOS' : 'PIZZAS'} EN PEDIDO
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-xs sm:text-sm font-black text-gray-700 flex-wrap">
              <span className="text-black text-sm sm:text-base font-black">${currentUnitPrice.toFixed(2)} USD</span>
              {currentUnitExtrasTotal > 0 && (
                <span className="text-emerald-700 text-xs font-bold">
                  (Base ${currentUnitBasePrice.toFixed(2)} + {isMorning ? 'Contornos' : 'Adicionales'} ${currentUnitExtrasTotal.toFixed(2)})
                </span>
              )}
              <span className="text-gray-400">•</span>
              <span>🇨🇴 {roundCOP(currentUnitPrice * copRate).toLocaleString()} COP</span>
              <span className="text-gray-400">•</span>
              <span>🇻🇪 {(currentUnitPrice * bsRate).toFixed(2)} Bs</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 hover:text-black transition-colors cursor-pointer flex items-center gap-1.5 font-black text-xs sm:text-sm shadow-2xs border border-gray-300"
          title={inline ? "Volver al catálogo" : "Cerrar modal"}
        >
          <IoClose className={inline ? "text-xl text-gray-700" : "text-2xl"} />
          <span className="hidden sm:inline">Volver al Menú</span>
        </button>
      </header>

      {/* 2. BODY SCROLLABLE */}
      <main className={`flex-1 min-h-0 overflow-y-auto ${inline ? 'p-2 space-y-2 pb-2' : 'p-3 sm:p-4 space-y-3 max-w-7xl mx-auto w-full pb-8'}`}>
        {/* BARRA SUPERIOR DE CONFIGURACIÓN RÁPIDA: CANTIDAD, TAMAÑO, FORMATO Y DESTINO */}
        <section className={`bg-white ${inline ? 'p-2 rounded-2xl' : 'p-3 rounded-2xl'} border border-gray-200 shadow-xs flex flex-wrap items-center justify-between gap-3`}>
          {/* Selector de Cantidad */}
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-black text-gray-900 uppercase">Cantidad:</span>
            <div className="flex items-center border-2 border-green-500 rounded-xl bg-white shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={handleDecreaseQuantity}
                className="px-3.5 py-1.5 hover:bg-green-100 text-black font-black text-base transition-colors cursor-pointer"
                title="Disminuir cantidad"
              >
                <IoRemove />
              </button>
              <span className="px-4 py-1.5 text-base sm:text-lg font-black text-black min-w-[2.5rem] text-center">
                {units.length}
              </span>
              <button
                type="button"
                onClick={handleIncreaseQuantity}
                className="px-3.5 py-1.5 hover:bg-green-100 text-black font-black text-base transition-colors cursor-pointer"
                title={`Agregar ${isMorning ? 'otro plato' : 'otra pizza'} para personalizar`}
              >
                <IoAdd />
              </button>
            </div>
          </div>

          {/* Selector de Tamaño: GRANDE vs PEQUEÑA (Solo Turno Noche / Pizzas) */}
          {!isMorning && (
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-black text-gray-900 uppercase">Tamaño:</span>
              <div className="flex items-center border border-gray-300 rounded-xl bg-white p-1 shadow-xs gap-1">
                <button
                  type="button"
                  onClick={() => handleToggleSize('Grande')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer ${
                    currentUnit.size === 'Grande'
                      ? 'bg-green-500 text-black shadow-xs'
                      : 'text-gray-600 hover:text-black'
                  }`}
                >
                  🍕 GRANDE
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleSize('Pequeña')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer ${
                    currentUnit.size === 'Pequeña'
                      ? 'bg-green-500 text-black shadow-xs'
                      : 'text-gray-600 hover:text-black'
                  }`}
                >
                  🍕 PEQUEÑA
                </button>
              </div>
            </div>
          )}

          {/* Selector de Formato: COMPLETA vs MITAD Y MITAD (Solo Turno Noche / Pizzas) */}
          {!isMorning && (
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-black text-gray-900 uppercase">Formato:</span>
              <div className="flex items-center border border-gray-300 rounded-xl bg-white p-1 shadow-xs gap-1">
                <button
                  type="button"
                  onClick={() => handleToggleFormat(false)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer ${
                    !currentUnit.isHalfHalf
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'text-gray-600 hover:text-black'
                  }`}
                >
                  🍕 COMPLETA
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFormat(true)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer ${
                    currentUnit.isHalfHalf
                      ? 'bg-amber-400 text-black shadow-xs'
                      : 'text-gray-600 hover:text-black'
                  }`}
                >
                  🌓 MITAD Y MITAD
                </button>
              </div>
            </div>
          )}

          {/* Opciones Rápidas: Salón / Llevar / Delivery */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center border border-gray-300 rounded-xl bg-white p-1 shadow-xs gap-1">
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isTakeaway: false,
                    isDelivery: false,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer ${
                  !currentUnit.isTakeaway && !currentUnit.isDelivery
                    ? 'bg-green-500 text-black shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🍽️ SALÓN
              </button>
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isTakeaway: true,
                    isDelivery: false,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer ${
                  currentUnit.isTakeaway && !currentUnit.isDelivery
                    ? 'bg-amber-400 text-black shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🛍️ LLEVAR
              </button>
              <button
                type="button"
                onClick={() =>
                  updateCurrentUnit((prev) => ({
                    ...prev,
                    isTakeaway: false,
                    isDelivery: true,
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-sm font-black transition-all cursor-pointer ${
                  currentUnit.isDelivery
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-black'
                }`}
              >
                🛵 DELIVERY
              </button>
            </div>
          </div>
        </section>

        {/* PESTAÑAS MULTI-UNIDAD CUANDO HAY MÁS DE 1 UNIDAD */}
        {units.length > 1 && (
          <section className="bg-green-50/80 p-3 sm:p-4 rounded-2xl border-2 border-green-300 shadow-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm sm:text-base font-black text-green-950 uppercase tracking-wide flex items-center gap-1.5">
                <span>{isMorning ? '🍽️' : '🍕'}</span>
                <span>SELECCIONA EL {isMorning ? 'PLATO' : 'PIZZA'} A PERSONALIZAR ({units.length}):</span>
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyActiveToAll}
                  className="px-3.5 py-1.5 rounded-xl bg-green-500 hover:bg-green-600 text-black text-xs sm:text-sm font-black border border-green-600 shadow-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 uppercase"
                  title={`Copiar configuración a tod${isMorning ? 'os los platos' : 'as las pizzas'}`}
                >
                  <IoCopyOutline className="text-base" />
                  <span>COPIAR #{activeUnitIndex + 1} A TODAS</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetCurrentUnit}
                  className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-800 text-xs sm:text-sm font-black border border-gray-300 shadow-xs flex items-center gap-1 cursor-pointer transition-all uppercase"
                  title="Restablecer receta base"
                >
                  <IoRefreshOutline className="text-base" />
                  <span>RESET #{activeUnitIndex + 1}</span>
                </button>
              </div>
            </div>

            {copyToast && (
              <div className="text-xs sm:text-sm font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-xl animate-in fade-in uppercase">
                {copyToast}
              </div>
            )}

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {units.map((u, idx) => {
                const isActive = idx === activeUnitIndex;
                const uSize = u.size || 'Grande';
                const uExtrasSum = u.isHalfHalf && u.half1 && u.half2
                  ? u.half1.selectedPaidExtras.reduce((s, e) => s + e.price, 0) + u.half2.selectedPaidExtras.reduce((s, e) => s + e.price, 0)
                  : u.selectedPaidExtras.reduce((s, e) => s + e.price, 0);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveUnitIndex(idx)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-black transition-all border-2 flex items-center gap-2 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-green-500 text-black border-green-600 shadow-sm scale-[1.02] ring-2 ring-green-400'
                        : 'bg-white text-gray-800 border-gray-200 hover:border-green-300 hover:bg-green-50/50'
                    }`}
                  >
                    <span>{isMorning ? '🍽️' : '🍕'} #{idx + 1}</span>
                    {!isMorning && (
                      <>
                        <span className="text-xs font-black px-1.5 py-0.5 rounded bg-black/10 uppercase">
                          {uSize === 'Pequeña' ? 'PEQ' : 'GDE'}
                        </span>
                        {u.isHalfHalf ? (
                          <span className="text-xs font-black px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 uppercase">
                            MITAD/MITAD
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 uppercase">
                            COMPLETA
                          </span>
                        )}
                      </>
                    )}
                    {uExtrasSum > 0 && (
                      <span className="text-xs font-black text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded">
                        +${uExtrasSum.toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* SECCIÓN 3: MITAD Y MITAD (SELECTOR DE SABORES, BASES Y EXTRAS) */}
        {/* ============================================================== */}
        {currentUnit.isHalfHalf && currentUnit.half1 && currentUnit.half2 ? (
          <section className="bg-amber-50/70 p-3 sm:p-4 rounded-2xl border-2 border-amber-300 shadow-xs space-y-3.5">
            {/* Pestañas de Mitades: 1RA MITAD vs 2DA MITAD */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-1.5 border-b border-amber-200">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-black text-amber-950 uppercase tracking-wide">
                  PERSONALIZANDO:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateCurrentUnit((prev) => ({ ...prev, activeHalf: 0 }))}
                    className={`px-4 py-2 rounded-xl text-sm font-black transition-all cursor-pointer border-2 flex items-center gap-2 uppercase ${
                      activeHalfIndex === 0
                        ? 'bg-amber-400 text-black border-amber-600 shadow-md scale-105 ring-2 ring-amber-400'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-amber-100'
                    }`}
                  >
                    <span>🌓 1RA MITAD:</span>
                    <span className="font-black text-black">{currentUnit.half1.flavor.toUpperCase()}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateCurrentUnit((prev) => ({ ...prev, activeHalf: 1 }))}
                    className={`px-4 py-2 rounded-xl text-sm font-black transition-all cursor-pointer border-2 flex items-center gap-2 uppercase ${
                      activeHalfIndex === 1
                        ? 'bg-amber-400 text-black border-amber-600 shadow-md scale-105 ring-2 ring-amber-400'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-amber-100'
                    }`}
                  >
                    <span>🌓 2DA MITAD:</span>
                    <span className="font-black text-black">{currentUnit.half2.flavor.toUpperCase()}</span>
                  </button>
                </div>
              </div>

              <span className="text-xs sm:text-sm font-black text-amber-900 bg-amber-200 px-3 py-1 rounded-lg border border-amber-300 uppercase">
                TOCA UNA PESTAÑA PARA ELEGIR SU SABOR E INGREDIENTES
              </span>
            </div>

            {/* SELECCIÓN DE SABOR DE ESTA MITAD */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-gray-900 uppercase">
                  1. SABOR DE LA {activeHalfIndex === 0 ? '1RA MITAD' : '2DA MITAD'} ({currentHalf.flavor.toUpperCase()}):
                </span>
                <span className="text-xs sm:text-sm font-bold text-gray-500 uppercase">
                  {effectivePizzas.length} SABORES DISPONIBLES
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-52 overflow-y-auto pr-1">
                {effectivePizzas.map((p) => {
                  const isSelected = p.name.toUpperCase() === currentHalf.flavor.toUpperCase();
                  const pPrice = getPizzaBasePrice(p, currentUnitSize);

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectHalfFlavor(activeHalfIndex, p)}
                      className={`p-2.5 rounded-xl text-left font-black transition-all border-2 cursor-pointer flex flex-col justify-between min-h-[70px] uppercase ${
                        isSelected
                          ? 'bg-amber-400 text-black border-amber-600 shadow-md ring-2 ring-amber-400 scale-[1.02]'
                          : 'bg-white text-gray-800 border-gray-200 hover:border-amber-400 hover:bg-amber-50/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs sm:text-sm font-black leading-tight line-clamp-2">
                          {p.name.toUpperCase()}
                        </span>
                        {isSelected && <IoCheckmark className="text-base text-black shrink-0" />}
                      </div>
                      <div className="flex items-center justify-between text-xs font-black text-gray-700 mt-1">
                        <span>${pPrice.toFixed(2)}</span>
                        {p.badge && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-black/10 font-bold uppercase">
                            {p.badge.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* INGREDIENTES BASE DE ESTA MITAD ("SIN ...") */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-gray-200 space-y-2 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-sm font-black text-gray-900 uppercase">
                  2. INGREDIENTES BASE DE ESTA MITAD ({currentHalf.flavor.toUpperCase()}):
                </span>
                <span className="text-xs sm:text-sm font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 uppercase">
                  {currentHalf.removedIngredients.length > 0
                    ? `🚫 SIN: ${currentHalf.removedIngredients.join(', ').toUpperCase()}`
                    : 'LLEVA TODOS SUS INGREDIENTES'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {currentHalf.baseIngredients.map((ing) => {
                  const isRemoved = currentHalf.removedIngredients.some(
                    (r) => r.toLowerCase().trim() === ing.toLowerCase().trim()
                  );

                  return (
                    <button
                      key={ing}
                      type="button"
                      onClick={() => toggleRemoveBase(ing, activeHalfIndex)}
                      className={`p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border flex items-center justify-center gap-1.5 cursor-pointer uppercase ${
                        isRemoved
                          ? 'bg-red-50 text-red-700 border-red-300 line-through'
                          : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-red-300'
                      }`}
                    >
                      <span className="truncate">{isRemoved ? `SIN ${ing.toUpperCase()}` : ing.toUpperCase()}</span>
                      {isRemoved && <IoCloseCircle className="text-red-600 text-sm shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* BOTÓN COLAPSABLE / CONTENEDOR DE ADICIONALES CON COSTO PARA ESTA MITAD */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-gray-200 space-y-2 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg">➕</span>
                  <span className="text-sm font-black text-gray-900 uppercase">
                    3. ADICIONALES CON COSTO ($) - {currentHalf.flavor.toUpperCase()}:
                  </span>
                  <span className="text-xs sm:text-sm font-black text-gray-600 uppercase">
                    {currentHalf.selectedPaidExtras.length > 0
                      ? `+${currentHalf.selectedPaidExtras.reduce((s, e) => s + (e.quantity || 1), 0)} PORCIÓN(ES) (+${currentHalf.selectedPaidExtras.reduce((s, e) => s + e.price, 0).toFixed(2)} USD)`
                      : 'TOCA PARA SUMAR (+1X, +2X, +3X)'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowHalfExtrasPanel((prev) => !prev)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 cursor-pointer transition-all shadow-sm active:scale-95 uppercase tracking-wide ${
                    showHalfExtrasPanel
                      ? 'bg-stone-800 hover:bg-stone-900 text-white border border-stone-900'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-500 shadow-md ring-2 ring-emerald-300'
                  }`}
                >
                  <span className="text-base">{showHalfExtrasPanel ? '▲' : '➕'}</span>
                  <span>{showHalfExtrasPanel ? 'OCULTAR ADICIONALES' : 'MOSTRAR ADICIONALES ($)'}</span>
                  {showHalfExtrasPanel ? <IoChevronUp className="text-base" /> : <IoChevronDown className="text-base" />}
                </button>
              </div>

              {showHalfExtrasPanel && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-1 animate-in fade-in">
                  {paidExtrasList.map((extra) => {
                    const existingExtra = currentHalf.selectedPaidExtras.find(
                      (e) => e.name.toLowerCase().trim() === extra.name.toLowerCase().trim()
                    );
                    const count = existingExtra?.quantity || (existingExtra ? 1 : 0);
                    const unitPrice = getIngredientExtraPrice(extra, currentUnitSize, true);
                    const displayPrice = count > 0 ? unitPrice * count : unitPrice;

                    return (
                      <div key={extra.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => togglePaidExtra(extra, activeHalfIndex)}
                          className={`w-full p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer min-h-[70px] select-none uppercase ${
                            count === 3
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-md scale-[1.03]'
                              : count === 2
                              ? 'bg-orange-500 text-white border-orange-600 shadow-sm scale-[1.02]'
                              : count === 1
                              ? 'bg-amber-400 text-black border-amber-500 shadow-xs scale-[1.01]'
                              : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-amber-400'
                          }`}
                          title={`${extra.name.toUpperCase()} (Toca para ciclar 1x, 2x, 3x)`}
                        >
                          <span className="truncate leading-tight text-center max-w-full font-black">{extra.name.toUpperCase()}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            {count > 0 && (
                              <span className="text-[10px] sm:text-xs font-black px-1.5 py-0.2 rounded bg-black/20 text-white">
                                {count}x
                              </span>
                            )}
                            <span className="font-black text-xs sm:text-sm">
                              +${displayPrice.toFixed(2)}
                            </span>
                          </div>
                        </button>

                        {count > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePaidExtra(extra.name, activeHalfIndex);
                            }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center border border-white shadow-md z-10 cursor-pointer active:scale-90"
                            title={`Quitar ${extra.name.toUpperCase()}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : isMorning ? (
          /* ============================================================== */
          /* SECCIÓN 3B-MAÑANA: PERSONALIZACIÓN DE PLATO (BASES Y CONTORNOS) */
          /* ============================================================== */
          <section className="space-y-3">
            {/* INGREDIENTES BASE ("SIN ...") - Solo si el plato define ingredientes base */}
            {burger.baseIngredients && burger.baseIngredients.length > 0 && (
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-gray-200 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between flex-wrap gap-1.5">
                  <span className="text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
                    <span>🛠️</span>
                    <span>PERSONALIZAR INGREDIENTES BASE (TOCA PARA QUITAR "SIN"):</span>
                  </span>
                  <span className="text-xs sm:text-sm font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 uppercase">
                    {currentUnit.removedIngredients.length > 0
                      ? `🚫 SIN: ${currentUnit.removedIngredients.join(', ').toUpperCase()}`
                      : 'LLEVA TODOS SUS INGREDIENTES'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {burger.baseIngredients.map((ing) => {
                    const isRemoved = currentUnit.removedIngredients.some(
                      (r) => r.toLowerCase().trim() === ing.toLowerCase().trim()
                    );

                    return (
                      <button
                        key={ing}
                        type="button"
                        onClick={() => toggleRemoveBase(ing)}
                        className={`p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border flex items-center justify-center gap-1.5 cursor-pointer uppercase ${
                          isRemoved
                            ? 'bg-red-50 text-red-700 border-red-300 line-through'
                            : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-red-300'
                        }`}
                      >
                        <span className="truncate">{isRemoved ? `SIN ${ing.toUpperCase()}` : ing.toUpperCase()}</span>
                        {isRemoved && <IoCloseCircle className="text-red-600 text-sm shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECCIÓN DE CONTORNOS Y GUARNICIONES (SIEMPRE VISIBLE Y ACCESIBLE) */}
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-gray-200 space-y-3 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🥗</span>
                  <span className="text-sm sm:text-base font-black text-gray-900 uppercase">
                    CONTORNOS Y GUARNICIONES:
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-black text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 uppercase">
                  {currentUnit.selectedPaidExtras.length > 0
                    ? `+${currentUnit.selectedPaidExtras.reduce((s, e) => s + (e.quantity || 1), 0)} CONTORNO(S) (+${currentUnitExtrasTotal.toFixed(2)} USD)`
                    : 'TOCA PARA SUMAR CONTORNO (+1X, +2X)'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 pt-1">
                {paidExtrasList.map((extra) => {
                  const existingExtra = currentUnit.selectedPaidExtras.find(
                    (e) => e.name.toLowerCase().trim() === extra.name.toLowerCase().trim()
                  );
                  const count = existingExtra?.quantity || (existingExtra ? 1 : 0);
                  const unitPrice = Number(extra.priceUSD) || 1.0;
                  const displayPrice = count > 0 ? unitPrice * count : unitPrice;

                  return (
                    <div key={extra.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => togglePaidExtra(extra)}
                        className={`w-full p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer min-h-[72px] select-none uppercase ${
                          count === 3
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-md scale-[1.03]'
                            : count === 2
                            ? 'bg-amber-500 text-white border-amber-600 shadow-sm scale-[1.02]'
                            : count === 1
                            ? 'bg-green-500 text-black border-green-600 shadow-xs scale-[1.01]'
                            : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-green-400 hover:bg-green-50/50'
                        }`}
                        title={`${extra.name.toUpperCase()} (Toca para ciclar 1x, 2x, 3x)`}
                      >
                        <span className="truncate leading-tight text-center max-w-full font-black">{extra.name.toUpperCase()}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {count > 0 && (
                            <span className="text-[10px] sm:text-xs font-black px-1.5 py-0.2 rounded bg-black/20 text-white">
                              {count}x
                            </span>
                          )}
                          <span className="font-black text-xs sm:text-sm">
                            +${displayPrice.toFixed(2)}
                          </span>
                        </div>
                      </button>

                      {count > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removePaidExtra(extra.name);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center border border-white shadow-md z-10 cursor-pointer active:scale-90"
                          title={`Quitar ${extra.name.toUpperCase()}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          /* ============================================================== */
          /* SECCIÓN 3B: PIZZA COMPLETA (BASES Y ADICIONALES)               */
          /* ============================================================== */
          <section className="space-y-2.5">
            {/* INGREDIENTES BASE ("SIN ...") */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-gray-200 space-y-2 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-sm font-black text-gray-900 uppercase flex items-center gap-1.5">
                  <span>🛠️</span>
                  <span>PERSONALIZAR INGREDIENTES BASE (TOCA PARA QUITAR "SIN"):</span>
                </span>
                <span className="text-xs sm:text-sm font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 uppercase">
                  {currentUnit.removedIngredients.length > 0
                    ? `🚫 SIN: ${currentUnit.removedIngredients.join(', ').toUpperCase()}`
                    : 'LLEVA TODOS SUS INGREDIENTES'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {(burger.baseIngredients && burger.baseIngredients.length > 0
                  ? burger.baseIngredients
                  : ['SALSA DE TOMATE', 'QUESO MOZZARELLA', 'ORÉGANO']
                ).map((ing) => {
                  const isRemoved = currentUnit.removedIngredients.some(
                    (r) => r.toLowerCase().trim() === ing.toLowerCase().trim()
                  );

                  return (
                    <button
                      key={ing}
                      type="button"
                      onClick={() => toggleRemoveBase(ing)}
                      className={`p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border flex items-center justify-center gap-1.5 cursor-pointer uppercase ${
                        isRemoved
                          ? 'bg-red-50 text-red-700 border-red-300 line-through'
                          : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-red-300'
                      }`}
                    >
                      <span className="truncate">{isRemoved ? `SIN ${ing.toUpperCase()}` : ing.toUpperCase()}</span>
                      {isRemoved && <IoCloseCircle className="text-red-600 text-sm shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* BOTÓN COLAPSABLE / CONTENEDOR DE ADICIONALES CON COSTO */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-gray-200 space-y-2 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg">➕</span>
                  <span className="text-sm font-black text-gray-900 uppercase">
                    ADICIONALES CON COSTO ($):
                  </span>
                  <span className="text-xs sm:text-sm font-black text-gray-600 uppercase">
                    {currentUnit.selectedPaidExtras.length > 0
                      ? `+${currentUnit.selectedPaidExtras.reduce((s, e) => s + (e.quantity || 1), 0)} PORCIÓN(ES) (+${currentUnitExtrasTotal.toFixed(2)} USD)`
                      : 'TOCA PARA SUMAR (+1X, +2X, +3X)'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowExtrasPanel((prev) => !prev)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 cursor-pointer transition-all shadow-sm active:scale-95 uppercase tracking-wide ${
                    showExtrasPanel
                      ? 'bg-stone-800 hover:bg-stone-900 text-white border border-stone-900'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-500 shadow-md ring-2 ring-emerald-300'
                  }`}
                >
                  <span className="text-base">{showExtrasPanel ? '▲' : '➕'}</span>
                  <span>{showExtrasPanel ? 'OCULTAR ADICIONALES' : 'MOSTRAR ADICIONALES ($)'}</span>
                  {showExtrasPanel ? <IoChevronUp className="text-base" /> : <IoChevronDown className="text-base" />}
                </button>
              </div>

              {showExtrasPanel && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-1 animate-in fade-in">
                  {paidExtrasList.map((extra) => {
                    const existingExtra = currentUnit.selectedPaidExtras.find(
                      (e) => e.name.toLowerCase().trim() === extra.name.toLowerCase().trim()
                    );
                    const count = existingExtra?.quantity || (existingExtra ? 1 : 0);
                    const unitPrice = getIngredientExtraPrice(extra, currentUnitSize, false);
                    const displayPrice = count > 0 ? unitPrice * count : unitPrice;

                    return (
                      <div key={extra.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => togglePaidExtra(extra)}
                          className={`w-full p-2.5 rounded-xl text-center font-black text-xs sm:text-sm transition-all border flex flex-col items-center justify-center gap-1 cursor-pointer min-h-[70px] select-none uppercase ${
                            count === 3
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-md scale-[1.03]'
                              : count === 2
                              ? 'bg-orange-500 text-white border-orange-600 shadow-sm scale-[1.02]'
                              : count === 1
                              ? 'bg-green-500 text-black border-green-600 shadow-xs scale-[1.01]'
                              : 'bg-stone-50 text-gray-800 border-gray-200 hover:border-green-400'
                          }`}
                          title={`${extra.name.toUpperCase()} (Toca para ciclar 1x, 2x, 3x)`}
                        >
                          <span className="truncate leading-tight text-center max-w-full font-black">{extra.name.toUpperCase()}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            {count > 0 && (
                              <span className="text-[10px] sm:text-xs font-black px-1.5 py-0.2 rounded bg-black/20 text-white">
                                {count}x
                              </span>
                            )}
                            <span className="font-black text-xs sm:text-sm">
                              +${displayPrice.toFixed(2)}
                            </span>
                          </div>
                        </button>

                        {count > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removePaidExtra(extra.name);
                            }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center border border-white shadow-md z-10 cursor-pointer active:scale-90"
                            title={`Quitar ${extra.name.toUpperCase()}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 4. NOTAS DE COCINA */}
        <section className={`bg-white ${inline ? 'p-2.5 rounded-2xl space-y-1.5' : 'p-3.5 rounded-2xl space-y-2'} border border-gray-200 shadow-xs`}>
          <label className="block text-sm font-black uppercase text-gray-900 tracking-wider">
            {units.length > 1
              ? `NOTAS DE PREPARACIÓN PARA COCINA (${isMorning ? 'PLATO' : 'PIZZA'} #${activeUnitIndex + 1}):`
              : 'NOTAS DE PREPARACIÓN PARA COCINA:'}
          </label>
          <input
            type="text"
            value={currentUnit.notes}
            onChange={(e) => updateCurrentUnit((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder={isMorning ? "EJ: TÉRMINO MEDIO, BIEN COCIDO, SIN SAL, SALSA APARTE..." : "EJ: MASA BIEN TOSTADA, POCO ORÉGANO, BIEN CALIENTE..."}
            className="w-full px-4 py-2 text-sm sm:text-base bg-stone-50 border border-gray-300 rounded-xl text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 shadow-2xs uppercase placeholder:normal-case"
          />
        </section>
      </main>

      {/* 5. BOTTOM FOOTER */}
      <footer className={`bg-white text-gray-900 ${inline ? 'px-4 py-2.5' : 'px-6 py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]'} border-t-2 ${isMorning ? 'border-amber-500' : 'border-green-500'} flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg`}>
        <div>
          <span className="text-xs font-black uppercase tracking-wider text-gray-500 block">
            TOTAL A SUMAR ({units.length} {isMorning ? 'PLATO' : 'PIZZA'}{units.length > 1 ? 'S' : ''}):
          </span>
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className={`${inline ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'} font-black text-black`}>
              ${grandTotalPrice.toFixed(2)} <span className="text-xs sm:text-sm font-bold text-gray-500">USD</span>
            </span>
            <span className="text-xs sm:text-sm font-black text-gray-700">
              🇨🇴 {roundCOP(grandTotalPrice * copRate).toLocaleString()} COP
            </span>
            <span className="text-xs sm:text-sm font-black text-gray-700">
              🇻🇪 {(grandTotalPrice * bsRate).toFixed(2)} Bs
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black text-gray-600 hover:bg-gray-100 hover:text-black transition-colors cursor-pointer uppercase"
          >
            CANCELAR
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-3 rounded-2xl bg-green-500 hover:bg-green-600 text-black font-black text-sm sm:text-base border-2 border-green-600 flex items-center gap-2 shadow-md transition-all active:scale-[0.98] cursor-pointer uppercase"
          >
            <IoCheckmark className="text-xl" />
            <span>
              {initialEditItem
                ? `GUARDAR CAMBIOS (${units.length})`
                : isMorning
                ? `AGREGAR PLATO A COMANDA (${units.length})`
                : `AGREGAR AL PEDIDO (${units.length})`}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );

  if (inline) {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};
