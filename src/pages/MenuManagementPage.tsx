import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Product, Ingredient, Table, RecipeIngredient } from '../data/mockData';

import {
  IoPizza,
  IoAdd,
  IoTrash,
  IoClose,
  IoSparkles,
  IoBeer,
} from 'react-icons/io5';

export const MenuManagementPage: React.FC = () => {
  const {
    products,
    ingredients,
    tables,
    addProduct,
    updateProduct,
    deleteProduct,
    addIngredient,
    updateIngredient,
    deleteIngredient,
    addTable,
    updateTable,
    deleteTable,
    purgeAllOrders,
    backendUrl,
    userSession,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'pizzas' | 'bebidas' | 'ingredientes' | 'mesas'>('pizzas');

  // Modal Pizza (Crear / Editar)
  const [isAddPizzaOpen, setIsAddPizzaOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [pizzaName, setPizzaName] = useState('');
  const [pizzaPrice, setPizzaPrice] = useState('');
  const [pizzaSmallPrice, setPizzaSmallPrice] = useState('');
  const [pizzaDesc, setPizzaDesc] = useState('');
  const [pizzaImg, setPizzaImg] = useState('https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80');
  const [selectedBaseIngredients, setSelectedBaseIngredients] = useState<string[]>([]);

  const handleStartEditPizza = (product: any) => {
    setEditingProductId(product.id);
    setPizzaName(product.name);
    setPizzaPrice(product.price.toString());
    setPizzaSmallPrice((product.priceSmall ?? (product.price - 4)).toString());
    setPizzaDesc(product.description || '');
    setPizzaImg(product.image || '');
    setSelectedBaseIngredients(product.baseIngredients || []);
    setIsAddPizzaOpen(true);
  };

  // Modal Nueva Bebida / Editar
  const [isAddDrinkOpen, setIsAddDrinkOpen] = useState(false);
  const [editingDrinkId, setEditingDrinkId] = useState<string | null>(null);
  const [drinkName, setDrinkName] = useState('');
  const [drinkType, setDrinkType] = useState<'refresco' | 'jugo' | 'licor'>('refresco');
  const [drinkPrice, setDrinkPrice] = useState('');
  const [drinkDesc, setDrinkDesc] = useState('');
  const [drinkImg, setDrinkImg] = useState('https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80');

  // Modal Nuevo Ingrediente / Editar
  const [isAddIngOpen, setIsAddIngOpen] = useState(false);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [ingName, setIngName] = useState('');
  const [ingPrice, setIngPrice] = useState('2.00');
  const [ingIsBase, setIngIsBase] = useState(true);
  const [ingIsExtra, setIngIsExtra] = useState(true);
  const [ingCategory, setIngCategory] = useState('Ingredientes');

  // Modal Nueva Mesa / Editar
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState('4');
  const [tableZone, setTableZone] = useState('Salón Principal');

  // Local Image Upload Handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, setUrl: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const res = await fetch(`${backendUrl}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename: file.name }),
        });
        if (res.ok) {
          const data = await res.json();
          setUrl(data.url);
        } else {
          setUrl(base64);
        }
      } catch (err) {
        setUrl(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePizza = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pizzaName || !pizzaPrice) return;

    const pPrice = parseFloat(pizzaPrice) || 0;
    const pSmallPrice = parseFloat(pizzaSmallPrice) || (pPrice > 4 ? pPrice - 4 : pPrice);

    const productData = {
      name: pizzaName,
      category: 'Pizzas' as const,
      price: pPrice,
      priceSmall: pSmallPrice,
      description: pizzaDesc || 'Pizza recién horneada con ingredientes artesanales.',
      image: pizzaImg,
      baseIngredients: selectedBaseIngredients.length > 0 ? selectedBaseIngredients : ['Salsa de Tomate', 'Queso Mozzarella'],
      recipe: [] as RecipeIngredient[],
      shift: userSession?.shift || 'ambos'
    };

    if (editingProductId) {
      await updateProduct(editingProductId, productData);
    } else {
      await addProduct(productData);
    }

    setEditingProductId(null);
    setPizzaName('');
    setPizzaPrice('');
    setPizzaSmallPrice('');
    setPizzaDesc('');
    setSelectedBaseIngredients([]);
    setIsAddPizzaOpen(false);
  };

  const handleStartEditDrink = (p: Product) => {
    setEditingDrinkId(p.id);
    setDrinkName(p.name);
    setDrinkType(p.drinkType || 'refresco');
    setDrinkPrice(p.price.toString());
    setDrinkDesc(p.description || '');
    setDrinkImg(p.image || 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80');
    setIsAddDrinkOpen(true);
  };

  const handleCreateDrink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drinkName || !drinkPrice) return;

    const drinkData = {
      name: drinkName,
      category: 'Bebidas' as const,
      drinkType: drinkType,
      price: parseFloat(drinkPrice) || 0,
      description: drinkDesc || 'Bebida fría.',
      image: drinkImg,
      recipe: [] as RecipeIngredient[],
      shift: userSession?.shift || 'ambos'
    };

    if (editingDrinkId) {
      await updateProduct(editingDrinkId, drinkData);
    } else {
      await addProduct(drinkData);
    }

    setEditingDrinkId(null);
    setDrinkName('');
    setDrinkPrice('');
    setDrinkDesc('');
    setIsAddDrinkOpen(false);
  };

  const handleStartEditIngredient = (ing: Ingredient) => {
    setEditingIngredientId(ing.id);
    setIngName(ing.name);
    setIngPrice(ing.priceUSD.toString());
    setIngIsBase(ing.isBaseForPizza);
    setIngIsExtra(ing.isExtraForPizza);
    setIngCategory(ing.category || 'Ingredientes');
    setIsAddIngOpen(true);
  };

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingName) return;

    const ingData = {
      name: ingName,
      priceUSD: parseFloat(ingPrice) || 0,
      isBaseForPizza: ingIsBase,
      isExtraForPizza: ingIsExtra,
      category: ingCategory || 'Ingredientes',
      shift: userSession?.shift || 'ambos'
    };

    if (editingIngredientId) {
      await updateIngredient(editingIngredientId, ingData);
    } else {
      await addIngredient(ingData);
    }

    setEditingIngredientId(null);
    setIngName('');
    setIngPrice('2.00');
    setIngIsBase(true);
    setIngIsExtra(true);
    setIsAddIngOpen(false);
  };

  const handleStartEditTable = (t: Table) => {
    setEditingTableId(t.id);
    setTableNumber(t.number.toString());
    setTableName(t.name || `Mesa #${t.number}`);
    setTableCapacity(t.capacity.toString());
    setTableZone(t.zone || 'Salón Principal');
    setIsAddTableOpen(true);
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber) return;

    const num = parseInt(tableNumber, 10);
    const tableData = {
      number: num,
      name: tableName || `Mesa #${num}`,
      capacity: parseInt(tableCapacity, 10) || 4,
      zone: tableZone || 'Salón Principal',
    };

    if (editingTableId) {
      await updateTable(editingTableId, tableData);
    } else {
      await addTable(tableData);
    }

    setEditingTableId(null);
    setTableNumber('');
    setTableName('');
    setTableCapacity('4');
    setTableZone('Salón Principal');
    setIsAddTableOpen(false);
  };

  const toggleBaseIngredientSelection = (name: string) => {
    setSelectedBaseIngredients((prev: string[]) =>
      prev.includes(name) ? prev.filter((n: string) => n !== name) : [...prev, name]
    );
  };

  const shiftProducts = products.filter(p => !p.shift || p.shift === 'ambos' || p.shift === userSession?.shift);
  const pizzas = shiftProducts.filter((p) => p.category === 'Pizzas');
  const bebidas = shiftProducts.filter((p) => p.category === 'Bebidas');
  const shiftIngredients = ingredients.filter(i => !i.shift || i.shift === 'ambos' || i.shift === userSession?.shift);
  const baseIngredientsAvailable = shiftIngredients.filter((i) => i.isBaseForPizza);

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto text-white">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-[#0B2A1A]/90 via-[#070707] to-[#0B2A1A]/80 border border-purple-500/30 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#0B2A1A] border border-purple-500/40 flex items-center justify-center shadow-lg">
            <IoPizza className="text-3xl text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Gestión del Menú & Mesas</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase">
                ADMINISTRADOR
              </span>
            </div>
            <p className="text-xs text-[#D8E6DF]/70 mt-1">
              Agrega y administra pizzas, bebidas, ingredientes y configuración de mesas del restaurante.
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/[0.04] border border-white/10 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('pizzas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'pizzas' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <IoPizza />
            <span>PIZZAS ({pizzas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('bebidas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'bebidas' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <IoBeer />
            <span>BEBIDAS ({bebidas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ingredientes')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'ingredientes' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <IoSparkles />
            <span>INGREDIENTES ({shiftIngredients.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mesas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              activeTab === 'mesas' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <IoPizza />
            <span>MESAS ({tables.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PIZZAS */}
      {activeTab === 'pizzas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <IoPizza className="text-purple-400 text-xl" />
              <span>CATÁLOGO DE PIZZAS</span>
            </h2>

            <button
              onClick={() => setIsAddPizzaOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all flex items-center gap-1.5 shadow-lg"
            >
              <IoAdd className="text-lg" />
              <span>NUEVA PIZZA</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pizzas.map((p) => (
              <div key={p.id} className="p-5 rounded-3xl bg-gradient-to-br from-[#0B2A1A]/80 to-[#070707] border border-white/15 shadow-2xl flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="relative h-44 rounded-2xl overflow-hidden border border-white/10">
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    {p.badge && (
                      <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-md bg-purple-600 text-white text-[10px] font-black uppercase">
                        {p.badge}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{p.name}</h3>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{p.description}</p>
                    
                    {p.baseIngredients && p.baseIngredients.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {p.baseIngredients.map((ing, idx) => (
                          <span key={idx} className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-emerald-300 font-medium">
                            ✓ {ing}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div className="flex flex-col">
                    <span className="text-base font-black text-emerald-400">${p.price.toFixed(2)} USD (Grande)</span>
                    <span className="text-[10px] font-bold text-amber-300">Pequeña: ${(p.priceSmall ?? (p.price - 4)).toFixed(2)} USD</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEditPizza(p)}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-white border border-purple-500/30 transition-all text-xs font-bold flex items-center gap-1"
                    >
                      ✏️ Editar
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 transition-all">
                      <IoTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: BEBIDAS */}
      {activeTab === 'bebidas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <IoBeer className="text-purple-400 text-xl" />
              <span>BEBIDAS & REFRESCOS</span>
            </h2>

            <button
              onClick={() => setIsAddDrinkOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all flex items-center gap-1.5 shadow-lg"
            >
              <IoAdd className="text-lg" />
              <span>NUEVA BEBIDA</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bebidas.map((p) => (
              <div key={p.id} className="p-5 rounded-3xl bg-gradient-to-br from-[#0B2A1A]/80 to-[#070707] border border-white/15 shadow-2xl flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="relative h-40 rounded-2xl overflow-hidden border border-white/10">
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                    <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-md bg-black/80 border border-white/20 text-sky-300 text-[10px] font-black uppercase">
                      {p.drinkType?.toUpperCase() || 'BEBIDA'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{p.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">{p.description}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <span className="text-xl font-black text-emerald-400">${p.price.toFixed(2)} USD</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEditDrink(p)}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-white border border-purple-500/30 transition-all text-xs font-bold flex items-center gap-1"
                    >
                      ✏️ Editar
                    </button>
                    <button onClick={() => deleteProduct(p.id)} className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 transition-all">
                      <IoTrash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: INGREDIENTES */}
      {activeTab === 'ingredientes' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <IoSparkles className="text-purple-400 text-xl" />
              <span>CATÁLOGO DE INGREDIENTES</span>
            </h2>

            <button
              onClick={() => { setEditingIngredientId(null); setIngName(''); setIngPrice('2.00'); setIngIsBase(true); setIngIsExtra(true); setIsAddIngOpen(true); }}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all flex items-center gap-1.5 shadow-lg"
            >
              <IoAdd className="text-lg" />
              <span>NUEVO INGREDIENTE</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-white/[0.04] text-white uppercase text-[10px] font-black border-b border-white/10">
                <tr>
                  <th className="p-4">Nombre del Ingrediente</th>
                  <th className="p-4">Costo Adicional (USD)</th>
                  <th className="p-4">Base para Pizza</th>
                  <th className="p-4">Adicional / Extra</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {shiftIngredients.map((ing) => (
                  <tr key={ing.id} className="hover:bg-white/[0.02]">
                    <td className="p-4 font-bold text-white flex items-center gap-2">
                      <IoSparkles className="text-purple-400" />
                      <span>{ing.name}</span>
                    </td>
                    <td className="p-4 font-black text-emerald-400">+${ing.priceUSD.toFixed(2)} USD</td>
                    <td className="p-4">
                      {ing.isBaseForPizza ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">✓ SÍ</span>
                      ) : (
                        <span className="text-gray-500">NO</span>
                      )}
                    </td>
                    <td className="p-4">
                      {ing.isExtraForPizza ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">✓ SÍ</span>
                      ) : (
                        <span className="text-gray-500">NO</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleStartEditIngredient(ing)}
                          className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-white border border-purple-500/30 transition-all text-xs font-bold flex items-center gap-1"
                        >
                          ✏️ Editar
                        </button>
                        <button onClick={() => deleteIngredient(ing.id)} className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 transition-all">
                          <IoTrash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MESAS */}
      {activeTab === 'mesas' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <IoPizza className="text-purple-400 text-xl" />
              <span>CONFIGURACIÓN DE MESAS DEL RESTAURANTE</span>
            </h2>

            <button
              onClick={() => { setEditingTableId(null); setTableNumber(''); setTableName(''); setIsAddTableOpen(true); }}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all flex items-center gap-1.5 shadow-lg"
            >
              <IoAdd className="text-lg" />
              <span>NUEVA MESA</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {tables.map((t) => {
              const sizeTag = t.capacity <= 2 ? 'Pequeña (2p)' : t.capacity <= 4 ? 'Mediana (4p)' : 'Grande (6-8p)';
              return (
                <div key={t.id} className="p-5 rounded-3xl bg-gradient-to-br from-[#0B2A1A]/80 to-[#070707] border border-white/15 shadow-2xl flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-md bg-purple-600/30 text-purple-300 border border-purple-500/40 text-[10px] font-black uppercase">
                        {sizeTag}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-bold uppercase">{t.zone || 'Salón'}</span>
                    </div>

                    <h3 className="text-xl font-black text-white mt-2">{t.name || `Mesa #${t.number}`}</h3>
                    <p className="text-xs text-gray-400 mt-1">Capacidad: <span className="text-white font-bold">{t.capacity} personas</span></p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <span className="text-xs font-bold text-gray-400">N° {t.number}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEditTable(t)}
                        className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500 hover:text-white border border-purple-500/30 transition-all text-xs font-bold flex items-center gap-1"
                      >
                        ✏️ Editar
                      </button>
                      <button onClick={() => deleteTable(t.id)} className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/30 transition-all">
                        <IoTrash size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL CREAR PIZZA */}
      {isAddPizzaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg p-6 bg-gradient-to-br from-[#0B2A1A] via-[#070707] to-[#0B2A1A] border border-purple-500/40 rounded-3xl shadow-2xl space-y-4 text-white">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-lg font-black">{editingProductId ? 'EDITAR PIZZA' : 'NUEVA PIZZA EN EL MENÚ'}</h3>
              <button onClick={() => { setIsAddPizzaOpen(false); setEditingProductId(null); }}><IoClose size={20} /></button>
            </div>

            <form onSubmit={handleCreatePizza} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Nombre de la Pizza:</label>
                <input
                  type="text"
                  required
                  value={pizzaName}
                  onChange={(e) => setPizzaName(e.target.value)}
                  placeholder="Ej: Pizza Cuatro Quesos"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-300 block mb-1">Precio Grande (12") USD ($):</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={pizzaPrice}
                    onChange={(e) => setPizzaPrice(e.target.value)}
                    placeholder="14.50"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-amber-300 block mb-1">Precio Pequeña (8") USD ($):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={pizzaSmallPrice}
                    onChange={(e) => setPizzaSmallPrice(e.target.value)}
                    placeholder="10.50"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-amber-500/40 text-xs text-amber-200 outline-none focus:border-amber-400 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Seleccionar Ingredientes Base de la Pizza:</label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-black/50 rounded-xl border border-white/10">
                  {baseIngredientsAvailable.map((ing) => {
                    const isSelected = selectedBaseIngredients.includes(ing.name);
                    return (
                      <button
                        key={ing.id}
                        type="button"
                        onClick={() => toggleBaseIngredientSelection(ing.name)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                          isSelected ? 'bg-purple-600 text-white border-purple-400' : 'bg-white/5 text-gray-300 border-white/10'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}{ing.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Cargar Imagen desde PC:</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, setPizzaImg)}
                    className="text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-purple-600 file:text-white hover:file:bg-purple-500"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-lg">
                GUARDAR PIZZA EN EL MENÚ
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR BEBIDA */}
      {isAddDrinkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg p-6 bg-gradient-to-br from-[#0B2A1A] via-[#070707] to-[#0B2A1A] border border-purple-500/40 rounded-3xl shadow-2xl space-y-4 text-white">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-lg font-black">NUEVA BEBIDA EN EL MENÚ</h3>
              <button onClick={() => setIsAddDrinkOpen(false)}><IoClose size={20} /></button>
            </div>

            <form onSubmit={handleCreateDrink} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Nombre de la Bebida:</label>
                <input
                  type="text"
                  required
                  value={drinkName}
                  onChange={(e) => setDrinkName(e.target.value)}
                  placeholder="Ej: Coca-Cola 1.5L"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Tipo de Bebida:</label>
                <select
                  value={drinkType}
                  onChange={(e) => setDrinkType(e.target.value as 'refresco' | 'jugo' | 'licor')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                >
                  <option value="refresco">Refresco / Gaseosa</option>
                  <option value="jugo">Jugo Natural</option>
                  <option value="licor">Licor / Vino / Cerveza</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Precio en USD ($):</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={drinkPrice}
                  onChange={(e) => setDrinkPrice(e.target.value)}
                  placeholder="3.50"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Descripción Breve:</label>
                <input
                  type="text"
                  value={drinkDesc}
                  onChange={(e) => setDrinkDesc(e.target.value)}
                  placeholder="Ej: Botella de 1.5 litros bien fría"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Cargar Imagen desde PC:</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, setDrinkImg)}
                    className="text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-purple-600 file:text-white hover:file:bg-purple-500"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-lg">
                GUARDAR BEBIDA EN EL MENÚ
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR INGREDIENTE */}
      {isAddIngOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md p-6 bg-gradient-to-br from-[#0B2A1A] via-[#070707] to-[#0B2A1A] border border-purple-500/40 rounded-3xl shadow-2xl space-y-4 text-white">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-lg font-black">NUEVO INGREDIENTE</h3>
              <button onClick={() => setIsAddIngOpen(false)}><IoClose size={20} /></button>
            </div>

            <form onSubmit={handleCreateIngredient} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Nombre del Ingrediente:</label>
                <input
                  type="text"
                  required
                  value={ingName}
                  onChange={(e) => setIngName(e.target.value)}
                  placeholder="Ej: Jamón Serrano"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Costo Adicional en USD ($):</label>
                <input
                  type="number"
                  step="0.5"
                  required
                  value={ingPrice}
                  onChange={(e) => setIngPrice(e.target.value)}
                  placeholder="2.00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Categoría del Ingrediente:</label>
                <select
                  value={ingCategory}
                  onChange={(e) => setIngCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                >
                  <option value="Ingredientes">General</option>
                  <option value="Quesos">Quesos</option>
                  <option value="Carnes">Carnes</option>
                  <option value="Vegetales">Vegetales</option>
                  <option value="Salsas">Salsas</option>
                  <option value="Especias">Especias</option>
                  <option value="Orillas">Orillas</option>
                </select>
              </div>

              <div className="space-y-2 bg-black/40 p-3 rounded-xl border border-white/10">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ingIsBase}
                    onChange={(e) => setIngIsBase(e.target.checked)}
                    className="rounded accent-purple-600"
                  />
                  <span>Usar como Ingrediente Base para Pizzas</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ingIsExtra}
                    onChange={(e) => setIngIsExtra(e.target.checked)}
                    className="rounded accent-purple-600"
                  />
                  <span>Disponible como Adicional / Extra al pedir</span>
                </label>
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-lg">
                GUARDAR INGREDIENTE
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR MESA */}
      {isAddTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-md p-6 bg-gradient-to-br from-[#0B2A1A] via-[#070707] to-[#0B2A1A] border border-purple-500/40 rounded-3xl shadow-2xl space-y-4 text-white">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-lg font-black">NUEVA MESA</h3>
              <button onClick={() => setIsAddTableOpen(false)}><IoClose size={20} /></button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Número de Mesa:</label>
                <input
                  type="number"
                  required
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Ej: 9"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Nombre o Referencia de Mesa:</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Ej: Mesa #9 (Terraza)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Tamaño / Capacidad:</label>
                <select
                  value={tableCapacity}
                  onChange={(e) => setTableCapacity(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                >
                  <option value="2">Pequeña (2 Personas)</option>
                  <option value="4">Mediana (4 Personas)</option>
                  <option value="6">Grande (6 Personas)</option>
                  <option value="8">Familiar (8 Personas)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-300 block mb-1">Ubicación / Zona:</label>
                <input
                  type="text"
                  value={tableZone}
                  onChange={(e) => setTableZone(e.target.value)}
                  placeholder="Salón Principal, Terraza, VIP..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/80 border border-white/20 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <button type="submit" className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-lg">
                GUARDAR MESA
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
