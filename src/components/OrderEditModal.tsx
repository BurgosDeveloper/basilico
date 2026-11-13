import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Order, OrderItem, Product, Ingredient } from '../data/mockData';
import { useApp } from '../context/AppContext';
import { ProductTextCatalog } from '../modules/mesero/ProductTextCatalog';
import { BurgerBuilderModal, BurgerOrderConfirmationItem } from '../modules/mesero/BurgerBuilderModal';
import { DrinkSelectorModal, DrinkOrderConfirmationItem } from '../modules/mesero/DrinkSelectorModal';
import { DeliveryConfigPanel } from '../modules/mesero/DeliveryConfigPanel';
import { roundCOP } from '../utils/currencyRounding';
import { areProteinsDefault, getCleanItemNote, normalizeProteinName, formatRemovedIngredients } from '../utils/burgerProteins';
import { isCustomizableProduct, isDrinkProduct } from '../utils/productClassifier';
import {
  IoClose,
  IoTrashOutline,
  IoPencilOutline,
  IoAlertCircleOutline,
  IoCheckmarkCircle,
  IoRestaurantOutline,
  IoSaveOutline,
} from 'react-icons/io5';

interface OrderEditModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  ingredients: Ingredient[];
  onSaveEdit: (orderId: string, payload: {
    items?: OrderItem[];
    kitchenNotes?: string;
    totalUSD?: number;
    customerName?: string;
    tableNumber?: number | null;
    type?: 'mesa' | 'llevar' | 'delivery' | 'pickup' | 'credito';
    deliveryFeeUSD?: number;
  }) => Promise<void>;
  onDeletePaymentEntry?: (orderId: string, paymentId: string) => Promise<Order>;
  onDeleteOrder?: (orderId: string) => Promise<void>;
}

/**
 * Modal de edición completa de comanda (pantalla dividida estilo toma de pedido),
 * adaptada a la paleta visual de Basilico POS y a los turnos Mañana y Noche.
 */
