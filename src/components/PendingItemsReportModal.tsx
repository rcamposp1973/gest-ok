import React from 'react';
import { 
  X, 
  Printer, 
  Download, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Building2, 
  Landmark, 
  Calendar,
  Layers,
  Sparkles,
  Move
} from 'lucide-react';
import { useDraggableModal } from '../hooks/useDraggableModal';
import { 
  Company, 
  ChartOfAccount, 
  BankStatementLine, 
  VoucherLine 
} from '../types';

export interface PendingVoucherItem {
  id?: string;
  date?: string;
  period?: string;
  documentDate?: string;
  documentNumber?: string;
  voucherNumber?: number | string;
  gloss?: string;
  debit?: number;
  credit?: number;
  [key: string]: any;
}

interface PendingItemsReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  bankAccount: ChartOfAccount | undefined;
  period: string;
  bankFinalBalance: number;
  bookFinalBalance: number;
  unmatchedCharges: BankStatementLine[]; // Cargos banco no contabilizados
  unmatchedDeposits: BankStatementLine[]; // Abonos banco no contabilizados
  outstandingChecks: PendingVoucherItem[]; // Cheques girados no cobrados (Crédito en libros)
  depositsInTransit: PendingVoucherItem[]; // Depósitos en tránsito (Débito en libros)
}

