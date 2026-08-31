import React, { useState, useEffect } from 'react';
import {
  VoucherLine,
  ChartOfAccount,
  CostCenterMaster,
  ExpenseItemMaster,
  NonSiiDocTypeMaster,
  ProjectMaster,
  ProductMaster,
  CustomAnalysisTableItem
} from '../types';
import { validateVoucherLine } from '../utils/voucherValidation';

interface VoucherLineDistributionModalProps {
  isOpen: boolean;
  sourceLine: VoucherLine | null;
  lineIndex: number | null;
  accounts: ChartOfAccount[];
  costCenters: CostCenterMaster[];
  expenseItems: ExpenseItemMaster[];
  nonSiiDocTypes: NonSiiDocTypeMaster[];
  projects: ProjectMaster[];
  products: ProductMaster[];
  customAnalysisItems: CustomAnalysisTableItem[];
  customColumns: string[];
  onApplyDistribution: (lineIndex: number, newLines: VoucherLine[]) => void;
  onClose: () => void;
}

interface DistributionSubLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  percentage: number;
  amount: number;
  costCenter: string;
  expenseItem: string;
  project: string;
  product: string;
  auxiliaryRut: string;
  auxiliaryName?: string;
  documentRef: string;
  gloss: string;
  customAnalyses: { [key: string]: string };
}

