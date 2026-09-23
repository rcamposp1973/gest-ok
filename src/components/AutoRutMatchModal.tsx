import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, setDoc, getDocs, updateDoc, query } from 'firebase/firestore';
import {
  BankStatementLine,
  ChartOfAccount,
  Voucher,
  VoucherLine,
  Auxiliary,
  RCVDocument,
  Company,
  FiscalPeriodYear
} from '../types';
import { extractRutFromGloss, areRutsEqual, ExtractedRutInfo } from '../utils/rutMatcher';
import { sanitizeForFirestore } from '../utils/bankReconciliationUtils';
import { logAuditEvent } from '../utils/auditLogger';
import { getNextOpenPeriodAndDate, checkIsPeriodClosed } from '../utils/periodUtils';
import { useDraggableModal } from '../hooks/useDraggableModal';
import { Move } from 'lucide-react';

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
  fiscalYears?: FiscalPeriodYear[];
  onApplyMatches: (
    updatedStatementLines: BankStatementLine[],
    createdVouchersCount: number
  ) => void;
  onVouchersUpdated?: () => void;
}

export interface LearnedRutRule {
  rut: string;
  entityName: string;
  type: 'ABONO' | 'CARGO';
  targetAccountId: string;
  targetAccountCode: string;
  targetAccountName: string;
  isHonorario?: boolean;
  timesApplied: number;
  lastUpdated: string;
}

export interface ProposedMatch {
  id: string;
  line: BankStatementLine;
  rutInfo: ExtractedRutInfo;
  type: 'ABONO' | 'CARGO'; // ABONO = Cobro de Cliente (Ingreso), CARGO = Pago a Proveedor / Honorario (Egreso)
  amount: number;
  matchStatus: 'EXACTO_MONTO_Y_RUT' | 'DIFERENCIA_MENOR_10_PENDIENTE' | 'MATCH_RUT_AUXILIAR' | 'APRENDIDO_POR_JUNIOR' | 'RUT_DETECTADO';
  differenceAmount?: number; // Para alertar diferencias menores a 10 pesos
  matchedDocument?: RCVDocument;
  matchedAuxiliary?: Auxiliary;
  isHonorario?: boolean;
  isJuniorLearned?: boolean;
  targetAccountId: string;
  targetAccountName: string;
  targetAccountCode: string;
  docType: string;
  docNumber: string;
  dueDate: string;
  effectiveRut: string;
  entityName: string;
  originalDate: string;
  effectiveDate: string;
  effectivePeriod: string;
  isPeriodShifted: boolean;
  selected: boolean;
}

export default function AutoRutMatchModal(props: AutoRutMatchModalProps) {
  if (!props.isOpen) return null;
  return <AutoRutMatchModalContent {...props} />;
}

