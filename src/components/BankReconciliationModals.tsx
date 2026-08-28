import React from 'react';
import { BankStatementLine, ChartOfAccount, Voucher } from '../types';

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  pastedCSV: string;
  setPastedCSV: (val: string) => void;
  importInitialBalance: number;
  setImportInitialBalance: (val: number) => void;
  onImport: () => void;
  currentPeriod: string;
}

export function ImportCSVModal({
  isOpen,
  onClose,
  pastedCSV,
  setPastedCSV,
  importInitialBalance,
  setImportInitialBalance,
  onImport,
  currentPeriod
}: ImportCSVModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b pb-2">
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase flex items-center gap-1.5">
              <span>📥</span> Importar Cartola Bancaria (Saldos Acumulativos Multimes)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Al importar, los movimientos se grabarán automáticamente y encadenarán los saldos de mes a mes.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold text-lg">
            ✕
          </button>
        </div>

        {/* Initial Balance in Import Modal */}
        <div className="bg-indigo-50/80 p-3.5 rounded-lg border border-indigo-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <label className="block text-xs font-bold text-indigo-950">
              Saldo Inicial Apertura / Mes Anterior ($):
            </label>
            <span className="text-[11px] text-slate-600">
              Punto de partida acumulativo para calcular el saldo progresivo de los movimientos:
            </span>
          </div>
          <div className="w-full sm:w-48">
            <input
              type="number"
              value={importInitialBalance}
              onChange={(e) => setImportInitialBalance(Number(e.target.value))}
              className="w-full bg-white border border-indigo-300 rounded px-3 py-1.5 font-mono font-bold text-indigo-950 text-xs"
            />
          </div>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
          <p className="font-semibold text-slate-800">
            Formato de columnas admitido (separado por punto y coma, coma o tabulación):
          </p>
          <code className="bg-white px-2 py-1 rounded text-indigo-800 font-mono text-[11px] block border border-slate-200">
            Fecha; Descripción / Glosa; N° Documento; Cargo; Abono [; Saldo]
          </code>
          <p className="text-[11px] text-slate-500 italic">
            * Si el archivo contiene fechas de diferentes meses (ej: 2026-01 y 2026-02), el sistema distribuirá y encadenará automáticamente cada mes en su período correspondiente.
          </p>
        </div>

        <textarea
          rows={8}
          value={pastedCSV}
          onChange={(e) => setPastedCSV(e.target.value)}
          placeholder={`2026-08-01;PAGO PROVEEDOR TRANSFERENCIA;10293;450000;0\n2026-08-03;DEPOSITO CLIENTE FACTURA 55;44812;0;1200000\n2026-08-05;COMISION MANTENCION CUENTA;0;15000;0`}
          className="w-full font-mono text-xs border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />

        <div className="flex justify-between items-center pt-2">
          <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
            <span>💾</span> Grabado automático inmediato al importar
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
            >
              Cancelar
            </button>
            <button
              onClick={onImport}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-xs"
            >
              Procesar y Guardar Cartola
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ManualMatchModalProps {
  manualMatchLine: BankStatementLine | null;
  onClose: () => void;
  modalScope: 'TODOS_PENDIENTES' | 'ESTE_MES' | 'MESES_POSTERIORES' | 'MESES_ANTERIORES';
  setModalScope: (scope: 'TODOS_PENDIENTES' | 'ESTE_MES' | 'MESES_POSTERIORES' | 'MESES_ANTERIORES') => void;
  modalExactOnly: boolean;
  setModalExactOnly: (val: boolean) => void;
  modalSearch: string;
  setModalSearch: (val: string) => void;
  availableVouchers: {
    voucher: Voucher;
    line: any;
    debit: number;
    credit: number;
    date: string;
    period: string;
    gloss: string;
  }[];
  onMatch: (voucherId: string, voucherNumber: number, voucherPeriod: string) => void;
  selectedPeriod: string;
}

export function ManualMatchModal({
  manualMatchLine,
  onClose,
  modalScope,
  setModalScope,
  modalExactOnly,
  setModalExactOnly,
  modalSearch,
  setModalSearch,
  availableVouchers,
  onMatch,
  selectedPeriod
}: ManualMatchModalProps) {
  if (!manualMatchLine) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-5 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center border-b pb-2">
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase flex items-center gap-1.5">
              <span>🔗</span> Conciliar Partida con Asiento (Mismo Mes o Distinto Mes)
            </h4>
            <div className="text-xs text-slate-600 mt-0.5">
              Línea Cartola: <strong className="text-slate-900">{manualMatchLine.description}</strong> ({manualMatchLine.date}) — Monto:{' '}
              <strong className={manualMatchLine.charge > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                ${((manualMatchLine.charge || 0) + (manualMatchLine.deposit || 0)).toLocaleString('es-CL')} (
                {manualMatchLine.charge > 0 ? 'Cargo / Egreso' : 'Abono / Ingreso'})
              </strong>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold text-lg">
            ✕
          </button>
        </div>

        {/* Scope and Filter Controls in Modal */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Alcance Temporal:</label>
            <select
              value={modalScope}
              onChange={(e) => setModalScope(e.target.value as any)}
              className="w-full bg-white border border-slate-300 rounded p-1.5 font-semibold text-xs"
            >
              <option value="TODOS_PENDIENTES">Todos los Meses (Pendientes)</option>
              <option value="ESTE_MES">Solo este Mes ({selectedPeriod})</option>
              <option value="MESES_POSTERIORES">Meses Posteriores (Regularizaciones Futuras)</option>
              <option value="MESES_ANTERIORES">Meses Anteriores</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Buscar Comprobante:</label>
            <input
              type="text"
              placeholder="N° Asiento, glosa, fecha..."
              value={modalSearch}
              onChange={(e) => setModalSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs"
            />
          </div>

          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs">
              <input
                type="checkbox"
                checked={modalExactOnly}
                onChange={(e) => setModalExactOnly(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
              />
              <span>Solo monto idéntico (${((manualMatchLine.charge || 0) + (manualMatchLine.deposit || 0)).toLocaleString('es-CL')})</span>
            </label>
          </div>
        </div>

        {/* Duplicate Vouchers Warning in Modal */}
        {(() => {
          const exactMatchingVouchers = availableVouchers.filter(bv => {
            return (
              (manualMatchLine.charge > 0 && bv.credit === manualMatchLine.charge) ||
              (manualMatchLine.deposit > 0 && bv.debit === manualMatchLine.deposit)
            );
          });

          if (exactMatchingVouchers.length >= 2) {
            return (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <div>
                  <strong className="font-bold">Advertencia de Asientos Múltiples / Duplicados en Libros:</strong>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    Se detectaron <strong>{exactMatchingVouchers.length} comprobantes contables</strong> con el mismo monto exacto (Asientos:{' '}
                    {exactMatchingVouchers.map(v => `N° ${v.voucher.voucherNumber}`).join(', ')}). El sistema omitió la conciliación automática
                    por seguridad. Seleccione manualmente el comprobante correcto o elimine el duplicado en el libro contable.
                  </p>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Table of Available Vouchers */}
        <div className="overflow-y-auto flex-1 border rounded-lg max-h-72">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100 sticky top-0 border-b border-slate-200">
              <tr>
                <th className="p-2">Período / Fecha</th>
                <th className="p-2">N° Asiento</th>
                <th className="p-2">Tipo</th>
                <th className="p-2">Glosa</th>
                <th className="p-2 text-right">Monto</th>
                <th className="p-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {availableVouchers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 font-sans italic">
                    No se encontraron comprobantes pendientes con los filtros seleccionados. Desmarca "Solo monto idéntico" o amplía el alcance temporal.
                  </td>
                </tr>
              ) : (
                availableVouchers.map((bv, idx) => {
                  const isExact =
                    (manualMatchLine.charge > 0 && bv.credit === manualMatchLine.charge) ||
                    (manualMatchLine.deposit > 0 && bv.debit === manualMatchLine.deposit);
                  const isCrossPeriod = bv.period !== selectedPeriod;

                  return (
                    <tr key={idx} className={`hover:bg-slate-50 ${isExact ? 'bg-emerald-50/30' : ''}`}>
                      <td className="p-2">
                        <div>{bv.date}</div>
                        {isCrossPeriod ? (
                          <span className="text-[9px] font-sans font-bold bg-indigo-100 text-indigo-800 px-1 rounded border border-indigo-200">
                            🔄 Período {bv.period}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 font-sans">Mismo período</span>
                        )}
                      </td>
                      <td className="p-2 font-bold text-indigo-700">N° {bv.voucher.voucherNumber}</td>
                      <td className="p-2 font-sans font-semibold text-slate-700">{bv.voucher.type}</td>
                      <td className="p-2 font-sans truncate max-w-[180px] text-slate-900" title={bv.gloss}>
                        {bv.gloss}
                      </td>
                      <td className="p-2 text-right font-bold text-slate-900">
                        ${(bv.debit > 0 ? bv.debit : bv.credit).toLocaleString('es-CL')}
                        {isExact && (
                          <span className="block text-[9px] text-emerald-700 font-sans font-bold">⭐ Coincide</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => onMatch(bv.voucher.id, bv.voucher.voucherNumber || 0, bv.period)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-black text-xs transition-colors shadow-2xs"
                        >
                          Vincular y Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-slate-500 flex justify-between items-center border-t pt-2">
          <span>* Al presionar "Vincular", el estado se graba automáticamente en tiempo real.</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

interface QuickVoucherModalProps {
  quickVoucherLine: BankStatementLine | null;
  onClose: () => void;
  accounts: ChartOfAccount[];
  quickExpenseAccountId: string;
  setQuickExpenseAccountId: (val: string) => void;
  quickGloss: string;
  setQuickGloss: (val: string) => void;
  quickVoucherPeriod: string;
  setQuickVoucherPeriod: (val: string) => void;
  onPost: () => void;
}

export function QuickVoucherModal({
  quickVoucherLine,
  onClose,
  accounts,
  quickExpenseAccountId,
  setQuickExpenseAccountId,
  quickGloss,
  setQuickGloss,
  quickVoucherPeriod,
  setQuickVoucherPeriod,
  onPost
}: QuickVoucherModalProps) {
  if (!quickVoucherLine) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4">
        <div className="flex justify-between items-center border-b pb-2">
          <h4 className="text-sm font-black text-slate-900 uppercase">
            Contabilizar Partida Bancaria Automática
          </h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 font-bold">
            ✕
          </button>
        </div>

        <div className="bg-slate-50 p-3 rounded-lg border text-xs space-y-1">
          <div><span className="font-bold">Glosa Banco:</span> {quickVoucherLine.description}</div>
          <div><span className="font-bold">Fecha Movimiento:</span> {quickVoucherLine.date}</div>
          <div>
            <span className="font-bold">Monto:</span> ${((quickVoucherLine.charge || 0) + (quickVoucherLine.deposit || 0)).toLocaleString('es-CL')} (
            {quickVoucherLine.charge > 0 ? 'Cargo / Egreso Bancario' : 'Abono / Ingreso Bancario'})
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Período Contable de Imputación:</label>
            <input
              type="month"
              value={quickVoucherPeriod}
              onChange={(e) => setQuickVoucherPeriod(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Cuenta de Contrapartida:</label>
            <select
              value={quickExpenseAccountId}
              onChange={(e) => setQuickExpenseAccountId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-medium"
            >
              <option value="">-- Seleccione Cuenta Contable --</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Glosa del Asiento:</label>
            <input
              type="text"
              value={quickGloss}
              onChange={(e) => setQuickGloss(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-1.5"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded"
          >
            Cancelar
          </button>
          <button
            onClick={onPost}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded shadow-xs"
          >
            Crear Asiento, Conciliar y Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
