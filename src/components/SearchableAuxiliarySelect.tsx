import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Check, User, Building2, Filter } from 'lucide-react';
import { Auxiliary } from '../types';
import { formatRut, cleanRutString } from '../utils/rutMatcher';
import { sortAuxiliariesByRut, filterAuxiliariesForAccount } from '../utils/sortingUtils';

interface SearchableAuxiliarySelectProps {
  auxiliaries: Auxiliary[];
  valueRut: string;
  valueName?: string;
  onSelect: (aux: Auxiliary) => void;
  onManualRutChange?: (rut: string) => void;
  onManualNameChange?: (name: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showManualInputs?: boolean;
  size?: 'sm' | 'md';
  forAccountId?: string;
  forAccountCode?: string;
}

export function SearchableAuxiliarySelect({
  auxiliaries = [],
  valueRut,
  valueName = '',
  onSelect,
  onManualRutChange,
  onManualNameChange,
  placeholder = 'Digitar RUT o Nombre para buscar...',
  required = false,
  disabled = false,
  className = '',
  showManualInputs = true,
  size = 'md',
  forAccountId,
  forAccountCode
}: SearchableAuxiliarySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyAccountAuxiliaries, setShowOnlyAccountAuxiliaries] = useState(true);
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

  // Filter & sort auxiliaries numerically by RUT and by account association
  const { accountSpecificAuxiliaries, sortedAuxiliaries, isFilteredByAccount } = useMemo(() => {
    const { filtered, isFilteredByAccount: isFiltered, allSorted } = filterAuxiliariesForAccount(
      auxiliaries,
      forAccountId,
      forAccountCode
    );
    return {
      accountSpecificAuxiliaries: filtered,
      sortedAuxiliaries: allSorted,
      isFilteredByAccount: isFiltered
    };
  }, [auxiliaries, forAccountId, forAccountCode]);

  const activeAuxList = useMemo(() => {
    if (isFilteredByAccount && showOnlyAccountAuxiliaries) {
      return accountSpecificAuxiliaries;
    }
    return sortedAuxiliaries;
  }, [isFilteredByAccount, showOnlyAccountAuxiliaries, accountSpecificAuxiliaries, sortedAuxiliaries]);

  // Filtered auxiliaries by search term
  const filteredAuxiliaries = useMemo(() => {
    if (!searchTerm.trim()) {
      return activeAuxList.slice(0, 30);
    }
    const term = searchTerm.toLowerCase().trim();
    const cleanSearchRut = term.replace(/[^0-9kK]/g, '');

    return activeAuxList.filter(aux => {
      const nameMatch = (aux.name || '').toLowerCase().includes(term);
      const rutMatch = (aux.rut || '').toLowerCase().includes(term);
      const cleanAuxRut = (aux.rut || '').toLowerCase().replace(/[^0-9kK]/g, '');
      const rutCleanMatch = cleanSearchRut.length >= 2 && cleanAuxRut.includes(cleanSearchRut);
      const roleMatch = (aux.role || '').toLowerCase().includes(term);
      return nameMatch || rutMatch || rutCleanMatch || roleMatch;
    }).slice(0, 40);
  }, [activeAuxList, searchTerm]);

