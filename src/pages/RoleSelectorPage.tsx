import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  IoPizza,
  IoArrowForward,
  IoRestaurant,
  IoFlame,
  IoCard,
  IoWifi,
} from 'react-icons/io5';

export const RoleSelectorPage: React.FC = () => {
  const navigate = useNavigate();
  const { orders, isConnected } = useApp();

  const pendingKdsCount = orders.filter((o) => o.status === 'en_preparacion').length;
  const unpaidCount = orders.filter((o) => o.paymentStatus === 'no_pagado').length;

  const roleCards = [
    {
      path: '/mesonero',
      title: 'Módulo Mesero',
      badgeTitle: 'Toma de Comandas',
      subtitle: 'Tarjetas táctiles de Mesas, Delivery y PickUp. Menú modal intuitivo de pizzas, bebidas y postres.',
      icon: <IoRestaurant className="text-4xl text-emerald-700" />,
      highlights: [
        'Selección directa de Mesa, Delivery o PickUp',
        'Modal de menú interactivo por categorías',
        'Sincronización WebSocket en tiempo real',
      ],
    },
    {
      path: '/caja',
      title: 'Módulo Caja POS',
      badgeTitle: 'Facturación & Cobro',
      subtitle: 'Comandas con estados duales (Cocina y Cobro), botón de entregado, Caja Chica contable y Asistente IA de Texto.',
      icon: <IoCard className="text-4xl text-emerald-700" />,
      badgeCount: unpaidCount,
      highlights: [
        'Cobro multimoneda: Efectivo USD USD, COP, Bs, Binance',
        'Apertura y flujo contable de Caja Chica',
        'Asistente de consulta rápida por texto',
      ],
    },
    {
      path: '/cocina',
      title: 'Módulo Cocina KDS',
      badgeTitle: 'Kitchen Display',
      subtitle: 'Monitor visual de comandas sin cortes de texto, temporizador en tiempo real y confirmación sonora síncrona.',
      icon: <IoFlame className="text-4xl text-amber-600" />,
      badgeCount: pendingKdsCount,
      highlights: [
        'Alertas de sonido por nuevas comandas',
        'Detallado completo con observaciones sin cortes',
        'Notificación instantánea a Mesero y Caja al estar lista',
      ],
    },
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-50 text-slate-900">
      {/* Title & Connection Status */}
      <div className="text-center max-w-2xl mb-10 space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-emerald-200 text-emerald-700 text-xs font-black uppercase tracking-widest shadow-lg">
          <IoPizza className="text-lg" />
          <span>BASILICO REALTIME SYSTEM</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900">
          Selecciona tu Módulo
        </h1>

        <p className="text-sm text-slate-700/70">
          Sistema 100% en tiempo real para Mesero, Caja POS y Cocina KDS en red local LAN.
        </p>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600">
          <IoWifi className={isConnected ? 'text-emerald-700 animate-pulse' : 'text-amber-600'} />
          <span>{isConnected ? 'Servidor WebSocket Activo (LAN)' : 'Esperando Servidor Backend...'}</span>
        </div>
      </div>

      {/* Role Cards Grid (Claymorphism & Glassmorphism) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
        {roleCards.map((card) => (
          <div
            key={card.path}
            onClick={() => navigate(card.path)}
            className="group relative flex flex-col justify-between p-6 rounded-3xl bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-emerald-200 hover:border-emerald-300/70 shadow-2xl hover:shadow-emerald-950/60 transition-all duration-300 transform hover:-translate-y-1.5 cursor-pointer backdrop-blur-xl"
          >
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="w-14 h-14 rounded-2xl bg-white border border-emerald-200 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                  {card.icon}
                </div>
                {card.badgeCount !== undefined && card.badgeCount > 0 && (
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-black shadow-lg animate-bounce">
                    {card.badgeCount} ACTIVAS
                  </span>
                )}
              </div>

              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                {card.badgeTitle}
              </span>

              <h2 className="text-2xl font-black text-slate-900 mt-2 group-hover:text-emerald-800 transition-colors">
                {card.title}
              </h2>

              <p className="text-xs text-slate-700/70 mt-2 leading-relaxed">
                {card.subtitle}
              </p>

              {/* Highlights */}
              <ul className="mt-4 space-y-2 border-t border-slate-200 pt-4">
                {card.highlights.map((h, i) => (
                  <li key={i} className="text-[11px] text-slate-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Footer */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between font-bold text-xs text-emerald-700 group-hover:text-emerald-800">
              <span>INGRESAR AL MÓDULO</span>
              <IoArrowForward className="text-base group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