function AutoRutMatchModalContent({
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
  fiscalYears = [],
  onApplyMatches,
  onVouchersUpdated
}: AutoRutMatchModalProps) {
  // Account Selection State
  const [collectionAccountId, setCollectionAccountId] = useState<string>(''); // Abonos: Clientes
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');       // Cargos: Proveedores
  const [honorariosAccountId, setHonorariosAccountId] = useState<string>(''); // Cargos: Honorarios por Pagar
  const [bankAccountId, setBankAccountId] = useState<string>(selectedBankAccountId);

  // Settings & Theme
  const [themeMode, setThemeMode] = useState<'NUEZ_MARIPOSA' | 'MAZINGER_Z'>('NUEZ_MARIPOSA');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [matchResults, setMatchResults] = useState<ProposedMatch[]>([]);
  const [filterType, setFilterType] = useState<'TODOS' | 'SOLO_EXACTOS' | 'DIFERENCIAS_MENORES' | 'ABONOS' | 'CARGOS' | 'HONORARIOS'>('TODOS');
  const [selectedCount, setSelectedCount] = useState<number>(0);
  const [learnedRules, setLearnedRules] = useState<Record<string, LearnedRutRule>>({});

  // Auto-detect default accounts on mount
  useEffect(() => {
    // 1. Clientes (Abonos)
    const defaultClientes = accounts.find(
      a => a.code === '1103001' || a.name.toLowerCase().includes('cliente')
    );
    if (defaultClientes) setCollectionAccountId(defaultClientes.id);
    else if (accounts.length > 0 && !collectionAccountId) setCollectionAccountId(accounts[0].id);

    // 2. Proveedores (Cargos Compras)
    const defaultProveedores = accounts.find(
      a => a.code === '2101001' || a.name.toLowerCase().includes('proveedor')
    );
    if (defaultProveedores) setPaymentAccountId(defaultProveedores.id);
    else if (accounts.length > 0 && !paymentAccountId) setPaymentAccountId(accounts[0].id);

    // 3. Honorarios por Pagar (Cargos BHE / Servicios)
    const defaultHonorarios = accounts.find(
      a => a.code === '2102001' || a.code === '2101002' || a.name.toLowerCase().includes('honorario') || a.name.toLowerCase().includes('retencion')
    );
    if (defaultHonorarios) setHonorariosAccountId(defaultHonorarios.id);
    else if (defaultProveedores) setHonorariosAccountId(defaultProveedores.id);

    if (!bankAccountId && selectedBankAccountId) {
      setBankAccountId(selectedBankAccountId);
    }
  }, [accounts, selectedBankAccountId]);

  // Load saved configuration and Junior's learned RUT memory from Firestore
  useEffect(() => {
    if (!studyId || !company?.id) return;
    const loadConfigAndMemory = async () => {
      try {
        const configSnap = await getDocs(query(collection(db, `studies/${studyId}/companies/${company.id}/bankConfig`)));
        configSnap.forEach(d => {
          if (d.id === 'rutAutoMatchConfig') {
            const data = d.data();
            if (data.collectionAccountId) setCollectionAccountId(data.collectionAccountId);
            if (data.paymentAccountId) setPaymentAccountId(data.paymentAccountId);
            if (data.honorariosAccountId) setHonorariosAccountId(data.honorariosAccountId);
          }
          if (d.id === 'rutLearnedRules') {
            const rulesData = d.data() as Record<string, LearnedRutRule>;
            setLearnedRules(rulesData || {});
          }
        });
      } catch (err) {
        console.warn('Config load info:', err);
      }
    };
    loadConfigAndMemory();
  }, [studyId, company]);

  // Analyze Unconciliated Statement Lines & Propose Matches (La Nuez Intelligence Engine)
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

        // Check Junior's learned memory first
        const learnedRule = learnedRules[rutInfo.rutClean] || learnedRules[rutInfo.rutShort];

        // Search in Auxiliaries
        const matchedAux = auxiliaries.find(a => areRutsEqual(a.rut, rutInfo.rutFormatted));

        // Search in RCV Documents:
        // For ABONO: Search in Sales Invoices (tipoRegistro === 'Venta')
        // For CARGO: Search in Purchase Invoices (tipoRegistro === 'Compra') or Honorarios (tipoRegistro === 'Honorarios' / BHE)
        let matchedDoc: RCVDocument | undefined = undefined;
        let isHonorario = false;

        if (isAbono) {
          // Ventas pendientes de clientes
          matchedDoc = rcvDocuments.find(d => {
            if (d.tipoRegistro !== 'Venta') return false;
            const docRut = d.rutReceptor;
            const rutMatch = areRutsEqual(docRut, rutInfo.rutFormatted);
            return rutMatch;
          });
        } else {
          // Primero buscar en Honorarios si la glosa o auxiliar lo indica o si hay Boleta de Honorarios pendiente
          const isGlossHonorario = /honorario|bhe|profesional|boleta/i.test(gloss) ||
                                  (matchedAux?.name && /honorario|profesional/i.test(matchedAux.name)) ||
                                  (matchedAux?.defaultGloss && /honorario|bhe/i.test(matchedAux.defaultGloss));

          const honorarioDoc = rcvDocuments.find(d => {
            if (d.tipoRegistro !== 'Honorarios' && d.tipoDoc !== 'BHE' && d.tipoDoc !== '70') return false;
            const docRut = d.rutEmisor;
            return areRutsEqual(docRut, rutInfo.rutFormatted);
          });

          if (honorarioDoc || isGlossHonorario) {
            isHonorario = true;
            matchedDoc = honorarioDoc;
          }

          if (!matchedDoc) {
            // Buscar en Compras (Proveedores)
            matchedDoc = rcvDocuments.find(d => {
              if (d.tipoRegistro !== 'Compra') return false;
              const docRut = d.rutEmisor;
              return areRutsEqual(docRut, rutInfo.rutFormatted);
            });
          }
        }

        // Determine target account
        let targetAccId = isAbono
          ? collectionAccountId
          : (isHonorario ? (honorariosAccountId || paymentAccountId) : paymentAccountId);

        if (learnedRule?.targetAccountId && accounts.some(a => a.id === learnedRule.targetAccountId)) {
          targetAccId = learnedRule.targetAccountId;
          if (learnedRule.isHonorario) isHonorario = true;
        }

        const targetAccObj = accounts.find(a => a.id === targetAccId);
        const targetAccCode = targetAccObj?.code || (isAbono ? '1103001' : (isHonorario ? '2102001' : '2101001'));
        const targetAccName = targetAccObj?.name || (isAbono ? 'Clientes Nacionales' : (isHonorario ? 'Honorarios por Pagar' : 'Proveedores Nacionales'));

        // Determine Entity Name
        const entityName = matchedAux?.name ||
                           matchedDoc?.razonSocialEmisor ||
                           matchedDoc?.razonSocialReceptor ||
                           learnedRule?.entityName ||
                           (isAbono ? 'Cliente Directo TEF' : (isHonorario ? 'Prestador Honorarios TEF' : 'Proveedor TEF'));

        // Determine effective document amount and compare with statement amount
        const docAmount = matchedDoc
          ? (matchedDoc.tipoRegistro === 'Honorarios' ? (matchedDoc.montoLiquido || matchedDoc.montoTotal) : matchedDoc.montoTotal)
          : 0;

        const diff = matchedDoc ? Math.abs(amount - docAmount) : 0;
        let matchStatus: ProposedMatch['matchStatus'] = 'RUT_DETECTADO';
        let differenceAmount: number | undefined = undefined;
        let isSelected = true;

        if (matchedDoc) {
          if (diff < 0.001) {
            // EXACTO: Monto y RUT idénticos
            matchStatus = 'EXACTO_MONTO_Y_RUT';
            isSelected = true;
          } else if (diff > 0.001 && diff <= 10) {
            // REGLA: Diferencias menores a 10 pesos quedan PENDIENTES DE REGISTRO pero INFORMADAS
            matchStatus = 'DIFERENCIA_MENOR_10_PENDIENTE';
            differenceAmount = amount - docAmount;
            isSelected = false; // Queda deseleccionado para no auto-contabilizar a ciegas
          } else {
            // Diferencia mayor a $10 (pago parcial o factura de otro monto)
            matchStatus = 'MATCH_RUT_AUXILIAR';
            isSelected = true;
          }
        } else if (matchedAux) {
          matchStatus = 'MATCH_RUT_AUXILIAR';
          isSelected = true;
        } else if (learnedRule) {
          matchStatus = 'APRENDIDO_POR_JUNIOR';
          isSelected = true;
        }

        // Effective RUT
        const effectiveRut = matchedAux?.rut ||
                             matchedDoc?.rutEmisor ||
                             matchedDoc?.rutReceptor ||
                             rutInfo.rutShort;

        // Document Metadata
        const docType = matchedDoc?.tipoDoc ? String(matchedDoc.tipoDoc) : (isHonorario ? 'BHE' : '33');
        const docNumber = matchedDoc?.folio ? String(matchedDoc.folio) : (line.documentNumber || '');
        const dueDate = matchedDoc?.fechaVencimiento || matchedDoc?.fechaEmision || line.date;

        // Date and Closed Period Calculation:
        // Rule: Registra en el mes (fecha) de la cartola; si el mes está CERRADO, registrar en el siguiente mes con fecha 01
        const shiftInfo = getNextOpenPeriodAndDate(line.date, fiscalYears);
        const originalDate = line.date;
        const effectiveDate = shiftInfo.date;
        const effectivePeriod = shiftInfo.period;
        const isPeriodShifted = effectiveDate !== originalDate;

        proposals.push({
          id: line.id,
          line,
          rutInfo,
          type: matchType,
          amount,
          matchStatus,
          differenceAmount,
          matchedDocument: matchedDoc,
          matchedAuxiliary: matchedAux,
          isHonorario,
          isJuniorLearned: !!learnedRule,
          targetAccountId: targetAccId,
          targetAccountName: targetAccName,
          targetAccountCode: targetAccCode,
          docType,
          docNumber,
          dueDate,
          effectiveRut,
          entityName,
          originalDate,
          effectiveDate,
          effectivePeriod,
          isPeriodShifted,
          selected: isSelected
        });
      }
    });

    setMatchResults(proposals);
  }, [statementLines, auxiliaries, rcvDocuments, collectionAccountId, paymentAccountId, honorariosAccountId, accounts, learnedRules, fiscalYears]);

  // Update selection count
  useEffect(() => {
    setSelectedCount(matchResults.filter(m => m.selected).length);
  }, [matchResults]);

  // Save Config and Junior Learned Knowledge to Firestore
  const saveAccountConfig = async () => {
    if (!studyId || !company?.id) return;
    try {
      const configRef = doc(db, `studies/${studyId}/companies/${company.id}/bankConfig`, 'rutAutoMatchConfig');
      await setDoc(configRef, {
        collectionAccountId,
        paymentAccountId,
        honorariosAccountId,
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

  // Change individual proposal target account
  const handleAccountChange = (id: string, newAccountId: string) => {
    const accObj = accounts.find(a => a.id === newAccountId);
    if (!accObj) return;
    setMatchResults(prev => prev.map(m => {
      if (m.id === id) {
        return {
          ...m,
          targetAccountId: newAccountId,
          targetAccountName: accObj.name,
          targetAccountCode: accObj.code
        };
      }
      return m;
    }));
  };

  // Filtered Match Results for rendering
  const filteredProposals = useMemo(() => {
    return matchResults.filter(m => {
      if (filterType === 'SOLO_EXACTOS') return m.matchStatus === 'EXACTO_MONTO_Y_RUT';
      if (filterType === 'DIFERENCIAS_MENORES') return m.matchStatus === 'DIFERENCIA_MENOR_10_PENDIENTE';
      if (filterType === 'ABONOS') return m.type === 'ABONO';
      if (filterType === 'CARGOS') return m.type === 'CARGO';
      if (filterType === 'HONORARIOS') return m.isHonorario;
      return true;
    });
  }, [matchResults, filterType]);

  // Execute Automatic Voucher Creation, Memory Learning for Junior & Full Reconciliation
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
      const newLearnedRules: Record<string, LearnedRutRule> = { ...learnedRules };

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

        // Target Account (Clientes / Proveedores / Honorarios por Pagar)
        const targetAccCode = item.targetAccountCode || (isAbono ? '1103001' : (item.isHonorario ? '2102001' : '2101001'));
        const targetAccNameStr = item.targetAccountName || (isAbono ? 'Clientes Nacionales' : (item.isHonorario ? 'Honorarios por Pagar' : 'Proveedores Nacionales'));

        const entityName = item.entityName || (isAbono ? 'Cliente TEF' : (item.isHonorario ? 'Honorarios TEF' : 'Proveedor TEF'));
        const auxRut = item.effectiveRut || item.rutInfo.rutShort;

        // Bank Document Ref
        const rawBankDoc = (item.line.documentNumber || '').trim();
        const periodDocRef = item.effectiveDate
          ? item.effectiveDate.replace(/-/g, '').slice(0, 6)
          : (selectedPeriod ? selectedPeriod.replace(/-/g, '') : '202601');
        const finalBankDocRef = rawBankDoc || periodDocRef;

        const glossHeader = isAbono
          ? 'Abono TEF Cliente'
          : (item.isHonorario ? 'Pago TEF Honorarios' : 'Pago TEF Proveedor');
        const glossText = `${glossHeader} ${auxRut} ${entityName} (${item.line.description})`;

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
          documentType: item.docType || (item.isHonorario ? 'BHE' : '33'),
          documentRef: item.docNumber || finalBankDocRef,
          dueDate: item.dueDate || item.effectiveDate
        };

        const lines: VoucherLine[] = isAbono ? [bankLine, auxLine] : [auxLine, bankLine];

        // Ensure date and period respect closed fiscal months (shifted to 01 of next open month)
        const effectiveDate = item.effectiveDate;
        const effectivePeriod = item.effectivePeriod;

        // Create Voucher Record in Firestore
        const voucherData: Omit<Voucher, 'id'> = {
          voucherNumber: nextVoucherNum,
          date: effectiveDate,
          period: effectivePeriod,
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
            matchedVoucherPeriod: effectivePeriod
          };
        }

        // Mark RCV Document as Pagada / Cancelada in Firestore
        if (item.matchedDocument?.id) {
          try {
            const rcvDocRef = doc(db, `studies/${studyId}/companies/${company.id}/rcvDocuments`, item.matchedDocument.id);
            await updateDoc(rcvDocRef, {
              estadoPago: 'Pagada',
              estadoCobranza: 'Pagada',
              saldoPendiente: 0,
              voucherId: voucherRef.id,
              updatedAt: new Date().toISOString()
            });
          } catch (rcvErr) {
            console.warn('Warning updating matched RCV document:', rcvErr);
          }
        }

        // Memorize learned rule for Junior
        if (item.rutInfo?.rutClean) {
          const prevTimes = newLearnedRules[item.rutInfo.rutClean]?.timesApplied || 0;
          newLearnedRules[item.rutInfo.rutClean] = {
            rut: item.effectiveRut,
            entityName,
            type: item.type,
            targetAccountId: item.targetAccountId,
            targetAccountCode: targetAccCode,
            targetAccountName: targetAccNameStr,
            isHonorario: item.isHonorario,
            timesApplied: prevTimes + 1,
            lastUpdated: new Date().toISOString()
          };
        }
      }

      // Persist learned memory for Junior in Firestore
      try {
        const memoryRef = doc(db, `studies/${studyId}/companies/${company.id}/bankConfig`, 'rutLearnedRules');
        await setDoc(memoryRef, newLearnedRules, { merge: true });

        // Also add training knowledge record for Junior AI Training Center
        await addDoc(
          collection(db, 'studies', studyId, 'companies', company.id, 'copilotCompanyKnowledge'),
          {
            title: `Memoria de Conciliación Nuez Mariposa (${company.name})`,
            keywords: ['conciliacion', 'nuez mariposa', 'rut', 'cartola', 'honorarios', 'clientes', 'proveedores'],
            directiveContent: `Junior ha memorizado ${Object.keys(newLearnedRules).length} RUTs y contrapartes bancarias habituales de ${company.name} para conciliar automáticamente abonos (Clientes) y cargos (Proveedores y Honorarios por Pagar), aplicando traslados automáticos de fechas a mes abierto (día 01) si el mes se encuentra cerrado.`,
            recommendedEntries: 'Revisa Conciliación Bancaria > 🧠 Nuez Mariposa para cruce en 1 clic.',
            scope: 'company',
            studyId,
            companyId: company.id,
            isActive: true,
            createdAt: new Date().toISOString()
          }
        );
      } catch (memErr) {
        console.warn('Junior memory save warning:', memErr);
      }

      // Audit Log
      await logAuditEvent({
        studyId,
        companyId: company.id,
        companyName: company.name,
        action: 'CONTABILIZAR',
        module: 'CONCILIACION',
        details: `Nuez Mariposa contabilizó y concilió ${createdVouchers} movimientos por RUT (Abonos -> Clientes, Cargos -> Proveedores/Honorarios). Junior memorizó los patrones para futuras cartolas.`
      });

      // Trigger callbacks
      onApplyMatches(updatedLines, createdVouchers);
      if (onVouchersUpdated) onVouchersUpdated();

      alert(`🎉 ¡PROCESO DE LA NUEZ MARIPOSA FINALIZADO CON ÉXITO!
--------------------------------------------------
✅ Comprobantes generados: ${createdVouchers}
✅ Movimientos bancarios conciliados: ${createdVouchers}
📅 Fechas asignadas según cartola (y trasladadas a día 01 en meses cerrados).
🧠 Junior ha memorizado los RUTs y cuentas asignadas para futuras conciliaciones.`);

      onClose();
    } catch (error: any) {
      console.error('Error in Auto RUT match:', error);
      alert(`⚠️ Ocurrió un error durante la contabilización: ${error.message || error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const { dragProps, modalStyle } = useDraggableModal({ isOpen: true });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div
        style={modalStyle}
        className={`bg-white rounded-2xl shadow-2xl max-w-6xl w-full border-2 overflow-hidden flex flex-col max-h-[92vh] ${
          themeMode === 'NUEZ_MARIPOSA' ? 'border-amber-400/80 shadow-amber-500/20' : 'border-rose-600/80 shadow-rose-600/20'
        }`}
      >
        
        {/* Animated Banner Header */}
        <div
          {...dragProps}
          className={`p-4 sm:p-5 text-white relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all duration-500 cursor-grab active:cursor-grabbing select-none ${
            themeMode === 'NUEZ_MARIPOSA' 
              ? 'bg-gradient-to-r from-amber-950 via-amber-900 to-yellow-950' 
              : 'bg-gradient-to-r from-slate-950 via-rose-950 to-slate-900 border-b border-rose-500/40'
          }`}
          title="Haz clic y arrastra para mover esta ventana"
        >
          <div className="flex items-center gap-3">
            
            {/* ICON: ANIMATED NUEZ MARIPOSA / CEREBRO or MAZINGER-Z */}
            {themeMode === 'NUEZ_MARIPOSA' ? (
              <div className="relative group cursor-pointer" title="Nuez Mariposa - Cerebro Inteligente de Cartolas & Junior AI">
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full blur-md opacity-75 animate-pulse group-hover:opacity-100 transition"></div>
                <div className="relative w-12 h-12 bg-amber-950 border-2 border-yellow-400/80 rounded-2xl flex items-center justify-center text-2xl shadow-inner transform transition hover:scale-110 active:rotate-12">
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
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-amber-200 uppercase flex items-center gap-1.5">
                  {themeMode === 'NUEZ_MARIPOSA' ? '🧠 Nuez Mariposa' : '🤖 Mazinger-Z'} Motor Inteligente de RUT & Contabilización
                </h3>
                <span className="text-[10px] bg-amber-400 text-amber-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  APRENDIZAJE JUNIOR ACTIVO
                </span>
              </div>
              <p className="text-xs text-amber-100/90 mt-0.5 max-w-2xl">
                Cruza <strong>Abonos</strong> con facturas de clientes, <strong>Cargos</strong> con facturas de proveedores y honorarios por pagar. Si el mes está cerrado, traslada automáticamente a fecha 01 del mes siguiente.
              </p>
            </div>
          </div>

          {/* Theme Switcher Toggle */}
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

        {/* Configuration Panel (Cuentas objetivo por defecto: Clientes, Proveedores, Honorarios, Banco) */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
              <span>📥 Cta. Clientes (Abonos):</span>
            </label>
            <select
              value={collectionAccountId}
              onChange={e => setCollectionAccountId(e.target.value)}
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-500"
            >
              <option value="">-- Cuenta Clientes --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
              <span>📤 Cta. Proveedores (Cargos):</span>
            </label>
            <select
              value={paymentAccountId}
              onChange={e => setPaymentAccountId(e.target.value)}
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-500"
            >
              <option value="">-- Cuenta Proveedores --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
              <span>📜 Cta. Honorarios por Pagar:</span>
            </label>
            <select
              value={honorariosAccountId}
              onChange={e => setHonorariosAccountId(e.target.value)}
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-500"
            >
              <option value="">-- Cuenta Honorarios --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
              <span>🏦 Cta. Banco Asiento:</span>
            </label>
            <select
              value={bankAccountId}
              onChange={e => setBankAccountId(e.target.value)}
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-500"
            >
              <option value="">-- Cuenta Banco --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Bar & Filter Controls */}
        <div className="bg-amber-50/70 p-3 border-b border-amber-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
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
              ✨ Exactos ({matchResults.filter(m => m.matchStatus === 'EXACTO_MONTO_Y_RUT').length})
            </button>
            <button
              onClick={() => setFilterType('DIFERENCIAS_MENORES')}
              className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition ${
                filterType === 'DIFERENCIAS_MENORES' ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-amber-900 border-amber-300'
              }`}
              title="Diferencias menores a $10 que quedan pendientes pero informadas"
            >
              ⚠️ Dif. &lt; $10 ({matchResults.filter(m => m.matchStatus === 'DIFERENCIA_MENOR_10_PENDIENTE').length})
            </button>
            <button
              onClick={() => setFilterType('ABONOS')}
              className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition ${
                filterType === 'ABONOS' ? 'bg-indigo-700 text-white border-indigo-800' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              📥 Abonos (Clientes)
            </button>
            <button
              onClick={() => setFilterType('CARGOS')}
              className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition ${
                filterType === 'CARGOS' ? 'bg-rose-700 text-white border-rose-800' : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              📤 Cargos (Proveedores)
            </button>
            <button
              onClick={() => setFilterType('HONORARIOS')}
              className={`px-2.5 py-1 text-xs rounded-lg font-bold border transition ${
                filterType === 'HONORARIOS' ? 'bg-purple-700 text-white border-purple-800' : 'bg-white text-purple-900 border-purple-300'
              }`}
            >
              📜 Honorarios ({matchResults.filter(m => m.isHonorario).length})
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
                Asegúrese de haber cargado la cartola bancaria. La Nuez escanea números con patrones como <code className="bg-slate-200 px-1 rounded">0105559089</code> o <code className="bg-slate-200 px-1 rounded">076123456K</code> en el detalle de la transferencia.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 text-center w-10">Sel.</th>
                    <th className="p-2.5">Fecha Cartola / Asiento</th>
                    <th className="p-2.5">Tipo</th>
                    <th className="p-2.5">Glosa Bancaria</th>
                    <th className="p-2.5">RUT / Entidad Detectada</th>
                    <th className="p-2.5 text-right">Monto Cartola ($)</th>
                    <th className="p-2.5">Cruce RCV / Documento</th>
                    <th className="p-2.5">Cuenta Contable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredProposals.map((item) => {
                    const isExact = item.matchStatus === 'EXACTO_MONTO_Y_RUT';
                    const isSmallDiff = item.matchStatus === 'DIFERENCIA_MENOR_10_PENDIENTE';
                    return (
                      <tr 
                        key={item.id}
                        className={`hover:bg-amber-50/50 transition ${
                          isSmallDiff ? 'bg-amber-50/40 border-l-4 border-l-amber-500' : (item.selected ? 'bg-amber-50/20' : '')
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
                        
                        {/* Fecha Cartola y Regla de Mes Cerrado */}
                        <td className="p-2.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{item.originalDate}</div>
                          {item.isPeriodShifted ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 mt-0.5" title="El mes original se encuentra CERRADO. Se contabilizará el día 01 del siguiente mes abierto.">
                              <span>🔄</span> A {item.effectiveDate}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5 mt-0.5">
                              <span>✓</span> Mes Abierto
                            </span>
                          )}
                        </td>

                        <td className="p-2.5">
                          {item.type === 'ABONO' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ABONO
                            </span>
                          ) : item.isHonorario ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300">
                              HONORARIO
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
                            {item.isJuniorLearned && (
                              <span className="bg-indigo-100 text-indigo-800 text-[9px] px-1 py-0.2 rounded font-black border border-indigo-200" title="RUT aprendido previamente por Junior">
                                🧠 Junior
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-700 font-medium truncate max-w-xs mt-0.5">
                            {item.entityName}
                          </div>
                        </td>

                        <td className="p-2.5 text-right font-black font-mono text-slate-900 text-sm">
                          ${item.amount.toLocaleString('es-CL')}
                        </td>

                        {/* Coincidencia / Diferencias < $10 */}
                        <td className="p-2.5">
                          {isExact ? (
                            <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-fit">
                              <span>✨</span> Exacto ({item.docType ? `Doc ${item.docType} ` : ''}Folio {item.docNumber})
                            </span>
                          ) : isSmallDiff ? (
                            <div className="p-1.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 max-w-xs">
                              <div className="flex items-center gap-1 text-amber-950 font-black">
                                <span>⚠️</span> Dif. &lt; $10 ({item.differenceAmount && item.differenceAmount > 0 ? `+$${item.differenceAmount.toFixed(0)}` : `-$${Math.abs(item.differenceAmount || 0).toFixed(0)}`})
                              </div>
                              <div className="text-[9px] text-amber-800 font-normal">
                                Pendiente de registro (Doc {item.docNumber || 'RCV'} por ${(item.amount - (item.differenceAmount || 0)).toLocaleString('es-CL')})
                              </div>
                            </div>
                          ) : item.matchedDocument ? (
                            <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-300 flex items-center gap-1 w-fit">
                              <span>📄</span> Doc {item.docType} Folio {item.docNumber} (${(item.matchedDocument.montoTotal || 0).toLocaleString('es-CL')})
                            </span>
                          ) : item.matchedAuxiliary ? (
                            <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-300 flex items-center gap-1 w-fit">
                              <span>👤</span> Auxiliar Maestro Registrado
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1 w-fit">
                              <span>🔍</span> Propuesta por RUT Glosa
                            </span>
                          )}
                        </td>

                        {/* Cuenta Asignada editable */}
                        <td className="p-2.5">
                          <select
                            value={item.targetAccountId}
                            onChange={e => handleAccountChange(item.id, e.target.value)}
                            className="text-xs font-semibold bg-white border border-slate-300 rounded px-1.5 py-1 focus:ring-1 focus:ring-amber-500 max-w-[180px] truncate"
                          >
                            {accounts.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.code} - {a.name}
                              </option>
                            ))}
                          </select>
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
            Seleccionados: <strong className="text-slate-900 font-bold">{selectedCount}</strong> de {matchResults.length} movimientos
            {matchResults.some(m => m.matchStatus === 'DIFERENCIA_MENOR_10_PENDIENTE') && (
              <span className="ml-2 text-amber-800 font-bold">
                (⚠️ {matchResults.filter(m => m.matchStatus === 'DIFERENCIA_MENOR_10_PENDIENTE').length} con dif. &lt; $10 pendientes e informados)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition w-full sm:w-auto cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleExecuteAutoMatch}
              disabled={isProcessing || selectedCount === 0}
              className={`px-5 py-2.5 text-xs font-black rounded-xl text-white shadow-lg transition flex items-center justify-center gap-2 w-full sm:w-auto cursor-pointer ${
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
