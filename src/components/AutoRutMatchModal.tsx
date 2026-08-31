import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, setDoc, getDocs, query } from 'firebase/firestore';
import {
  BankStatementLine,
  ChartOfAccount,
  Voucher,
  VoucherLine,
  Auxiliary,
  RCVDocument,
  Company
} from '../types';
import { extractRutFromGloss, areRutsEqual, ExtractedRutInfo } from '../utils/rutMatcher';
import { sanitizeForFirestore } from '../utils/bankReconciliationUtils';
import { logAuditEvent } from '../utils/auditLogger';

export interface AutoRutMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  company: Company;
  statementLines: BankStatementLine[];
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  auxiliaries?: Auxiliary[];
  rcvDocuments?: RCVDocument[];
  selectedBankAccountId: string;
  selectedPeriod: string;
  onApplyMatches: (
    updatedStatementLines: BankStatementLine[],
    createdVouchersCount: number
  ) => void;
  onVouchersUpdated?: () => void;
}

export interface ProposedMatch {
  id: string;
  line: BankStatementLine;
  rutInfo: ExtractedRutInfo;
  type: 'ABONO' | 'CARGO'; // ABONO = Cobro de Cliente (Ingreso), CARGO = Pago a Proveedor (Egreso)
  amount: number;
  matchStatus: 'EXACTO_MONTO_Y_RUT' | 'MATCH_RUT_AUXILIAR' | 'RUT_DETECTADO';
  matchedDocument?: RCVDocument;
  matchedAuxiliary?: Auxiliary;
  targetAccountId: string;
  targetAccountName: string;
  docType: string;
  docNumber: string;
  dueDate: string;
  effectiveRut: string;
  selected: boolean;
}