export default function VoucherLineDistributionModal({
  isOpen,
  sourceLine,
  lineIndex,
  accounts,
  costCenters,
  expenseItems,
  nonSiiDocTypes,
  projects,
  products,
  customAnalysisItems,
  customColumns,
  onApplyDistribution,
  onClose
}: VoucherLineDistributionModalProps) {
  if (!isOpen || !sourceLine || lineIndex === null) return null;

  const isDebit = (Number(sourceLine.debit) || 0) > 0;
  const originalTotal = isDebit ? Number(sourceLine.debit) : Number(sourceLine.credit) || 0;

  const [mode, setMode] = useState<'percentage' | 'amount'>('percentage');
  const [subLines, setSubLines] = useState<DistributionSubLine[]>([]);

  // Initialize with 2 split lines
  useEffect(() => {
    if (!sourceLine) return;
    const half = Math.round(originalTotal / 2);
    const halfRemainder = originalTotal - half;

    const initialLines: DistributionSubLine[] = [
      {
        id: '1',
        accountId: sourceLine.accountId || '',
        accountCode: sourceLine.accountCode || '',
        accountName: sourceLine.accountName || '',
        percentage: 50,
        amount: half,
        costCenter: sourceLine.costCenter || (costCenters[0]?.code || ''),
        expenseItem: sourceLine.expenseItem || (expenseItems[0]?.code || ''),
        project: sourceLine.project || '',
        product: sourceLine.product || '',
        auxiliaryRut: sourceLine.auxiliaryRut || '',
        auxiliaryName: sourceLine.auxiliaryName || '',
        documentRef: sourceLine.documentRef || '',
        gloss: sourceLine.gloss || '',
        customAnalyses: { ...(sourceLine.customAnalyses || {}) }
      },
      {
        id: '2',
        accountId: sourceLine.accountId || '',
        accountCode: sourceLine.accountCode || '',
        accountName: sourceLine.accountName || '',
        percentage: 50,
        amount: halfRemainder,
        costCenter: costCenters[1]?.code || '',
        expenseItem: sourceLine.expenseItem || (expenseItems[0]?.code || ''),
        project: sourceLine.project || '',
        product: sourceLine.product || '',
        auxiliaryRut: sourceLine.auxiliaryRut || '',
        auxiliaryName: sourceLine.auxiliaryName || '',
        documentRef: sourceLine.documentRef || '',
        gloss: sourceLine.gloss || '',
        customAnalyses: { ...(sourceLine.customAnalyses || {}) }
      }
    ];

    setSubLines(initialLines);
  }, [sourceLine, originalTotal]);

  // Quick split helpers
  const handleQuickSplit = (parts: number) => {
    if (parts <= 0) return;
    const pctEach = Number((100 / parts).toFixed(2));
    let accumulatedAmt = 0;

    const newSubs: DistributionSubLine[] = [];
    for (let i = 0; i < parts; i++) {
      const isLast = i === parts - 1;
      const pct = isLast ? Number((100 - pctEach * (parts - 1)).toFixed(2)) : pctEach;
      const amt = isLast ? originalTotal - accumulatedAmt : Math.round((originalTotal * pct) / 100);
      accumulatedAmt += amt;

      const defaultCc = costCenters[i % costCenters.length]?.code || '';

      newSubs.push({
        id: String(Date.now() + i),
        accountId: sourceLine.accountId || '',
        accountCode: sourceLine.accountCode || '',
        accountName: sourceLine.accountName || '',
        percentage: pct,
        amount: amt,
        costCenter: defaultCc,
        expenseItem: sourceLine.expenseItem || '',
        project: sourceLine.project || '',
        product: sourceLine.product || '',
        auxiliaryRut: sourceLine.auxiliaryRut || '',
        auxiliaryName: sourceLine.auxiliaryName || '',
        documentRef: sourceLine.documentRef || '',
        gloss: sourceLine.gloss || '',
        customAnalyses: { ...(sourceLine.customAnalyses || {}) }
      });
    }

    setSubLines(newSubs);
  };

  // Add line
  const handleAddSubLine = () => {
    const totalCurrentAmt = subLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const totalCurrentPct = subLines.reduce((s, l) => s + (Number(l.percentage) || 0), 0);

    const diffAmt = Math.max(0, originalTotal - totalCurrentAmt);
    const diffPct = Math.max(0, Number((100 - totalCurrentPct).toFixed(2)));

    const newLine: DistributionSubLine = {
      id: String(Date.now()),
      accountId: sourceLine.accountId || '',
      accountCode: sourceLine.accountCode || '',
      accountName: sourceLine.accountName || '',
      percentage: diffPct,
      amount: diffAmt,
      costCenter: '',
      expenseItem: sourceLine.expenseItem || '',
      project: sourceLine.project || '',
      product: sourceLine.product || '',
      auxiliaryRut: sourceLine.auxiliaryRut || '',
      auxiliaryName: sourceLine.auxiliaryName || '',
      documentRef: sourceLine.documentRef || '',
      gloss: sourceLine.gloss || '',
      customAnalyses: { ...(sourceLine.customAnalyses || {}) }
    };

    setSubLines([...subLines, newLine]);
  };

  // Remove line
  const handleRemoveSubLine = (id: string) => {
    if (subLines.length <= 2) {
      alert('La distribución debe contener al menos 2 partes.');
      return;
    }
    setSubLines(subLines.filter(l => l.id !== id));
  };

  // Change amount
  const handleAmountChange = (index: number, newAmount: number) => {
    const updated = [...subLines];
    const pct = originalTotal > 0 ? Number(((newAmount / originalTotal) * 100).toFixed(2)) : 0;
    updated[index] = {
      ...updated[index],
      amount: newAmount,
      percentage: pct
    };
    setSubLines(updated);
  };

  // Change percentage
  const handlePercentageChange = (index: number, newPct: number) => {
    const updated = [...subLines];
    const amt = Math.round((originalTotal * newPct) / 100);
    updated[index] = {
      ...updated[index],
      percentage: newPct,
      amount: amt
    };
    setSubLines(updated);
  };

  // Change account
  const handleAccountChange = (index: number, newAccountId: string) => {
    const accObj = accounts.find(a => a.id === newAccountId);
    const updated = [...subLines];
    updated[index] = {
      ...updated[index],
      accountId: newAccountId,
      accountCode: accObj?.code || '',
      accountName: accObj?.name || ''
    };
    setSubLines(updated);
  };

  // Totals calculations
  const totalDistributedAmount = subLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const totalDistributedPercentage = subLines.reduce((s, l) => s + (Number(l.percentage) || 0), 0);
  const diffAmount = originalTotal - totalDistributedAmount;
  const isPerfectAmount = Math.abs(diffAmount) === 0;

  // Validation before apply
  const handleApply = () => {
    if (!isPerfectAmount) {
      alert(`⚠️ La distribución no coincide con el monto total original ($${originalTotal.toLocaleString('es-CL')}). Diferencia pendiente: $${diffAmount.toLocaleString('es-CL')}`);
      return;
    }

    // Convert subLines to VoucherLine[]
    const generatedLines: VoucherLine[] = subLines.map(sl => {
      return {
        accountId: sl.accountId,
        accountCode: sl.accountCode,
        accountName: sl.accountName,
        debit: isDebit ? sl.amount : 0,
        credit: !isDebit ? sl.amount : 0,
        costCenter: sl.costCenter,
        expenseItem: sl.expenseItem,
        project: sl.project,
        product: sl.product,
        auxiliaryRut: sl.auxiliaryRut,
        auxiliaryName: sl.auxiliaryName,
        documentRef: sl.documentRef,
        gloss: sl.gloss || sourceLine.gloss || 'Distribución de costo',
        customAnalyses: sl.customAnalyses
      };
    });

    // Validate that all lines satisfy their account analysis requirements
    for (let i = 0; i < generatedLines.length; i++) {
      const line = generatedLines[i];
      const acc = accounts.find(a => a.id === line.accountId || a.code === line.accountCode);
      const val = validateVoucherLine(line, acc, customColumns);
      if (!val.isValid) {
        alert(`⚠️ Línea #${i + 1} (${line.accountCode} - ${line.accountName}): Faltan análisis obligatorios:\n\n${val.missingFields.join('\n')}`);
        return;
      }
    }

    onApplyDistribution(lineIndex, generatedLines);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🔀</span>
            <div>
              <h3 className="font-bold text-sm leading-tight">
                Distribución Contable de Línea (Prorrateo de Centros de Costo / Ítems)
              </h3>
              <p className="text-[11px] text-slate-400">
                Divida el monto de la línea en múltiples centros de costos, ítems de gasto o cuentas contables.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Source Line Information Bar */}
        <div className="bg-slate-50 p-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Línea Original:</span>
              <span className="font-mono font-bold text-indigo-700">
                [{sourceLine.accountCode}] {sourceLine.accountName}
              </span>
            </div>
            {sourceLine.auxiliaryRut && (
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Auxiliar:</span>
                <span className="font-mono text-slate-700 font-semibold">{sourceLine.auxiliaryRut}</span>
              </div>
            )}
            {sourceLine.documentRef && (
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Doc Ref:</span>
                <span className="font-mono text-slate-700 font-semibold">{sourceLine.documentRef}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Monto Total a Prorratear ({isDebit ? 'DEBE' : 'HABER'}):</span>
              <span className="text-sm font-black text-slate-900 font-mono">
                ${originalTotal.toLocaleString('es-CL')}
              </span>
            </div>
          </div>

          {/* Quick Split Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Repartición Rápida:</span>
            <button
              type="button"
              onClick={() => handleQuickSplit(2)}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded text-xs transition-colors"
            >
              ½ en 2 (50/50)
            </button>
            <button
              type="button"
              onClick={() => handleQuickSplit(3)}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded text-xs transition-colors"
            >
              ⅓ en 3
            </button>
            <button
              type="button"
              onClick={() => handleQuickSplit(4)}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded text-xs transition-colors"
            >
              ¼ en 4
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Modo de Edición:</span>
              <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                <button
                  type="button"
                  onClick={() => setMode('percentage')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    mode === 'percentage'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por Porcentaje (%)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('amount')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    mode === 'amount'
                      ? 'bg-white text-indigo-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Por Monto Fijo ($)
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddSubLine}
              className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors border border-indigo-200 flex items-center gap-1"
            >
              <span>➕</span>
              <span>Agregar Sub-Línea</span>
            </button>
          </div>

          {/* Sub-lines Table */}
          <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs">
            <table className="w-full text-left text-xs min-w-[980px]">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5 w-10 text-center">#</th>
                  <th className="p-2.5 w-64">Cuenta Contable Destino</th>
                  <th className="p-2.5 w-24 text-right">%</th>
                  <th className="p-2.5 w-32 text-right">Monto ($)</th>
                  <th className="p-2.5 w-44">Centro de Costo</th>
                  <th className="p-2.5 w-44">Ítem de Gasto</th>
                  <th className="p-2.5 w-36">Proyecto / Obra</th>
                  <th className="p-2.5">Detalle / Glosa</th>
                  <th className="p-2.5 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {subLines.map((sub, idx) => (
                  <tr key={sub.id} className="hover:bg-slate-50">
                    <td className="p-2 text-center font-bold text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-2">
                      <select
                        value={sub.accountId}
                        onChange={e => handleAccountChange(idx, e.target.value)}
                        className="border border-slate-300 p-1.5 w-full rounded text-xs bg-white font-mono focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Seleccione Cuenta...</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>
                            [{a.code}] {a.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Percentage Input */}
                    <td className="p-2 text-right">
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={sub.percentage}
                          onChange={e => handlePercentageChange(idx, parseFloat(e.target.value) || 0)}
                          className="border border-slate-300 p-1.5 w-full rounded text-xs text-right font-mono font-semibold focus:ring-1 focus:ring-indigo-500 pr-5"
                        />
                        <span className="absolute right-1.5 text-slate-400 text-[10px] font-bold">%</span>
                      </div>
                    </td>

                    {/* Amount Input */}
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        min="0"
                        value={sub.amount}
                        onChange={e => handleAmountChange(idx, parseFloat(e.target.value) || 0)}
                        className="border border-slate-300 p-1.5 w-full rounded text-xs text-right font-mono font-bold text-indigo-900 focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>

                    {/* Centro de Costo (From Master Table) */}
                    <td className="p-2">
                      <div className="space-y-1">
                        <select
                          value={costCenters.some(c => c.code === sub.costCenter) ? sub.costCenter : (sub.costCenter ? 'CUSTOM' : '')}
                          onChange={e => {
                            const val = e.target.value;
                            const updated = [...subLines];
                            updated[idx] = { ...updated[idx], costCenter: val === 'CUSTOM' ? '' : val };
                            setSubLines(updated);
                          }}
                          className="border border-slate-300 p-1 w-full rounded text-xs bg-white font-medium focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">-- Sin Centro Costo --</option>
                          {costCenters.map(cc => (
                            <option key={cc.id} value={cc.code}>
                              [{cc.code}] {cc.name}
                            </option>
                          ))}
                          <option value="CUSTOM">Otro / Escribir manual...</option>
                        </select>
                        {!costCenters.some(c => c.code === sub.costCenter) && sub.costCenter !== '' && (
                          <input
                            type="text"
                            placeholder="Escriba CC..."
                            value={sub.costCenter}
                            onChange={e => {
                              const updated = [...subLines];
                              updated[idx] = { ...updated[idx], costCenter: e.target.value };
                              setSubLines(updated);
                            }}
                            className="border border-slate-300 p-1 w-full rounded text-[11px] font-mono"
                          />
                        )}
                      </div>
                    </td>

                    {/* Ítem de Gasto (From Master Table) */}
                    <td className="p-2">
                      <div className="space-y-1">
                        <select
                          value={expenseItems.some(item => item.code === sub.expenseItem) ? sub.expenseItem : (sub.expenseItem ? 'CUSTOM' : '')}
                          onChange={e => {
                            const val = e.target.value;
                            const updated = [...subLines];
                            updated[idx] = { ...updated[idx], expenseItem: val === 'CUSTOM' ? '' : val };
                            setSubLines(updated);
                          }}
                          className="border border-slate-300 p-1 w-full rounded text-xs bg-white font-medium focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="">-- Sin Ítem Gasto --</option>
                          {expenseItems.map(exp => (
                            <option key={exp.id} value={exp.code}>
                              [{exp.code}] {exp.name}
                            </option>
                          ))}
                          <option value="CUSTOM">Otro / Escribir manual...</option>
                        </select>
                        {!expenseItems.some(item => item.code === sub.expenseItem) && sub.expenseItem !== '' && (
                          <input
                            type="text"
                            placeholder="Escriba Ítem Gasto..."
                            value={sub.expenseItem}
                            onChange={e => {
                              const updated = [...subLines];
                              updated[idx] = { ...updated[idx], expenseItem: e.target.value };
                              setSubLines(updated);
                            }}
                            className="border border-slate-300 p-1 w-full rounded text-[11px] font-mono"
                          />
                        )}
                      </div>
                    </td>

                    {/* Proyecto / Obra */}
                    <td className="p-2">
                      <select
                        value={sub.project}
                        onChange={e => {
                          const updated = [...subLines];
                          updated[idx] = { ...updated[idx], project: e.target.value };
                          setSubLines(updated);
                        }}
                        className="border border-slate-300 p-1 w-full rounded text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Sin Proyecto --</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.code}>
                            [{p.code}] {p.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Glosa / Detalle */}
                    <td className="p-2">
                      <input
                        type="text"
                        placeholder="Glosa sub-línea..."
                        value={sub.gloss}
                        onChange={e => {
                          const updated = [...subLines];
                          updated[idx] = { ...updated[idx], gloss: e.target.value };
                          setSubLines(updated);
                        }}
                        className="border border-slate-300 p-1 w-full rounded text-xs focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>

                    {/* Delete Sub-line */}
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveSubLine(sub.id)}
                        className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition-colors"
                        title="Eliminar sub-línea"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Totals and Balancing Footer */}
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                <tr>
                  <td colSpan={2} className="p-2.5 text-right uppercase text-slate-700">Totales Distribución:</td>
                  <td className={`p-2.5 text-right font-mono ${totalDistributedPercentage === 100 ? 'text-emerald-700 font-black' : 'text-amber-700 font-bold'}`}>
                    {totalDistributedPercentage.toFixed(2)}%
                  </td>
                  <td className={`p-2.5 text-right font-mono ${isPerfectAmount ? 'text-emerald-700 font-black' : 'text-rose-700 font-bold'}`}>
                    ${totalDistributedAmount.toLocaleString('es-CL')}
                  </td>
                  <td colSpan={5} className="p-2.5">
                    {!isPerfectAmount ? (
                      <span className="text-rose-700 font-medium flex items-center gap-1">
                        <span>⚠️ Diferencia:</span>
                        <strong className="font-mono">${diffAmount.toLocaleString('es-CL')}</strong>
                        <button
                          type="button"
                          onClick={() => {
                            if (subLines.length > 0) {
                              const lastIdx = subLines.length - 1;
                              const updated = [...subLines];
                              const newAmt = updated[lastIdx].amount + diffAmount;
                              updated[lastIdx] = {
                                ...updated[lastIdx],
                                amount: newAmt,
                                percentage: originalTotal > 0 ? Number(((newAmt / originalTotal) * 100).toFixed(2)) : 0
                              };
                              setSubLines(updated);
                            }
                          }}
                          className="ml-2 px-2 py-0.5 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded font-bold text-[10px]"
                        >
                          Ajustar a última fila
                        </button>
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-medium">
                        ✓ Distribución 100% Cuadrada ($ {originalTotal.toLocaleString('es-CL')})
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors"
          >
            Cancelar
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isPerfectAmount}
              onClick={handleApply}
              className={`px-6 py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 ${
                isPerfectAmount
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <span>✓</span>
              <span>Aplicar Distribución al Comprobante</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
