import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Product, ExtraIngredient } from '../data/mockData';
import { IoClose, IoAdd, IoRemove, IoCheckmark } from 'react-icons/io5';

interface ProductModifierModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (item: {
    productId: string;
    productName: string;
    price: number;
    quantity: number;
    modifiers: string[];
    notes: string;
  }) => void;
}

export const ProductModifierModal: React.FC<ProductModifierModalProps> = ({
  product,
  onClose,
  onConfirm,
}) => {
  const { extras } = useApp();
  const sortedExtras = useMemo(() => [...extras].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })), [extras]);
  const [quantity, setQuantity] = useState<number>(1);
  const [selectedModifiers, setSelectedModifiers] = useState<ExtraIngredient[]>([]);

  const toggleModifier = (mod: ExtraIngredient) => {
    if (selectedModifiers.some((m) => m.id === mod.id)) {
      setSelectedModifiers(selectedModifiers.filter((m) => m.id !== mod.id));
    } else {
      setSelectedModifiers([...selectedModifiers, mod]);
    }
  };

  const extraPrice = selectedModifiers.reduce((sum, m) => sum + m.priceUSD, 0);
  const unitPrice = product.price + extraPrice;
  const totalPrice = unitPrice * quantity;

  const handleConfirm = () => {
    onConfirm({
      productId: product.id,
      productName: product.name,
      price: unitPrice,
      quantity,
      modifiers: selectedModifiers.map((m) => m.name),
      notes: '',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-50/80 backdrop-blur-md animate-in fade-in">
      <div className="glass-panel rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-[#D8E6DF]/30 flex flex-col max-h-[90vh]">
        <div className="relative h-48 w-full">
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070707] via-slate-50 to-transparent flex items-end p-5">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 leading-tight">{product.name}</h2>
              <p className="text-xs text-slate-700/80 line-clamp-1">{product.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl bg-slate-50/80 text-slate-900 hover:bg-slate-50 transition-colors border border-[#D8E6DF]/20"
          >
            <IoClose className="text-lg" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-slate-900">
          <div className="flex items-center justify-between bg-white/80 p-3.5 rounded-2xl border border-[#D8E6DF]/20">
            <span className="font-extrabold text-xs tracking-wider text-slate-700">CANTIDAD:</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-9 h-9 rounded-xl bg-slate-50 border border-[#D8E6DF]/30 flex items-center justify-center text-slate-900"
              >
                <IoRemove className="text-sm" />
              </button>
              <span className="font-black text-lg w-6 text-center text-slate-700">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-9 h-9 rounded-xl bg-slate-50 border border-[#D8E6DF]/30 flex items-center justify-center text-slate-900"
              >
                <IoAdd className="text-sm" />
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-700/60 mb-2">
              INGREDIENTES ADICIONALES
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sortedExtras.map((mod) => {
                const isSelected = selectedModifiers.some((m) => m.id === mod.id);
                return (
                  <button
                    key={mod.id}
                    onClick={() => toggleModifier(mod)}
                    className={`flex items-center justify-between p-3 rounded-2xl border text-xs font-bold text-left transition-all ${
                      isSelected
                        ? 'bg-[#10b981]/20 border-[#10b981] text-slate-700'
                        : 'bg-white/40 border-[#D8E6DF]/15 text-slate-700/70 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${isSelected ? 'bg-[#10b981] border-[#10b981] text-[#070707]' : 'border-[#D8E6DF]/30'}`}>
                        {isSelected && <IoCheckmark className="text-[10px] font-extrabold" />}
                      </div>
                      <span>{mod.name}</span>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-semibold">
                      +${mod.priceUSD.toFixed(2)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-[#D8E6DF]/20 flex items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-slate-700/60 font-bold block">SUBTOTAL:</span>
            <span className="text-xl font-black text-slate-700">
              ${totalPrice.toFixed(2)} USD
            </span>
          </div>
          <button
            onClick={handleConfirm}
            className="clay-btn px-6 py-3 rounded-2xl text-xs font-black"
          >
            Agregar a Comanda
          </button>
        </div>
      </div>
    </div>
  );
};
