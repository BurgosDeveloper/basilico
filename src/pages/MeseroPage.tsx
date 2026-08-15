import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Product, OrderItem, ExtraIngredient } from '../data/mockData';

import {
  IoRestaurant,
  IoSearch,
  IoAdd,
  IoPaperPlane,
  IoGridOutline,
  IoBagCheckOutline,
  IoClose,
  IoPizza,
  IoReaderOutline,
  IoCar,
  IoWalk,
  IoCheckmarkCircle,
  IoBagOutline,
  IoSparkles,
  IoCloseCircle,
  IoTimeOutline,
  IoPersonOutline,
  IoDocumentTextOutline,
} from 'react-icons/io5';

export const MeseroPage: React.FC = () => {
  const { tables, products, ingredients, orders, createOrder, cancelOrder, exchangeRates, userSession } = useApp();
  const [searchParams] = useSearchParams();
  const activeSubTab = searchParams.get('tab') || 'pedidos';

  // Order Target Modal (Mesa, Delivery, PickUp)
  const [activeOrderTarget, setActiveOrderTarget] = useState<{
    type: 'mesa' | 'delivery' | 'pickup';
    tableNumber?: number;
    title: string;
  } | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart Items Array & General Notes
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');
  const [deliveryFeeUSD, setDeliveryFeeUSD] = useState<number>(0);
  const [sentAlert, setSentAlert] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Modal 1: Pizza Customization Modal State
  const [configuringPizza, setConfiguringPizza] = useState<Product | null>(null);
  const [pizzaSize, setPizzaSize] = useState<'Grande' | 'Pequeña'>('Grande');
  const [pizzaIsHalfHalf, setPizzaIsHalfHalf] = useState<boolean>(false);
  const [pizzaHalf1, setPizzaHalf1] = useState<Product | null>(null);
  const [pizzaHalf2, setPizzaHalf2] = useState<Product | null>(null);
  const [pizzaHalf1Removed, setPizzaHalf1Removed] = useState<string[]>([]);
  const [pizzaHalf2Removed, setPizzaHalf2Removed] = useState<string[]>([]);
  const [pizzaHalf1Extras, setPizzaHalf1Extras] = useState<{ name: string; price: number }[]>([]);
  const [pizzaHalf2Extras, setPizzaHalf2Extras] = useState<{ name: string; price: number }[]>([]);
  const [pizzaRemovedIngredients, setPizzaRemovedIngredients] = useState<string[]>([]);
  const [pizzaExtras, setPizzaExtras] = useState<{ name: string; price: number }[]>([]);
  const [pizzaIsTakeaway, setPizzaIsTakeaway] = useState<boolean>(false);

  // Modal 2: Extras Modal State
  const [isExtrasModalOpen, setIsExtrasModalOpen] = useState<boolean>(false);
  const [extrasTargetHalf, setExtrasTargetHalf] = useState<'full' | 'half1' | 'half2'>('full');

  // Modal 3: Jugo Preference Modal State
  const [configuringJugo, setConfiguringJugo] = useState<Product | null>(null);

  const categories = ['Todas', ...Array.from(new Set(products.filter(p => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift).map(p => p.category)))];
  const shiftProducts = products.filter(p => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift);
  const allPizzaProducts = shiftProducts.filter((p) => p.category === 'Pizzas');
  const availableExtras = ingredients.filter((i) => i.isExtraForPizza && (!i.shift || i.shift === 'ambos' || i.shift === userSession?.shift));

  const handleOpenMenuModal = (type: 'mesa' | 'delivery' | 'pickup', tableNumber?: number, title?: string) => {
    setActiveOrderTarget({
      type,
      tableNumber,
      title: title || (type === 'delivery' ? 'Orden para Delivery' : type === 'pickup' ? 'Orden para PickUp / Para Llevar' : `Mesa #${tableNumber}`),
    });
    setCartItems([]);
    setCustomerName('');
    setKitchenNotes('');
    setDeliveryFeeUSD(0);
  };

  // Click on a Product from Menu
  const handleSelectProduct = (product: Product) => {
    if (product.category === 'Pizzas') {
      setConfiguringPizza(product);
      setPizzaSize('Grande');
      setPizzaIsHalfHalf(false);
      setPizzaHalf1(product);
      setPizzaHalf2(allPizzaProducts.find((p) => p.id !== product.id) || product);
      setPizzaHalf1Removed([]);
      setPizzaHalf2Removed([]);
      setPizzaHalf1Extras([]);
      setPizzaHalf2Extras([]);
      setPizzaRemovedIngredients([]);
      setPizzaExtras([]);
      setPizzaIsTakeaway(activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery');
    } else if (product.category === 'Bebidas' && product.drinkType === 'jugo') {
      setConfiguringJugo(product);
    } else {
      addSimpleItemToCart(product);
    }
  };

  const addSimpleItemToCart = (product: Product, sugarPreference?: 'Con azúcar' | 'Sin azúcar') => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity: 1,
      sugarPreference,
      isNewOrModified: false,
    };
    setCartItems((prev) => [...prev, newItem]);
  };

  // Save Configured Pizza to Cart
  const handleConfirmPizzaAdd = () => {
    if (!configuringPizza) return;

    let basePrice = configuringPizza.price;
    let smallPrice = configuringPizza.priceSmall ?? (configuringPizza.price > 4 ? configuringPizza.price - 4.00 : configuringPizza.price);

    if (pizzaIsHalfHalf && pizzaHalf1 && pizzaHalf2) {
      basePrice = Math.max(pizzaHalf1.price, pizzaHalf2.price);
      const small1 = pizzaHalf1.priceSmall ?? (pizzaHalf1.price > 4 ? pizzaHalf1.price - 4.00 : pizzaHalf1.price);
      const small2 = pizzaHalf2.priceSmall ?? (pizzaHalf2.price > 4 ? pizzaHalf2.price - 4.00 : pizzaHalf2.price);
      smallPrice = Math.max(small1, small2);
    }

    const effectiveBasePrice = pizzaSize === 'Pequeña' ? smallPrice : basePrice;
    const combinedExtras = pizzaIsHalfHalf ? [...pizzaHalf1Extras, ...pizzaHalf2Extras] : pizzaExtras;
    const extrasTotal = combinedExtras.reduce((sum, e) => sum + e.price, 0);
    const finalPrice = Math.max(2.00, effectiveBasePrice + extrasTotal);

    const productName = pizzaIsHalfHalf && pizzaHalf1 && pizzaHalf2
      ? `Pizza 1/2 ${pizzaHalf1.name.replace('Pizza ', '')} + 1/2 ${pizzaHalf2.name.replace('Pizza ', '')} (${pizzaSize})`
      : `${configuringPizza.name} (${pizzaSize})`;

    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      productId: configuringPizza.id,
      productName,
      price: finalPrice,
      quantity: 1,
      size: pizzaSize,
      isHalfHalf: pizzaIsHalfHalf,
      halfDetails: pizzaIsHalfHalf && pizzaHalf1 && pizzaHalf2 ? {
        half1Name: pizzaHalf1.name,
        half2Name: pizzaHalf2.name,
        half1Removed: pizzaHalf1Removed,
        half2Removed: pizzaHalf2Removed,
        half1Extras: pizzaHalf1Extras,
        half2Extras: pizzaHalf2Extras,
      } : undefined,
      removedIngredients: pizzaIsHalfHalf ? [] : pizzaRemovedIngredients,
      extras: pizzaIsHalfHalf ? [] : pizzaExtras,
      isTakeaway: pizzaIsTakeaway,
      isNewOrModified: false,
    };

    setCartItems((prev) => [...prev, newItem]);
    setConfiguringPizza(null);
  };


  // Toggle Base Ingredient Removal (Sin X)
  const toggleRemovedIngredient = (ingName: string) => {
    setPizzaRemovedIngredients((prev) =>
      prev.includes(ingName) ? prev.filter((i) => i !== ingName) : [...prev, ingName]
    );
  };

  // Toggle Extra Ingredient (Add/Remove from Pizza or targeted Half)
  const toggleExtraIngredient = (extra: ExtraIngredient) => {
    const extraObj = { name: extra.name, price: extra.priceUSD };
    if (extrasTargetHalf === 'half1') {
      setPizzaHalf1Extras((prev) =>
        prev.some((e) => e.name === extra.name)
          ? prev.filter((e) => e.name !== extra.name)
          : [...prev, extraObj]
      );
    } else if (extrasTargetHalf === 'half2') {
      setPizzaHalf2Extras((prev) =>
        prev.some((e) => e.name === extra.name)
          ? prev.filter((e) => e.name !== extra.name)
          : [...prev, extraObj]
      );
    } else {
      setPizzaExtras((prev) =>
        prev.some((e) => e.name === extra.name)
          ? prev.filter((e) => e.name !== extra.name)
          : [...prev, extraObj]
      );
    }
  };

  const handleRemoveCartItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const cartTotalUSD = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0) + (activeOrderTarget?.type === 'delivery' ? deliveryFeeUSD : 0);

  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const handleConfirmOrder = async () => {
    if (!activeOrderTarget || cartItems.length === 0 || isSubmittingOrder) return;
    setIsSubmittingOrder(true);
    try {
      await createOrder({
        type: activeOrderTarget.type,
        tableNumber: activeOrderTarget.tableNumber,
        customerName: customerName || undefined,
        kitchenNotes: kitchenNotes || undefined,
        items: cartItems,
        totalUSD: cartTotalUSD,
        deliveryFeeUSD: activeOrderTarget.type === 'delivery' ? deliveryFeeUSD : 0,
        shift: userSession?.shift || 'ambos'
      } as any);
      setSentAlert(`¡Comanda enviada a Cocina & Caja! (${activeOrderTarget.title})`);

      setTimeout(() => setSentAlert(null), 4000);
      setActiveOrderTarget(null);
      setCartItems([]);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'No se pudo enviar la comanda. Intenta nuevamente.');
      setTimeout(() => setOrderError(null), 4000);
    } finally {
      setIsSubmittingOrder(false);
    }
  };


  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto text-slate-900">
      {/* Sent Order Toast Notification */}
      {sentAlert && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-3 p-4 rounded-2xl bg-emerald-500 text-black font-black shadow-2xl animate-bounce">
          <IoCheckmarkCircle className="text-2xl" />
          <span>{sentAlert}</span>
        </div>
      )}
      {orderError && (
        <div role="alert" className="fixed top-20 right-6 z-50 flex items-center gap-3 p-4 rounded-2xl bg-red-100 text-red-950 border border-red-300 font-black shadow-2xl">
          <IoCloseCircle className="text-2xl" />
          <span>{orderError}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-white via-slate-50 to-slate-100 border border-emerald-200 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white border border-emerald-200 flex items-center justify-center shadow-lg">
            <IoRestaurant className="text-3xl text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Mesero</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase">
                EN VIVO
              </span>
            </div>
            <p className="text-xs text-slate-700/70 mt-1">
              Selecciona Delivery, PickUp o una Mesa para tomar el pedido con personalizaciones de pizzas y bebidas.
            </p>
          </div>
        </div>
      </div>

      {/* SUB-TAB: PEDIDOS */}
      {(activeSubTab === 'pedidos' || activeSubTab === 'default') && (
        <div className="space-y-8">
          {/* Special Cards: Delivery & PickUp */}
          <div>
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <IoBagCheckOutline className="text-emerald-700 text-lg" />
              <span>ORDENES ESPECIALES (DELIVERY & PICKUP)</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Delivery Card */}
              <div
                onClick={() => handleOpenMenuModal('delivery', undefined, 'Orden de Delivery a Domicilio')}
                className="group cursor-pointer p-6 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-200 hover:border-emerald-300 backdrop-blur-xl shadow-2xl hover:scale-[1.02] transition-all duration-300 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-emerald-300 flex items-center justify-center text-slate-900 group-hover:scale-110 transition-transform">
                    <IoCar className="text-3xl text-emerald-700" />
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase">
                      DOMICILIO
                    </span>
                    <h3 className="text-lg font-black text-slate-900 mt-1 group-hover:text-emerald-800 transition-colors">
                      NUEVO DELIVERY
                    </h3>
                    <p className="text-xs text-slate-500">Envío directo a casa del cliente con dirección y notas.</p>
                  </div>
                </div>

                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-200 flex items-center justify-center text-emerald-700 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                  <IoAdd className="text-xl" />
                </div>
              </div>

              {/* PickUp Card */}
              <div
                onClick={() => handleOpenMenuModal('pickup', undefined, 'Orden para Llevar (PickUp)')}
                className="group cursor-pointer p-6 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-amber-200 hover:border-amber-300 backdrop-blur-xl shadow-2xl hover:scale-[1.02] transition-all duration-300 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-amber-300 flex items-center justify-center text-slate-900 group-hover:scale-110 transition-transform">
                    <IoWalk className="text-3xl text-amber-600" />
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 border border-amber-200 text-[10px] font-black uppercase">
                      PARA LLEVAR
                    </span>
                    <h3 className="text-lg font-black text-slate-900 mt-1 group-hover:text-amber-700 transition-colors">
                      NUEVO PICKUP
                    </h3>
                    <p className="text-xs text-slate-500">El cliente retira directamente en la pizzería.</p>
                  </div>
                </div>

                <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-200 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-black transition-all">
                  <IoAdd className="text-xl" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Table Map */}
          <div>
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <IoGridOutline className="text-emerald-700 text-lg" />
              <span>MAPA DE MESAS (SALÓN PRINCIPAL)</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {tables.map((t) => {
                const activeOrder = orders.find(
                  (o) => o.tableNumber === t.number && o.status !== 'entregada' && o.status !== 'cancelado' && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift)
                );
                const isReady = activeOrder?.status === 'preparada';
                const isOccupied = !!activeOrder;

                return (
                  <div
                    key={t.id}
                    onClick={() => handleOpenMenuModal('mesa', t.number, `Mesa #${t.number}`)}
                    className={`cursor-pointer p-5 rounded-3xl border backdrop-blur-xl transition-all duration-300 shadow-2xl flex flex-col justify-between space-y-4 hover:scale-[1.02] ${
                      isReady
                        ? 'bg-gradient-to-br from-emerald-50 via-slate-50 to-emerald-100 border-emerald-300 shadow-emerald-950/50'
                        : isOccupied
                        ? 'bg-gradient-to-br from-white via-slate-50 to-slate-100 border-amber-300'
                        : 'bg-gradient-to-br from-white via-slate-50 to-slate-100 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                        <IoPizza className={isReady ? 'text-emerald-700 text-xl' : isOccupied ? 'text-amber-600 text-xl' : 'text-emerald-700 text-xl'} />
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                          isReady
                            ? 'bg-emerald-500 text-black border-emerald-300 shadow-lg'
                            : isOccupied
                            ? 'bg-amber-500/20 text-amber-700 border-amber-200'
                            : 'bg-emerald-500/20 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {isReady ? '¡LISTA!' : isOccupied ? 'OCUPADA' : 'LIBRE'}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-black text-slate-900">Mesa #{t.number}</h3>
                      <p className="text-xs text-slate-500">Capacidad: {t.capacity} Personas</p>
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-emerald-700">
                      <span>ABRIR PEDIDO</span>
                      <IoAdd className="text-lg" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: MIS COMANDAS */}
      {activeSubTab === 'comandas' && (
        <div className="space-y-6">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <IoReaderOutline className="text-emerald-700 text-xl" />
            <span>ESTADO DE COMANDAS ENVIADAS</span>
          </h2>

          {orders.filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada' && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift)).length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-slate-100 border border-slate-200 text-slate-500 font-bold">
              No hay comandas activas enviadas en este momento.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {orders.filter((o) => o.status !== 'cancelado' && o.status !== 'fusionada' && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift)).map((ord) => (
                <div key={ord.id} className="p-6 rounded-3xl bg-gradient-to-br from-white to-[#070707] border border-slate-200 space-y-4 shadow-xl">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <div>
                      <span className="text-2xl font-black text-slate-900">{ord.orderNumber}</span>
                      <span className="text-xs text-emerald-700 font-bold ml-2">({ord.type.toUpperCase()})</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 border border-emerald-200 text-xs font-bold uppercase flex items-center gap-1">
                      {ord.status === 'en_preparacion' ? <IoTimeOutline /> : <IoCheckmarkCircle />}
                      <span>{ord.status === 'en_preparacion' ? '⏳ EN COCINA' : ord.status === 'preparada' ? '🔥 ¡LISTA!' : ord.status.toUpperCase()}</span>
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 font-bold flex items-center gap-1">
                    <IoPersonOutline />
                    <span>👤 Cliente: {ord.customerName || (ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'pickup' ? 'PickUp / Para Llevar' : 'Delivery')}</span>
                  </p>

                  {ord.kitchenNotes && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-200 text-xs text-amber-700 font-medium flex items-start gap-1">
                      <IoDocumentTextOutline className="mt-0.5 shrink-0" />
                      <div>📝 <span className="font-bold">Nota Cocina:</span> {ord.kitchenNotes}</div>
                    </div>
                  )}

                  <div className="text-xs text-slate-600 space-y-2">
                    {(ord.items || []).map((it) => (
                      <div key={it.id} className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex justify-between font-bold text-slate-900">
                          <span className="flex items-center gap-1">
                            • {it.quantity}x {it.productName}
                            {it.isTakeaway && <span className="text-amber-600 font-bold ml-1.5">(📦 PARA LLEVAR)</span>}
                          </span>
                          <span className="text-emerald-700">${(it.price * it.quantity).toFixed(2)}</span>
                        </div>

                        {it.sugarPreference && (
                          <p className="text-[11px] text-cyan-700 font-medium ml-3">
                            🥤 Preferencia: {it.sugarPreference}
                          </p>
                        )}

                        {it.isHalfHalf && it.halfDetails && (
                          <div className="ml-3 my-1.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-200 text-xs space-y-1.5 font-bold">
                            <div className="text-amber-700 text-[11px] uppercase tracking-wider font-black flex items-center gap-1">
                              <span>🌓 DESGLOSE MITAD Y MITAD ({it.size || 'Grande'}):</span>
                            </div>
                            <div className="text-slate-900 bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-1">
                              <div className="text-amber-600 font-black">
                                • 1ra Mitad: <span className="text-slate-900">{it.halfDetails.half1Name}</span>
                              </div>
                              {it.halfDetails.half1Removed && it.halfDetails.half1Removed.length > 0 && (
                                <div className="text-red-600 text-[11px] font-extrabold ml-2">
                                  🚫 SIN: {it.halfDetails.half1Removed.join(', ')}
                                </div>
                              )}
                              {it.halfDetails.half1Extras && it.halfDetails.half1Extras.length > 0 && (
                                <div className="text-emerald-700 text-[11px] font-extrabold ml-2 space-y-0.5">
                                  {it.halfDetails.half1Extras.map((e, idx) => (
                                    <div key={idx} className="flex justify-between">
                                      <span>➕ EXTRAS 1RA MITAD: {e.name}</span>
                                      {e.price > 0 && <span className="text-emerald-700">+${e.price.toFixed(2)}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="text-slate-900 bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-1">
                              <div className="text-amber-600 font-black">
                                • 2da Mitad: <span className="text-slate-900">{it.halfDetails.half2Name}</span>
                              </div>
                              {it.halfDetails.half2Removed && it.halfDetails.half2Removed.length > 0 && (
                                <div className="text-red-600 text-[11px] font-extrabold ml-2">
                                  🚫 SIN: {it.halfDetails.half2Removed.join(', ')}
                                </div>
                              )}
                              {it.halfDetails.half2Extras && it.halfDetails.half2Extras.length > 0 && (
                                <div className="text-emerald-700 text-[11px] font-extrabold ml-2 space-y-0.5">
                                  {it.halfDetails.half2Extras.map((e, idx) => (
                                    <div key={idx} className="flex justify-between">
                                      <span>➕ EXTRAS 2DA MITAD: {e.name}</span>
                                      {e.price > 0 && <span className="text-emerald-700">+${e.price.toFixed(2)}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {!it.isHalfHalf && it.removedIngredients && it.removedIngredients.length > 0 && (
                          <p className="text-[11px] text-red-600 font-semibold ml-3 flex items-center gap-1">
                            <IoCloseCircle /> 🚫 SIN: {it.removedIngredients.join(', ')}
                          </p>
                        )}

                        {!it.isHalfHalf && it.extras && it.extras.length > 0 && (
                          <div className="ml-3 text-[11px] text-emerald-700 space-y-0.5 font-medium">
                            {(it.extras || []).map((ex, exIdx) => (
                              <div key={exIdx} className="flex justify-between">
                                <span>➕ EXTRA: {ex.name}</span>
                                {ex.price > 0 && <span>+${ex.price.toFixed(2)}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs">
                    <div>
                      <span className="text-slate-500 block">Total USD / COP:</span>
                      <span className="text-slate-500 text-[10px]">({exchangeRates.COP.toLocaleString()} COP/$)</span>
                    </div>
                    <div className="text-right">
                      {ord.type === 'delivery' && ord.deliveryFeeUSD ? (
                        <div className="text-[10px] text-amber-600 font-bold mb-1">
                          + Delivery: ${ord.deliveryFeeUSD.toFixed(2)}
                        </div>
                      ) : null}
                      <span className="text-lg font-black text-emerald-700 block">${ord.totalUSD.toFixed(2)} USD</span>
                      <span className="text-xs font-bold text-emerald-800/80">${(ord.totalUSD * exchangeRates.COP).toLocaleString()} COP</span>
                    </div>
                  </div>

                  {/* Actions */}
                  {ord.status !== 'cancelado' && (
                    <div className="grid grid-cols-1 gap-2 pt-2">
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Confirmas cancelar la comanda ${ord.orderNumber}? Sonará una alarma en cocina.`)) {
                            cancelOrder(ord.id);
                          }
                        }}
                        className="py-2.5 px-3 rounded-xl bg-red-500/20 hover:bg-red-500 hover:text-slate-900 border border-red-300 text-red-700 font-black text-xs flex items-center justify-center gap-1 transition-all"
                      >
                        🚫 CANCELAR
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* MODAL 1: MENÚ Y CREACIÓN DE COMANDA */}
      {activeOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-md">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  <IoPizza className="text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-black">{activeOrderTarget.title}</h3>
                  <p className="text-xs text-slate-500">Selecciona pizzas o bebidas para armar la comanda.</p>
                </div>
              </div>
              <button
                onClick={() => setActiveOrderTarget(null)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900"
              >
                <IoClose size={22} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Customer Reference & Kitchen Notes Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-white/60 border border-slate-200">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Nombre o Referencia del Cliente:</label>
                  <input
                    type="text"
                    placeholder="Ej: Juan Pérez / Mesa Ventana"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-white/80 border border-slate-300 text-slate-900 placeholder-gray-500 text-xs outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Observación o Nota General para Cocina:</label>
                  <input
                    type="text"
                    placeholder="Ej: Poco dorada / Sin servilletas"
                    value={kitchenNotes}
                    onChange={(e) => setKitchenNotes(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl bg-white/80 border border-slate-300 text-slate-900 placeholder-gray-500 text-xs outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                {/* Delivery Fee Selector */}
                {activeOrderTarget.type === 'delivery' && (
                  <div className="md:col-span-2 p-4 bg-emerald-50 rounded-xl border border-emerald-200 mt-2">
                    <label className="text-xs font-bold text-emerald-800 block mb-2">Precio del Delivery (USD):</label>
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                      <div className="flex flex-wrap gap-2">
                        {[1, 1.5, 2, 2.5, 3, 4, 5].map(fee => (
                          <button
                            key={fee}
                            type="button"
                            onClick={() => setDeliveryFeeUSD(fee)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                              deliveryFeeUSD === fee
                                ? 'bg-emerald-500 text-black border-emerald-400 shadow-md scale-[1.05]'
                                : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            ${fee}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600">Otro:</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={deliveryFeeUSD || ''}
                          onChange={(e) => setDeliveryFeeUSD(parseFloat(e.target.value) || 0)}
                          className="w-24 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs font-bold outline-none focus:border-emerald-500"
                          placeholder="$0.00"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Categories & Search */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-emerald-500 text-black shadow-lg'
                          : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat === 'Pizzas' ? '🍕 PIZZAS' : cat === 'Bebidas' ? '🥤 BEBIDAS' : 'TODOS'}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <IoSearch className="absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Buscar pizza o bebida..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/80 border border-slate-300 text-slate-900 placeholder-gray-500 text-xs outline-none focus:border-emerald-500 font-bold"
                  />
                </div>
              </div>

              {/* Product Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectProduct(p)}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer flex flex-col justify-between space-y-3 group hover:scale-[1.02]"
                  >
                    <div className="flex items-center gap-3">
                      <img src={p.image} alt={p.name} className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                      <div>
                        <h4 className="text-sm font-black text-slate-900 group-hover:text-emerald-800">{p.name}</h4>
                        <span className="text-emerald-700 font-black text-xs">${p.price.toFixed(2)} USD</span>
                        <p className="text-[10px] text-slate-500 line-clamp-1">{p.description}</p>
                      </div>
                    </div>

                    <button className="w-full py-2 rounded-xl bg-emerald-500/20 text-emerald-800 hover:bg-emerald-500 hover:text-black font-black text-xs transition-all flex items-center justify-center gap-1 border border-emerald-200">
                      <IoAdd />
                      <span>{p.category === 'Pizzas' ? 'PERSONALIZAR Y PEDIR' : 'AGREGAR A COMANDA'}</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Current Cart Item Summary */}
              {cartItems.length > 0 && (
                <div className="space-y-3 p-4 rounded-2xl bg-white/80 border border-emerald-200">
                  <h4 className="text-xs font-black text-emerald-700 uppercase tracking-wider">
                    RESUMEN DE LA COMANDA ({cartItems.length} ITEMS)
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {cartItems.map((item) => (
                      <div key={item.id} className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                            <span>🍕 {item.productName}</span>
                            {item.size && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 text-[9px] font-black">
                                📐 {item.size}
                              </span>
                            )}
                            {item.isTakeaway && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 text-[9px] font-black">
                                📦 PARA LLEVAR
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-black text-emerald-700">${item.price.toFixed(2)}</span>
                            <button onClick={() => handleRemoveCartItem(item.id)} className="text-red-600 hover:text-red-700">
                              <IoCloseCircle size={18} />
                            </button>
                          </div>
                        </div>

                        {/* Half-and-Half breakdown */}
                        {item.isHalfHalf && item.halfDetails && (
                          <div className="ml-2 p-2 rounded-lg bg-amber-500/10 border border-amber-200 space-y-1">
                            <div className="text-amber-700 text-[10px] font-black uppercase">🌓 MITAD Y MITAD:</div>
                            <div className="text-slate-900 text-[10px] font-bold">
                              • 1ra Mitad: {item.halfDetails.half1Name}
                              {item.halfDetails.half1Removed && item.halfDetails.half1Removed.length > 0 && (
                                <span className="text-red-600 ml-1">🚫 SIN: {item.halfDetails.half1Removed.join(', ')}</span>
                              )}
                              {item.halfDetails.half1Extras && item.halfDetails.half1Extras.length > 0 && (
                                <span className="text-emerald-700 ml-1">➕ EXTRAS: {item.halfDetails.half1Extras.map(e => e.name).join(', ')}</span>
                              )}
                            </div>
                            <div className="text-slate-900 text-[10px] font-bold">
                              • 2da Mitad: {item.halfDetails.half2Name}
                              {item.halfDetails.half2Removed && item.halfDetails.half2Removed.length > 0 && (
                                <span className="text-red-600 ml-1">🚫 SIN: {item.halfDetails.half2Removed.join(', ')}</span>
                              )}
                              {item.halfDetails.half2Extras && item.halfDetails.half2Extras.length > 0 && (
                                <span className="text-emerald-700 ml-1">➕ EXTRAS: {item.halfDetails.half2Extras.map(e => e.name).join(', ')}</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Regular pizza details */}
                        {!item.isHalfHalf && item.removedIngredients && item.removedIngredients.length > 0 && (
                          <div className="text-[10px] text-red-600 font-bold ml-2">🚫 SIN: {item.removedIngredients.join(', ')}</div>
                        )}
                        {!item.isHalfHalf && item.extras && item.extras.length > 0 && (
                          <div className="text-[10px] text-emerald-700 font-bold ml-2">➕ EXTRAS: {item.extras.map((e) => e.name).join(', ')}</div>
                        )}
                        {item.sugarPreference && (
                          <div className="text-[10px] text-sky-700 font-bold ml-2">🥤 {item.sugarPreference}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-200 bg-white/60 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs text-slate-500">Total Comanda:</div>
                <div className="text-2xl font-black text-emerald-700">
                  ${cartTotalUSD.toFixed(2)} USD{' '}
                  <span className="text-xs text-slate-500">(${(cartTotalUSD * exchangeRates.COP).toLocaleString()} COP)</span>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setActiveOrderTarget(null)}
                  className="px-5 py-3 rounded-xl bg-slate-100 text-slate-900 font-bold text-xs hover:bg-slate-200"
                >
                  CANCELAR
                </button>
                <button
                  onClick={handleConfirmOrder}
                  disabled={cartItems.length === 0 || isSubmittingOrder}
                  className={`flex-1 sm:flex-none px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-2 shadow-lg ${isSubmittingOrder || cartItems.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <IoPaperPlane />
                  <span>{isSubmittingOrder ? 'ENVIANDO...' : 'ENVIAR COMANDA A COCINA'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 2: PERSONALIZACIÓN DE PIZZA */}
      {configuringPizza && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-gradient-to-br from-white to-[#070707] border border-emerald-200 rounded-3xl p-6 shadow-2xl space-y-6 text-slate-900 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xl font-black text-slate-900">{configuringPizza.name}</h3>
                <span className="text-xs text-emerald-700 font-bold">${configuringPizza.price.toFixed(2)} USD</span>
              </div>
              <button onClick={() => setConfiguringPizza(null)} className="text-slate-500 hover:text-slate-900">
                <IoClose size={22} />
              </button>
            </div>

            {/* 1. SELECCIÓN DE TAMAÑO (Grande vs Pequeña) */}
            <div>
              <label className="text-xs font-black text-slate-600 block mb-2 uppercase tracking-wider">
                1. TAMAÑO DE LA PIZZA:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Grande', 'Pequeña'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setPizzaSize(sz)}
                    className={`py-3 px-4 rounded-xl text-xs font-extrabold border transition-all ${
                      pizzaSize === sz
                        ? 'bg-emerald-500 text-black border-emerald-300 font-black shadow-lg scale-[1.02]'
                        : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sz === 'Grande' ? '🍕 Grande (12" - Familiar)' : '🍕 Pequeña (8" - Personal -$4)'}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. MODALIDAD: ENTERA O MITAD/MITAD */}
            <div>
              <label className="text-xs font-black text-slate-600 block mb-2 uppercase tracking-wider">
                2. MODALIDAD DE LA PIZZA:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPizzaIsHalfHalf(false)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border transition-all ${
                    !pizzaIsHalfHalf
                      ? 'bg-emerald-500 text-black border-emerald-300 font-black shadow-lg'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🍕 Pizza Completa (1 Sabor)
                </button>

                <button
                  type="button"
                  onClick={() => setPizzaIsHalfHalf(true)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border transition-all ${
                    pizzaIsHalfHalf
                      ? 'bg-amber-500 text-black border-amber-300 font-black shadow-lg'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🌓 Mitad y Mitad (2 Sabores)
                </button>
              </div>
            </div>

            {/* Controles si es Mitad y Mitad */}
            {pizzaIsHalfHalf ? (
              <div className="space-y-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-200">
                <div className="text-xs font-black text-amber-700 uppercase tracking-wider">
                  🌓 DESGLOSE E INGREDIENTES DE CADA MITAD:
                </div>

                {/* MITAD 1 */}
                <div className="space-y-2 p-3 rounded-xl bg-white/60 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-amber-600">1ra Mitad (Sabor A):</label>
                    <select
                      value={pizzaHalf1?.id || ''}
                      onChange={(e) => {
                        const selected = allPizzaProducts.find((p) => p.id === e.target.value);
                        if (selected) setPizzaHalf1(selected);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs border border-slate-300 font-bold"
                    >
                      {allPizzaProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-[11px] font-bold text-slate-600">Ingredientes 1ra Mitad (Toca para remover / marcar "SIN"):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(pizzaHalf1?.baseIngredients || ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano']).map((ing) => {
                      const isRemoved = pizzaHalf1Removed.includes(ing);
                      return (
                        <button
                          key={ing}
                          type="button"
                          onClick={() =>
                            setPizzaHalf1Removed((prev) =>
                              prev.includes(ing) ? prev.filter((i) => i !== ing) : [...prev, ing]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            isRemoved
                              ? 'bg-red-500/20 border-red-500 text-red-700 line-through'
                              : 'bg-emerald-500/20 border-emerald-300 text-emerald-800'
                          }`}
                        >
                          {isRemoved ? `🚫 SIN ${ing}` : `✓ ${ing}`}
                        </button>
                      );
                    })}
                  </div>

                  {/* Extras for 1st Half */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-200 mt-2">
                    <span className="text-[10px] text-amber-700 font-bold">
                      Adicionales 1ra Mitad ({pizzaHalf1Extras.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => { setExtrasTargetHalf('half1'); setIsExtrasModalOpen(true); }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-800 border border-emerald-200 text-[10px] font-black"
                    >
                      ➕ Extras 1ra Mitad
                    </button>
                  </div>
                  {pizzaHalf1Extras.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pizzaHalf1Extras.map((e) => (
                        <span key={e.name} className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 font-bold text-[9px]">
                          +{e.name} (+${e.price.toFixed(2)})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* MITAD 2 */}
                <div className="space-y-2 p-3 rounded-xl bg-white/60 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-amber-600">2da Mitad (Sabor B):</label>
                    <select
                      value={pizzaHalf2?.id || ''}
                      onChange={(e) => {
                        const selected = allPizzaProducts.find((p) => p.id === e.target.value);
                        if (selected) setPizzaHalf2(selected);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs border border-slate-300 font-bold"
                    >
                      {allPizzaProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-[11px] font-bold text-slate-600">Ingredientes 2da Mitad (Toca para remover / marcar "SIN"):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(pizzaHalf2?.baseIngredients || ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano']).map((ing) => {
                      const isRemoved = pizzaHalf2Removed.includes(ing);
                      return (
                        <button
                          key={ing}
                          type="button"
                          onClick={() =>
                            setPizzaHalf2Removed((prev) =>
                              prev.includes(ing) ? prev.filter((i) => i !== ing) : [...prev, ing]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            isRemoved
                              ? 'bg-red-500/20 border-red-500 text-red-700 line-through'
                              : 'bg-emerald-500/20 border-emerald-300 text-emerald-800'
                          }`}
                        >
                          {isRemoved ? `🚫 SIN ${ing}` : `✓ ${ing}`}
                        </button>
                      );
                    })}
                  </div>

                  {/* Extras for 2nd Half */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-200 mt-2">
                    <span className="text-[10px] text-amber-700 font-bold">
                      Adicionales 2da Mitad ({pizzaHalf2Extras.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => { setExtrasTargetHalf('half2'); setIsExtrasModalOpen(true); }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-800 border border-emerald-200 text-[10px] font-black"
                    >
                      ➕ Extras 2da Mitad
                    </button>
                  </div>
                  {pizzaHalf2Extras.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pizzaHalf2Extras.map((e) => (
                        <span key={e.name} className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 font-bold text-[9px]">
                          +{e.name} (+${e.price.toFixed(2)})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Pizza Completa Base Ingredients */
              <div>
                <label className="text-xs font-black text-slate-600 block mb-2 uppercase tracking-wider">
                  INGREDIENTES BASE (Toca para remover / marcar "SIN"):
                </label>
                <div className="flex flex-wrap gap-2">
                  {(configuringPizza.baseIngredients || ['Salsa de Tomate', 'Queso Mozzarella', 'Orégano']).map((ing) => {
                    const isRemoved = pizzaRemovedIngredients.includes(ing);
                    return (
                      <button
                        key={ing}
                        type="button"
                        onClick={() => toggleRemovedIngredient(ing)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                          isRemoved
                            ? 'bg-red-500/20 border-red-500 text-red-700 line-through'
                            : 'bg-emerald-500/20 border-emerald-300 text-emerald-800 hover:bg-emerald-500 hover:text-black'
                        }`}
                      >
                        {isRemoved ? `🚫 SIN ${ing}` : `✓ ${ing}`}
                      </button>
                    );
                  })}
                </div>

                {/* Single Flavor Pizza Extras */}
                {pizzaExtras.length > 0 && (
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-200 text-xs mt-3">
                    <span className="text-emerald-700 font-bold">Extras seleccionados:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pizzaExtras.map((e) => (
                        <span key={e.name} className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 font-bold text-[10px]">
                          +{e.name} (+${e.price.toFixed(2)})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { setExtrasTargetHalf('full'); setIsExtrasModalOpen(true); }}
                  className="w-full py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-200 text-emerald-800 font-black text-xs flex items-center justify-center gap-2 shadow-lg mt-3"
                >
                  <IoSparkles className="text-emerald-700" />
                  <span>➕ AGREGAR ADICIONALES / EXTRAS</span>
                </button>
              </div>
            )}

            {/* Individual Item Takeaway Switcher */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 border border-slate-200">
              <div className="flex items-center gap-2">
                <IoBagOutline className="text-amber-600 text-lg" />
                <div>
                  <div className="text-xs font-black text-slate-900">Empacar esta Pizza para Llevar</div>
                  <div className="text-[10px] text-slate-500">Marcar individualmente para empaque de llevar</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={pizzaIsTakeaway}
                onChange={(e) => setPizzaIsTakeaway(e.target.checked)}
                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setConfiguringPizza(null)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-900 font-bold text-xs">
                CANCELAR
              </button>
              <button onClick={handleConfirmPizzaAdd} className="flex-1 py-3 rounded-xl bg-emerald-500 text-black font-black text-xs hover:bg-emerald-400 shadow-lg">
                AGREGAR A COMANDA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SELECCIÓN DE EXTRAS DE PIZZA */}
      {isExtrasModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-gradient-to-br from-white to-[#070707] border border-emerald-200 rounded-3xl p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="text-base font-black text-slate-900">
                {extrasTargetHalf === 'half1'
                  ? `Adicionales para 1ra Mitad (${pizzaHalf1?.name})`
                  : extrasTargetHalf === 'half2'
                  ? `Adicionales para 2da Mitad (${pizzaHalf2?.name})`
                  : 'Adicionales para Toda la Pizza'}
              </h3>
              <button onClick={() => setIsExtrasModalOpen(false)} className="text-slate-500 hover:text-slate-900">
                <IoClose size={22} />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {availableExtras.map((extra) => {
                const isSelected =
                  extrasTargetHalf === 'half1'
                    ? pizzaHalf1Extras.some((e) => e.name === extra.name)
                    : extrasTargetHalf === 'half2'
                    ? pizzaHalf2Extras.some((e) => e.name === extra.name)
                    : pizzaExtras.some((e) => e.name === extra.name);
                return (
                  <div
                    key={extra.id}
                    onClick={() => toggleExtraIngredient(extra)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-400 text-slate-900 font-bold'
                        : 'bg-white/60 border-slate-200 text-slate-600 hover:border-emerald-500/40'
                    }`}
                  >
                    <span>{extra.name}</span>
                    <span className="text-emerald-700 font-black text-xs">+${extra.priceUSD.toFixed(2)} USD</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setIsExtrasModalOpen(false)}
              className="w-full py-3 rounded-xl bg-emerald-500 text-slate-900 font-black text-xs hover:bg-emerald-400 shadow-lg"
            >
              LISTO (APLICAR ADICIONALES)
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: PREFERENCIA DE AZÚCAR EN JUGOS */}
      {configuringJugo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="relative w-full max-w-sm bg-gradient-to-br from-white to-[#070707] border border-sky-200 rounded-3xl p-6 shadow-2xl space-y-5 text-slate-900 text-center">
            <h3 className="text-lg font-black text-slate-900">{configuringJugo.name}</h3>
            <p className="text-xs text-slate-600">¿Cómo prefiere el cliente preparar este jugo natural?</p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  addSimpleItemToCart(configuringJugo, 'Con azúcar');
                  setConfiguringJugo(null);
                }}
                className="py-4 rounded-2xl bg-sky-500/20 hover:bg-sky-500 hover:text-black border border-sky-300 text-sky-800 font-black text-xs transition-all shadow-lg"
              >
                🧊 CON AZÚCAR
              </button>

              <button
                onClick={() => {
                  addSimpleItemToCart(configuringJugo, 'Sin azúcar');
                  setConfiguringJugo(null);
                }}
                className="py-4 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500 hover:text-black border border-emerald-300 text-emerald-200 font-black text-xs transition-all shadow-lg"
              >
                🌿 SIN AZÚCAR
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
