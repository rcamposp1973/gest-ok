import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear } from '../types';
import { generateSIIReportPDF } from '../utils/pdfGenerator';

interface LibroMayorViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  onViewVoucher?: (voucher: Voucher) => void;
}

interface AccountMovement {
  voucherId: string;
  voucherNumber: number;
  voucherType: string;
  voucherStatus?: string;
  date: string;
  period: string;
  gloss: string;
  lineGloss?: string;
  auxiliaryRut?: string;
  auxiliaryName?: string;
  documentRef?: string;
  debit: number;
  credit: number;
}

interface AccountLedger {
  account: ChartOfAccount;
  initialBalance: number;
  movements: AccountMovement[];
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  balanceType: 'Deudor' | 'Acreedor' | 'Cero';
}

export default function LibroMayorView({
  company,
  vouchers,
  accounts,
  fiscalYears,
  onViewVoucher
}: LibroMayorViewProps) {
  const [periodFilter, setPeriodFilter] = useState<string>('Todos');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [searchAccountQuery, setSearchAccountQuery] = useState<string>('');
  const [hideZeroBalance, setHideZeroBalance] = useState<boolean>(true);

  // Available periods
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      if (v.period) set.add(v.period);
    });
    return Array.from(set).sort().reverse();
  }, [vouchers]);

  // Account map for fast lookup
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
      map.set(acc.code, acc);
    });
    return map;
  }, [accounts]);

  // Compute movements grouped by account
  const ledgerMap = useMemo(() => {
    const map = new Map<string, AccountLedger>();

    // Initialize map with all active chart of accounts
    accounts.forEach(acc => {
      map.set(acc.id, {
        account: acc,
        initialBalance: 0,
        movements: [],
        totalDebit: 0,
        totalCredit: 0,
        finalBalance: 0,
        balanceType: 'Cero'
      });
    });

    // Process valid vouchers
    const sortedVouchers = [...vouchers]
      .filter(v => v.status !== 'Anulado')
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.voucherNumber || 0) - (b.voucherNumber || 0);
      });

    sortedVouchers.forEach(v => {
      // Period / date filter
      if (periodFilter !== 'Todos' && v.period !== periodFilter) return;
      if (dateFrom && v.date < dateFrom) return;
      if (dateTo && v.date > dateTo) return;

      if (!v.lines) return;

      v.lines.forEach(line => {
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (debit === 0 && credit === 0) return;

        // Find or fallback account
        let targetAcc = accountMap.get(line.accountId) || accountMap.get(line.accountCode);
        if (!targetAcc) {
          const accCodeStr = line.accountCode || 'S/C';
          const prefix = accCodeStr.trim().charAt(0);
          let inferredType: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' = 'Activo';
          if (prefix === '1') inferredType = 'Activo';
          else if (prefix === '2') {
            inferredType = (accCodeStr.startsWith('23') || accCodeStr.startsWith('2.3') || accCodeStr.startsWith('2-3')) ? 'Patrimonio' : 'Pasivo';
          }
          else if (prefix === '3') inferredType = 'Ingreso';
          else if (prefix === '4' || prefix === '5') inferredType = 'Gasto';

          targetAcc = {
            id: line.accountId || line.accountCode || 'unknown',
            code: accCodeStr,
            name: line.accountName || 'Cuenta Sin Clasificar',
            type: inferredType,
            requiereCentroCosto: false,
            requiereAuxiliarRUT: false,
            requiereConciliacionBancaria: false,
            requiereDocumento: false,
            estado: 'Activo'
          };
        }

        let ledgerEntry = map.get(targetAcc.id);
        if (!ledgerEntry) {
          ledgerEntry = {
            account: targetAcc,
            initialBalance: 0,
            movements: [],
            totalDebit: 0,
            totalCredit: 0,
            finalBalance: 0,
            balanceType: 'Cero'
          };
          map.set(targetAcc.id, ledgerEntry);
        }

        ledgerEntry.movements.push({
          voucherId: v.id,
          voucherNumber: v.voucherNumber,
          voucherType: v.type,
          voucherStatus: v.status,
          date: v.date,
          period: v.period,
          gloss: v.gloss,
          lineGloss: line.gloss,
          auxiliaryRut: line.auxiliaryRut,
          auxiliaryName: line.auxiliaryName,
          documentRef: line.documentRef,
          debit,
          credit
        });

        ledgerEntry.totalDebit += debit;
        ledgerEntry.totalCredit += credit;
      });
    });

    // Compute final balances for each account ledger
    map.forEach(ledger => {
      const diff = ledger.totalDebit - ledger.totalCredit;
      if (diff > 0) {
        ledger.finalBalance = diff;
        ledger.balanceType = 'Deudor';
      } else if (diff < 0) {
        ledger.finalBalance = Math.abs(diff);
        ledger.balanceType = 'Acreedor';
      } else {
        ledger.finalBalance = 0;
        ledger.balanceType = 'Cero';
      }
    });

    return map;
  }, [vouchers, accounts, accountMap, periodFilter, dateFrom, dateTo]);

  // Accounts with movements list sorted by code
  const accountsWithMovements = useMemo(() => {
    const list: AccountLedger[] = [];
    ledgerMap.forEach(ledger => {
      if (ledger.movements.length > 0) {
        list.push(ledger);
      }
    });
    return list.sort((a, b) => a.account.code.localeCompare(b.account.code));
  }, [ledgerMap]);

  // Filtered accounts to display
  const displayedLedgers = useMemo(() => {
    let list: AccountLedger[] = [];

    if (selectedAccountId === 'ALL') {
      if (hideZeroBalance) {
        list = accountsWithMovements;
      } else {
        list = Array.from(ledgerMap.values()).sort((a, b) => a.account.code.localeCompare(b.account.code));
      }
    } else {
      const selected = ledgerMap.get(selectedAccountId);
      if (selected) list = [selected];
    }

    if (searchAccountQuery.trim()) {
      const q = searchAccountQuery.toLowerCase().trim();
      list = list.filter(l => 
        l.account.code.toLowerCase().includes(q) ||
        l.account.name.toLowerCase().includes(q) ||
        l.account.type.toLowerCase().includes(q)
      );
    }

    return list;
  }, [ledgerMap, selectedAccountId, hideZeroBalance, accountsWithMovements, searchAccountQuery]);

  // Overall statistics
  const globalSummary = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let accountsWithMovCount = 0;

    accountsWithMovements.forEach(l => {
      totalDebit += l.totalDebit;
      totalCredit += l.totalCredit;
      accountsWithMovCount++;
    });

    return {
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
      accountsCount: accountsWithMovCount
    };
  }, [accountsWithMovements]);

  // Export to CSV
  const handleExportCSV = () => {
    if (displayedLedgers.length === 0) {
      alert('No hay movimientos en el Libro Mayor para exportar.');
      return;
    }

    const headers = [
      'Código Cuenta',
      'Nombre Cuenta',
      'Tipo Cuenta',
      'Fecha',
      'N° Asiento',
      'Tipo Comprobante',
      'Glosa / Detalle',
      'Auxiliar RUT',
      'Auxiliar Nombre',
      'Doc Ref',
      'Debe ($)',
      'Haber ($)',
      'Saldo Progresivo ($)',
      'Naturaleza Saldo'
    ];

    const rows: string[][] = [];

    displayedLedgers.forEach(ledger => {
      let progressiveBalance = 0;
      ledger.movements.forEach(mov => {
        progressiveBalance += (mov.debit - mov.credit);
        const nature = progressiveBalance >= 0 ? 'Deudor' : 'Acreedor';
        rows.push([
          `"${ledger.account.code}"`,
          `"${ledger.account.name.replace(/"/g, '""')}"`,
          ledger.account.type,
          mov.date,
          mov.voucherNumber.toString(),
          mov.voucherType,
          `"${(mov.lineGloss || mov.gloss || '').replace(/"/g, '""')}"`,
          `"${mov.auxiliaryRut || ''}"`,
          `"${(mov.auxiliaryName || '').replace(/"/g, '""')}"`,
          `"${(mov.documentRef || '').replace(/"/g, '""')}"`,
          mov.debit.toString(),
          mov.credit.toString(),
          Math.abs(progressiveBalance).toString(),
          nature
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Libro_Mayor_${company.rut}_${periodFilter !== 'Todos' ? periodFilter : 'General'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSIIReport = () => {
    if (displayedLedgers.length === 0) {
      alert('No hay movimientos en el Libro Mayor para generar el informe.');
      return;
    }
    
    const title = `Libro_Mayor_${company.name}_${periodFilter}`;
    const columns = ['Código', 'Cuenta', 'Fecha', 'N° Asiento', 'Glosa', 'Debe', 'Haber'];
    const data: any[][] = [];
    
    displayedLedgers.forEach(ledger => {
      ledger.movements.forEach(mov => {
        data.push([
          ledger.account.code,
          ledger.account.name,
          mov.date,
          mov.voucherNumber.toString(),
          mov.lineGloss || mov.gloss || '',
          mov.debit > 0 ? mov.debit.toLocaleString('es-CL') : '0',
          mov.credit > 0 ? mov.credit.toLocaleString('es-CL') : '0'
        ]);
      });
    });
    
    generateSIIReportPDF(title, columns, data);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Libro Mayor Contable</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Centralización y saldos por cuenta contable con detalle de movimientos ({company.name} - RUT: {company.rut})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadSIIReport}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>📄</span>
            <span>Informe SII (PDF)</span>
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

      {/* Filter and Account Selector Bar */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap gap-3 items-center justify-between">
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

            <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideZeroBalance}
                onChange={(e) => setHideZeroBalance(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium">Ocultar cuentas sin movimientos</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Buscar cuenta por código o nombre..."
              value={searchAccountQuery}
              onChange={(e) => setSearchAccountQuery(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-3 py-1 text-xs w-60 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Account Quick Selector Dropdown */}
        <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-700">Seleccionar Cuenta:</span>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-white border border-slate-300 rounded-md px-3 py-1.5 text-xs font-medium text-slate-800 max-w-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="ALL">🌟 Ver Todas las Cuentas con Movimiento ({accountsWithMovements.length})</option>
            {accountsWithMovements.map(l => (
              <option key={l.account.id} value={l.account.id}>
                {l.account.code} - {l.account.name} ({l.movements.length} movs | Saldo: ${l.finalBalance.toLocaleString('es-CL')} {l.balanceType})
              </option>
            ))}
          </select>

          {selectedAccountId !== 'ALL' && (
            <button
              onClick={() => setSelectedAccountId('ALL')}
              className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-semibold rounded text-[11px] hover:bg-indigo-100 transition-colors"
            >
              ← Ver Todas
            </button>
          )}
        </div>
      </div>

      {/* KPI Global Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cuentas Activas con Movimiento</span>
          <p className="text-lg font-black text-slate-900 mt-0.5">{globalSummary.accountsCount} <span className="text-xs font-normal text-slate-500 font-sans">cuentas</span></p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Suma Total Débitos (Debe)</span>
          <p className="text-lg font-black text-indigo-900 mt-0.5">${globalSummary.totalDebit.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Suma Total Créditos (Haber)</span>
          <p className="text-lg font-black text-emerald-900 mt-0.5">${globalSummary.totalCredit.toLocaleString('es-CL')}</p>
        </div>
        <div className={`p-3 rounded-lg border shadow-2xs ${globalSummary.difference === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider">Cuadratura General Mayor</span>
          <p className="text-lg font-black mt-0.5">
            {globalSummary.difference === 0 ? '✓ Cuadrado ($0)' : `⚠️ Descuadre: $${globalSummary.difference.toLocaleString('es-CL')}`}
          </p>
        </div>
      </div>

      {/* Account Ledgers View */}
      {displayedLedgers.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200 space-y-3">
          <span className="text-4xl">📚</span>
          <p className="text-slate-600 font-medium">No se encontraron cuentas o movimientos para los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {displayedLedgers.map((ledger) => {
            let runningBalance = ledger.initialBalance || 0;

            return (
              <div
                key={ledger.account.id}
                className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"
              >
                {/* Account Card Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-black text-amber-400 text-sm bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
                      {ledger.account.code}
                    </span>
                    <h4 className="text-base font-bold text-white tracking-tight">
                      {ledger.account.name}
                    </h4>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-700/80 text-slate-300 border border-slate-600">
                      {ledger.account.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">SALDO FINAL:</span>
                      <span className={`font-black text-sm ${
                        ledger.balanceType === 'Deudor' ? 'text-emerald-400' :
                        ledger.balanceType === 'Acreedor' ? 'text-indigo-400' : 'text-slate-400'
                      }`}>
                        ${ledger.finalBalance.toLocaleString('es-CL')} ({ledger.balanceType})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Movements Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-24">Fecha</th>
                        <th className="py-2.5 px-3 w-24">Asiento N°</th>
                        <th className="py-2.5 px-3 w-20">Tipo</th>
                        <th className="py-2.5 px-3">Glosa / Detalle</th>
                        <th className="py-2.5 px-3">Auxiliar / RUT</th>
                        <th className="py-2.5 px-3">Doc Ref</th>
                        <th className="py-2.5 px-3 text-right w-28">Debe ($)</th>
                        <th className="py-2.5 px-3 text-right w-28">Haber ($)</th>
                        <th className="py-2.5 px-3 text-right w-32">Saldo Acumulado ($)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {/* Initial Balance Row */}
                      {ledger.initialBalance !== 0 && (
                        <tr className="bg-slate-50/60 font-semibold italic text-slate-600">
                          <td className="py-2 px-3">-</td>
                          <td className="py-2 px-3">-</td>
                          <td className="py-2 px-3">Apertura</td>
                          <td colSpan={3} className="py-2 px-3 font-sans">Saldo Inicial / Arrastrado</td>
                          <td className="py-2 px-3 text-right">-</td>
                          <td className="py-2 px-3 text-right">-</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">${ledger.initialBalance.toLocaleString('es-CL')}</td>
                        </tr>
                      )}

                      {ledger.movements.length > 0 ? (
                        ledger.movements.map((mov, mIdx) => {
                          runningBalance += (mov.debit - mov.credit);
                          const isDeudor = runningBalance >= 0;
                          const formattedBalance = Math.abs(runningBalance).toLocaleString('es-CL');

                          return (
                            <tr key={`${mov.voucherId}-${mIdx}`} className="hover:bg-slate-50/80">
                              <td className="py-2 px-3 text-slate-700">{mov.date}</td>
                              <td className="py-2 px-3 font-bold text-indigo-700">#{mov.voucherNumber}</td>
                              <td className="py-2 px-3">
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  mov.voucherType === 'Ingreso' ? 'bg-emerald-100 text-emerald-800' :
                                  mov.voucherType === 'Egreso' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {mov.voucherType}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-sans text-slate-800">
                                {mov.lineGloss || mov.gloss || '-'}
                              </td>
                              <td className="py-2 px-3 font-sans text-slate-600">
                                {mov.auxiliaryRut ? (
                                  <div>
                                    <span className="font-mono font-semibold text-slate-900">{mov.auxiliaryRut}</span>
                                    {mov.auxiliaryName && <span className="block text-[10px] text-slate-500">{mov.auxiliaryName}</span>}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-sans text-slate-600">{mov.documentRef || '-'}</td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                {mov.debit > 0 ? `$${mov.debit.toLocaleString('es-CL')}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                {mov.credit > 0 ? `$${mov.credit.toLocaleString('es-CL')}` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-black">
                                <span className={isDeudor ? 'text-emerald-700' : 'text-indigo-700'}>
                                  ${formattedBalance}
                                </span>
                                <span className="text-[10px] text-slate-400 font-sans ml-1">
                                  {isDeudor ? 'D' : 'A'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={9} className="py-4 px-3 text-center text-slate-400 italic">
                            Sin movimientos en el período seleccionado
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-slate-100/90 border-t-2 border-slate-300 font-mono font-bold text-xs">
                      <tr>
                        <td colSpan={6} className="py-2.5 px-3 text-right font-sans uppercase tracking-wider text-slate-700">
                          Sumas y Saldo Final ({ledger.account.name}):
                        </td>
                        <td className="py-2.5 px-3 text-right text-indigo-950">${ledger.totalDebit.toLocaleString('es-CL')}</td>
                        <td className="py-2.5 px-3 text-right text-indigo-950">${ledger.totalCredit.toLocaleString('es-CL')}</td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900 bg-amber-50">
                          ${ledger.finalBalance.toLocaleString('es-CL')} <span className="text-[10px] text-slate-600 font-sans">{ledger.balanceType}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
