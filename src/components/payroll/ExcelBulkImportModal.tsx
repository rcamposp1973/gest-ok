import React, { useState, useMemo } from 'react';
import { Employee, PayrollConcept } from '../../types';
import { 
  X, FileSpreadsheet, Upload, Download, CheckCircle2, AlertTriangle, 
  Copy, RefreshCw, Layers, ArrowRight, HelpCircle 
} from 'lucide-react';

interface ExcelBulkImportModalProps {
  periodStr: string;
  employees: Employee[];
  concepts: PayrollConcept[];
  isOpen: boolean;
  onClose: () => void;
  onApply: (bulkData: Record<string, Record<string, number>>) => void;
}

interface ParsedEntry {
  rawRut: string;
  employeeId?: string;
  employeeName?: string;
  conceptCode: string;
  conceptName?: string;
  conceptType?: string;
  amount: number;
  isValid: boolean;
  error?: string;
}

export const ExcelBulkImportModal: React.FC<ExcelBulkImportModalProps> = ({
  periodStr,
  employees,
  concepts,
  isOpen,
  onClose,
  onApply
}) => {
  const [inputText, setInputText] = useState('');
  const [notification, setNotification] = useState('');

  if (!isOpen) return null;

  // Normalizador de RUT para matching exacto
  const cleanRut = (rut: string) => rut.replace(/[^0-9Kk]/g, '').toUpperCase();

  // Empleados indexados por RUT limpio
  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(cleanRut(emp.rut), emp);
    }
    return map;
  }, [employees]);

  // Conceptos indexados por Código en mayúsculas
  const conceptMap = useMemo(() => {
    const map = new Map<string, PayrollConcept>();
    for (const c of concepts) {
      map.set(c.code.toUpperCase(), c);
    }
    return map;
  }, [concepts]);

  // Parser inteligente de texto tabulado (detecta Formato Matriz o Formato 3 Columnas)
  const parsedEntries: ParsedEntry[] = useMemo(() => {
    if (!inputText.trim()) return [];

    const lines = inputText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    const entries: ParsedEntry[] = [];

    // Revisar la primera línea para detectar si es formato Matriz (RUT \t CONCEPTO_1 \t CONCEPTO_2...)
    const firstLineCols = lines[0].split(/[\t;,]/).map(c => c.trim());
    const isMatrixHeader = firstLineCols.some(col => conceptMap.has(col.toUpperCase()));

    if (isMatrixHeader) {
      // FORMATO MATRIZ: Fila 1 tiene códigos de conceptos
      const headerConceptCodes = firstLineCols.slice(1); // Omitimos primera columna que es RUT/Nombre
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/[\t;,]/).map(c => c.trim());
        if (cols.length < 2) continue;
        const rutStr = cols[0];
        const cRut = cleanRut(rutStr);
        const emp = employeeMap.get(cRut);

        for (let colIdx = 1; colIdx < cols.length; colIdx++) {
          const conceptCode = (headerConceptCodes[colIdx - 1] || '').toUpperCase();
          if (!conceptCode) continue;

          const rawAmountStr = cols[colIdx].replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.').trim();
          const amount = parseFloat(rawAmountStr) || 0;
          if (amount === 0) continue; // Si es 0 no es necesario crear entrada

          const concept = conceptMap.get(conceptCode);
          entries.push({
            rawRut: rutStr,
            employeeId: emp?.id,
            employeeName: emp?.name,
            conceptCode,
            conceptName: concept?.name,
            conceptType: concept?.type,
            amount,
            isValid: Boolean(emp && concept),
            error: !emp ? 'RUT no encontrado en la empresa' : (!concept ? `Concepto ${conceptCode} no existe` : undefined)
          });
        }
      }
    } else {
      // FORMATO LISTA: RUT [TAB] CODIGO_CONCEPTO [TAB] MONTO
      for (const line of lines) {
        // Ignorar encabezados como "RUT", "CONCEPTO", etc.
        const upper = line.toUpperCase();
        if (upper.includes('RUT') && (upper.includes('CONCEPTO') || upper.includes('MONTO') || upper.includes('CODIGO'))) {
          continue;
        }

        const cols = line.split(/[\t;,]/).map(c => c.trim());
        if (cols.length < 2) continue;

        const rutStr = cols[0];
        const conceptCode = (cols[1] || '').toUpperCase();
        const rawAmountStr = (cols[2] || cols[cols.length - 1] || '0').replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.').trim();
        const amount = parseFloat(rawAmountStr) || 0;

        const cRut = cleanRut(rutStr);
        const emp = employeeMap.get(cRut);
        const concept = conceptMap.get(conceptCode);

        entries.push({
          rawRut: rutStr,
          employeeId: emp?.id,
          employeeName: emp?.name,
          conceptCode,
          conceptName: concept?.name,
          conceptType: concept?.type,
          amount,
          isValid: Boolean(emp && concept && amount > 0),
          error: !emp 
            ? 'RUT no encontrado en la empresa' 
            : (!concept 
              ? `Concepto "${conceptCode}" no existe en la configuración` 
              : (amount <= 0 ? 'Monto debe ser mayor a 0' : undefined))
        });
      }
    }

    return entries;
  }, [inputText, employeeMap, conceptMap]);

  const validEntries = parsedEntries.filter(e => e.isValid);
  const invalidEntries = parsedEntries.filter(e => !e.isValid);
  const totalAmountToApply = validEntries.reduce((sum, e) => sum + e.amount, 0);

  // Descargar plantilla Excel / CSV tabulada
  const handleDownloadTemplate = () => {
    const activeEmployees = employees.filter(e => e.active);
    const availableCodes = concepts.map(c => c.code);

    // Formato Matriz: RUT \t NOMBRE \t CODIGO1 \t CODIGO2...
    const header = ['RUT', 'NOMBRE', ...availableCodes].join('\t');
    const rows = activeEmployees.map(emp => {
      const zeros = availableCodes.map(() => '0').join('\t');
      return `${emp.rut}\t${emp.name}\t${zeros}`;
    });

    const tsvContent = [header, ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + tsvContent], { type: 'text/tab-separated-values;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Plantilla_Haberes_${periodStr}.tsv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Cargar ejemplo rápido
  const handleLoadExample = () => {
    if (employees.length === 0 || concepts.length === 0) return;
    const emp1 = employees[0];
    const emp2 = employees[1] || employees[0];
    const c1 = concepts[0]?.code || 'BONO_PROD';
    const c2 = concepts[1]?.code || concepts[0]?.code || 'VIATICO_FAENA';

    const sample = `${emp1.rut}\t${c1}\t250000\n${emp1.rut}\t${c2}\t85000\n${emp2.rut}\t${c1}\t180000`;
    setInputText(sample);
  };

  // Aplicar a la nómina activa
  const handleApply = () => {
    if (validEntries.length === 0) {
      alert('No hay registros válidos para aplicar.');
      return;
    }

    // Estructura: employeeId -> { conceptCode: amount }
    const result: Record<string, Record<string, number>> = {};
    for (const entry of validEntries) {
      if (!entry.employeeId) continue;
      if (!result[entry.employeeId]) {
        result[entry.employeeId] = {};
      }
      result[entry.employeeId][entry.conceptCode] = (result[entry.employeeId][entry.conceptCode] || 0) + entry.amount;
    }

    onApply(result);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl text-white">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-tight">
                Carga Masiva de Haberes por Excel Tabulado
              </h2>
              <p className="text-xs text-slate-300">
                Imputación trabajador por trabajador y concepto por concepto para el período <strong className="text-amber-300 font-mono">{periodStr}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar con instrucciones y botones */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-1.5 font-bold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl shadow-2xs flex items-center gap-1.5 transition-colors"
              title="Descargar archivo con los RUTs y conceptos configurados de la empresa"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              Descargar Plantilla Tabulada
            </button>
            <button
              type="button"
              onClick={handleLoadExample}
              className="px-3 py-1.5 font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cargar Ejemplo
            </button>
          </div>

          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
            <span>Copie las celdas en Excel y péguelas directamente en el recuadro inferior</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Textarea para pegar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800">
                Pegar Celdas de Excel / Google Sheets (Tabulado):
              </label>
              <span className="text-[11px] font-mono text-slate-500">
                Formato: RUT [TAB] CÓDIGO_CONCEPTO [TAB] MONTO
              </span>
            </div>
            <textarea
              rows={5}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="12345678-9&#9;BONO_PROD&#9;250000&#10;12345678-9&#9;VIATICO_FAENA&#9;80000&#10;9876543-2&#9;COM_VTAS&#9;420000"
              className="w-full p-3 font-mono text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          {/* Resumen de Validación */}
          {parsedEntries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Registros Válidos</span>
                  <span className="text-xl font-bold font-mono text-emerald-700">{validEntries.length}</span>
                </div>
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>

              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">Con Errores</span>
                  <span className="text-xl font-bold font-mono text-rose-700">{invalidEntries.length}</span>
                </div>
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">Total Montos a Imputar</span>
                  <span className="text-lg font-bold font-mono text-indigo-900">${totalAmountToApply.toLocaleString('es-CL')}</span>
                </div>
                <Layers className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          )}

          {/* Tabla de Previsualización */}
          {parsedEntries.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="bg-slate-100 px-4 py-2 text-xs font-bold text-slate-800 border-b border-slate-200 flex items-center justify-between">
                <span>Vista Previa de Validación ({parsedEntries.length} filas procesadas)</span>
                <span className="text-[11px] font-normal text-slate-500">Sólo las filas válidas serán imputadas al mes</span>
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0 text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-3">Estado</th>
                      <th className="py-2 px-3">RUT</th>
                      <th className="py-2 px-3">Trabajador</th>
                      <th className="py-2 px-3">Concepto</th>
                      <th className="py-2 px-3 text-right">Monto ($ CLP)</th>
                      <th className="py-2 px-3">Observación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedEntries.map((item, idx) => (
                      <tr key={idx} className={item.isValid ? 'hover:bg-emerald-50/40' : 'bg-rose-50/60'}>
                        <td className="py-2 px-3">
                          {item.isValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Válido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[11px]">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              Error
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                          {item.rawRut}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {item.employeeName || <span className="text-rose-500 italic">No reconocido</span>}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                            {item.conceptCode}
                          </span>
                          {item.conceptName && (
                            <span className="text-slate-500 ml-1.5 text-[11px]">({item.conceptName})</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          ${item.amount.toLocaleString('es-CL')}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-600">
                          {item.error ? (
                            <span className="text-rose-600 font-semibold">{item.error}</span>
                          ) : (
                            <span className="text-emerald-700">Listo para imputar</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Guía Rápida de Conceptos Disponibles */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-700 block mb-1.5">
              Códigos de Conceptos Habilitados en la Empresa:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {concepts.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setInputText(prev => prev + (prev ? '\n' : '') + `12.345.678-9\t${c.code}\t100000`)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded-md font-mono text-[11px] text-indigo-700 hover:bg-indigo-50 transition-colors"
                  title={`${c.name} (${c.type})`}
                >
                  +{c.code}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={validEntries.length === 0}
            className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <ArrowRight className="w-4 h-4" />
            Imputar y Aplicar {validEntries.length} Haberes a la Nómina de {periodStr}
          </button>
        </div>
      </div>
    </div>
  );
};
