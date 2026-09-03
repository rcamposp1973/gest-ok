import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  KNOWN_CHILEAN_BANKS,
  BankCartolaParsedResult,
  parseBankCartola
} from '../utils/bankCartolaParser';
import { BankStatementLine, ChartOfAccount } from '../types';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Copy, ShieldAlert, ArrowRight, RefreshCw } from 'lucide-react';

interface BankCartolaSmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBankAccount: ChartOfAccount | undefined;
  selectedPeriod: string;
  existingLines: BankStatementLine[];
  currentInitialBalance: number;
  onImportComplete: (result: {
    newLines: BankStatementLine[];
    initialBalance: number;
    finalBalance: number;
    bankName: string;
  }) => void;
}

export default function BankCartolaSmartImportModal({
  isOpen,
  onClose,
  selectedBankAccount,
  selectedPeriod,
  existingLines,
  currentInitialBalance,
  onImportComplete
}: BankCartolaSmartImportModalProps) {
  const [bankTemplateId, setBankTemplateId] = useState<string>('AUTO');
  const [activeTab, setActiveTab] = useState<'EXCEL' | 'PASTE'>('EXCEL');
  const [pastedText, setPastedText] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [customInitialBal, setCustomInitialBal] = useState<number>(currentInitialBalance || 0);

  const [parsedPreview, setParsedPreview] = useState<BankCartolaParsedResult | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setIsProcessing(true);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawMatrix: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        const result = parseBankCartola(
          rawMatrix,
          selectedPeriod,
          bankTemplateId,
          existingLines,
          customInitialBal
        );

        setParsedPreview(result);
        if (result.previousBalance !== customInitialBal) {
          setCustomInitialBal(result.previousBalance);
        }
      } catch (err: any) {
        console.error('Error al parsear archivo Excel de cartola:', err);
        setParseError('No se pudo leer el archivo Excel: ' + (err.message || 'Formato no soportado'));
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleParsePastedText = () => {
    if (!pastedText.trim()) {
      setParseError('Pegue el texto o tabla de la cartola antes de procesar.');
      return;
    }

    setIsProcessing(true);
    setParseError(null);

    try {
      const rows = pastedText.trim().split('\n').map(row => {
        return row.split(/[\t;|,]/).map(c => c.trim().replace(/^"|"$/g, ''));
      });

      const result = parseBankCartola(
        rows,
        selectedPeriod,
        bankTemplateId,
        existingLines,
        customInitialBal
      );

      setParsedPreview(result);
      if (result.previousBalance !== customInitialBal) {
        setCustomInitialBal(result.previousBalance);
      }
    } catch (err: any) {
      console.error('Error parsing pasted cartola:', err);
      setParseError('Error al interpretar los datos pegados: ' + (err.message || 'Formato inválido'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (!parsedPreview) return;

    if (parsedPreview.newLines.length === 0 && parsedPreview.duplicateCount > 0) {
      alert(`⚠️ Todos los movimientos detectados (${parsedPreview.duplicateCount}) ya se encuentran registrados en la cartola de este período. No se agregaron duplicados.`);
      onClose();
      return;
    }

    onImportComplete({
      newLines: parsedPreview.newLines,
      initialBalance: parsedPreview.previousBalance,
      finalBalance: parsedPreview.calculatedFinalBalance,
      bankName: parsedPreview.detectedBank
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 space-y-5 my-auto max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
              <span>Lectura Inteligente de Cartolas Bancarias</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cuenta: <span className="font-bold text-slate-800">{selectedBankAccount?.name} ({selectedBankAccount?.code})</span> | Período: <span className="font-bold text-indigo-700">{selectedPeriod}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold text-xl px-2 py-0.5 rounded-lg hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              🏦 Banco Emisor de la Cartola:
            </label>
            <select
              value={bankTemplateId}
              onChange={(e) => setBankTemplateId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {KNOWN_CHILEAN_BANKS.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">
              * El motor analiza el formato original del banco sin alterar tus archivos.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              💰 Saldo Anterior / Inicial ($):
            </label>
            <input
              type="number"
              value={customInitialBal}
              onChange={(e) => setCustomInitialBal(Number(e.target.value))}
              placeholder="0"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono font-bold text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Punto de partida acumulativo. Se autocalculará si viene indicado en la cartola.
            </p>
          </div>
        </div>

        {/* Tabs: File vs Paste */}
        <div className="flex border-b border-slate-200 gap-2">
          <button
            onClick={() => setActiveTab('EXCEL')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'EXCEL'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Cargar Archivo Excel / CSV Oficial</span>
          </button>
          <button
            onClick={() => setActiveTab('PASTE')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'PASTE'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Copy className="w-4 h-4" />
            <span>Pegar Texto / Tabla Copiada</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="space-y-4">
          {activeTab === 'EXCEL' && (
            <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/20 rounded-2xl p-6 text-center transition-all">
              <input
                type="file"
                id="cartola-file-input"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="cartola-file-input"
                className="cursor-pointer flex flex-col items-center justify-center space-y-2"
              >
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shadow-xs">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-sm font-bold text-indigo-900 block">
                    {selectedFileName || 'Haga clic para seleccionar o arrastrar la Cartola (Excel / CSV)'}
                  </span>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    Formatos admitidos: .xlsx, .xls, .csv de cualquier banco chileno
                  </span>
                </div>
              </label>
            </div>
          )}

          {activeTab === 'PASTE' && (
            <div className="space-y-2">
              <textarea
                rows={5}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Copie y pegue aquí los movimientos desde la web del banco o su planilla Excel..."
                className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleParsePastedText}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Analizar Texto Pegado</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {parseError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Parsed Summary & Validation Card */}
        {parsedPreview && (
          <div className="flex-1 overflow-y-auto space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-slate-900">
                  Cartola Reconocida: <span className="text-indigo-700">{parsedPreview.detectedBank}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                  +{parsedPreview.newLines.length} nuevos a inyectar
                </span>
                {parsedPreview.duplicateCount > 0 && (
                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                    {parsedPreview.duplicateCount} omitidos (duplicados)
                  </span>
                )}
              </div>
            </div>

            {/* Financial Reconciliation Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Saldo Anterior</span>
                <span className="font-mono font-bold text-slate-800 text-xs">
                  ${parsedPreview.previousBalance.toLocaleString('es-CL')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Abonos (+)</span>
                <span className="font-mono font-bold text-emerald-600 text-xs">
                  +${parsedPreview.totalDeposits.toLocaleString('es-CL')} ({parsedPreview.depositsCount})
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Cargos (-)</span>
                <span className="font-mono font-bold text-rose-600 text-xs">
                  -${parsedPreview.totalCharges.toLocaleString('es-CL')} ({parsedPreview.chargesCount})
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Saldo Final Cartola</span>
                <span className="font-mono font-black text-indigo-900 text-xs">
                  ${parsedPreview.calculatedFinalBalance.toLocaleString('es-CL')}
                </span>
              </div>
            </div>

            {/* Balance check alert */}
            {parsedPreview.isBalanceConsistent ? (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-[11px] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <strong>Saldos Cuadrados:</strong> El saldo final coincide exactamente con la secuencia matemática de cargos y abonos.
                </span>
              </div>
            ) : (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <strong>Aviso de Cuadratura:</strong> Saldo informado (${parsedPreview.finalBalance.toLocaleString('es-CL')}) difiere del acumulado calculado (${parsedPreview.calculatedFinalBalance.toLocaleString('es-CL')}). Se adoptará el saldo progresivo continuo.
                </span>
              </div>
            )}

            {/* Preview of rows */}
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-slate-100 sticky top-0 border-b border-slate-200 text-slate-700">
                  <tr>
                    <th className="p-2 font-bold">Fecha</th>
                    <th className="p-2 font-bold">Descripción</th>
                    <th className="p-2 font-bold">N° Doc</th>
                    <th className="p-2 font-bold text-right text-rose-600">Cargo (-)</th>
                    <th className="p-2 font-bold text-right text-emerald-600">Abono (+)</th>
                    <th className="p-2 font-bold text-right font-mono">Saldo Progresivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {parsedPreview.newLines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 text-slate-700 whitespace-nowrap">{line.date}</td>
                      <td className="p-2 text-slate-900 font-sans truncate max-w-xs">{line.description}</td>
                      <td className="p-2 text-slate-500">{line.documentNumber || '-'}</td>
                      <td className="p-2 text-right text-rose-600">{line.charge > 0 ? `$${line.charge.toLocaleString('es-CL')}` : '-'}</td>
                      <td className="p-2 text-right text-emerald-600">{line.deposit > 0 ? `$${line.deposit.toLocaleString('es-CL')}` : '-'}</td>
                      <td className="p-2 text-right font-bold text-slate-900">${(line.balance || 0).toLocaleString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
          >
            Cancelar
          </button>
          
          <button
            onClick={handleConfirmImport}
            disabled={!parsedPreview || (parsedPreview.newLines.length === 0 && parsedPreview.duplicateCount === 0)}
            className={`px-6 py-2.5 rounded-xl text-xs font-black text-white shadow-sm flex items-center gap-2 transition-all ${
              parsedPreview && (parsedPreview.newLines.length > 0 || parsedPreview.duplicateCount > 0)
                ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            <span>Inyectar Movimientos a la Cartola</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