export default function AutoRutMatchModal({
  isOpen,
  onClose,
  studyId,
  company,
  statementLines,
  accounts,
  vouchers,
  auxiliaries = [],
  rcvDocuments = [],
  selectedBankAccountId,
  selectedPeriod,
  onApplyMatches,
  onVouchersUpdated
}: AutoRutMatchModalProps) {
  if (!isOpen) return null;

  // Account Selection State
  const [collectionAccountId, setCollectionAccountId] = useState<string>(''); // Accounts for Abonos (e.g. Clientes)
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');       // Accounts for Cargos (e.g. Proveedores)
  const [bankAccountId, setBankAccountId] = useState<string>(selectedBankAccountId);

  // Settings & Theme
  const [themeMode, setThemeMode] = useState<'NUEZ_MARIPOSA' | 'MAZINGER_Z'>('NUEZ_MARIPOSA');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [matchResults, setMatchResults] = useState<ProposedMatch[]>([]);
  const [filterType, setFilterType] = useState<'TODOS' | 'SOLO_EXACTOS' | 'ABONOS' | 'CARGOS'>('TODOS');
  const [selectedCount, setSelectedCount] = useState<number>(0);

  // Auto-detect default accounts on mount
  useEffect(() => {
    // Try to find default "Clientes" account
    const defaultClientes = accounts.find(
      a => a.code === '1103001' || a.name.toLowerCase().includes('cliente')
    );
    if (defaultClientes) setCollectionAccountId(defaultClientes.id);
    else if (accounts.length > 0) setCollectionAccountId(accounts[0].id);

    // Try to find default "Proveedores" account
    const defaultProveedores = accounts.find(
      a => a.code === '2101001' || a.name.toLowerCase().includes('proveedor')
    );
    if (defaultProveedores) setPaymentAccountId(defaultProveedores.id);
    else if (accounts.length > 0) setPaymentAccountId(accounts[0].id);

    if (!bankAccountId && selectedBankAccountId) {
      setBankAccountId(selectedBankAccountId);
    }
  }, [accounts, selectedBankAccountId]);

  // Load saved configuration for this company from Firestore
  useEffect(() => {
    if (!studyId || !company?.id) return;
    const loadConfig = async () => {
      try {
        const configSnap = await getDocs(query(collection(db, `studies/${studyId}/companies/${company.id}/bankConfig`)));
        configSnap.forEach(d => {
          if (d.id === 'rutAutoMatchConfig') {
            const data = d.data();
            if (data.collectionAccountId) setCollectionAccountId(data.collectionAccountId);
            if (data.paymentAccountId) setPaymentAccountId(data.paymentAccountId);
          }
        });
      } catch (err) {
        console.warn('Config load info:', err);
      }
    };
    loadConfig();
  }, [studyId, company]);

  // Analyze Unconciliated Statement Lines & Propose Matches
  useEffect(() => {
    if (!statementLines || statementLines.length === 0) {
      setMatchResults([]);
      return;
    }

    const pendingLines = statementLines.filter(l => l.matchedStatus !== 'Conciliado');
    const proposals: ProposedMatch[] = [];

    pendingLines.forEach(line => {
      const gloss = line.description || '';
      const rutInfo = extractRutFromGloss(gloss);

      if (rutInfo) {
        const depositAmt = line.deposit || 0;
        const chargeAmt = line.charge || 0;
        const isAbono = depositAmt > 0;
        const amount = isAbono ? depositAmt : chargeAmt;
        const matchType: 'ABONO' | 'CARGO' = isAbono ? 'ABONO' : 'CARGO';

        // Search in Auxiliaries
        const matchedAux = auxiliaries.find(a => areRutsEqual(a.rut, rutInfo.rutFormatted));

        // Search in RCV Documents (Pending Invoices)
        const matchedDoc = rcvDocuments.find(d => {
          const docRut = d.tipoRegistro === 'Venta' ? d.rutReceptor : d.rutEmisor;
          const rutMatch = areRutsEqual(docRut, rutInfo.rutFormatted);
          const amountMatch = Math.abs(d.montoTotal - amount) < 1; // exact or rounded amount
          return rutMatch && (amountMatch || !d.estadoContabilizado);
        });

        // Determine target account
        let targetAccId = isAbono ? collectionAccountId : paymentAccountId;
        let targetAccName = accounts.find(a => a.id === targetAccId)?.name || (isAbono ? 'Clientes' : 'Proveedores');

        // Determine Match Quality
        let matchStatus: ProposedMatch['matchStatus'] = 'RUT_DETECTADO';
        if (matchedDoc && Math.abs(matchedDoc.montoTotal - amount) < 1) {
          matchStatus = 'EXACTO_MONTO_Y_RUT';
        } else if (matchedAux || matchedDoc) {
          matchStatus = 'MATCH_RUT_AUXILIAR';
        }

        // Determine effective RUT: use exact RUT from auxiliary if matched, else short format without dots
        const effectiveRut = matchedAux?.rut ||
                             matchedDoc?.rutEmisor ||
                             matchedDoc?.rutReceptor ||
                             rutInfo.rutShort;

        // Determine Document Metadata from RCV document if matched
        const docType = matchedDoc?.tipoDoc ? String(matchedDoc.tipoDoc) : '33';
        const docNumber = matchedDoc?.folio ? String(matchedDoc.folio) : (line.documentNumber || '');
        const dueDate = matchedDoc?.fechaVencimiento || matchedDoc?.fechaEmision || line.date;

        proposals.push({
          id: line.id,
          line,
          rutInfo,
          type: matchType,
          amount,
          matchStatus,
          matchedDocument: matchedDoc,
          matchedAuxiliary: matchedAux,
          targetAccountId: targetAccId,
          targetAccountName: targetAccName,
          docType,
          docNumber,
          dueDate,
          effectiveRut,
          selected: true
        });
      }
    });

    setMatchResults(proposals);
  }, [statementLines, auxiliaries, rcvDocuments, collectionAccountId, paymentAccountId, accounts]);

  // Update selection count
  useEffect(() => {
    setSelectedCount(matchResults.filter(m => m.selected).length);
  }, [matchResults]);

  // Save Config to Firestore
  const saveAccountConfig = async () => {
    if (!studyId || !company?.id) return;
    try {
      const configRef = doc(db, `studies/${studyId}/companies/${company.id}/bankConfig`, 'rutAutoMatchConfig');
      await setDoc(configRef, {
        collectionAccountId,
        paymentAccountId,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Error saving config:', e);
    }
  };

  // Toggle selection
  const toggleSelectAll = (checked: boolean) => {
    setMatchResults(prev => prev.map(m => ({ ...m, selected: checked })));
  };

  const toggleSelectOne = (id: string) => {
    setMatchResults(prev => prev.map(m => m.id === id ? { ...m, selected: !m.selected } : m));
  };

  // Filtered Match Results for rendering
  const filteredProposals = useMemo(() => {
    return matchResults.filter(m => {
      if (filterType === 'SOLO_EXACTOS') return m.matchStatus === 'EXACTO_MONTO_Y_RUT';
      if (filterType === 'ABONOS') return m.type === 'ABONO';
      if (filterType === 'CARGOS') return m.type === 'CARGO';
      return true;
    });
  }, [matchResults, filterType]);

  // Execute Automatic Voucher Creation & Reconciliation
  const handleExecuteAutoMatch = async () => {
    const selectedMatches = matchResults.filter(m => m.selected);
    if (selectedMatches.length === 0) {
      alert('⚠️ Seleccione al menos un movimiento para contabilizar y conciliar.');
      return;
    }

    if (!bankAccountId) {
      alert('⚠️ Por favor seleccione la Cuenta Bancaria para el asiento.');
      return;
    }

    setIsProcessing(true);
    await saveAccountConfig();

    try {
      const updatedLines = [...statementLines];
      let createdVouchers = 0;

      const bankAcc = accounts.find(a => a.id === bankAccountId);

      // Determine initial sequential voucherNumber from existing accounting vouchers
      let currentNextVoucherNumber = vouchers && vouchers.length > 0
        ? Math.max(...vouchers.map(v => Number(v.voucherNumber) || 0))
        : 0;

      for (const item of selectedMatches) {
        currentNextVoucherNumber++;
        const nextVoucherNum = currentNextVoucherNumber;

        const isAbono = item.type === 'ABONO';
        const voucherType: 'Ingreso' | 'Egreso' | 'Traspaso' = isAbono ? 'Ingreso' : 'Egreso';

        // Target Account (Clientes / Proveedores)
        const targetAcc = accounts.find(a => a.id === item.targetAccountId);
        const targetAccCode = targetAcc?.code || (isAbono ? '1103001' : '2101001');
        const targetAccNameStr = targetAcc?.name || (isAbono ? 'Clientes Nacionales' : 'Proveedores Nacionales');

        const entityName = item.matchedAuxiliary?.name ||
                           item.matchedDocument?.razonSocialEmisor ||
                           item.matchedDocument?.razonSocialReceptor ||
                           'PAGO/ABONO TEF';

        // Effective RUT: Use exact auxiliary RUT if matched, else short format without extra dots
        const auxRut = item.effectiveRut || item.matchedAuxiliary?.rut || item.rutInfo.rutShort;

        // Bank Document Ref: Use statement document number, or fallback to YYYYMM (e.g. 202601)
        const rawBankDoc = (item.line.documentNumber || '').trim();
        const periodDocRef = item.line.date
          ? item.line.date.replace(/-/g, '').slice(0, 6)
          : (selectedPeriod ? selectedPeriod.replace(/-/g, '') : '202601');
        const finalBankDocRef = rawBankDoc || periodDocRef;

        const glossText = `${isAbono ? 'Abono TEF Cliente' : 'Pago TEF Proveedor'} ${auxRut} ${entityName} (${item.line.description})`;

        // Build Voucher Lines
        const bankLine: VoucherLine = {
          id: `line-bank-${Date.now()}-${Math.random()}`,
          accountId: bankAccountId,
          accountCode: bankAcc?.code || '1102001',
          accountName: bankAcc?.name || 'Banco',
          debit: isAbono ? item.amount : 0,
          credit: isAbono ? 0 : item.amount,
          documentRef: finalBankDocRef,
          bankDocRef: finalBankDocRef,
          gloss: glossText
        };

        const auxLine: VoucherLine = {
          id: `line-aux-${Date.now()}-${Math.random()}`,
          accountId: item.targetAccountId,
          accountCode: targetAccCode,
          accountName: targetAccNameStr,
          debit: isAbono ? 0 : item.amount,
          credit: isAbono ? item.amount : 0,
          gloss: glossText,
          auxiliaryRut: auxRut,
          auxiliaryName: entityName,
          documentType: item.docType || '33',
          documentRef: item.docNumber || finalBankDocRef,
          dueDate: item.dueDate || item.line.date
        };

        const lines: VoucherLine[] = isAbono ? [bankLine, auxLine] : [auxLine, bankLine];

        const currentPeriodStr = selectedPeriod || item.line.date.slice(0, 7);

        // Create Voucher Record in Firestore with correct sequential voucherNumber
        const voucherData: Omit<Voucher, 'id'> = {
          voucherNumber: nextVoucherNum,
          date: item.line.date,
          period: currentPeriodStr,
          type: voucherType,
          status: 'Valido',
          gloss: glossText,
          lines,
          totalDebit: item.amount,
          totalCredit: item.amount,
          createdAt: new Date().toISOString()
        };

        const cleanVoucher = sanitizeForFirestore(voucherData);
        const voucherRef = await addDoc(
          collection(db, `studies/${studyId}/companies/${company.id}/vouchers`),
          cleanVoucher
        );

        createdVouchers++;

        // Update statement line as reconciled
        const lineIdx = updatedLines.findIndex(l => l.id === item.id);
        if (lineIdx !== -1) {
          updatedLines[lineIdx] = {
            ...updatedLines[lineIdx],
            matchedStatus: 'Conciliado',
            matchedVoucherId: voucherRef.id,
            matchedVoucherNumber: nextVoucherNum,
            matchedVoucherPeriod: currentPeriodStr
          };
        }
      }

      // Audit Log
      await logAuditEvent({
        studyId,
        companyId: company.id,
        companyName: company.name,
        action: 'CONTABILIZAR',
        module: 'CONCILIACION',
        details: `Se contabilizaron y concatenaron ${createdVouchers} movimientos de cartola bancaria por RUT (${themeMode}).`
      });

      // Trigger callback
      onApplyMatches(updatedLines, createdVouchers);
      if (onVouchersUpdated) onVouchersUpdated();

      alert(`🎉 ¡ÉXITO TOTAL!
--------------------------------------------------
✅ Comprobantes creados: ${createdVouchers}
✅ Movimientos conciliados en la cartola: ${createdVouchers}
🧠 Proceso de Inteligencia por RUT finalizado con aislamiento multiempresa.`);

      onClose();
    } catch (error: any) {
      console.error('Error in Auto RUT match:', error);
      alert(`⚠️ Ocurrió un error durante la contabilización: ${error.message || error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className={`bg-white rounded-2xl shadow-2xl max-w-5xl w-full border-2 overflow-hidden flex flex-col max-h-[92vh] ${
        themeMode === 'NUEZ_MARIPOSA' ? 'border-amber-400/80 shadow-amber-500/20' : 'border-rose-600/80 shadow-rose-600/20'
      }`}>
        
        {/* Animated Banner Header */}
        <div className={`p-4 sm:p-5 text-white relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-500 ${
          themeMode === 'NUEZ_MARIPOSA' 
            ? 'bg-gradient-to-r from-amber-900 via-amber-800 to-yellow-900' 
            : 'bg-gradient-to-r from-slate-950 via-rose-950 to-slate-900 border-b border-rose-500/40'
        }`}>
          <div className="flex items-center gap-3">
            
            {/* ICON: ANIMATED NUEZ MARIPOSA / CEREBRO or MAZINGER-Z */}
            {themeMode === 'NUEZ_MARIPOSA' ? (
              <div className="relative group cursor-pointer" title="Nuez Mariposa - Cerebro Inteligente de Cartolas">
                {/* Glowing pulsing aura */}
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full blur-md opacity-75 animate-pulse group-hover:opacity-100 transition"></div>
                <div className="relative w-12 h-12 bg-amber-950 border-2 border-yellow-400/80 rounded-2xl flex items-center justify-center text-2xl shadow-inner transform transition hover:scale-110 active:rotate-12">
                  {/* Custom Walnut Brain SVG */}
                  <svg className="w-8 h-8 text-yellow-400 animate-spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8 2 5 4.5 5 8c0 2 1 3.5 2.5 4.5C6 13.5 5 15 5 17c0 3 3 5 7 5s7-2 7-5c0-2-1-3.5-2.5-4.5C18 11.5 19 10 19 8c0-3.5-3-6-7-6z" fill="rgba(251, 191, 36, 0.15)" />
                    <path d="M12 2v20" strokeDasharray="2 2" className="animate-pulse" />
                    <path d="M7.5 8c1-.5 2.5 0 3 1s0 2.5-1 3" />
                    <path d="M16.5 8c-1-.5-2.5 0-3 1s0 2.5 1 3" />
                    <path d="M7.5 17c1 .5 2.5 0 3-1s0-2.5-1-3" />
                    <path d="M16.5 17c-1 .5-2.5 0-3-1s0-2.5 1-3" />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="relative group cursor-pointer" title="Robot Mazinger-Z Mode">
                <div className="absolute -inset-1 bg-gradient-to-r from-rose-600 to-red-500 rounded-full blur-md opacity-80 animate-ping"></div>
                <div className="relative w-12 h-12 bg-slate-900 border-2 border-rose-500 rounded-2xl flex items-center justify-center text-2xl shadow-inner transform transition hover:scale-110">
                  <span className="text-3xl animate-bounce">🤖</span>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-amber-200 uppercase flex items-center gap-1.5">
                  {themeMode === 'NUEZ_MARIPOSA' ? '🧠 Nuez Mariposa' : '🤖 Mazinger-Z'} Match & Contabilización Automática por RUT
                </h3>
                <span className="text-[10px] bg-amber-400 text-amber-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  FASE 1 ASISTIDA
                </span>
              </div>
              <p className="text-xs text-amber-100/80 mt-0.5">
                Escanea la cartola, extrae el RUT de las glosas bancarias (<code className="bg-black/30 px-1 py-0.2 rounded text-amber-300">0105559089</code> ➔ <code className="bg-black/30 px-1 py-0.2 rounded text-amber-300">10.555.908-9</code>), cruza con auxiliares/facturas y contabiliza.
              </p>
            </div>
          </div>

          {/* Theme Switcher Toggle (Nuez Mariposa vs Mazinger Z) */}
          <div className="flex items-center gap-2 self-end sm:self-auto bg-black/40 p-1 rounded-xl border border-white/20">
            <button
              onClick={() => setThemeMode('NUEZ_MARIPOSA')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                themeMode === 'NUEZ_MARIPOSA' 
                  ? 'bg-amber-400 text-amber-950 shadow-md scale-105' 
                  : 'text-amber-200 hover:text-white'
              }`}
            >
              <span>🧠 Nuez Mariposa</span>
            </button>
            <button
              onClick={() => setThemeMode('MAZINGER_Z')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                themeMode === 'MAZINGER_Z' 
                  ? 'bg-rose-600 text-white shadow-md scale-105' 
                  : 'text-rose-200 hover:text-white'
              }`}
            >
              <span>🤖 Mazinger-Z</span>
            </button>
            <button 
              onClick={onClose}
              className="ml-2 text-amber-200/70 hover:text-white font-bold text-xl px-2"
              title="Cerrar ventana"
            >
              ✕
            </button>
          </div>

        </div>

        {/* Configuration Panel (Cuentas objetivo por defecto) */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
              <span>📥 Cta. Cobro Clientes (Abonos):</span>
            </label>
            <select
              value={collectionAccountId}
              onChange={e => setCollectionAccountId(e.target.value)}
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-500"
            >
              <option value="">-- Seleccionar Cuenta de Clientes --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
              <span>📤 Cta. Pago Proveedores (Cargos):</span>
            </label>
            <select
              value={paymentAccountId}
              onChange={e => setPaymentAccountId(e.target.value)}
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-500"
            >
              <option value="">-- Seleccionar Cuenta de Proveedores --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
              <span>🏦 Cta. Banco para Asiento:</span>
            </label>
            <select
              value={bankAccountId}
              onChange={e => setBankAccountId(e.target.value)}
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-500"
            >
              <option value="">-- Seleccionar Cuenta Bancaria --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Bar & Filter Controls */}
        <div className="bg-amber-50/60 p-3 border-b border-amber-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-amber-950 uppercase">Filtrar:</span>
            <button
              onClick={() => setFilterType('TODOS')}
              className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition ${
                filterType === 'TODOS' ? 'bg-amber-800 text-white border-amber-900' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              Todos ({matchResults.length})
            </button>
            <button
              onClick={() => setFilterType('SOLO_EXACTOS')}
              className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition ${
                filterType === 'SOLO_EXACTOS' ? 'bg-emerald-700 text-white border-emerald-800' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              ✨ Exactos RUT + Monto ({matchResults.filter(m => m.matchStatus === 'EXACTO_MONTO_Y_RUT').length})
            </button>
            <button
              onClick={() => setFilterType('ABONOS')}
              className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition ${
                filterType === 'ABONOS' ? 'bg-indigo-700 text-white border-indigo-800' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              📥 Solo Abonos (Ingresos)
            </button>
            <button
              onClick={() => setFilterType('CARGOS')}
              className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition ${
                filterType === 'CARGOS' ? 'bg-rose-700 text-white border-rose-800' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              📤 Solo Cargos (Egresos)
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCount > 0 && selectedCount === matchResults.length}
                onChange={e => toggleSelectAll(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
              />
              <span>Seleccionar Todos ({selectedCount})</span>
            </label>
          </div>
        </div>

        {/* Results Table */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredProposals.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              <span className="text-4xl block mb-2">🔍</span>
              <p className="text-sm font-bold text-slate-700">
                No se encontraron movimientos no conciliados con RUTs detectables en la glosa.
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Asegúrese de haber cargado la cartola bancaria. El motor escanea números con patrones como <code className="bg-slate-200 px-1 rounded">0105559089</code> o <code className="bg-slate-200 px-1 rounded">076123456K</code> en el detalle de la transferencia.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 text-center w-10">Sel.</th>
                    <th className="p-2.5">Fecha</th>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5">Glosa Bancaria Original</th>
                    <th className="p-2.5">RUT Detectado / Entidad</th>
                    <th className="p-2.5 text-right">Monto ($)</th>
                    <th className="p-2.5">Coincidencia / Documento</th>
                    <th className="p-2.5">Cuenta Asignada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredProposals.map((item) => {
                    const isExact = item.matchStatus === 'EXACTO_MONTO_Y_RUT';
                    return (
                      <tr 
                        key={item.id}
                        className={`hover:bg-amber-50/50 transition ${
                          item.selected ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleSelectOne(item.id)}
                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-2.5 font-bold text-slate-800 whitespace-nowrap">
                          {item.line.date}
                        </td>
                        <td className="p-2.5">
                          {item.type === 'ABONO' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ABONO
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                              CARGO
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-700 max-w-xs truncate" title={item.line.description}>
                          <span className="font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200 text-[11px]">
                            {item.line.description}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono font-black border border-amber-300">
                              {item.effectiveRut || item.rutInfo.rutFormatted}
                            </span>
                          </div>
                          {(item.matchedAuxiliary || item.matchedDocument) && (
                            <div className="text-[11px] text-slate-600 font-medium truncate max-w-xs mt-0.5">
                              {item.matchedAuxiliary?.name || item.matchedDocument?.razonSocialEmisor || item.matchedDocument?.razonSocialReceptor}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-black font-mono text-slate-900 text-sm">
                          ${item.amount.toLocaleString('es-CL')}
                        </td>
                        <td className="p-2.5">
                          {isExact ? (
                            <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-fit">
                              <span>✨</span> Exacto ({item.docType ? `Tipo ${item.docType} ` : ''}N° {item.docNumber})
                            </span>
                          ) : item.matchedAuxiliary ? (
                            <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-300 flex items-center gap-1 w-fit">
                              <span>👤</span> Auxiliar Encontrado {item.docNumber ? `(Doc N° ${item.docNumber})` : ''}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1 w-fit">
                              <span>📄</span> Pago por RUT {item.docNumber ? `(Doc N° ${item.docNumber})` : ''}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-semibold text-slate-800">
                          {item.targetAccountName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="text-xs text-slate-600 font-medium">
            Seleccionados: <strong className="text-slate-900 font-bold">{selectedCount}</strong> de {matchResults.length} movimientos.
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition w-full sm:w-auto"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleExecuteAutoMatch}
              disabled={isProcessing || selectedCount === 0}
              className={`px-5 py-2.5 text-xs font-black rounded-xl text-white shadow-lg transition flex items-center justify-center gap-2 w-full sm:w-auto ${
                themeMode === 'NUEZ_MARIPOSA'
                  ? 'bg-gradient-to-r from-amber-600 via-amber-700 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 shadow-amber-500/30'
                  : 'bg-gradient-to-r from-rose-600 via-red-600 to-slate-900 hover:from-rose-700 hover:to-slate-950 shadow-rose-600/30'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isProcessing ? (
                <>
                  <span className="animate-spin text-base">⏳</span>
                  <span>Generando Comprobantes y Conciliando...</span>
                </>
              ) : (
                <>
                  {themeMode === 'NUEZ_MARIPOSA' ? (
                    <span className="text-base animate-pulse">🧠</span>
                  ) : (
                    <span className="text-base animate-bounce">🤖</span>
                  )}
                  <span>Contabilizar y Conciliar {selectedCount} Movimientos</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