  // Current selected auxiliary object
  const currentAux = useMemo(() => {
    if (!valueRut) return null;
    const cleanCurrent = valueRut.replace(/[^0-9kK]/g, '').toUpperCase();
    return auxiliaries.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanCurrent) || null;
  }, [auxiliaries, valueRut]);

  const handleSelect = (aux: Auxiliary) => {
    onSelect(aux);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onManualRutChange) onManualRutChange('');
    if (onManualNameChange) onManualNameChange('');
    setSearchTerm('');
  };

  const isInvalid = required && !valueRut;

  return (
    <div className={`space-y-1.5 ${className}`} ref={containerRef}>
      {/* Searchable Combobox Header */}
      <div className="relative">
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
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {valueRut ? (
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[11px] shrink-0">
                  {formatRut(valueRut)}
                </span>
                <span className="truncate font-medium text-slate-900">
                  {valueName || currentAux?.name || 'Sin Razón Social'}
                </span>
              </div>
            ) : (
              <span className="text-slate-400 select-none truncate">{placeholder}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {valueRut && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                title="Limpiar selección"
                className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <span className="text-slate-400 text-[10px]">▼</span>
          </div>
        </div>

        {/* Floating Dropdown */}
        {isOpen && !disabled && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-100">
            {/* Search Input inside Dropdown */}
            <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-600 shrink-0 ml-1" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Escribe RUT o Nombre..."
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

            {/* Account Specific Auxiliary Filter Notice */}
            {isFilteredByAccount && (
              <div className="px-2.5 py-1.5 bg-amber-50 border-b border-amber-200/60 flex items-center justify-between text-[11px] text-amber-900 font-medium">
                <div className="flex items-center gap-1.5 truncate mr-1">
                  <Filter className="w-3 h-3 text-amber-700 shrink-0" />
                  <span className="truncate">
                    {showOnlyAccountAuxiliaries
                      ? `Filtrados para esta cuenta (${accountSpecificAuxiliaries.length})`
                      : `Mostrando todos (${sortedAuxiliaries.length})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOnlyAccountAuxiliaries(!showOnlyAccountAuxiliaries)}
                  className="text-indigo-700 hover:text-indigo-900 underline font-bold text-[10px] shrink-0"
                >
                  {showOnlyAccountAuxiliaries ? 'Ver Todos' : 'Filtrar por Cuenta'}
                </button>
              </div>
            )}

            {/* List of matches */}
            <div className="overflow-y-auto flex-1 p-1 divide-y divide-slate-50">
              {filteredAuxiliaries.length > 0 ? (
                filteredAuxiliaries.map(aux => {
                  const isSelected = (aux.rut || '').trim().toUpperCase() === (valueRut || '').trim().toUpperCase();
                  return (
                    <div
                      key={aux.id || aux.rut}
                      onClick={() => handleSelect(aux)}
                      className={`p-2 rounded-lg cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                        <div className="w-7 h-7 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                          {aux.role === 'Deudor' ? (
                            <User className="w-3.5 h-3.5" />
                          ) : (
                            <Building2 className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-indigo-900 bg-indigo-50/80 px-1 rounded">
                              {formatRut(aux.rut)}
                            </span>
                            {aux.role && (
                              <span className="text-[10px] uppercase font-semibold text-slate-500 bg-slate-100 px-1 rounded">
                                {aux.role}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-medium text-slate-800 truncate mt-0.5">
                            {aux.name}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-indigo-600 shrink-0 mr-1" />
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-500 space-y-1">
                  <p>No se encontraron auxiliares para "{searchTerm}".</p>
                  <p className="text-[11px] text-indigo-600 font-medium">
                    Puedes ingresar el RUT y Nombre manualmente en los campos inferiores.
                  </p>
                </div>
              )}
            </div>

            {/* Total Indicator Footer */}
            <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between items-center">
              <span>{auxiliaries.length} auxiliares registrados</span>
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

      {/* Manual RUT & Name Inputs (for free typing, editing or creating new) */}
      {showManualInputs && onManualRutChange && onManualNameChange && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <input
            type="text"
            placeholder="RUT Ej. 76.123.456-7"
            value={valueRut}
            onChange={(e) => onManualRutChange(formatRut(e.target.value))}
            onBlur={(e) => onManualRutChange(formatRut(e.target.value))}
            disabled={disabled}
            className={`p-1.5 border rounded-lg text-xs font-mono uppercase transition-colors ${
              disabled
                ? 'bg-slate-100 text-slate-400 border-slate-200'
                : isInvalid
                ? 'border-rose-400 bg-rose-50/40 text-slate-800'
                : 'border-slate-300 bg-white text-slate-800'
            }`}
          />
          <input
            type="text"
            placeholder="Razón Social / Nombre"
            value={valueName}
            onChange={(e) => onManualNameChange(e.target.value.toUpperCase())}
            disabled={disabled}
            className={`p-1.5 border rounded-lg text-xs uppercase transition-colors ${
              disabled
                ? 'bg-slate-100 text-slate-400 border-slate-200'
                : 'border-slate-300 bg-white text-slate-800'
            }`}
          />
        </div>
      )}
    </div>
  );
}
