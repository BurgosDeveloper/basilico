import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { soundService } from '../services/soundService';
import {
  Product,
  Table,
  Order,
  OrderItem,
  OrderStatus,
  ExchangeRates,
  PaymentMethod,
  Ingredient,
  CajaChicaApertura,
  CajaChicaTransaction,
  CajaChicaCierre,
} from '../data/mockData';

export type UserRole = 'mesero' | 'caja' | 'cocina' | 'admin';

export interface UserSession {
  username: string;
  role: UserRole;
  shift?: 'manana' | 'noche' | 'ambos';
}

interface AppContextType {
  userSession: UserSession | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  
  products: Product[];
  ingredients: Ingredient[];
  extras: Ingredient[]; // alias para ingredientes con isExtraForPizza === true
  tables: Table[];
  orders: Order[];
  exchangeRates: ExchangeRates;
  
  cajaChicaApertura: CajaChicaApertura;
  cajaChicaTransactions: CajaChicaTransaction[];
  ultimoCierre: CajaChicaCierre | null;
  
  // Actions
  createOrder: (orderData: {
    type: 'mesa' | 'delivery' | 'pickup';
    tableNumber?: number;
    customerName?: string;
    kitchenNotes?: string;
    items: OrderItem[];
    totalUSD: number;
  }) => Promise<void>;
  
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  editOrder: (orderId: string, editData: { items: OrderItem[]; kitchenNotes?: string; totalUSD: number }) => Promise<void>;
  processPayment: (

    orderId: string,
    method: PaymentMethod,
    amountUSD?: number,
    amountCOP?: number,
    splitPayments?: any[],
    details?: {
      payerName?: string;
      cashTenderedUSD?: number;
      cashTenderedCOP?: number;
      changeGivenUSD?: number;
      changeGivenCOP?: number;
      changeGivenBs?: number;
      cashTenderedBs?: number;
      itemIds?: string[];
    }
  ) => Promise<void>;
  mergeOrders: (targetOrderId: string, sourceOrderIds: string[]) => Promise<void>;
  processMultiplePayments: (orderIds: string[], method: PaymentMethod, totalUSD: number, totalCOP: number, splitPayments?: any[]) => Promise<void>;

  aperturarCajaChica: (usdCash: number, copCash: number) => Promise<void>;
  addCajaTransaction: (trans: { type: 'ingreso' | 'egreso'; amountUSD: number; amountCOP: number; paymentMethod: string; description: string }) => Promise<void>;
  realizarCierreCaja: (actualUSD: number, actualCOP: number, notes?: string) => Promise<any>;
  obtenerReporteDiario: () => Promise<any>;
  updateExchangeRates: (newRates: Partial<ExchangeRates>) => Promise<void>;
  queryCajaAI: (message: string) => Promise<string>;

  
  // Admin CRUD Actions (Persisted to Database / JSON)
  addProduct: (product: Omit<Product, 'id'> & { id?: string }) => Promise<void>;
  updateProduct: (id: string, data: Omit<Product, 'id'>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addIngredient: (ing: Omit<Ingredient, 'id'> & { id?: string }) => Promise<void>;
  updateIngredient: (id: string, data: Partial<Ingredient>) => Promise<void>;
  deleteIngredient: (id: string) => Promise<void>;
  addTable: (table: { number: number; name: string; capacity: number; zone: string }) => Promise<void>;
  updateTable: (id: string, data: { number: number; name: string; capacity: number; zone: string }) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
  purgeAllOrders: () => Promise<void>;

  // Server connection status & backend URL
  isConnected: boolean;
  backendUrl: string;
  updateServerIp: (newIp: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const getInitialBackendUrl = (): string => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    const savedIp = window.localStorage.getItem('basilico_server_ip');
    if (savedIp) {
      const cleanIp = savedIp.trim();
      return cleanIp.startsWith('http') ? cleanIp : `http://${cleanIp}:3001`;
    }
  }

  if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname !== 'localhost') {
    return `${window.location.protocol || 'http:'}//${window.location.hostname}:3001`;
  }