export const OrderEditModal: React.FC<OrderEditModalProps> = ({
  order,
  isOpen,
  onClose,
  products,
  ingredients,
  onSaveEdit,
  onDeletePaymentEntry,
  onDeleteOrder,
}) => {
  const { exchangeRates, userSession } = useApp();

  // Estados de formulario de cabecera/metadatos
  const [customerName, setCustomerName] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<number | ''>('');
  const [type, setType] = useState<'mesa' | 'pickup' | 'delivery'>('mesa');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(0);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<Order['paymentHistory']>([]);

  // Estados de catálogo, builders inline y pestañas
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBurger, setSelectedBurger] = useState<Product | null>(null);
  const [selectedDrink, setSelectedDrink] = useState<Product | null>(null);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [showDeliveryConfig, setShowDeliveryConfig] = useState<boolean>(false);
  const [leftTab, setLeftTab] = useState<'catalogo' | 'pagos'>('catalogo');
  const [mobileOrderTab, setMobileOrderTab] = useState<'left' | 'cart'>('left');

  // Estados de UI y envío
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string>('');

  const initializedOrderIdRef = useRef<string | null>(null);

  // Sincronizar formulario al abrir o cambiar de comanda, preservando edición local frente a updates Socket.IO
  useEffect(() => {
    if (!isOpen || !order) {
      initializedOrderIdRef.current = null;
      return;
    }

    if (initializedOrderIdRef.current !== order.id) {
      initializedOrderIdRef.current = order.id;
      setCustomerName(order.customerName || '');
      setTableNumber(order.tableNumber ?? '');
      const rawType = (order.type as string) === 'llevar' ? 'pickup' : (order.type || 'mesa');
      setType(rawType === 'delivery' ? 'delivery' : rawType === 'pickup' ? 'pickup' : 'mesa');
      setKitchenNotes(order.kitchenNotes || '');
      setDeliveryFeeUSD(Number(order.deliveryFeeUSD || 0));
      setItems(JSON.parse(JSON.stringify(order.items || [])));
      setPaymentHistory(order.paymentHistory ? JSON.parse(JSON.stringify(order.paymentHistory)) : []);
      setSelectedCategory('Todas');
      setSearchQuery('');
      setSelectedBurger(null);
      setSelectedDrink(null);
      setEditingItemIndex(null);
      setShowDeliveryConfig(false);
      setLeftTab((order.paymentHistory?.length || 0) > 0 ? 'pagos' : 'catalogo');
      setMobileOrderTab('left');
      setError('');
      setSuccessToast('');
      setIsSubmitting(false);
    } else {
      setPaymentHistory(order.paymentHistory ? JSON.parse(JSON.stringify(order.paymentHistory)) : []);
    }
  }, [order, isOpen]);

  // Turno efectivo: prioriza el turno propio de la comanda para admins globales ('ambos')
  const effectiveShift = useMemo(() => {
    if (order?.shift && order.shift !== 'ambos') return order.shift;
    if (userSession?.shift && userSession.shift !== 'ambos') return userSession.shift;
    return undefined;
  }, [order?.shift, userSession?.shift]);

  const isMorningShift = effectiveShift === 'manana';

  // Filtrar productos e ingredientes estrictamente por turno efectivo
  const activeProducts = useMemo(() => {
    return products
      .filter((p) => !effectiveShift || !p.shift || p.shift === 'ambos' || p.shift === effectiveShift)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products, effectiveShift]);

  const activeIngredients = useMemo(() => {
    return ingredients
      .filter((i) => !effectiveShift || !i.shift || i.shift === 'ambos' || i.shift === effectiveShift)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [ingredients, effectiveShift]);

  const availablePizzas = useMemo(() => {
    return activeProducts.filter((p) => (p.category || '').toLowerCase().includes('pizza'));
  }, [activeProducts]);

  const availableExtras = useMemo(() => {
    return activeIngredients.filter(
      (i) =>
        i.isExtra ||
        i.isExtraForPizza ||
        i.ingredientType === 'adicional' ||
        i.ingredientType === 'gratis' ||
        i.category === 'Adicionales' ||
        i.category === 'Toppings' ||
        i.category?.toUpperCase() === 'CONTORNOS'
    );
  }, [activeIngredients]);

  const availableFreeToppings = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.ingredientType === 'gratis' || i.category === 'Gratis'
    );
  }, [activeIngredients]);

  const availableProteins = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.ingredientType === 'proteina' || i.category === 'Proteínas' || i.category === 'Carnes'
    );
  }, [activeIngredients]);

  const availableSalsas = useMemo(() => {
    return activeIngredients.filter(
      (i) => i.category === 'Salsas' || i.ingredientType === 'salsa'
    );
  }, [activeIngredients]);

  const itemsChanged = useMemo(() => {
    if (!order) return false;
    return JSON.stringify(order.items || []) !== JSON.stringify(items);
  }, [order, items]);

  if (!isOpen || !order) return null;

  const hasPaymentHistory = (paymentHistory?.length || 0) > 0;
  const isDeliveryOrder = type === 'delivery';
  const effectiveDeliveryFee = isDeliveryOrder ? (Number(deliveryFeeUSD) || 0) : 0;
  const deliveryFeeChanged = Math.abs(effectiveDeliveryFee - Number(order.deliveryFeeUSD || 0)) > 0.01;

  // Cálculo de totales
  const itemsSubtotalUSD = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0
  );
  const totalUSD = itemsSubtotalUSD + effectiveDeliveryFee;
  const copRate = exchangeRates?.COP || 3950;
  const bsRate = exchangeRates?.Bs || 36.5;
  const totalCOP = roundCOP(totalUSD * copRate);
  const totalBs = (totalUSD * bsRate).toFixed(2);

  // Comparar ítems idénticos para fusionar cantidades sin duplicar filas
  const areItemsIdentical = (a: OrderItem, b: OrderItem): boolean => {
    if (a.productId !== b.productId) return false;
    if ((a.size || 'Grande') !== (b.size || 'Grande')) return false;
    if (Boolean(a.isHalfHalf) !== Boolean(b.isHalfHalf)) return false;
    if (JSON.stringify(a.halfDetails || null) !== JSON.stringify(b.halfDetails || null)) return false;
    if (Boolean(a.isTakeaway) !== Boolean(b.isTakeaway)) return false;
    if (Boolean(a.isDelivery) !== Boolean(b.isDelivery)) return false;
    if (Boolean(a.isCut) !== Boolean(b.isCut)) return false;
    if ((a.cutPreference || 'Entera') !== (b.cutPreference || 'Entera')) return false;
    if ((a.sugarPreference || '') !== (b.sugarPreference || '')) return false;
    if ((a.flavor || '') !== (b.flavor || '')) return false;
    if (getCleanItemNote(a.notes) !== getCleanItemNote(b.notes)) return false;

    const aProt = [...(a.proteins || [])].map(normalizeProteinName).sort().join('|');
    const bProt = [...(b.proteins || [])].map(normalizeProteinName).sort().join('|');
    if (aProt !== bProt) return false;

    const aRem = [...(a.removedIngredients || [])].sort().join('|');
    const bRem = [...(b.removedIngredients || [])].sort().join('|');
    if (aRem !== bRem) return false;

    const aExtras = (a.extras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    const bExtras = (b.extras || []).map((e) => `${e.name}:${e.quantity || 1}:${e.price}`).sort().join('|');
    if (aExtras !== bExtras) return false;

    return Math.abs((Number(a.price) || 0) - (Number(b.price) || 0)) < 0.01;
  };

  const mergeItem = (list: OrderItem[], item: OrderItem): OrderItem[] => {
    const matchIndex = list.findIndex((existing) => areItemsIdentical(existing, item));
    if (matchIndex !== -1) {
      const updated = [...list];
      updated[matchIndex] = {
        ...updated[matchIndex],
        quantity: (updated[matchIndex].quantity || 1) + (item.quantity || 1),
      };
      return updated;
    }
    return [...list, item];
  };

  const guardPaymentLockForItems = (): boolean => {
    if (hasPaymentHistory) {
      setError('Esta comanda tiene pagos o vueltos registrados. Anúlalos primero en la pestaña "Historial de Pagos" para modificar productos o montos.');
      setLeftTab('pagos');
      setMobileOrderTab('left');
      return true;
    }
    return false;
  };

  // Selección de producto desde catálogo
  const handleSelectProduct = (prod: Product) => {
    if (guardPaymentLockForItems()) return;
    setError('');

    if (isCustomizableProduct(prod)) {
      setEditingItemIndex(null);
      setSelectedDrink(null);
      setShowDeliveryConfig(false);
      setSelectedBurger(prod);
    } else if (prod.drinkType === 'jugo' || (prod.flavors && prod.flavors.length > 0)) {
      setEditingItemIndex(null);
      setSelectedBurger(null);
      setShowDeliveryConfig(false);
      setSelectedDrink(prod);
    } else {
      const newItem: OrderItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: prod.id,
        productName: prod.name,
        price: prod.price,
        quantity: 1,
        category: prod.category || (isMorningShift ? 'Platos' : 'Bebidas'),
        drinkType: prod.drinkType,
        isTakeaway: type === 'pickup',
        isDelivery: type === 'delivery',
        isNewOrModified: true,
      };
      setItems((prev) => mergeItem(prev, newItem));
      setSuccessToast(`¡${prod.name} agregado!`);
      setTimeout(() => setSuccessToast(''), 2500);
    }
  };

  // Adición rápida de salsa ($0.00, no contable en venta)
  const handleSelectSalsa = (salsa: Ingredient) => {
    if (guardPaymentLockForItems()) return;
    setError('');

    const newItem: OrderItem = {
      id: `item-salsa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      productId: salsa.id,
      productName: salsa.name.toUpperCase(),
      price: 0,
      quantity: 1,
      category: 'Salsas',
      isTakeaway: type === 'pickup',
      isDelivery: type === 'delivery',
      isNewOrModified: true,
    };
    setItems((prev) => mergeItem(prev, newItem));
    setSuccessToast(`¡Salsa ${salsa.name} agregada!`);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Confirmar Pizza / Plato personalizado (nuevo o editado)
  const handleConfirmBurgerAdd = (
    configOrList: BurgerOrderConfirmationItem | BurgerOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const generatedItems: OrderItem[] = list.map((config) => {
      const isHalf = Boolean(config.isHalfHalf);
      const displayName = isHalf && config.halfDetails
        ? `${config.halfDetails.half1Name} / ${config.halfDetails.half2Name}`
        : config.burger.name;
      const isProteinChanged = !areProteinsDefault(
        config.burger.name,
        config.proteins,
        config.burger.defaultProteins
      );

      return {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: config.burger.id,
        productName: displayName,
        price: config.finalPrice,
        quantity: config.quantity,
        category: config.burger.category || (isMorningShift ? 'Platos' : 'Pizzas'),
        size: isMorningShift ? undefined : (config.size || 'Grande'),
        isHalfHalf: isHalf,
        halfDetails: config.halfDetails,
        proteins: isProteinChanged ? config.proteins : undefined,
        defaultProteins: config.burger.defaultProteins || [],
        removedIngredients: config.removedIngredients && config.removedIngredients.length > 0 ? config.removedIngredients : undefined,
        extras: config.extras && config.extras.length > 0 ? config.extras : undefined,
        isTakeaway: Boolean(config.isTakeaway),
        isDelivery: Boolean(config.isDelivery),
        isCut: Boolean(config.isCut),
        cutPreference: config.cutPreference,
        notes: getCleanItemNote(config.notes) || undefined,
        isNewOrModified: true,
      };
    });

    if (editingItemIndex !== null) {
      setItems((prev) => {
        const updated = [...prev];
        updated.splice(editingItemIndex, 1, ...generatedItems);
        return updated;
      });
      setEditingItemIndex(null);
      setSuccessToast('¡Producto actualizado en la comanda!');
    } else {
      setItems((prev) => {
        let current = [...prev];
        for (const it of generatedItems) {
          current = mergeItem(current, it);
        }
        return current;
      });
      setSuccessToast(`¡${list.length} producto(s) agregado(s)!`);
    }

    setSelectedBurger(null);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Confirmar Bebida seleccionada o editada
  const handleConfirmDrinkAdd = (
    configOrList: DrinkOrderConfirmationItem | DrinkOrderConfirmationItem[]
  ) => {
    const list = Array.isArray(configOrList) ? configOrList : [configOrList];
    const generatedItems: OrderItem[] = list.map((config) => {
      const formattedName = config.flavor
        ? `${config.drink.name} (${config.flavor})`
        : config.drink.name;

      return {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        productId: config.drink.id,
        productName: formattedName,
        price: config.drink.price,
        quantity: config.quantity,
        category: config.drink.category || 'Bebidas',
        drinkType: config.drink.drinkType,
        sugarPreference: config.sugarPreference,
        flavor: config.flavor,
        isTakeaway: Boolean(config.isTakeaway),
        isDelivery: Boolean(config.isDelivery),
        notes: getCleanItemNote(config.notes) || undefined,
        isNewOrModified: true,
      };
    });

    if (editingItemIndex !== null) {
      setItems((prev) => {
        const updated = [...prev];
        updated.splice(editingItemIndex, 1, ...generatedItems);
        return updated;
      });
      setEditingItemIndex(null);
      setSuccessToast('¡Bebida actualizada en la comanda!');
    } else {
      setItems((prev) => {
        let current = [...prev];
        for (const it of generatedItems) {
          current = mergeItem(current, it);
        }
        return current;
      });
      setSuccessToast(`¡${list.length} bebida(s) agregada(s)!`);
    }

    setSelectedDrink(null);
    setTimeout(() => setSuccessToast(''), 2500);
  };

  // Abrir editor inline para un ítem existente de la comanda
  const handleEditItem = (index: number) => {
    if (guardPaymentLockForItems()) return;
    const item = items[index];
    if (!item) return;

    if (item.isPaidIndividually) {
      setError(`El ítem "${item.productName}" ya fue pagado individualmente. Anula primero ese pago en el Historial de Pagos.`);
      setLeftTab('pagos');
      return;
    }

    const paidExtrasCost = (item.extras || []).reduce((s, e) => s + (Number(e.price) || 0), 0);
    const estimatedBasePrice = Math.max(0, (Number(item.price) || 0) - paidExtrasCost);
    const cleanNameForSearch = (item.isHalfHalf && item.halfDetails?.half1Name
      ? item.halfDetails.half1Name
      : item.productName
    )
      .replace(/\s*\((Grande|Pequeña|Mediana|Familiar|Estándar)\)/gi, '')
      .trim();

    let prod = activeProducts.find((p) => p.id === item.productId);
    if (!prod) {
      prod = activeProducts.find(
        (p) =>
          p.name.toLowerCase() === cleanNameForSearch.toLowerCase() ||
          cleanNameForSearch.toLowerCase().startsWith(p.name.toLowerCase())
      );
    }
    if (!prod) {
      prod = {
        id: item.productId || 'custom-item',
        name: cleanNameForSearch || item.productName,
        category: item.category || (isMorningShift ? 'Platos' : 'Pizzas'),
        drinkType: item.drinkType,
        price: estimatedBasePrice,
        description: '',
        image: '',
        baseIngredients: [],
        proteinCount: 1,
        defaultProteins: item.defaultProteins || [],
        flavors: item.flavor ? [item.flavor] : [],
        recipe: [],
        shift: effectiveShift || 'noche',
      };
    }

    setError('');
    setShowDeliveryConfig(false);
    setEditingItemIndex(index);
    setMobileOrderTab('left');

    if (isCustomizableProduct(prod) || item.isHalfHalf || (prod.category || '').toLowerCase().includes('pizza')) {
      setSelectedDrink(null);
      setSelectedBurger(prod);
    } else if (isDrinkProduct(prod) || prod.drinkType === 'jugo' || (prod.flavors && prod.flavors.length > 0)) {
      setSelectedBurger(null);
      setSelectedDrink(prod);
    } else {
      const newNotes = window.prompt('Notas o indicaciones para este ítem:', item.notes || '');
      if (newNotes !== null) {
        setItems((prev) => {
          const updated = [...prev];
          updated[index] = { ...updated[index], notes: newNotes.trim() || undefined };
          return updated;
        });
      }
      setEditingItemIndex(null);
    }
  };

  // Ajuste rápido de cantidades
  const handleQuantityChange = (index: number, delta: number) => {
    if (guardPaymentLockForItems()) return;
    const it = items[index];
    if (it?.isPaidIndividually) {
      setError(`El producto "${it.productName}" ya fue pagado individualmente. Anula primero ese pago para modificarlo.`);
      setLeftTab('pagos');
      return;
    }
    setItems((prev) => {
      const updated = [...prev];
      const newQty = (updated[index].quantity || 1) + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index] = { ...updated[index], quantity: newQty };
      }
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    if (guardPaymentLockForItems()) return;
    const it = items[index];
    if (it?.isPaidIndividually) {
      setError(`El producto "${it.productName}" ya fue pagado individualmente. Primero anula ese pago para eliminarlo.`);
      setLeftTab('pagos');
      return;
    }
    setItems((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  // Anular pago o vuelto individual sin cancelar la comanda
  const handleAnularPago = async (paymentId: string, isChange: boolean, amountStr: string) => {
    if (!onDeletePaymentEntry) {
      setError('La función de anulación de pagos no está disponible.');
      return;
    }
    if (
      !window.confirm(
        `¿Estás seguro de anular este ${isChange ? 'vuelto' : 'pago'} de ${amountStr}? Se revertirá en el historial financiero y se ajustará el saldo sin cancelar la comanda.`
      )
    ) {
      return;
    }
    try {
      setIsSubmitting(true);
      setError('');
      const updatedOrder = await onDeletePaymentEntry(order.id, paymentId);
      if (updatedOrder) {
        setPaymentHistory(updatedOrder.paymentHistory ? [...updatedOrder.paymentHistory] : []);
        setItems(JSON.parse(JSON.stringify(updatedOrder.items || [])));
      } else {
        setPaymentHistory((prev) => (prev || []).filter((p) => p.id !== paymentId));
      }
      setSuccessToast(`¡${isChange ? 'Vuelto' : 'Pago'} anulado! Ya puedes continuar editando la comanda.`);
      setTimeout(() => setSuccessToast(''), 3500);
    } catch (err: any) {
      console.error('Error al anular pago:', err);
      setError(err?.message || 'Error al anular el movimiento financiero.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const blockedByPayments = hasPaymentHistory && (itemsChanged || deliveryFeeChanged);

  // Guardar cambios (con productos cuando no hay pagos, o solo metadatos si hay pagos)
  const handleSave = async () => {
    if (blockedByPayments) {
      setError('Esta comanda tiene pagos o vueltos registrados. Anúlalos primero en "Historial de Pagos" antes de modificar productos o montos.');
      setLeftTab('pagos');
      setMobileOrderTab('left');
      return;
    }
    if (items.length === 0) {
      setError('La comanda debe contener al menos un producto. Si deseas eliminarla, usa "Anular Comanda".');
      return;
    }
    if (type === 'delivery') {
      if (!customerName.trim()) {
        setError('Para órdenes DELIVERY es obligatorio ingresar el nombre o referencia del cliente.');
        return;
      }
      if (!hasPaymentHistory && effectiveDeliveryFee <= 0) {
        setError('Para órdenes DELIVERY es obligatorio especificar un costo de delivery mayor a $0 USD.');
        return;
      }
    }
    if (type === 'pickup' && !customerName.trim()) {
      setError('Para órdenes PICKUP / PARA LLEVAR es obligatorio ingresar el nombre del cliente.');
      return;
    }
    if (type === 'mesa' && (!tableNumber || Number(tableNumber) <= 0)) {
      setError('Para órdenes en MESA debes especificar un número de mesa válido mayor a 0.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      const basePayload = {
        kitchenNotes: kitchenNotes.trim(),
        customerName: customerName.trim(),
        tableNumber: type === 'mesa' && tableNumber ? Number(tableNumber) : null,
        type,
      };

      if (hasPaymentHistory) {
        // Solo metadatos (cliente, notas, mesa/pickup) para proteger integridad financiera
        await onSaveEdit(order.id, basePayload);
      } else {
        await onSaveEdit(order.id, {
          ...basePayload,
          items,
          totalUSD: Number(totalUSD.toFixed(2)),
          deliveryFeeUSD: isDeliveryOrder ? effectiveDeliveryFee : 0,
        });
      }
      onClose();
    } catch (err: any) {
      console.error('Error al guardar edición de comanda:', err);
      setError(err?.message || 'Error al guardar los cambios de la comanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanOrderNumber = order.orderNumber.toString().replace(/^#+/, '');
  const totalUnits = items.reduce((s, it) => s + (it.quantity || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-100 text-gray-900 w-screen h-screen overflow-hidden animate-in fade-in select-none">
      {/* HEADER PRINCIPAL (PALETA BASILICO) */}
      <header className="bg-white px-4 py-2 border-b-2 border-green-500 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="p-1.5 rounded-xl bg-green-500 text-black text-lg font-black shadow-xs shrink-0">
            ✏️
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-base sm:text-lg text-gray-950 leading-tight uppercase">
                EDITAR COMANDA #{cleanOrderNumber}
              </h3>
              <span className="px-2.5 py-0.5 rounded-lg bg-green-500 text-black font-black text-xs border border-green-600 shadow-xs uppercase">
                {type === 'mesa' ? `Mesa #${tableNumber || order.tableNumber}` : type.toUpperCase()}
              </span>
              <span
                className={`px-2 py-0.5 rounded-lg font-black text-[11px] border uppercase ${
                  isMorningShift
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-slate-800 text-white border-slate-900'
                }`}
              >
                {isMorningShift ? '☀️ Mañana' : '🌙 Noche'}
              </span>
              <span className="text-xs text-gray-700 font-bold truncate">
                👤 Cliente: <strong className="text-black">{customerName || order.customerName || 'General'}</strong>
              </span>
              {hasPaymentHistory && (
                <span className="px-2 py-0.5 rounded-lg bg-yellow-400 text-black font-black text-xs border border-yellow-500 shadow-2xs">
                  💳 {paymentHistory?.length} Pago(s)
                </span>
              )}
            </div>
            <span className="text-[11px] text-gray-600 font-bold uppercase block mt-0.5">
              Edición completa de {isMorningShift ? 'Platos, Pastas y Bebidas (Mañana)' : 'Pizzas, Bebidas y Salsas (Noche)'} • Anulación segura de pagos
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-red-50 text-gray-800 hover:text-red-700 transition-colors flex items-center gap-1.5 font-black text-xs cursor-pointer border border-gray-300 shrink-0"
          title="Cerrar ventana de edición"
        >
          <IoClose className="text-xl" />
          <span>Cerrar</span>
        </button>
      </header>

      {/* MENSAJES DE ERROR / ÉXITO */}
      {error && (
        <div className="bg-red-50 text-red-800 px-3 py-1.5 text-xs font-bold border-b border-red-200 flex items-center gap-1.5 shrink-0">
          <IoAlertCircleOutline className="text-lg text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successToast && (
        <div className="bg-emerald-50 text-emerald-900 px-3 py-1 text-xs font-black border-b border-emerald-200 flex items-center gap-1.5 shrink-0 animate-in fade-in">
          <IoCheckmarkCircle className="text-base text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* PESTAÑAS RESPONSIVE MÓVIL (< md) */}
      {!(selectedBurger || selectedDrink || (showDeliveryConfig && isDeliveryOrder)) && (
        <div className="flex md:hidden items-center bg-stone-200 p-1 gap-1 border-b border-gray-300 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOrderTab('left')}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileOrderTab === 'left'
                ? 'bg-white text-black shadow-xs border border-gray-300'
                : 'text-gray-700 hover:text-black'
            }`}
          >
            <span>{leftTab === 'pagos' && hasPaymentHistory ? '💳 Pagos' : '📖 Menú'}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileOrderTab('cart')}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileOrderTab === 'cart'
                ? 'bg-green-500 text-black shadow-xs border border-green-600'
                : 'text-gray-700 hover:text-black'
            }`}
          >
            <span>🧾 Comanda ({totalUnits})</span>
            <span className="px-1.5 py-0.5 rounded bg-black/10 text-[11px] font-black">${totalUSD.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* CUERPO PRINCIPAL 2 COLUMNAS */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-stone-100">
        {/* COLUMNA IZQUIERDA (65%): BUILDERS INLINE / DELIVERY CONFIG / HISTORIAL PAGOS / CATÁLOGO */}
        <div
          className={`${
            !(selectedBurger || selectedDrink || (showDeliveryConfig && isDeliveryOrder)) && mobileOrderTab === 'cart'
              ? 'hidden md:flex'
              : 'flex'
          } flex-1 md:w-[65%] ${
            selectedBurger || selectedDrink || (showDeliveryConfig && isDeliveryOrder) ? 'p-1 sm:p-1.5' : 'p-2.5 sm:p-3'
          } border-r border-gray-200 flex-col overflow-hidden min-h-0`}
        >
          {selectedBurger ? (
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <BurgerBuilderModal
                burger={selectedBurger}
                availableExtras={availableExtras}
                availableProteins={availableProteins}
                availableFreeToppings={availableFreeToppings}
                availablePizzas={availablePizzas}
                isOpen={true}
                inline={true}
                onClose={() => {
                  setSelectedBurger(null);
                  setEditingItemIndex(null);
                }}
                onConfirm={(config) => {
                  handleConfirmBurgerAdd(config);
                  setSelectedBurger(null);
                }}
                defaultTakeaway={type === 'pickup'}
                defaultDelivery={type === 'delivery'}
                exchangeRates={exchangeRates}
                initialEditItem={editingItemIndex !== null ? items[editingItemIndex] : null}
              />
            </div>
          ) : selectedDrink ? (
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <DrinkSelectorModal
                drink={selectedDrink}
                isOpen={true}
                inline={true}
                initialEditItem={editingItemIndex !== null ? items[editingItemIndex] : null}
                onClose={() => {
                  setSelectedDrink(null);
                  setEditingItemIndex(null);
                }}
                onConfirm={(config) => {
                  handleConfirmDrinkAdd(config);
                  setSelectedDrink(null);
                  setEditingItemIndex(null);
                }}
                defaultTakeaway={type === 'pickup'}
                defaultDelivery={type === 'delivery'}
                exchangeRates={exchangeRates}
              />
            </div>
          ) : showDeliveryConfig && isDeliveryOrder ? (
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <DeliveryConfigPanel
                customerName={customerName}
                onCustomerNameChange={setCustomerName}
                kitchenNotes={kitchenNotes}
                onKitchenNotesChange={setKitchenNotes}
                deliveryFeeUSD={deliveryFeeUSD}
                onDeliveryFeeChange={(fee) => {
                  if (!guardPaymentLockForItems()) setDeliveryFeeUSD(fee);
                }}
                cartItems={items}
                onSetItemPackaging={(itemId, mode) => {
                  if (guardPaymentLockForItems()) return;
                  setItems((prev) =>
                    prev.map((it) =>
                      it.id === itemId
                        ? { ...it, isDelivery: mode === 'delivery', isTakeaway: mode === 'llevar' }
                        : it
                    )
                  );
                }}
                onSetAllDelivery={(isDel) => {
                  if (guardPaymentLockForItems()) return;
                  setItems((prev) => prev.map((it) => ({ ...it, isDelivery: isDel, isTakeaway: false })));
                }}
                exchangeRates={exchangeRates}
                onClose={() => setShowDeliveryConfig(false)}
                onClearAllDelivery={() => {
                  if (guardPaymentLockForItems()) return;
                  setItems((prev) => prev.map((it) => ({ ...it, isDelivery: false })));
                }}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {hasPaymentHistory && (
                <div className="flex items-center gap-2 mb-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setLeftTab('catalogo')}
                    className={`px-4 py-2 rounded-xl font-black text-xs transition-all border cursor-pointer ${
                      leftTab === 'catalogo'
                        ? 'bg-green-500 text-black border-green-600 shadow-xs'
                        : 'bg-white text-gray-800 border-gray-300 hover:bg-stone-50'
                    }`}
                  >
                    {isMorningShift ? '🍝 Menú / Platos (Mañana)' : '🍕 Menú / Pizzas (Noche)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftTab('pagos')}
                    className={`px-4 py-2 rounded-xl font-black text-xs transition-all border cursor-pointer flex items-center gap-1.5 ${
                      leftTab === 'pagos'
                        ? 'bg-yellow-400 text-black border-yellow-500 shadow-xs'
                        : 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <span>💳 Historial de Pagos y Vueltos ({paymentHistory?.length})</span>
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                  </button>
                </div>
              )}

              {leftTab === 'pagos' && hasPaymentHistory ? (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white rounded-2xl border-2 border-yellow-400 p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-200 flex-wrap">
                    <div>
                      <h4 className="font-black text-sm text-gray-950 flex items-center gap-2">
                        <span>💳 MOVIMIENTOS FINANCIEROS REGISTRADOS</span>
                      </h4>
                      <p className="text-xs text-amber-900 font-semibold mt-0.5">
                        Anula aquí cualquier pago o vuelto para modificar los productos sin cancelar la comanda.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLeftTab('catalogo')}
                      className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-gray-900 font-black text-xs cursor-pointer border border-gray-300"
                    >
                      ← Ver Menú
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {paymentHistory?.map((pm) => {
                      const isChange = (pm.changeGivenUSD || 0) > 0 || (pm.changeGivenCOP || 0) > 0 || (pm.changeGivenBs || 0) > 0;
                      const amount = isChange
                        ? pm.changeGivenUSD || pm.changeGivenCOP || pm.changeGivenBs || 0
                        : pm.cashTenderedUSD || pm.cashTenderedCOP || pm.cashTenderedBs || pm.amountPaidUSD || 0;
                      const currency = isChange
                        ? pm.changeGivenUSD ? 'USD' : pm.changeGivenCOP ? 'COP' : 'Bs'
                        : pm.cashTenderedUSD ? 'USD' : pm.cashTenderedCOP ? 'COP' : pm.cashTenderedBs ? 'Bs' : 'USD';
                      const amountStr = `${Number(amount).toLocaleString()} ${currency}`;

                      return (
                        <div
                          key={pm.id}
                          className="p-3 rounded-xl bg-stone-50 border border-gray-200 flex items-center justify-between gap-3 hover:bg-white transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-black uppercase ${
                                  isChange
                                    ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                    : 'bg-green-100 text-green-950 border border-green-300'
                                }`}
                              >
                                {isChange ? 'VUELTO' : 'PAGO'}
                              </span>
                              <span className="font-black text-base text-gray-950">{amountStr}</span>
                              <span className="text-xs font-bold text-gray-700">({pm.paymentMethod})</span>
                            </div>
                            <div className="text-[11px] text-gray-600 font-semibold">
                              Por: <strong className="text-gray-900">{pm.payerName || 'Cliente General'}</strong>
                              {pm.createdAt && ` • ${new Date(pm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleAnularPago(pm.id, isChange, amountStr)}
                            className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-300 hover:border-red-600 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 shrink-0"
                            title={`Anular este ${isChange ? 'vuelto' : 'pago'}`}
                          >
                            <IoTrashOutline className="text-base" />
                            <span>Anular {isChange ? 'Vuelto' : 'Pago'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <ProductTextCatalog
                  products={activeProducts}
                  onSelectProduct={handleSelectProduct}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  exchangeRates={exchangeRates}
                  salsas={availableSalsas}
                  onSelectSalsa={handleSelectSalsa}
                />
              )}
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA (35%): METADATOS + ÍTEMS + TOTALES */}
        <div
          className={`${
            !(selectedBurger || selectedDrink || (showDeliveryConfig && isDeliveryOrder)) && mobileOrderTab === 'left'
              ? 'hidden md:flex'
              : 'flex'
          } md:w-[35%] p-2.5 sm:p-3 flex-col justify-between bg-stone-50 overflow-hidden min-h-0 border-l border-gray-200`}
        >
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 space-y-2">
            {/* CONFIGURACIÓN DE METADATOS */}
            <div className="p-3 bg-white rounded-2xl border border-gray-200 shadow-xs space-y-2 shrink-0">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-0.5">Tipo de Pedido</label>
                  <select
                    value={type}
                    onChange={(e) => {
                      const newType = e.target.value as 'mesa' | 'pickup' | 'delivery';
                      if (hasPaymentHistory && newType === 'delivery' && effectiveDeliveryFee === 0) {
                        setError('Anula los pagos antes de agregar tarifa de delivery.');
                        setLeftTab('pagos');
                        return;
                      }
                      setType(newType);
                      if (newType === 'delivery' && deliveryFeeUSD <= 0 && !hasPaymentHistory) {
                        setDeliveryFeeUSD(1.0);
                      }
                      if (newType !== 'delivery') {
                        setShowDeliveryConfig(false);
                      }
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-900 outline-none cursor-pointer focus:border-green-500"
                  >
                    <option value="mesa">🍽️ Mesa</option>
                    <option value="pickup">🛍️ Pickup / Llevar</option>
                    <option value="delivery">🛵 Delivery</option>
                  </select>
                </div>

                {type === 'mesa' ? (
                  <div>
                    <label className="block text-[10px] font-black text-gray-600 uppercase mb-0.5">Nº Mesa</label>
                    <input
                      type="number"
                      min={1}
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value ? Number(e.target.value) : '')}
                      placeholder="Mesa #"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-900 outline-none focus:border-green-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black text-blue-700 uppercase mb-0.5">
                      {type === 'delivery' ? 'Costo Delivery ($)' : 'Servicio'}
                    </label>
                    {type === 'delivery' ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          disabled={hasPaymentHistory}
                          value={deliveryFeeUSD}
                          onChange={(e) => setDeliveryFeeUSD(parseFloat(e.target.value) || 0)}
                          placeholder="1.00"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-blue-300 bg-blue-50 font-bold text-xs text-blue-950 outline-none disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBurger(null);
                            setSelectedDrink(null);
                            setShowDeliveryConfig((prev) => !prev);
                          }}
                          className={`px-2 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer shrink-0 ${
                            showDeliveryConfig
                              ? 'bg-blue-600 text-white border-blue-700'
                              : 'bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200'
                          }`}
                          title="Configurar empaque Delivery / Llevar"
                        >
                          ⚙️
                        </button>
                      </div>
                    ) : (
                      <div className="px-2.5 py-1.5 rounded-xl bg-stone-100 font-bold text-xs text-gray-700 border border-gray-200">
                        🛍️ Mostrador
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-600 uppercase mb-0.5">
                  Nombre del Cliente {type !== 'mesa' && <span className="text-red-600">*</span>}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nombre o referencia del cliente..."
                  className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-bold text-xs text-gray-900 outline-none focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-600 uppercase mb-0.5">Notas de Cocina</label>
                <input
                  type="text"
                  value={kitchenNotes}
                  onChange={(e) => setKitchenNotes(e.target.value)}
                  placeholder="Observaciones generales para cocina..."
                  className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 bg-white font-medium text-xs text-gray-900 outline-none focus:border-green-500"
                />
              </div>
            </div>

            {/* BANNER DE PROTECCIÓN SI HAY PAGOS */}
            {hasPaymentHistory && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-center justify-between gap-2 shrink-0">
                <div className="text-[11px] font-bold leading-tight">
                  🔒 <strong>{paymentHistory?.length} movimiento(s) de pago.</strong> Anúlalos para editar productos; puedes actualizar cliente/notas/mesa sin anular.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLeftTab('pagos');
                    setMobileOrderTab('left');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-black font-black text-[10px] shrink-0 cursor-pointer border border-yellow-500"
                >
                  Anular Pagos
                </button>
              </div>
            )}

            {/* CABECERA LISTA DE ÍTEMS */}
            <div className="flex items-center justify-between pb-1 border-b border-gray-200 shrink-0">
              <span className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <IoRestaurantOutline className="text-green-600 text-base" />
                <span>Productos ({totalUnits})</span>
              </span>
              <span className="text-xs font-black text-green-950 bg-green-100 px-2 py-0.5 rounded-lg border border-green-300">
                ${itemsSubtotalUSD.toFixed(2)} USD
              </span>
            </div>

            {/* LISTA SCROLLABLE DE ÍTEMS */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {items.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 font-bold text-xs">
                  No hay productos en la comanda. Selecciona del menú para agregar.
                </div>
              ) : (
                items.map((it, idx) => {
                  const unitPrice = Number(it.price) || 0;
                  const itemTotalUSD = unitPrice * (it.quantity || 1);
                  const isItemLocked = hasPaymentHistory || Boolean(it.isPaidIndividually);

                  return (
                    <div
                      key={`${it.id || 'it'}-${idx}`}
                      className={`p-2.5 rounded-xl bg-white border shadow-2xs space-y-1.5 transition-colors ${
                        editingItemIndex === idx
                          ? 'border-green-500 ring-2 ring-green-200'
                          : 'border-gray-200 hover:border-green-400'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-xs text-gray-950 leading-tight break-words">
                            {it.productName}
                          </div>
                          <div className="text-[11px] text-gray-600 font-bold mt-0.5">
                            ${unitPrice.toFixed(2)} c/u • <strong className="text-black">${itemTotalUSD.toFixed(2)} USD</strong>
                          </div>
                        </div>

                        {/* Controles Cantidad / Editar / Eliminar */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isItemLocked}
                            onClick={() => handleQuantityChange(idx, -1)}
                            className="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-xs flex items-center justify-center cursor-pointer border border-gray-300 active:scale-95"
                            title={isItemLocked ? 'Anula pagos primero' : 'Restar 1'}
                          >
                            -
                          </button>
                          <span className="w-5 text-center font-black text-xs text-black">
                            {it.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={isItemLocked}
                            onClick={() => handleQuantityChange(idx, 1)}
                            className="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-xs flex items-center justify-center cursor-pointer border border-gray-300 active:scale-95"
                            title={isItemLocked ? 'Anula pagos primero' : 'Sumar 1'}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            disabled={isItemLocked}
                            onClick={() => handleEditItem(idx)}
                            className="p-1 rounded-lg bg-green-50 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed text-green-800 font-black text-xs cursor-pointer border border-green-300 transition-colors ml-1"
                            title={isItemLocked ? 'Anula pagos primero' : 'Editar personalización de este ítem'}
                          >
                            <IoPencilOutline className="text-sm" />
                          </button>
                          <button
                            type="button"
                            disabled={isItemLocked}
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed text-red-700 font-black text-xs cursor-pointer border border-red-200 transition-colors"
                            title={isItemLocked ? 'Anula pagos primero' : 'Eliminar este ítem'}
                          >
                            <IoTrashOutline className="text-sm" />
                          </button>
                        </div>
                      </div>

                      {/* Badges detallados por turno/producto */}
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        {it.isPaidIndividually && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-950 font-black border border-emerald-400">
                            ✅ Pagado{it.paidByName ? `: ${it.paidByName}` : ''}
                          </span>
                        )}
                        {it.size && !isMorningShift && !isDrinkProduct({ category: it.category, drinkType: it.drinkType, name: it.productName } as Product) && (
                          <span className="px-1.5 py-0.5 rounded bg-stone-100 text-gray-900 font-black border border-gray-300">
                            📏 {it.size}
                          </span>
                        )}
                        {it.isHalfHalf && it.halfDetails && (
                          <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-950 font-black border border-yellow-300">
                            🍕 MITADES: {it.halfDetails.half1Name} / {it.halfDetails.half2Name}
                          </span>
                        )}
                        {it.isTakeaway && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 font-black border border-amber-300">
                            📦 LLEVAR
                          </span>
                        )}
                        {it.isDelivery && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-950 font-black border border-blue-300">
                            🛵 DELIVERY
                          </span>
                        )}
                        {!isMorningShift && it.isCut && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-950 font-black border border-purple-300">
                            ✂️ {it.cutPreference || 'Picada'}
                          </span>
                        )}
                        {it.flavor && (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-950 font-black border border-cyan-300">
                            🍹 {it.flavor}
                          </span>
                        )}
                        {it.sugarPreference && (
                          <span className="px-1.5 py-0.5 rounded bg-pink-100 text-pink-950 font-black border border-pink-300">
                            🍬 {it.sugarPreference}
                          </span>
                        )}
                        {it.proteins && it.proteins.length > 0 && !areProteinsDefault(it.productName, it.proteins, it.defaultProteins) && (
                          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-950 font-black border border-rose-300">
                            🥩 {it.proteins.join(', ')}
                          </span>
                        )}
                        {it.removedIngredients && it.removedIngredients.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-900 font-bold border border-red-200 line-through">
                            🚫 SIN: {formatRemovedIngredients(it.removedIngredients).join(', ')}
                          </span>
                        )}
                        {it.extras && it.extras.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-950 font-bold border border-green-300">
                            ➕ {it.extras.map((e) => `${(e.quantity || 1) > 1 ? `${e.quantity}x ` : ''}${e.name}`).join(', ')}
                          </span>
                        )}
                        {it.notes && (
                          <span className="text-gray-700 font-semibold italic block w-full">
                            📝 {it.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* TOTALES Y ACCIONES INFERIORES */}
          <div className="pt-2 border-t border-gray-200 shrink-0 space-y-2">
            <div className="p-2.5 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] text-gray-600 font-black uppercase block">Total Comanda</span>
                <span className="text-lg font-black text-gray-950 leading-tight">${totalUSD.toFixed(2)} USD</span>
              </div>
              <div className="text-right text-[11px] font-bold text-gray-700 leading-tight">
                <div>🇨🇴 <strong className="text-sky-800">{totalCOP.toLocaleString('es-CO')} COP</strong></div>
                <div>🇻🇪 <strong className="text-amber-800">{totalBs} Bs</strong></div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-3 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-900 font-black text-xs cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                {onDeleteOrder && (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `¿Seguro que deseas anular y eliminar completamente la comanda #${cleanOrderNumber}? Se liberará su número correlativo y se borrarán todos sus registros.`
                        )
                      ) {
                        return;
                      }
                      try {
                        setIsSubmitting(true);
                        await onDeleteOrder(order.id);
                        onClose();
                      } catch (err: any) {
                        setError(err?.message || 'No se pudo anular la comanda');
                        setIsSubmitting(false);
                      }
                    }}
                    className="px-2.5 py-2 rounded-xl bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-300 font-black text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    title="Anular y eliminar comanda completamente"
                  >
                    <IoTrashOutline />
                    <span>Anular Comanda</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={isSubmitting || blockedByPayments}
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-500 disabled:border-gray-300 disabled:cursor-not-allowed text-black font-black text-xs border border-green-600 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title={
                  blockedByPayments
                    ? 'Anula los pagos primero para guardar cambios en productos'
                    : hasPaymentHistory
                    ? 'Guardar metadatos (cliente, mesa, notas de cocina)'
                    : 'Guardar todos los cambios de la comanda'
                }
              >
                <IoSaveOutline className="text-base" />
                <span>
                  {isSubmitting
                    ? 'Guardando...'
                    : hasPaymentHistory
                    ? 'Guardar Datos'
                    : 'Guardar Cambios'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
