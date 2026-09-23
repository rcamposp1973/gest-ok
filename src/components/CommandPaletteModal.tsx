import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, BookOpen, Users, FileText, Calculator, Building2, 
  ShieldCheck, Landmark, Sparkles, ArrowRight, X, ArrowDown, ArrowUp
} from 'lucide-react';
import { ChartOfAccount, Auxiliary, Voucher } from '../types';
import { compareAccountCodes, compareRuts } from '../utils/sortingUtils';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToView: (viewKey: string) => void;
  accounts?: ChartOfAccount[];
  auxiliaries?: Auxiliary[];
  vouchers?: Voucher[];
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onNavigateToView,
  accounts = [],
  auxiliaries = [],
  vouchers = []
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Command items definition
  const navigationItems = [
    { type: 'NAV', key: 'PLAN_CUENTAS', title: 'Plan de Cuentas Contable', subtitle: 'Ver, agregar y editar cuentas contables', icon: BookOpen },
    { type: 'NAV', key: 'LIBRO_DIARIO', title: 'Libro Diario (Comprobantes)', subtitle: 'Ingreso e inspección de asientos contables', icon: FileText },
    { type: 'NAV', key: 'LIBRO_MAYOR', title: 'Libro Mayor', subtitle: 'Análisis de movimientos por cuenta contable', icon: BookOpen },
    { type: 'NAV', key: 'BALANCE_8_COLUMNAS', title: 'Balance de 8 Columnas', subtitle: 'Balance Tributario y Financiero de comprobación', icon: Calculator },
    { type: 'NAV', key: 'CONCILIACION_BANCARIA', title: 'Conciliación Bancaria Inteligente', subtitle: 'Cuadratura de cartolas bancarias y motor Junior', icon: Landmark },
    { type: 'NAV', key: 'REMUNERACIONES', title: 'Remuneraciones y LRD', subtitle: 'Liquidaciones de sueldo, Previred y LRD DT', icon: Users },
    { type: 'NAV', key: 'ACTIVO_FIJO', title: 'Activo Fijo y Depreciación Dual', subtitle: 'Cuadro de activo fijo Art. 31 LIR e IFRS', icon: Building2 },
    { type: 'NAV', key: 'DDJJ_SII', title: 'Declaraciones Juradas SII (DDJJ)', subtitle: 'DJ 1887, DJ 1879 y DJ 1847 para Renta', icon: ShieldCheck }
  ];

  const results = useMemo(() => {
    if (!searchTerm.trim()) {
      return navigationItems;
    }
    const q = searchTerm.toLowerCase().trim();

    // 1. Navigation Matches
    const navMatches = navigationItems.filter(
      n => n.title.toLowerCase().includes(q) || n.subtitle.toLowerCase().includes(q)
    );

    // 2. Account Matches (Sorted numerically)
    const accMatches = [...accounts]
      .sort((a, b) => compareAccountCodes(a.code, b.code))
      .filter(a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(a => ({
        type: 'ACCOUNT',
        key: 'PLAN_CUENTAS',
        title: `[${a.code}] ${a.name}`,
        subtitle: `Cuenta Contable (${a.type || 'Imputable'})`,
        icon: BookOpen,
        rawAccount: a
      }));

    // 3. Auxiliary Matches (Sorted numerically by RUT)
    const auxMatches = [...auxiliaries]
      .sort((a, b) => compareRuts(a.rut, b.rut))
      .filter(a => a.rut.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(a => ({
        type: 'AUXILIARY',
        key: 'AUXILIARES',
        title: `${a.rut} - ${a.name}`,
        subtitle: `Auxiliar / Entidad (${a.role || 'General'})`,
        icon: Users,
        rawAuxiliary: a
      }));

    return [...navMatches, ...accMatches, ...auxMatches].slice(0, 12);
  }, [searchTerm, accounts, auxiliaries]);

  // Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        onNavigateToView(results[selectedIndex].key);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-start justify-center pt-20 p-4">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-5 h-5 text-indigo-600 shrink-0 ml-1" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar pantalla, cuenta contable, RUT de auxiliar o comprobante (Cmd+K)..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent border-none text-sm font-bold text-slate-900 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-bold text-slate-500 bg-slate-200 rounded border border-slate-300">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="p-2 max-h-96 overflow-y-auto divide-y divide-slate-100">
          {results.length > 0 ? (
            results.map((item, idx) => {
              const IconComp = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={idx}
                  onClick={() => {
                    onNavigateToView(item.key);
                    onClose();
                  }}
                  className={`p-3 rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'
                    }`}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs truncate font-bold">{item.title}</div>
                      <div className={`text-[11px] truncate ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <ArrowRight className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              No se encontraron resultados para "{searchTerm}".
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
          <span>Usa <kbd className="font-mono bg-slate-200 px-1 rounded">↑</kbd> <kbd className="font-mono bg-slate-200 px-1 rounded">↓</kbd> para navegar y <kbd className="font-mono bg-slate-200 px-1 rounded">Enter</kbd> para ir</span>
          <span className="font-bold text-indigo-600">Gest_OK v3.0 Omnisearch</span>
        </div>
      </div>
    </div>
  );
};
