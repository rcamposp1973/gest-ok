import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc } from 'firebase/firestore';
import { Company, ChartOfAccount, Voucher, VoucherLine, FiscalPeriodYear } from '../types';
import { useProcess } from '../context/ProcessContext';

interface CargaMasivaComprobantesViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
}

interface ParsedVoucherDraft {
  tempId: string;
  voucherNumber: number;
  date: string;
  period: string;
  type: 'Ingreso' | 'Egreso' | 'Traspaso';
  gloss: string;
  lines: VoucherLine[];
  totalDebit: number;
  totalCredit: number;
  isValid: boolean;
  error?: string;
}

export default function CargaMasivaComprobantesView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears,
  onVouchersUpdated
}: CargaMasivaComprobantesViewProps) {
  const { withProcess } = useProcess();
  const [pastedData, setPastedData] = useState<string>('');
  const [parsedVouchers, setParsedVouchers] = useState<ParsedVoucherDraft[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<number | null>(null);

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Map of accounts by code for fast lookup
  const accountMap = new Map<string, ChartOfAccount>();
  accounts.forEach(a => {
    if (a.code) accountMap.set(a.code.trim(), a);
  });

  // Download Sample Template CSV
  const handleDownloadTemplate = () => {
    const headers = 'NumComprobante;Fecha;Tipo;GlosaComprobante;CodigoCuenta;Debe;Haber;RutAuxiliar;NombreAuxiliar;GlosaLinea;RefDTE';
    const sampleRows = [
      '1;2026-08-01;Ingreso;Aporte Inicial de Capital;1-1-01-02;5000000;0;;;Deposito Bancario Capital;',
      '1;2026-08-01;Ingreso;Aporte Inicial de Capital;3-1-01-01;0;5000000;;;Capital Pagado;',
      '2;2026-08-05;Egreso;Pago de Arriendo Oficina;4-2-01-01;650000;0;76.123.456-7;INMOBILIARIA SPA;Gasto Arriendo Agosto;Fac 102',
      '2;2026-08-05;Egreso;Pago de Arriendo Oficina;1-1-01-02;0;650000;76.123.456-7;INMOBILIARIA SPA;Transferencia Bancaria;Fac 102'
    ];

    const content = '\uFEFF' + [headers, ...sampleRows].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Plantilla_Carga_Masiva_Comprobantes_${company.name}.csv`;
    link.click();
  };

  // Parse Text or CSV
  const handleParseData = () => {
    if (!pastedData.trim()) {
      alert('Pegue los datos o cargue un archivo CSV antes de procesar.');
      return;
    }

    const rows = pastedData.trim().split('\n');
    const groupedByNumber = new Map<number, {
      date: string;
      period: string;
      type: 'Ingreso' | 'Egreso' | 'Traspaso';
      gloss: string;
      lines: VoucherLine[];
    }>();

    let startIdx = 0;
    // Check if first line is header
    if (rows[0].toLowerCase().includes('comprobante') || rows[0].toLowerCase().includes('cuenta') || rows[0].toLowerCase().includes('debe')) {
      startIdx = 1;
    }

    for (let i = startIdx; i < rows.length; i++) {
      const rawLine = rows[i].trim();
      if (!rawLine) continue;

      const cols = rawLine.split(/[;\t,]/).map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 7) continue;

      const vNum = parseInt(cols[0]) || 1;
      const vDate = cols[1] || new Date().toISOString().split('T')[0];
      const vPeriod = vDate.slice(0, 7);
      const vType = (['Ingreso', 'Egreso', 'Traspaso'].includes(cols[2]) ? cols[2] : 'Traspaso') as 'Ingreso' | 'Egreso' | 'Traspaso';
      const vGloss = cols[3] || 'Comprobante Importado Masivo';
      const accCode = cols[4] || '';
      const debit = parseFloat(cols[5].replace(/[^0-9.-]/g, '')) || 0;
      const credit = parseFloat(cols[6].replace(/[^0-9.-]/g, '')) || 0;
      const auxRut = cols[7] || '';
      const auxName = cols[8] || '';
      const lineGloss = cols[9] || vGloss;
      const refDte = cols[10] || '';

      const matchedAccount = accountMap.get(accCode);
      const accId = matchedAccount ? matchedAccount.id : `acc_${accCode}`;
      const accName = matchedAccount ? matchedAccount.name : `Cuenta ${accCode}`;

      const voucherLine: VoucherLine = {
        id: `line_${i}`,
        accountId: accId,
        accountCode: accCode,
        accountName: accName,
        debit,
        credit,
        auxiliaryRut: auxRut,
        auxiliaryName: auxName,
        documentRef: refDte,
        gloss: lineGloss
      };

      if (!groupedByNumber.has(vNum)) {
        groupedByNumber.set(vNum, {
          date: vDate,
          period: vPeriod,
          type: vType,
          gloss: vGloss,
          lines: []
        });
      }

      groupedByNumber.get(vNum)!.lines.push(voucherLine);
    }

    // Convert to ParsedVoucherDraft array
    const drafts: ParsedVoucherDraft[] = [];
    let nextNumBase = vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0;

    groupedByNumber.forEach((val, originalNum) => {
      nextNumBase++;
      const totalDebit = val.lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = val.lines.reduce((s, l) => s + (l.credit || 0), 0);
      const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

      drafts.push({
        tempId: `draft_${originalNum}_${Date.now()}`,
        voucherNumber: nextNumBase,
        date: val.date,
        period: val.period,
        type: val.type,
        gloss: val.gloss,
        lines: val.lines,
        totalDebit,
        totalCredit,
        isValid: isBalanced,
        error: !isBalanced ? `Descuadre: Debe ($${totalDebit}) != Haber ($${totalCredit})` : undefined
      });
    });

    setParsedVouchers(drafts);
    setUploadSuccess(null);
  };

  // Upload Drafts to Firestore
  const handleBatchSave = async () => {
    const validDrafts = parsedVouchers.filter(d => d.isValid);
    if (validDrafts.length === 0) {
      alert('No hay comprobantes válidos y cuadrados para importar.');
      return;
    }

    setLoading(true);
    try {
      await withProcess(
        `Contabilizando comprobantes (0/${validDrafts.length})...`,
        async (updateProgress) => {
          let count = 0;
          for (const draft of validDrafts) {
            count++;
            updateProgress({
              current: count,
              total: validDrafts.length,
              message: `Contabilizando comprobante N° ${draft.voucherNumber} (${count}/${validDrafts.length})`,
              stage: `${draft.type}: ${draft.gloss}`
            });

            const voucherData = {
              voucherNumber: draft.voucherNumber,
              date: draft.date,
              period: draft.period,
              type: draft.type,
              gloss: draft.gloss,
              lines: draft.lines,
              totalDebit: draft.totalDebit,
              totalCredit: draft.totalCredit,
              status: 'Valido',
              createdAt: new Date().toISOString()
            };

            await addDoc(collection(companyRef, 'vouchers'), voucherData);
          }
        }
      );

      setUploadSuccess(validDrafts.length);
      setParsedVouchers([]);
      setPastedData('');
      alert(`✅ Se cargaron y contabilizaron exitosamente ${validDrafts.length} comprobantes contables.`);
      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error batch uploading vouchers:', err);
      alert('Error en la carga masiva: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Carga Masiva de Comprobantes Contables</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Importación por lote de asientos contables desde planillas Excel / CSV con validación de partida doble ({company.name})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Descargar Plantilla CSV</span>
          </button>
        </div>
      </div>

      {/* Input / Paste Area */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-xs font-bold uppercase text-slate-700">
            Pegar Datos de Comprobantes (CSV / Excel):
          </label>
          <span className="text-[11px] text-slate-400">
            Separadores aceptados: punto y coma (;), tabulación o coma (,)
          </span>
        </div>

        <textarea
          rows={6}
          value={pastedData}
          onChange={(e) => setPastedData(e.target.value)}
          placeholder={`NumComprobante;Fecha;Tipo;GlosaComprobante;CodigoCuenta;Debe;Haber;RutAuxiliar;NombreAuxiliar;GlosaLinea;RefDTE\n1;2026-08-01;Ingreso;Aporte Inicial;1-1-01-02;5000000;0;;;Deposito Banco;\n1;2026-08-01;Ingreso;Aporte Inicial;3-1-01-01;0;5000000;;;Capital Pagado;\n2;2026-08-05;Egreso;Pago Arriendo;4-2-01-01;650000;0;76.123.456-7;INMOBILIARIA;Gasto Arriendo;Fac 102\n2;2026-08-05;Egreso;Pago Arriendo;1-1-01-02;0;650000;76.123.456-7;INMOBILIARIA;Egreso Banco;Fac 102`}
          className="w-full font-mono text-xs border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setPastedData('')}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
          >
            Limpiar
          </button>
          <button
            onClick={handleParseData}
            className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors"
          >
            Procesar y Validar Asientos
          </button>
        </div>
      </div>

      {/* PARSED PREVIEW */}
      {parsedVouchers.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase">
                Vista Previa de Comprobantes a Importar ({parsedVouchers.length} asientos)
              </h4>
              <span className="text-[11px] text-slate-500">
                {parsedVouchers.filter(v => v.isValid).length} válidos y cuadrados | {parsedVouchers.filter(v => !v.isValid).length} con errores
              </span>
            </div>

            <button
              onClick={handleBatchSave}
              disabled={loading || parsedVouchers.filter(v => v.isValid).length === 0}
              className={`px-5 py-2 text-xs font-black rounded-lg shadow-xs transition-colors ${
                loading || parsedVouchers.filter(v => v.isValid).length === 0
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {loading ? 'Guardando en Base de Datos...' : `Guardar ${parsedVouchers.filter(v => v.isValid).length} Comprobantes en Libros`}
            </button>
          </div>

          <div className="space-y-3">
            {parsedVouchers.map(v => (
              <div
                key={v.tempId}
                className={`p-3 rounded-lg border text-xs font-mono ${
                  v.isValid ? 'bg-slate-50 border-slate-200' : 'bg-rose-50 border-rose-300'
                }`}
              >
                <div className="flex justify-between items-center border-b pb-2 mb-2 font-sans">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-700">Comprobante N° {v.voucherNumber}</span>
                    <span className="text-slate-500">({v.date})</span>
                    <span className="px-2 py-0.2 bg-slate-200 text-slate-800 rounded text-[10px] font-bold uppercase">{v.type}</span>
                    <span className="text-slate-700 font-semibold truncate max-w-sm">{v.gloss}</span>
                  </div>

                  <div>
                    {v.isValid ? (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                        ✓ Cuadrado (${v.totalDebit.toLocaleString('es-CL')})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded font-bold text-[10px]">
                        ⚠️ {v.error}
                      </span>
                    )}
                  </div>
                </div>

                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="text-slate-500 font-bold border-b border-slate-200">
                      <th className="py-1 px-2">Código</th>
                      <th className="py-1 px-2">Nombre Cuenta</th>
                      <th className="py-1 px-2">Glosa Línea</th>
                      <th className="py-1 px-2 text-right">Debe ($)</th>
                      <th className="py-1 px-2 text-right">Haber ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {v.lines.map((l, lIdx) => (
                      <tr key={lIdx}>
                        <td className="py-1 px-2 font-bold text-slate-800">{l.accountCode}</td>
                        <td className="py-1 px-2 text-slate-700 font-sans">{l.accountName}</td>
                        <td className="py-1 px-2 text-slate-500 font-sans">{l.gloss}</td>
                        <td className="py-1 px-2 text-right text-emerald-700 font-bold">
                          {l.debit > 0 ? `$${l.debit.toLocaleString('es-CL')}` : '-'}
                        </td>
                        <td className="py-1 px-2 text-right text-rose-700 font-bold">
                          {l.credit > 0 ? `$${l.credit.toLocaleString('es-CL')}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
