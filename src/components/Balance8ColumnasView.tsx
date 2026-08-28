import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear } from '../types';

interface Balance8ColumnasViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
}

interface BalanceRow {
  code: string;
  name: string;
  type: string;
  sumDebit: number; // Suma Debe
  sumCredit: number; // Suma Haber
  balDebit: number; // Saldo Deudor
  balCredit: number; // Saldo Acreedor
  invAsset: number; // Inventario Activo
  invLiability: number; // Inventario Pasivo
  resLoss: number; // Resultado Pérdida
  resGain: number; // Resultado Ganancia
}

export default function Balance8ColumnasView({
  company,
  vouchers,
  accounts,
  fiscalYears
}: Balance8ColumnasViewProps) {
  const [periodFilter, setPeriodFilter] = useState<string>('Todos');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [onlyWithMovements, setOnlyWithMovements] = useState<boolean>(true);

  // Handle date changes with cycle validation
  const handleDateFromChange = (date: string) => {
    // Para balances anuales/acumulados, forzar inicio en 01-01
    const [year] = date.split('-');
    setDateFrom(`${year}-01-01`);
  };

  const handleDateToChange = (date: string) => {
    // Validar que la fecha final sea mayor o igual a la de inicio
    if (dateFrom && date < dateFrom) {
        alert("La fecha de término no puede ser anterior a la fecha de inicio.");
        return;
    }
    setDateTo(date);
  };
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Available periods
  const availablePeriods = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach(v => {
      if (v.period) set.add(v.period);
    });
    return Array.from(set).sort().reverse();
  }, [vouchers]);

  // Account map
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
      map.set(acc.code, acc);
    });
    return map;
  }, [accounts]);

  // Calculate 8-Column Balance Matrix
  const { rows, subtotals, result, finalTotals, isFullyBalanced, descuadradosCount } = useMemo(() => {
    const accSums = new Map<string, { sumDebit: number; sumCredit: number; account: ChartOfAccount }>();

    // Initialize with all accounts
    accounts.forEach(acc => {
      accSums.set(acc.id, {
        sumDebit: 0,
        sumCredit: 0,
        account: acc
      });
    });

    // Detect excluded imbalanced/descuadrados vouchers
    const descuadradosVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      if (periodFilter !== 'Todos' && v.period !== periodFilter) return false;
      if (dateFrom && v.date < dateFrom) return false;
      if (dateTo && v.date > dateTo) return false;
      return v.status === 'Descuadrado' || v.isDescuadrado || Math.abs((v.totalDebit || 0) - (v.totalCredit || 0)) > 0.01;
    });

    // Sum movements ONLY from valid, perfectly balanced vouchers (Strict Partida Doble)
    const validVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      if (v.status === 'Descuadrado' || v.isDescuadrado) return false;
      if (Math.abs((v.totalDebit || 0) - (v.totalCredit || 0)) > 0.01) return false;
      if (periodFilter !== 'Todos' && v.period !== periodFilter) return false;
      if (dateFrom && v.date < dateFrom) return false;
      if (dateTo && v.date > dateTo) return false;
      return true;
    });

    validVouchers.forEach(v => {
      if (!v.lines) return;
      v.lines.forEach(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        if (debit === 0 && credit === 0) return;

        let targetAcc = accountMap.get(l.accountId) || accountMap.get(l.accountCode);
        if (!targetAcc) {
          const accCodeStr = l.accountCode || 'S/C';
          const prefix = accCodeStr.trim().charAt(0);
          let inferredType: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' = 'Activo';
          if (prefix === '1') inferredType = 'Activo';
          else if (prefix === '2') {
            inferredType = (accCodeStr.startsWith('23') || accCodeStr.startsWith('2.3') || accCodeStr.startsWith('2-3')) ? 'Patrimonio' : 'Pasivo';
          }
          else if (prefix === '3') inferredType = 'Ingreso';
          else if (prefix === '4' || prefix === '5') inferredType = 'Gasto';

          targetAcc = {
            id: l.accountId || l.accountCode || 'unknown',
            code: accCodeStr,
            name: l.accountName || 'Cuenta Sin Clasificar',
            type: inferredType,
            requiereCentroCosto: false,
            requiereAuxiliarRUT: false,
            requiereConciliacionBancaria: false,
            requiereDocumento: false,
            estado: 'Activo'
          };
        }

        let entry = accSums.get(targetAcc.id);
        if (!entry) {
          entry = { sumDebit: 0, sumCredit: 0, account: targetAcc };
          accSums.set(targetAcc.id, entry);
        }

        entry.sumDebit += debit;
        entry.sumCredit += credit;
      });
    });

    // Build 8 columns for each account
    const calculatedRows: BalanceRow[] = [];

    accSums.forEach(({ sumDebit, sumCredit, account }) => {
      if (onlyWithMovements && sumDebit === 0 && sumCredit === 0) return;

      // 1. Saldos
      let balDebit = 0;
      let balCredit = 0;
      if (sumDebit > sumCredit) {
        balDebit = sumDebit - sumCredit;
      } else if (sumCredit > sumDebit) {
        balCredit = sumCredit - sumDebit;
      }

      // 2. Inventario (Activo / Pasivo) and Resultados (Pérdida / Ganancia)
      let invAsset = 0;
      let invLiability = 0;
      let resLoss = 0;
      let resGain = 0;

      const code = (account.code || '').trim();
      const codePrefix = code.charAt(0);
      const normType = (account.type || 'Activo').toLowerCase();

      // Criterios de Clasificación: 1 = Activos, 2 = Pasivo (salvedad 23 = Patrimonio), 3 = Ingresos, 4 / 5 = Gastos
      const isPatrimonio = 
        code.startsWith('23') || 
        code.startsWith('2.3') || 
        code.startsWith('2-3') || 
        normType.includes('patrimonio') || 
        normType.includes('capital');

      const isActivo = 
        codePrefix === '1' || 
        (!['2', '3', '4', '5'].includes(codePrefix) && normType.includes('activo'));

      const isPasivo = 
        !isPatrimonio && 
        (codePrefix === '2' || (!['1', '3', '4', '5'].includes(codePrefix) && normType.includes('pasivo')));

      const isGasto = 
        codePrefix === '4' || 
        codePrefix === '5' || 
        (!['1', '2', '3'].includes(codePrefix) && (normType.includes('gasto') || normType.includes('costo') || normType.includes('perdida')));

      const isIngreso = 
        codePrefix === '3' || 
        (!['1', '2', '4', '5'].includes(codePrefix) && (normType.includes('ingreso') || normType.includes('ganancia') || normType.includes('venta')));

      if (isActivo) {
        invAsset = balDebit - balCredit;
        if (invAsset < 0) {
          invAsset = 0;
          invLiability = balCredit - balDebit;
        }
      } else if (isPasivo || isPatrimonio) {
        invLiability = balCredit - balDebit;
        if (invLiability < 0) {
          invLiability = 0;
          invAsset = balDebit - balCredit;
        }
      } else if (isGasto) {
        resLoss = balDebit - balCredit;
        if (resLoss < 0) {
          resLoss = 0;
          resGain = balCredit - balDebit;
        }
      } else if (isIngreso) {
        resGain = balCredit - balDebit;
        if (resGain < 0) {
          resGain = 0;
          resLoss = balDebit - balCredit;
        }
      } else {
        // Default fallback to Asset/Liability based on balance
        if (balDebit > balCredit) invAsset = balDebit - balCredit;
        else invLiability = balCredit - balDebit;
      }

      calculatedRows.push({
        code: account.code,
        name: account.name,
        type: account.type,
        sumDebit,
        sumCredit,
        balDebit,
        balCredit,
        invAsset,
        invLiability,
        resLoss,
        resGain
      });
    });

    // Sort rows by account code
    calculatedRows.sort((a, b) => a.code.localeCompare(b.code));

    // Filter by search query if present
    const filteredRows = searchQuery.trim()
      ? calculatedRows.filter(r => 
          r.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.type.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : calculatedRows;

    // Subtotals
    const subtotals = {
      sumDebit: calculatedRows.reduce((s, r) => s + r.sumDebit, 0),
      sumCredit: calculatedRows.reduce((s, r) => s + r.sumCredit, 0),
      balDebit: calculatedRows.reduce((s, r) => s + r.balDebit, 0),
      balCredit: calculatedRows.reduce((s, r) => s + r.balCredit, 0),
      invAsset: calculatedRows.reduce((s, r) => s + r.invAsset, 0),
      invLiability: calculatedRows.reduce((s, r) => s + r.invLiability, 0),
      resLoss: calculatedRows.reduce((s, r) => s + r.resLoss, 0),
      resGain: calculatedRows.reduce((s, r) => s + r.resGain, 0),
    };

    // Results calculation (Utilidad o Pérdida)
    const resultFromGainLoss = subtotals.resGain - subtotals.resLoss;
    const resultFromBalance = subtotals.invAsset - subtotals.invLiability;

    const isUtilidad = resultFromGainLoss >= 0;
    const resultAmount = Math.abs(resultFromGainLoss);

    // Row of result:
    // If Utilidad: placed in resLoss column & invLiability column to balance both blocks
    // If Pérdida: placed in resGain column & invAsset column to balance both blocks
    const resultRow = {
      label: isUtilidad ? 'UTILIDAD DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO',
      isUtilidad,
      amount: resultAmount,
      resLoss: isUtilidad ? resultAmount : 0,
      resGain: isUtilidad ? 0 : resultAmount,
      invAsset: isUtilidad ? 0 : resultAmount,
      invLiability: isUtilidad ? resultAmount : 0,
    };

    // Final Equal Totals
    const finalTotals = {
      sumDebit: subtotals.sumDebit,
      sumCredit: subtotals.sumCredit,
      balDebit: subtotals.balDebit,
      balCredit: subtotals.balCredit,
      invAsset: subtotals.invAsset + resultRow.invAsset,
      invLiability: subtotals.invLiability + resultRow.invLiability,
      resLoss: subtotals.resLoss + resultRow.resLoss,
      resGain: subtotals.resGain + resultRow.resGain,
    };

    const isSumsBalanced = Math.abs(subtotals.sumDebit - subtotals.sumCredit) < 0.01;
    const isSaldosBalanced = Math.abs(subtotals.balDebit - subtotals.balCredit) < 0.01;
    const isFinalBalanceBalanced = Math.abs(finalTotals.invAsset - finalTotals.invLiability) < 0.01;
    const isFinalResultsBalanced = Math.abs(finalTotals.resLoss - finalTotals.resGain) < 0.01;
    const isFullyBalanced = isSumsBalanced && isSaldosBalanced && isFinalBalanceBalanced && isFinalResultsBalanced;

    return {
      rows: filteredRows,
      subtotals,
      result: resultRow,
      finalTotals,
      isFullyBalanced,
      descuadradosCount: descuadradosVouchers.length
    };
  }, [accounts, vouchers, accountMap, periodFilter, dateFrom, dateTo, onlyWithMovements, searchQuery]);

  // Export to CSV
  const handleExportCSV = () => {
    if (rows.length === 0) {
      alert('No hay datos en el balance para exportar.');
      return;
    }

    const headers = [
      'Código Cuenta',
      'Cuenta Contable',
      'Tipo',
      'Sumas - Debe',
      'Sumas - Haber',
      'Saldos - Deudor',
      'Saldos - Acreedor',
      'Inventario - Activo',
      'Inventario - Pasivo',
      'Resultados - Pérdida',
      'Resultados - Ganancia'
    ];

    const csvRows = rows.map(r => [
      `"${r.code}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      r.type,
      r.sumDebit.toString(),
      r.sumCredit.toString(),
      r.balDebit.toString(),
      r.balCredit.toString(),
      r.invAsset.toString(),
      r.invLiability.toString(),
      r.resLoss.toString(),
      r.resGain.toString()
    ]);

    // Subtotal row
    csvRows.push([
      '"SUBTOTALES"',
      '""',
      '""',
      subtotals.sumDebit.toString(),
      subtotals.sumCredit.toString(),
      subtotals.balDebit.toString(),
      subtotals.balCredit.toString(),
      subtotals.invAsset.toString(),
      subtotals.invLiability.toString(),
      subtotals.resLoss.toString(),
      subtotals.resGain.toString()
    ]);

    // Result row
    csvRows.push([
      `"${result.label}"`,
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      result.invAsset.toString(),
      result.invLiability.toString(),
      result.resLoss.toString(),
      result.resGain.toString()
    ]);

    // Final Totals row
    csvRows.push([
      '"TOTALES IGUALES"',
      '""',
      '""',
      finalTotals.sumDebit.toString(),
      finalTotals.sumCredit.toString(),
      finalTotals.balDebit.toString(),
      finalTotals.balCredit.toString(),
      finalTotals.invAsset.toString(),
      finalTotals.invLiability.toString(),
      finalTotals.resLoss.toString(),
      finalTotals.resGain.toString()
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...csvRows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Balance_8_Columnas_${company.rut}_${periodFilter !== 'Todos' ? periodFilter : 'General'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚖️</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Balance Tributario de 8 Columnas</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Matriz estándar de Sumas, Saldos, Inventario y Resultados ({company.name} - RUT: {company.rut})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
            isFullyBalanced 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
              : 'bg-rose-50 text-rose-800 border-rose-300'
          }`}>
            <span>{isFullyBalanced ? '✓ Balance Cuadrado' : '⚠️ Descuadre Detectado'}</span>
          </div>

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

      {/* Alerta de comprobantes excluidos por descuadratura */}
      {descuadradosCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl text-amber-900 text-xs flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <div>
              <span className="font-bold">Partida Doble Estricta:</span> Se han excluido automáticamente <strong>{descuadradosCount}</strong> comprobante(s) que presentaban descuadre o falta de balance (Debe ≠ Haber) para garantizar un Balance Tributario 100% fidedigno y cuadrado.
            </div>
          </div>
        </div>
      )}

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
              <option value="Todos">Todo el Ejercicio</option>
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
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Hasta:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyWithMovements}
              onChange={(e) => setOnlyWithMovements(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="font-medium">Solo cuentas con movimiento</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por código o cuenta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white border border-slate-300 rounded-md px-3 py-1 text-xs w-60 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Total Sumas (Debe/Haber)</span>
          <p className="text-lg font-black text-slate-900 mt-0.5">${subtotals.sumDebit.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Total Saldos (Deudor/Acreedor)</span>
          <p className="text-lg font-black text-slate-900 mt-0.5">${subtotals.balDebit.toLocaleString('es-CL')}</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Total Activos</span>
          <p className="text-lg font-black text-blue-900 mt-0.5">${subtotals.invAsset.toLocaleString('es-CL')}</p>
        </div>
        <div className={`p-3 rounded-lg border shadow-2xs ${result.isUtilidad ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
          <span className="text-[11px] font-bold uppercase tracking-wider">{result.label}</span>
          <p className="text-lg font-black mt-0.5">${result.amount.toLocaleString('es-CL')}</p>
        </div>
      </div>

      {/* 8-Column Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            {/* Super Header */}
            <thead>
              <tr className="bg-slate-900 text-white text-[11px] uppercase tracking-wider text-center font-bold">
                <th colSpan={3} className="py-2.5 px-3 border-r border-slate-700">Identificación de Cuenta</th>
                <th colSpan={2} className="py-2.5 px-3 border-r border-slate-700 bg-indigo-950">1. Sumas</th>
                <th colSpan={2} className="py-2.5 px-3 border-r border-slate-700 bg-slate-950">2. Saldos</th>
                <th colSpan={2} className="py-2.5 px-3 border-r border-slate-700 bg-blue-950">3. Inventario / Balance</th>
                <th colSpan={2} className="py-2.5 px-3 bg-emerald-950">4. Resultados</th>
              </tr>
              <tr className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider border-b-2 border-slate-300">
                <th className="py-2 px-2.5 w-24 border-r border-slate-200">Código</th>
                <th className="py-2 px-3 border-r border-slate-200">Cuenta Contable</th>
                <th className="py-2 px-2 w-20 border-r border-slate-200 text-center">Tipo</th>

                {/* Sumas */}
                <th className="py-2 px-2.5 text-right w-24 bg-indigo-50/70 text-indigo-950 border-r border-slate-200">Debe ($)</th>
                <th className="py-2 px-2.5 text-right w-24 bg-indigo-50/70 text-indigo-950 border-r border-slate-200">Haber ($)</th>

                {/* Saldos */}
                <th className="py-2 px-2.5 text-right w-24 bg-slate-50 text-slate-900 border-r border-slate-200">Deudor ($)</th>
                <th className="py-2 px-2.5 text-right w-24 bg-slate-50 text-slate-900 border-r border-slate-200">Acreedor ($)</th>

                {/* Inventario */}
                <th className="py-2 px-2.5 text-right w-24 bg-blue-50/70 text-blue-950 border-r border-slate-200">Activo ($)</th>
                <th className="py-2 px-2.5 text-right w-24 bg-blue-50/70 text-blue-950 border-r border-slate-200">Pasivo ($)</th>

                {/* Resultados */}
                <th className="py-2 px-2.5 text-right w-24 bg-rose-50/70 text-rose-950 border-r border-slate-200">Pérdida ($)</th>
                <th className="py-2 px-2.5 text-right w-24 bg-emerald-50/70 text-emerald-950">Ganancia ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400 font-sans italic">
                    No hay movimientos registrados para mostrar en el Balance de 8 Columnas.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={r.code || idx} className="hover:bg-slate-50">
                    <td className="py-1.5 px-2.5 font-bold text-slate-800 border-r border-slate-100">{r.code}</td>
                    <td className="py-1.5 px-3 font-sans font-medium text-slate-900 border-r border-slate-100 truncate max-w-xs">{r.name}</td>
                    <td className="py-1.5 px-2 text-center border-r border-slate-100">
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {r.type.substring(0, 4)}
                      </span>
                    </td>

                    {/* Sumas */}
                    <td className="py-1.5 px-2.5 text-right border-r border-slate-100 bg-indigo-50/30">
                      {r.sumDebit > 0 ? r.sumDebit.toLocaleString('es-CL') : '-'}
                    </td>
                    <td className="py-1.5 px-2.5 text-right border-r border-slate-100 bg-indigo-50/30">
                      {r.sumCredit > 0 ? r.sumCredit.toLocaleString('es-CL') : '-'}
                    </td>

                    {/* Saldos */}
                    <td className="py-1.5 px-2.5 text-right border-r border-slate-100 font-semibold text-slate-800">
                      {r.balDebit > 0 ? r.balDebit.toLocaleString('es-CL') : '-'}
                    </td>
                    <td className="py-1.5 px-2.5 text-right border-r border-slate-100 font-semibold text-slate-800">
                      {r.balCredit > 0 ? r.balCredit.toLocaleString('es-CL') : '-'}
                    </td>

                    {/* Inventario */}
                    <td className="py-1.5 px-2.5 text-right border-r border-slate-100 bg-blue-50/30 font-semibold text-blue-900">
                      {r.invAsset > 0 ? r.invAsset.toLocaleString('es-CL') : '-'}
                    </td>
                    <td className="py-1.5 px-2.5 text-right border-r border-slate-100 bg-blue-50/30 font-semibold text-blue-900">
                      {r.invLiability > 0 ? r.invLiability.toLocaleString('es-CL') : '-'}
                    </td>

                    {/* Resultados */}
                    <td className="py-1.5 px-2.5 text-right border-r border-slate-100 bg-rose-50/30 font-semibold text-rose-900">
                      {r.resLoss > 0 ? r.resLoss.toLocaleString('es-CL') : '-'}
                    </td>
                    <td className="py-1.5 px-2.5 text-right bg-emerald-50/30 font-semibold text-emerald-900">
                      {r.resGain > 0 ? r.resGain.toLocaleString('es-CL') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Subtotals Row */}
            <tfoot className="border-t-2 border-slate-400 font-mono font-bold text-[11px]">
              <tr className="bg-slate-200/90 text-slate-900">
                <td colSpan={3} className="py-2 px-3 text-right font-sans uppercase tracking-wider text-slate-800 border-r border-slate-300">
                  Subtotales:
                </td>
                {/* Sumas */}
                <td className="py-2 px-2.5 text-right border-r border-slate-300 text-indigo-950 bg-indigo-100/50">
                  ${subtotals.sumDebit.toLocaleString('es-CL')}
                </td>
                <td className="py-2 px-2.5 text-right border-r border-slate-300 text-indigo-950 bg-indigo-100/50">
                  ${subtotals.sumCredit.toLocaleString('es-CL')}
                </td>

                {/* Saldos */}
                <td className="py-2 px-2.5 text-right border-r border-slate-300 text-slate-900">
                  ${subtotals.balDebit.toLocaleString('es-CL')}
                </td>
                <td className="py-2 px-2.5 text-right border-r border-slate-300 text-slate-900">
                  ${subtotals.balCredit.toLocaleString('es-CL')}
                </td>

                {/* Inventario */}
                <td className="py-2 px-2.5 text-right border-r border-slate-300 text-blue-950 bg-blue-100/50">
                  ${subtotals.invAsset.toLocaleString('es-CL')}
                </td>
                <td className="py-2 px-2.5 text-right border-r border-slate-300 text-blue-950 bg-blue-100/50">
                  ${subtotals.invLiability.toLocaleString('es-CL')}
                </td>

                {/* Resultados */}
                <td className="py-2 px-2.5 text-right border-r border-slate-300 text-rose-950 bg-rose-100/50">
                  ${subtotals.resLoss.toLocaleString('es-CL')}
                </td>
                <td className="py-2 px-2.5 text-right text-emerald-950 bg-emerald-100/50">
                  ${subtotals.resGain.toLocaleString('es-CL')}
                </td>
              </tr>

              {/* Resultado del Ejercicio Row */}
              <tr className={`border-t border-slate-300 font-black ${result.isUtilidad ? 'bg-emerald-50 text-emerald-950' : 'bg-rose-50 text-rose-950'}`}>
                <td colSpan={3} className="py-2 px-3 text-right font-sans uppercase tracking-wider border-r border-slate-300">
                  {result.label}:
                </td>
                <td className="py-2 px-2.5 text-right border-r border-slate-300">-</td>
                <td className="py-2 px-2.5 text-right border-r border-slate-300">-</td>
                <td className="py-2 px-2.5 text-right border-r border-slate-300">-</td>
                <td className="py-2 px-2.5 text-right border-r border-slate-300">-</td>

                {/* Inventario Balance adjustment */}
                <td className="py-2 px-2.5 text-right border-r border-slate-300">
                  {result.invAsset > 0 ? `$${result.invAsset.toLocaleString('es-CL')}` : '-'}
                </td>
                <td className="py-2 px-2.5 text-right border-r border-slate-300">
                  {result.invLiability > 0 ? `$${result.invLiability.toLocaleString('es-CL')}` : '-'}
                </td>

                {/* Resultados adjustment */}
                <td className="py-2 px-2.5 text-right border-r border-slate-300">
                  {result.resLoss > 0 ? `$${result.resLoss.toLocaleString('es-CL')}` : '-'}
                </td>
                <td className="py-2 px-2.5 text-right">
                  {result.resGain > 0 ? `$${result.resGain.toLocaleString('es-CL')}` : '-'}
                </td>
              </tr>

              {/* Totales Iguales Row */}
              <tr className="bg-slate-900 text-white text-xs font-black border-t-2 border-slate-900">
                <td colSpan={3} className="py-2.5 px-3 text-right font-sans uppercase tracking-wider text-emerald-400 border-r border-slate-700">
                  TOTALES IGUALES:
                </td>
                {/* Sumas */}
                <td className="py-2.5 px-2.5 text-right border-r border-slate-700 text-amber-300">
                  ${finalTotals.sumDebit.toLocaleString('es-CL')}
                </td>
                <td className="py-2.5 px-2.5 text-right border-r border-slate-700 text-amber-300">
                  ${finalTotals.sumCredit.toLocaleString('es-CL')}
                </td>

                {/* Saldos */}
                <td className="py-2.5 px-2.5 text-right border-r border-slate-700 text-emerald-300">
                  ${finalTotals.balDebit.toLocaleString('es-CL')}
                </td>
                <td className="py-2.5 px-2.5 text-right border-r border-slate-700 text-emerald-300">
                  ${finalTotals.balCredit.toLocaleString('es-CL')}
                </td>

                {/* Inventario */}
                <td className="py-2.5 px-2.5 text-right border-r border-slate-700 text-blue-300">
                  ${finalTotals.invAsset.toLocaleString('es-CL')}
                </td>
                <td className="py-2.5 px-2.5 text-right border-r border-slate-700 text-blue-300">
                  ${finalTotals.invLiability.toLocaleString('es-CL')}
                </td>

                {/* Resultados */}
                <td className="py-2.5 px-2.5 text-right border-r border-slate-700 text-rose-300">
                  ${finalTotals.resLoss.toLocaleString('es-CL')}
                </td>
                <td className="py-2.5 px-2.5 text-right text-emerald-300">
                  ${finalTotals.resGain.toLocaleString('es-CL')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
