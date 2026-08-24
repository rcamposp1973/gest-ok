import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear } from '../types';

interface LibroDiarioViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  onEditVoucher?: (voucher: Voucher) => void;
  onViewVoucher?: (voucher: Voucher) => void;
}

export default function LibroDiarioView({
  company,
  vouchers,
  accounts,
  fiscalYears,
  onEditVoucher,
  onViewVoucher
}: LibroDiarioViewProps) {
  const currentYear = new Date().getFullYear();
  const currentMonthStr = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const [periodFilter, setPeriodFilter] = useState<string>('Todos');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('Todos');
  const [statusFilter, setStatusFilter] = useState<'Valido' | 'Todos' | 'Anulado'>('Valido');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('detailed');

  // Build list of unique periods available in vouchers
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      if (v.period) set.add(v.period);
    });
    return Array.from(set).sort().reverse();
  }, [vouchers]);

  // Account map for quick name lookups if line is missing name
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
      map.set(acc.code, acc);
    });
    return map;
  }, [accounts]);

  // Filtered and sorted vouchers
  const filteredVouchers = useMemo(() => {
    return vouchers
      .filter(v => {
        // Status filter
        if (statusFilter === 'Valido' && v.status === 'Anulado') return false;
        if (statusFilter === 'Anulado' && v.status !== 'Anulado') return false;

        // Period filter
        if (periodFilter !== 'Todos' && v.period !== periodFilter) return false;

        // Date range filter
        if (dateFrom && v.date < dateFrom) return false;
        if (dateTo && v.date > dateTo) return false;

        // Type filter
        if (typeFilter !== 'Todos' && v.type !== typeFilter) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchVoucherNum = v.voucherNumber.toString().includes(q);
          const matchGloss = (v.gloss || '').toLowerCase().includes(q);
          const matchDate = (v.date || '').includes(q);
          const matchLines = v.lines?.some(l => 
            (l.accountCode || '').toLowerCase().includes(q) ||
            (l.accountName || '').toLowerCase().includes(q) ||
            (l.auxiliaryRut || '').toLowerCase().includes(q) ||
            (l.auxiliaryName || '').toLowerCase().includes(q) ||
            (l.documentRef || '').toLowerCase().includes(q) ||
            (l.gloss || '').toLowerCase().includes(q)
          );
          if (!matchVoucherNum && !matchGloss && !matchDate && !matchLines) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort chronologically by date and voucher number
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return (a.voucherNumber || 0) - (b.voucherNumber || 0);
      });
  }, [vouchers, periodFilter, dateFrom, dateTo, typeFilter, statusFilter, searchQuery]);

  // Totals calculations
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let validCount = 0;
    let unbalanceCount = 0;

    filteredVouchers.forEach(v => {
      const vDebit = v.totalDebit || v.lines?.reduce((s, l) => s + (Number(l.debit) || 0), 0) || 0;
      const vCredit = v.totalCredit || v.lines?.reduce((s, l) => s + (Number(l.credit) || 0), 0) || 0;
      
      if (v.status !== 'Anulado') {
        totalDebit += vDebit;
        totalCredit += vCredit;
        validCount++;
        if (Math.abs(vDebit - vCredit) > 0.01) {
          unbalanceCount++;
        }
      }
    });

    return {
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
      totalVouchers: filteredVouchers.length,
      validCount,
      unbalanceCount
    };
  }, [filteredVouchers]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredVouchers.length === 0) {
      alert('No hay asientos contables para exportar con los filtros seleccionados.');
      return;
    }

    const headers = [
      'N° Asiento',
      'Fecha',
      'Período',
      'Tipo Comprobante',
      'Glosa Comprobante',
      'Estado',
      'Código Cuenta',
      'Nombre Cuenta',
      'RUT Auxiliar',
      'Nombre Auxiliar',
      'Doc Ref',
      'Glosa Línea',
      'Debe',
      'Haber'
    ];

    const rows: string[][] = [];

    filteredVouchers.forEach(v => {
      if (v.lines && v.lines.length > 0) {
        v.lines.forEach(line => {
          rows.push([
            v.voucherNumber.toString(),
            v.date,
            v.period,
            v.type,
            `"${(v.gloss || '').replace(/"/g, '""')}"`,
            v.status || 'Valido',
            `"${line.accountCode || ''}"`,
            `"${(line.accountName || '').replace(/"/g, '""')}"`,
            `"${line.auxiliaryRut || ''}"`,
            `"${(line.auxiliaryName || '').replace(/"/g, '""')}"`,
            `"${(line.documentRef || '').replace(/"/g, '""')}"`,
            `"${(line.gloss || '').replace(/"/g, '""')}"`,
            (line.debit || 0).toString(),
            (line.credit || 0).toString()
          ]);
        });
      } else {
        rows.push([
          v.voucherNumber.toString(),
          v.date,
          v.period,
          v.type,
          `"${(v.gloss || '').replace(/"/g, '""')}"`,
          v.status || 'Valido',
          '',
          '',
          '',
          '',
          '',
          '',
          (v.totalDebit || 0).toString(),
          (v.totalCredit || 0).toString()
        ]);
      }
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Libro_Diario_${company.rut}_${periodFilter !== 'Todos' ? periodFilter : 'General'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📖</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Libro Diario Contable</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro cronológico a partida doble de todas las transacciones y comprobantes ({company.name} - RUT: {company.rut})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setViewMode(viewMode === 'detailed' ? 'compact' : 'detailed')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors"
          >
            {viewMode === 'detailed' ? '📋 Vista Compacta' : '🔍 Vista Detallada'}
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>📥</span>
            <span>Exportar CSV / Excel</span>
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-lg border border-indigo-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>🖨️</span>
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Período:</label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="Todos">Todos los Períodos</option>
              {availablePeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Desde:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Hasta:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Tipo:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="Todos">Todos los Tipos</option>
              <option value="Ingreso">Ingreso</option>
              <option value="Egreso">Egreso</option>
              <option value="Traspaso">Traspaso</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Estado:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="Valido">Solo Válidos</option>
              <option value="Todos">Todos (Inc. Anulados)</option>
              <option value="Anulado">Solo Anulados</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por glosa, cuenta, RUT, N°..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white border border-slate-300 rounded-md px-3 py-1 text-xs w-64 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          {(periodFilter !== 'Todos' || dateFrom || dateTo || typeFilter !== 'Todos' || statusFilter !== 'Valido' || searchQuery) && (
            <button
              onClick={() => {
                setPeriodFilter('Todos');
                setDateFrom('');
                setDateTo('');
                setTypeFilter('Todos');
                setStatusFilter('Valido');
                setSearchQuery('');
              }}
              className="text-[11px] text-slate-500 hover:text-slate-800 underline"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Asientos Registrados</span>
          <p className="text-lg font-black text-slate-900 mt-0.5">{filteredVouchers.length} <span className="text-xs font-normal text-slate-500 font-sans">comprobantes</span></p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Total Débitos (Debe)</span>
          <p className="text-lg font-black text-indigo-900 mt-0.5">${totals.totalDebit.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Créditos (Haber)</span>
          <p className="text-lg font-black text-emerald-900 mt-0.5">${totals.totalCredit.toLocaleString('es-CL')}</p>
        </div>
        <div className={`p-3 rounded-lg border shadow-2xs ${totals.difference === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider">Cuadratura Período</span>
          <p className="text-lg font-black mt-0.5 flex items-center gap-1.5">
            <span>{totals.difference === 0 ? '✓ Cuadrado' : `⚠️ Descuadre: $${totals.difference.toLocaleString('es-CL')}`}</span>
          </p>
        </div>
      </div>

      {/* Main Journal Table */}
      {filteredVouchers.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200 space-y-3">
          <span className="text-4xl">📖</span>
          <p className="text-slate-600 font-medium">No se encontraron asientos contables en el Libro Diario para los filtros seleccionados.</p>
          <p className="text-xs text-slate-400">Puedes generar comprobantes desde la pestaña Comprobantes Contables o contabilizando documentos del RCV.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVouchers.map((v) => {
            const vDebit = v.totalDebit || v.lines?.reduce((s, l) => s + (Number(l.debit) || 0), 0) || 0;
            const vCredit = v.totalCredit || v.lines?.reduce((s, l) => s + (Number(l.credit) || 0), 0) || 0;
            const isAnulado = v.status === 'Anulado';
            const isBalanced = Math.abs(vDebit - vCredit) < 0.01;

            return (
              <div
                key={v.id}
                className={`bg-white rounded-xl border transition-all shadow-xs overflow-hidden ${
                  isAnulado ? 'border-red-200 bg-red-50/20 opacity-75' : isBalanced ? 'border-slate-200' : 'border-amber-300 ring-1 ring-amber-300'
                }`}
              >
                {/* Voucher Header Banner */}
                <div className={`px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b ${
                  isAnulado ? 'bg-red-100/60 border-red-200' : 'bg-slate-100/90 border-slate-200'
                }`}>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300 text-xs">
                      Asiento N° {v.voucherNumber}
                    </span>
                    <span className="font-mono font-semibold text-slate-700 text-xs">
                      📅 {v.date}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      v.type === 'Ingreso' ? 'bg-emerald-100 text-emerald-800' :
                      v.type === 'Egreso' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {v.type}
                    </span>
                    <span className="text-xs font-mono text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">
                      Período: {v.period}
                    </span>
                    {isAnulado && (
                      <span className="text-[10px] bg-red-600 text-white font-bold px-2 py-0.5 rounded uppercase">
                        ANULADO
                      </span>
                    )}
                    {!isBalanced && !isAnulado && (
                      <span className="text-[10px] bg-amber-500 text-white font-bold px-2 py-0.5 rounded uppercase">
                        DESCUADRADO
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-xs font-mono">
                      <span className="text-slate-500 mr-1">Total:</span>
                      <span className="font-bold text-slate-900">${vDebit.toLocaleString('es-CL')}</span>
                    </div>
                    {onEditVoucher && !isAnulado && (
                      <button
                        onClick={() => onEditVoucher(v)}
                        className="text-[11px] text-indigo-600 hover:text-indigo-900 font-semibold underline"
                      >
                        Editar Comprobante
                      </button>
                    )}
                  </div>
                </div>

                {/* Glosa Principal */}
                {v.gloss && (
                  <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100 text-xs text-slate-700 font-medium flex items-center gap-1.5">
                    <span className="text-slate-400 font-sans">Glosa:</span>
                    <span>{v.gloss}</span>
                  </div>
                )}

                {/* Voucher Lines (Double Entry Table) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 w-28">Código Cuenta</th>
                        <th className="py-2 px-3">Cuenta Contable</th>
                        <th className="py-2 px-3">Auxiliar / RUT</th>
                        <th className="py-2 px-3">Doc Ref</th>
                        <th className="py-2 px-3">Glosa Línea</th>
                        <th className="py-2 px-3 text-right w-28">Debe ($)</th>
                        <th className="py-2 px-3 text-right w-28">Haber ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {v.lines && v.lines.length > 0 ? (
                        v.lines.map((line, idx) => {
                          const acc = accountMap.get(line.accountId) || accountMap.get(line.accountCode);
                          const accName = line.accountName || acc?.name || 'Cuenta Contable';
                          const accCode = line.accountCode || acc?.code || line.accountId;

                          return (
                            <tr key={line.id || idx} className="hover:bg-slate-50/80">
                              <td className="py-2 px-3 font-bold text-slate-800">{accCode}</td>
                              <td className="py-2 px-3 font-sans font-medium text-slate-900">{accName}</td>
                              <td className="py-2 px-3 text-slate-600 font-sans">
                                {line.auxiliaryRut ? (
                                  <div>
                                    <span className="font-mono text-slate-900 font-semibold">{line.auxiliaryRut}</span>
                                    {line.auxiliaryName && <span className="block text-[11px] text-slate-500">{line.auxiliaryName}</span>}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-slate-600 font-sans">{line.documentRef || '-'}</td>
                              <td className="py-2 px-3 text-slate-500 font-sans italic">{line.gloss || '-'}</td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                {line.debit > 0 ? `$${Number(line.debit).toLocaleString('es-CL')}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                {line.credit > 0 ? `$${Number(line.credit).toLocaleString('es-CL')}` : '-'}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-2 px-3 text-center text-slate-400 italic">
                            Sin líneas detalladas
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-slate-100/70 border-t border-slate-200 font-mono font-bold text-xs">
                      <tr>
                        <td colSpan={5} className="py-2 px-3 text-right font-sans uppercase tracking-wider text-slate-600 text-[10px]">
                          Totales Asiento N° {v.voucherNumber}:
                        </td>
                        <td className="py-2 px-3 text-right text-indigo-950">${vDebit.toLocaleString('es-CL')}</td>
                        <td className="py-2 px-3 text-right text-indigo-950">${vCredit.toLocaleString('es-CL')}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Global Bottom Summary */}
      {filteredVouchers.length > 0 && (
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 font-bold">TOTAL LIBRO DIARIO:</span>
            <span>{filteredVouchers.length} asientos</span>
            <span>•</span>
            <span>{totals.validCount} válidos</span>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-400 mr-2">TOTAL DÉBITOS:</span>
              <span className="text-emerald-400 font-bold">${totals.totalDebit.toLocaleString('es-CL')}</span>
            </div>
            <div>
              <span className="text-slate-400 mr-2">TOTAL CRÉDITOS:</span>
              <span className="text-emerald-400 font-bold">${totals.totalCredit.toLocaleString('es-CL')}</span>
            </div>
            <div>
              <span className="text-slate-400 mr-2">DIFERENCIA:</span>
              <span className={`font-bold ${totals.difference === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${totals.difference.toLocaleString('es-CL')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