export default function PendingItemsReportModal({
  isOpen,
  onClose,
  company,
  bankAccount,
  period,
  bankFinalBalance,
  bookFinalBalance,
  unmatchedCharges,
  unmatchedDeposits,
  outstandingChecks,
  depositsInTransit
}: PendingItemsReportModalProps) {
  if (!isOpen) return null;

  const totalUnmatchedCharges = unmatchedCharges.reduce((s, l) => s + (l.charge || 0), 0);
  const totalUnmatchedDeposits = unmatchedDeposits.reduce((s, l) => s + (l.deposit || 0), 0);

  const totalOutstandingChecks = outstandingChecks.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const totalDepositsInTransit = depositsInTransit.reduce((s, l) => s + (Number(l.debit) || 0), 0);

  // Conciliación Aritmética Oficial
  const saldoBancoAjustado = bankFinalBalance + totalDepositsInTransit - totalOutstandingChecks;
  const saldoLibroAjustado = bookFinalBalance + totalUnmatchedDeposits - totalUnmatchedCharges;
  const diferenciaAjustada = Math.abs(saldoBancoAjustado - saldoLibroAjustado);
  const isBalanced = diferenciaAjustada < 1;

  // Export CSV
  const handleExportCSV = () => {
    const rows = [
      ['INFORME OFICIAL DE PARTIDAS PENDIENTES DE CONCILIACIÓN BANCARIA'],
      [`Empresa: ${company.name}`, `RUT: ${company.rut}`],
      [`Cuenta Bancaria: ${bankAccount?.code} - ${bankAccount?.name} (${bankAccount?.bankInstitution || 'Banco'})`],
      [`Período Conciliado: ${period}`],
      [''],
      ['1. RESUMEN DE SALDOS'],
      ['Saldo Final según Cartola Bancaria:', bankFinalBalance.toString()],
      ['Saldo Final según Libro Mayor:', bookFinalBalance.toString()],
      [''],
      ['2. PARTIDAS PENDIENTES EN CARTOLA BANCARIA (NO REGISTRADAS EN CONTABILIDAD)'],
      ['TIPO', 'FECHA', 'N° DOC', 'DESCRIPCIÓN', 'MONTO ($)'],
      ...unmatchedCharges.map(l => ['CARGO BANCO NO CONTABILIZADO', l.date, l.documentNumber || '', `"${l.description}"`, `-${l.charge}`]),
      ...unmatchedDeposits.map(l => ['ABONO BANCO NO CONTABILIZADO', l.date, l.documentNumber || '', `"${l.description}"`, `+${l.deposit}`]),
      ['TOTAL CARGOS BANCO PENDIENTES:', '', '', '', `-${totalUnmatchedCharges}`],
      ['TOTAL ABONOS BANCO PENDIENTES:', '', '', '', `+${totalUnmatchedDeposits}`],
      [''],
      ['3. PARTIDAS PENDIENTES EN LIBRO MAYOR (EN TRÁNSITO / NO ACREDITADAS EN BANCO)'],
      ['TIPO', 'FECHA', 'COMPROBANTE', 'GLOSA', 'MONTO ($)'],
      ...outstandingChecks.map(l => ['CHEQUE / TRANSFERENCIA EN TRÁNSITO (CRÉDITO)', l.date || l.period || '', l.voucherNumber || l.documentNumber || '', `"${l.gloss}"`, `-${l.credit}`]),
      ...depositsInTransit.map(l => ['DEPÓSITO EN TRÁNSITO (DÉBITO)', l.date || l.period || '', l.voucherNumber || l.documentNumber || '', `"${l.gloss}"`, `+${l.debit}`]),
      ['TOTAL CHEQUES / CARGOS EN TRÁNSITO:', '', '', '', `-${totalOutstandingChecks}`],
      ['TOTAL DEPÓSITOS EN TRÁNSITO:', '', '', '', `+${totalDepositsInTransit}`],
      [''],
      ['4. CUADRATURA ARITMÉTICA FINAL'],
      ['Saldo Cartola Ajustado:', saldoBancoAjustado.toString()],
      ['Saldo Libro Mayor Ajustado:', saldoLibroAjustado.toString()],
      ['Diferencia Neta:', diferenciaAjustada.toString()],
      ['Estado:', isBalanced ? 'CONCILIACIÓN 100% CUADRADA' : 'DESCUADRE DETECTADO']
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Partidas_Pendientes_Conciliacion_${company.rut}_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const { dragProps, modalStyle } = useDraggableModal({ isOpen: true });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-4 overflow-y-auto">
      <div
        style={modalStyle}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden font-sans"
      >
        
        {/* Header */}
        <div
          {...dragProps}
          className="bg-slate-900 text-white p-4 flex justify-between items-center border-b border-slate-800 cursor-grab active:cursor-grabbing select-none"
          title="Haz clic y arrastra para mover esta ventana"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
              <Move className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base uppercase tracking-wide">
                Reporte de Partidas Pendientes de Conciliación Bancaria
              </h3>
              <p className="text-xs text-slate-300">
                {company.name} ({company.rut}) • Período: <strong className="text-amber-300 font-mono">{period}</strong> (Ventana movible)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Bar */}
        <div className="bg-slate-100 p-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-indigo-700" />
            <span className="font-bold text-slate-800">
              Cuenta: {bankAccount?.code} - {bankAccount?.name} ({bankAccount?.bankInstitution || 'Banco'} {bankAccount?.bankAccountNumber ? `N° ${bankAccount.bankAccountNumber}` : ''})
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono">
            <span className="text-slate-600">Saldo Cartola: <strong className="text-slate-900">${bankFinalBalance.toLocaleString('es-CL')}</strong></span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">Saldo Mayor: <strong className="text-slate-900">${bookFinalBalance.toLocaleString('es-CL')}</strong></span>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          
          {/* CUADRATURA RESUMEN */}
          <div className={`p-3.5 rounded-xl border flex justify-between items-center ${
            isBalanced ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}>
            <div className="flex items-center gap-2">
              {isBalanced ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />}
              <div>
                <span className="font-bold text-xs uppercase tracking-wide">
                  {isBalanced ? 'Cuadratura Aritmética de Partidas en Conciliación Conforme' : 'Diferencia en Conciliación Bancaria'}
                </span>
                <p className="text-[11px] opacity-80">
                  Saldo Cartola Ajustado (${saldoBancoAjustado.toLocaleString('es-CL')}) = Saldo Mayor Ajustado (${saldoLibroAjustado.toLocaleString('es-CL')})
                </p>
              </div>
            </div>

            <div className="font-mono font-black text-sm">
              {isBalanced ? '$ 0 (Cuadrado)' : `Diff: $ ${diferenciaAjustada.toLocaleString('es-CL')}`}
            </div>
          </div>

          {/* SECCIÓN 1: PARTIDAS PENDIENTES EN CARTOLA BANCARIA */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-slate-900 text-white p-2.5 font-bold uppercase text-xs flex justify-between items-center">
              <span>1. Partidas Pendientes en Cartola Bancaria (No Registradas en Contabilidad)</span>
              <span className="font-mono text-amber-300 font-black">
                {unmatchedCharges.length + unmatchedDeposits.length} movimientos
              </span>
            </div>

            {/* Cargos Banco */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-rose-900 mb-2">
                <span>🔻 Cargos Bancarios No Contabilizados (Comisiones, Giros, Pagos Automáticos):</span>
                <span className="font-mono font-black">-${totalUnmatchedCharges.toLocaleString('es-CL')}</span>
              </div>
              {unmatchedCharges.length > 0 ? (
                <div className="space-y-1 font-mono text-[11px]">
                  {unmatchedCharges.map(l => (
                    <div key={l.id} className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200">
                      <div className="flex items-center gap-2 truncate max-w-[480px]">
                        <span className="text-slate-500 font-semibold">{l.date}</span>
                        <span className="font-sans text-slate-800 truncate">{l.description}</span>
                        {l.documentNumber && <span className="bg-slate-100 px-1 rounded text-slate-600 text-[10px]">Doc #{l.documentNumber}</span>}
                      </div>
                      <span className="font-bold text-rose-700">-${(l.charge || 0).toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">Sin cargos bancarios pendientes de contabilización.</p>
              )}
            </div>

            {/* Abonos Banco */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-emerald-900 mb-2">
                <span>🟢 Abonos Bancarios No Contabilizados (Transferencias de Clientes no registradas):</span>
                <span className="font-mono font-black">+${totalUnmatchedDeposits.toLocaleString('es-CL')}</span>
              </div>
              {unmatchedDeposits.length > 0 ? (
                <div className="space-y-1 font-mono text-[11px]">
                  {unmatchedDeposits.map(l => (
                    <div key={l.id} className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200">
                      <div className="flex items-center gap-2 truncate max-w-[480px]">
                        <span className="text-slate-500 font-semibold">{l.date}</span>
                        <span className="font-sans text-slate-800 truncate">{l.description}</span>
                        {l.documentNumber && <span className="bg-slate-100 px-1 rounded text-slate-600 text-[10px]">Doc #{l.documentNumber}</span>}
                      </div>
                      <span className="font-bold text-emerald-700">+${(l.deposit || 0).toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">Sin abonos bancarios pendientes de contabilización.</p>
              )}
            </div>
          </div>

          {/* SECCIÓN 2: PARTIDAS PENDIENTES EN LIBRO MAYOR */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-slate-900 text-white p-2.5 font-bold uppercase text-xs flex justify-between items-center">
              <span>2. Partidas Pendientes en Libro Mayor (En Tránsito / No Acreditadas en Banco)</span>
              <span className="font-mono text-amber-300 font-black">
                {outstandingChecks.length + depositsInTransit.length} movimientos
              </span>
            </div>

            {/* Cheques Girados y no Cobrados / Transferencias en Tránsito */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-indigo-950 mb-2">
                <span>📋 Cheques Girados y No Cobrados / Pagos en Tránsito (Créditos en Libro):</span>
                <span className="font-mono font-black text-rose-700">-${totalOutstandingChecks.toLocaleString('es-CL')}</span>
              </div>
              {outstandingChecks.length > 0 ? (
                <div className="space-y-1 font-mono text-[11px]">
                  {outstandingChecks.map((l, i) => (
                    <div key={i} className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200">
                      <div className="flex items-center gap-2 truncate max-w-[480px]">
                        <span className="text-slate-500 font-semibold">{l.date || l.period || period}</span>
                        <span className="font-sans text-slate-800 truncate">{l.gloss}</span>
                        {(l.voucherNumber || l.documentNumber) && <span className="bg-slate-100 px-1 rounded text-slate-600 text-[10px]">N° {l.voucherNumber || l.documentNumber}</span>}
                      </div>
                      <span className="font-bold text-rose-700">-${(Number(l.credit) || 0).toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">Sin cheques o pagos pendientes de cobro.</p>
              )}
            </div>

            {/* Depósitos en Tránsito */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-indigo-950 mb-2">
                <span>📥 Depósitos en Tránsito (Débitos en Libro Mayor aún no acreditados en Cartola):</span>
                <span className="font-mono font-black text-emerald-700">+${totalDepositsInTransit.toLocaleString('es-CL')}</span>
              </div>
              {depositsInTransit.length > 0 ? (
                <div className="space-y-1 font-mono text-[11px]">
                  {depositsInTransit.map((l, i) => (
                    <div key={i} className="flex justify-between items-center bg-white p-1.5 rounded border border-slate-200">
                      <div className="flex items-center gap-2 truncate max-w-[480px]">
                        <span className="text-slate-500 font-semibold">{l.date || l.period || period}</span>
                        <span className="font-sans text-slate-800 truncate">{l.gloss}</span>
                        {(l.voucherNumber || l.documentNumber) && <span className="bg-slate-100 px-1 rounded text-slate-600 text-[10px]">N° {l.voucherNumber || l.documentNumber}</span>}
                      </div>
                      <span className="font-bold text-emerald-700">+${(Number(l.debit) || 0).toLocaleString('es-CL')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px]">Sin depósitos en tránsito.</p>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-100 p-3 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Asistido por <strong>Junior</strong> • Sistema Contable Pulso</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition-colors"
          >
            Cerrar Reporte
          </button>
        </div>

      </div>
    </div>
  );
}
