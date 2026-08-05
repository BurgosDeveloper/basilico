import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  IoPizza,
  IoPersonOutline,
  IoKeyOutline,
  IoArrowForward,
  IoWarningOutline,
  IoShieldCheckmarkOutline,
} from 'react-icons/io5';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const [username, setUsername] = useState('basilico');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const res = await login(username, password);
    if (!res.success) {
      setErrorMessage(res.error || 'Credenciales inválidas');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#070707] text-white selection:bg-emerald-500 selection:text-black relative overflow-hidden">
      {/* Background Glossy Glow Spheres */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-emerald-900/30 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glassmorphism Card */}
      <div className="relative w-full max-w-md p-8 rounded-3xl bg-gradient-to-br from-[#0B2A1A]/80 via-[#070707]/90 to-[#0B2A1A]/60 border border-emerald-500/30 shadow-2xl shadow-emerald-950/80 backdrop-blur-2xl space-y-8">
        
        {/* Header / Brand */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-[#0B2A1A] to-emerald-800 border border-emerald-400/40 flex items-center justify-center shadow-xl shadow-emerald-900/60 transform hover:scale-105 transition-all">
            <IoPizza className="text-4xl text-emerald-400" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-2">
              <IoShieldCheckmarkOutline />
              <span>SISTEMA DE ACCESO BASILICO</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">BASILICO PIZZERIA</h1>
            <p className="text-xs text-[#D8E6DF]/70 mt-1">Ingresa tus credenciales para acceder al sistema.</p>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-2 animate-shake">
            <IoWarningOutline className="text-lg shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-300 block">Usuario:</label>
            <div className="relative">
              <IoPersonOutline className="absolute left-4 top-3.5 text-emerald-400 text-base" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nombre de usuario"
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-black/80 border border-white/20 text-white placeholder-gray-500 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-bold"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-300 block">Contraseña:</label>
            <div className="relative">
              <IoKeyOutline className="absolute left-4 top-3.5 text-emerald-400 text-base" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-black/80 border border-white/20 text-white placeholder-gray-500 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-bold"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-black font-black text-sm hover:from-emerald-400 hover:to-emerald-300 transition-all shadow-xl shadow-emerald-950/80 flex items-center justify-center gap-2 transform hover:scale-[1.02]"
          >
            <span>INGRESAR AL SISTEMA</span>
            <IoArrowForward className="text-lg" />
          </button>
        </form>

      </div>
    </div>
  );
};