  try {
    const lanConfig = require('../config/lanConfig.json');
    if (lanConfig && lanConfig.backendUrl) {
      return lanConfig.backendUrl;
    }
  } catch (e) {}

  return 'http://192.168.1.4:3001';
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [backendUrl, setBackendUrlState] = useState<string>(getInitialBackendUrl);

  const updateServerIp = useCallback((newIp: string) => {
    let cleanIp = newIp.trim();
    if (!cleanIp) return;
    if (!cleanIp.startsWith('http://') && !cleanIp.startsWith('https://')) {
      if (cleanIp.includes(':')) {
        cleanIp = `http://${cleanIp}`;
      } else {
        cleanIp = `http://${cleanIp}:3001`;
      }
    }
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem('basilico_server_ip', cleanIp);
    }
    setBackendUrlState(cleanIp);
  }, []);

  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      const saved = window.localStorage.getItem('basilico_user_session');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return null;
  });

  const [isConnected, setIsConnected] = useState<boolean>(false);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ COP: 3950, Bs: 36.50 });
  
  const [cajaChicaApertura, setCajaChicaApertura] = useState<CajaChicaApertura>({ usdCash: 0, copCash: 0 });
  const [cajaChicaTransactions, setCajaChicaTransactions] = useState<CajaChicaTransaction[]>([]);
  const [ultimoCierre, setUltimoCierre] = useState<CajaChicaCierre | null>(null);

  // Fetch Functions
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/products`);
      if (res.ok) setProducts(await res.json());
    } catch (e) {}
  }, [backendUrl]);

  const fetchIngredients = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/ingredients`);
      if (res.ok) setIngredients(await res.json());
    } catch (e) {}
  }, [backendUrl]);

  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/tables`);
      if (res.ok) setTables(await res.json());
    } catch (e) {}
  }, [backendUrl]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/orders`);
      if (res.ok) setOrders(await res.json());
    } catch (e) {}
  }, [backendUrl]);

  const fetchCajaChica = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/caja-chica`);
      if (res.ok) {
        const data = await res.json();
        if (data.apertura) setCajaChicaApertura(data.apertura);
        if (data.transacciones) setCajaChicaTransactions(data.transacciones);
        if (data.ultimoCierre) setUltimoCierre(data.ultimoCierre);
      }
    } catch (e) {}
  }, [backendUrl]);

  const fetchRates = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/rates`);
      if (res.ok) setExchangeRates(await res.json());
    } catch (e) {}
  }, [backendUrl]);

  const refreshAllState = useCallback(() => {
    fetchProducts();
    fetchIngredients();
    fetchTables();
    fetchOrders();
    fetchCajaChica();
    fetchRates();
  }, [fetchProducts, fetchIngredients, fetchTables, fetchOrders, fetchCajaChica, fetchRates]);

  const login = async (usernameInput: string, passwordInput: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          const session: UserSession = { username: data.user.username, role: data.user.role, shift: data.user.shift };
          setUserSession(session);
          if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
            window.localStorage.setItem('basilico_user_session', JSON.stringify(session));
          }
          return { success: true };
        }
      }
      return { success: false, error: 'Credenciales inválidas. Verifica usuario y contraseña.' };
    } catch (e) {
      return {
        success: false,
        error: `⚠️ Sin conexión a la PC Servidor (${backendUrl}). Verifica que el servidor esté encendido y la IP configurada.`,
      };
    }
  };

  const logout = () => {
    setUserSession(null);
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.removeItem('basilico_user_session');
    }
  };

  useEffect(() => {
    refreshAllState();

    const socket: Socket = io(backendUrl, {
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      refreshAllState();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('order:created', (newOrder: Order) => {
      setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
      soundService.playNewOrderSound();
    });

    socket.on('order:status_updated', (updatedOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
    });

    socket.on('order:prepared_sound', () => {
      soundService.playOrderReadySound();
    });

    socket.on('order:cancelled_sound', () => {
      soundService.playOrderCancelledSound();
    });

    socket.on('order:cancelled', (cancelledOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === cancelledOrder.id ? cancelledOrder : o)));
      soundService.playOrderCancelledSound();
    });

    socket.on('order:edited', (editedOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === editedOrder.id ? editedOrder : o)));
      soundService.playOrderEditedSound();
    });

    socket.on('order:paid', (updatedOrder: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
      fetchCajaChica();
    });

    socket.on('orders:sync', (allOrders: Order[]) => {
      setOrders(allOrders);
    });

    socket.on('products:sync', (allProducts: Product[]) => {
      setProducts(allProducts);
    });

    socket.on('ingredients:sync', (allIngredients: Ingredient[]) => {
      setIngredients(allIngredients);
    });

    socket.on('tables:sync', (allTables: Table[]) => {
      setTables(allTables);
    });

    socket.on('caja:updated', () => {
      fetchCajaChica();
    });

    socket.on('rates:updated', (newRates: ExchangeRates) => {
      setExchangeRates(newRates);
    });

    return () => {
      socket.disconnect();
    };
  }, [refreshAllState, fetchCajaChica]);

  const createOrder = async (orderData: {
    type: 'mesa' | 'delivery' | 'pickup';
    tableNumber?: number;
    customerName?: string;
    kitchenNotes?: string;
    items: OrderItem[];
    totalUSD: number;
  }) => {
    try {
      const res = await fetch(`${backendUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...orderData, waiterName: 'Mesero' }),
      });
      if (res.ok) {
        const created = await res.json();
        setOrders((prev) => [created, ...prev.filter((o) => o.id !== created.id)]);
        soundService.playNewOrderSound();
      } else {
        const errText = await res.text();
        console.warn('⚠️ Error de respuesta en servidor al crear comanda:', res.status, errText);
        throw new Error(`Server returned ${res.status}: ${errText}`);
      }
    } catch (e) {
      console.warn('⚠️ Usando estado local para comanda:', e);
      const nextNum = 101 + orders.length;
      const newOrd: Order = {
        id: `ord-${Date.now()}`,
        orderNumber: `#${nextNum}`,
        type: orderData.type,
        tableNumber: orderData.tableNumber,
        customerName: orderData.customerName,
        kitchenNotes: orderData.kitchenNotes,
        status: 'en_preparacion',
        paymentStatus: 'no_pagado',
        totalUSD: orderData.totalUSD,
        waiterName: 'Mesero',
        createdAt: new Date().toISOString(),
        elapsedMinutes: 0,
        items: orderData.items,
      };
      setOrders((prev) => [newOrd, ...prev.filter((o) => o.id !== newOrd.id)]);
      soundService.playNewOrderSound();
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const res = await fetch(`${backendUrl}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      }
    } catch (e) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
      if (status === 'preparada') soundService.playOrderReadySound();
    }
  };

  const cancelOrder = async (orderId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/orders/${orderId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelado' } : o)));
        soundService.playOrderCancelledSound();
      }
    } catch (e) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelado' } : o)));
      soundService.playOrderCancelledSound();
    }
  };

  const editOrder = async (orderId: string, editData: { items: OrderItem[]; kitchenNotes?: string; totalUSD: number }) => {
    try {
      const res = await fetch(`${backendUrl}/api/orders/${orderId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      }
    } catch (e) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...editData, isEdited: true } : o)));
    }
  };

  const processPayment = async (
    orderId: string,
    method: PaymentMethod,
    amountUSD?: number,
    amountCOP?: number,
    splitPayments?: any[],
    details?: {
      payerName?: string;
      cashTenderedUSD?: number;
      cashTenderedCOP?: number;
      cashTenderedBs?: number;
      changeGivenUSD?: number;
      changeGivenCOP?: number;
      changeGivenBs?: number;
      itemIds?: string[];
    }
  ) => {
    try {
      const payload = {
        paymentMethod: method,
        amountUSD,
        amountCOP,
        splitPayments,
        payerName: details?.payerName,
        cashTenderedUSD: details?.cashTenderedUSD,
        cashTenderedCOP: details?.cashTenderedCOP,
        cashTenderedBs: details?.cashTenderedBs,
        changeGivenUSD: details?.changeGivenUSD,
        changeGivenCOP: details?.changeGivenCOP,
        changeGivenBs: details?.changeGivenBs,
        itemIds: details?.itemIds,
        shift: userSession?.shift || 'ambos',
      };

      const res = await fetch(`${backendUrl}/api/orders/${orderId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
        fetchCajaChica();
      }
    } catch (e) {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, paymentStatus: 'pagado', paymentMethod: method } : o))
      );
    }
  };

  const mergeOrders = async (targetOrderId: string, sourceOrderIds: string[]) => {
    try {
      const res = await fetch(`${backendUrl}/api/orders/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetOrderId, sourceOrderIds }),
      });
      if (res.ok) {
        fetchOrders();
      }
    } catch (e) {
      console.error('Error al fusionar comandas:', e);
    }
  };

  const processMultiplePayments = async (
    orderIds: string[],
    method: PaymentMethod,
    totalUSD: number,
    totalCOP: number,
    splitPayments?: any[]
  ) => {
    try {
      const res = await fetch(`${backendUrl}/api/orders/pay-multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds, paymentMethod: method, totalUSD, totalCOP, splitPayments, shift: userSession?.shift || 'ambos' }),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (orderIds.includes(o.id) ? { ...o, paymentStatus: 'pagado', paymentMethod: method } : o)));
        fetchCajaChica();
      }
    } catch (e) {
      setOrders((prev) => prev.map((o) => (orderIds.includes(o.id) ? { ...o, paymentStatus: 'pagado', paymentMethod: method } : o)));
    }
  };



  const aperturarCajaChica = async (usdCash: number, copCash: number) => {
    try {
      await fetch(`${backendUrl}/api/caja-chica/apertura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usdCash, copCash, shift: userSession?.shift || 'ambos' }),
      });
      fetchCajaChica();
    } catch (e) {
      setCajaChicaApertura({ usdCash, copCash, shift: userSession?.shift || 'ambos' });
    }
  };

  const addCajaTransaction = async (trans: {
    type: 'ingreso' | 'egreso';
    amountUSD: number;
    amountCOP: number;
    paymentMethod: string;
    description: string;
  }) => {
    try {
      await fetch(`${backendUrl}/api/caja-chica/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...trans, shift: userSession?.shift || 'ambos' }),
      });
      fetchCajaChica();
    } catch (e) {
      const newTx: CajaChicaTransaction = {
        id: `tx-${Date.now()}`,
        ...trans,
        timestamp: new Date().toISOString(),
        shift: userSession?.shift || 'ambos'
      };
      setCajaChicaTransactions((prev) => [newTx, ...prev]);
    }
  };

  const realizarCierreCaja = async (actualUSD: number, actualCOP: number, notes?: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/caja-chica/cierre`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualUSD, actualCOP, notes, closedBy: userSession?.username || 'Caja', shift: userSession?.shift || 'ambos' }),
      });
      if (res.ok) {
        const data = await res.json();
        fetchCajaChica();
        return data;
      }
    } catch (e) {}
    return null;
  };

  const obtenerReporteDiario = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/caja-chica/reporte-diario`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  };

  const updateExchangeRates = async (newRates: Partial<ExchangeRates>) => {
    try {
      const updated = { ...exchangeRates, ...newRates };
      await fetch(`${backendUrl}/api/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      setExchangeRates(updated);
    } catch (e) {
      setExchangeRates((prev) => ({ ...prev, ...newRates }));
    }
  };

  const queryCajaAI = async (message: string): Promise<string> => {
    try {
      const res = await fetch(`${backendUrl}/api/caja/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.reply;
      }
    } catch (e) {}

    const lower = message.toLowerCase();
    const paidOrders = orders.filter((o) => o.paymentStatus === 'pagado');
    if (lower.includes('pizza') || lower.includes('vendida')) {
      const tally: Record<string, number> = {};
      paidOrders.forEach((o) => {
        o.items.forEach((it) => {
          tally[it.productName] = (tally[it.productName] || 0) + it.quantity;
        });
      });
      const entries = Object.entries(tally);
      if (entries.length === 0) return '🍕 No se registran pizzas cobradas hoy.';
      return `🍕 Pizzas Cobradas Hoy:\n` + entries.map(([n, q]) => `• ${n}: ${q} unidades`).join('\n');
    }
    return `🤖 Asistente de Caja: Hay ${orders.length} comandas registradas en el sistema.`;
  };

  // ADMIN CRUD ACTIONS (Persisted to Database / JSON)
  const addProduct = async (productData: Omit<Product, 'id'>) => {
    try {
      const res = await fetch(`${backendUrl}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      if (res.ok) fetchProducts();
    } catch (e) {
      const newProduct: Product = { ...productData, id: `p${Date.now()}` };
      setProducts((prev) => [newProduct, ...prev]);
    }
  };

  const updateProduct = async (id: string, productData: Omit<Product, 'id'>) => {
    try {
      const res = await fetch(`${backendUrl}/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      if (res.ok) fetchProducts();
    } catch (e) {
      setProducts((prev) => prev.map((p) => p.id === id ? { ...p, ...productData } : p));
    }
  };


  const deleteProduct = async (id: string) => {
    try {
      await fetch(`${backendUrl}/api/products/${id}`, { method: 'DELETE' });
      fetchProducts();
    } catch (e) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const addIngredient = async (ingData: Omit<Ingredient, 'id'>) => {
    try {
      const res = await fetch(`${backendUrl}/api/ingredients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ingData),
      });
      if (res.ok) fetchIngredients();
    } catch (e) {
      const newIng: Ingredient = { ...ingData, id: `ing-${Date.now()}` };
      setIngredients((prev) => [newIng, ...prev]);
    }
  };

  const updateIngredient = async (id: string, ingData: Partial<Ingredient>) => {
    try {
      const res = await fetch(`${backendUrl}/api/ingredients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ingData),
      });
      if (res.ok) fetchIngredients();
    } catch (e) {
      setIngredients((prev) => prev.map((i) => i.id === id ? { ...i, ...ingData } : i));
    }
  };


  const deleteIngredient = async (id: string) => {
    try {
      await fetch(`${backendUrl}/api/ingredients/${id}`, { method: 'DELETE' });
      fetchIngredients();
    } catch (e) {
      setIngredients((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const addTable = async (tableData: { number: number; name: string; capacity: number; zone: string }) => {
    try {
      const res = await fetch(`${backendUrl}/api/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tableData),
      });
      if (res.ok) fetchTables();
    } catch (e) {
      const newT: Table = { id: `t-${Date.now()}`, ...tableData, status: 'libre' };
      setTables((prev) => [...prev, newT]);
    }
  };

  const updateTable = async (id: string, tableData: { number: number; name: string; capacity: number; zone: string }) => {
    try {
      const res = await fetch(`${backendUrl}/api/tables/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tableData),
      });
      if (res.ok) fetchTables();
    } catch (e) {
      setTables((prev) => prev.map((t) => t.id === id ? { ...t, ...tableData } : t));
    }
  };


  const deleteTable = async (id: string) => {
    try {
      await fetch(`${backendUrl}/api/tables/${id}`, { method: 'DELETE' });
      fetchTables();
    } catch (e) {
      setTables((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const purgeAllOrders = async () => {
    try {
      await fetch(`${backendUrl}/api/orders/purge-all`, { method: 'DELETE' });
      setOrders([]);
    } catch (e) {
      setOrders([]);
    }
  };

  const extras = ingredients.filter((i) => i.isExtraForPizza);

  return (
    <AppContext.Provider
      value={{
        userSession,
        login,
        logout,
        products,
        ingredients,
        extras,
        tables,
        orders,
        exchangeRates,
        cajaChicaApertura,
        cajaChicaTransactions,
        ultimoCierre,
        createOrder,
        updateOrderStatus,
        cancelOrder,
        editOrder,
        processPayment,
        mergeOrders,
        processMultiplePayments,

        aperturarCajaChica,
        addCajaTransaction,
        realizarCierreCaja,
        obtenerReporteDiario,
        updateExchangeRates,
        queryCajaAI,
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
        isConnected,
        backendUrl,
        updateServerIp,
      }}

    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp debe ser usado dentro de un AppProvider');
  }
  return context;
};
