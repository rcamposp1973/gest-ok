import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Check, BookOpen } from 'lucide-react';
import { ChartOfAccount } from '../types';
import { sortAccountsNumerically } from '../utils/sortingUtils';

export type Account = ChartOfAccount;

interface SearchableAccountSelectProps {
  accounts: ChartOfAccount[];
  valueAccountId: string;
  onSelectAccount: (account: ChartOfAccount) => void;
  onClear?: () => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  filterImputableOnly?: boolean;
}

export function SearchableAccountSelect({
  accounts = [],
  valueAccountId,
  onSelectAccount,
  onClear,
  placeholder = '-- Seleccionar Cuenta Contable --',
  required = false,
  disabled = false,
  className = '',
  size = 'md',
  filterImputableOnly = false
}: SearchableAccountSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const baseAccounts = useMemo(() => {
    let list = accounts;
    if (filterImputableOnly) {
      list = accounts.filter(a => (a as any).imputable !== false && (a as any).isGrouping !== true);
    }
    return sortAccountsNumerically(list);
  }, [accounts, filterImputableOnly]);

  const filteredAccounts = useMemo(() => {
    if (!searchTerm.trim()) {
      return baseAccounts.slice(0, 35);
    }
    const term = searchTerm.toLowerCase().trim();
    return baseAccounts.filter(acc => {
      const codeMatch = (acc.code || '').toLowerCase().includes(term);
      const nameMatch = (acc.name || '').toLowerCase().includes(term);
      return codeMatch || nameMatch;
    }).slice(0, 50);
  }, [baseAccounts, searchTerm]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === valueAccountId || a.code === valueAccountId) || null;
  }, [accounts, valueAccountId]);

  const handleSelect = (acc: Account) => {
    onSelectAccount(acc);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClear) onClear();
    setSearchTerm('');
  };

  const isInvalid = required && !valueAccountId;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`flex items-center justify-between border rounded-lg transition-all cursor-pointer ${
          size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs'
        } ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isInvalid
            ? 'border-rose-400 bg-rose-50/40 text-slate-800 focus-within:ring-2 focus-within:ring-rose-500'
            : 'border-slate-300 bg-white hover:border-indigo-400 text-slate-800 focus-within:ring-2 focus-within:ring-indigo-500'
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-1">
          <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {selectedAccount ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                {selectedAccount.code}
              </span>
              <span className="truncate font-medium text-slate-900">
                {selectedAccount.name}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 select-none truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedAccount && !disabled && onClear && (
            <button
              type="button"
              onClick={handleClear}
              title="Limpiar cuenta"
              className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-slate-400 text-[10px]">▼</span>
        </div>
      </div>

      {/* Dropdown menu */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-600 shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Escribe código o nombre de cuenta..."
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 p-1 divide-y divide-slate-50">
            {filteredAccounts.length > 0 ? (
              filteredAccounts.map(acc => {
                const isSelected = selectedAccount?.id === acc.id;
                return (
                  <div
                    key={acc.id}
                    onClick={() => handleSelect(acc)}
                    className={`p-2 rounded-lg cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                      <span className="font-mono font-bold text-xs text-indigo-900 bg-indigo-50/80 px-1.5 py-0.5 rounded shrink-0">
                        {acc.code}
                      </span>
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {acc.name}
                      </span>
                      {acc.requiereAuxiliarRUT && (
                        <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded font-semibold shrink-0">
                          Exige RUT
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-indigo-600 shrink-0 mr-1" />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-500">
                No se encontraron cuentas para "{searchTerm}".
              </div>
            )}
          </div>

          <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between items-center">
            <span>{baseAccounts.length} cuentas disponibles</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-indigo-600 hover:text-indigo-800 font-bold"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
