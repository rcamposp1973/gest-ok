import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, query, where, deleteDoc } from 'firebase/firestore';
import {
  Company,
  ChartOfAccount,
  Voucher,
  VoucherLine,
  Auxiliary,
  RCVDocument,
  FiscalPeriodYear,
  AccountMatch,
  MatchedLineRef
} from '../types';
import { logAuditEvent } from '../utils/auditLogger';
import { 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Link2, 
  Unlink, 
  FileSpreadsheet, 
  Printer, 
  HelpCircle, 
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  AlertCircle,
  FileText,
  User,
  Hash,
  ArrowRightLeft,
  Info,
  Layers,
  Check,
  Zap,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

interface AnalisisCuentasViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears?: FiscalPeriodYear[];
  auxiliaries?: Auxiliary[];
  rcvDocuments?: RCVDocument[];
  onVouchersUpdated?: () => void;
}

export interface ExtVoucherLine {
  key: string; // voucherId_lineIndex
  voucherId: string;
  voucherNumber: number;
  voucherDate: string;
  voucherPeriod: string;
  voucherType: 'Ingreso' | 'Egreso' | 'Traspaso';
  lineIndex: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  gloss: string;
  documentRef?: string;
  auxiliaryRut?: string;
  auxiliaryName?: string;
  matchId?: string | null;
  matchGroup?: AccountMatch | null;
}

export default function AnalisisCuentasView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears = [],
  auxiliaries = [],
  rcvDocuments = [],
  onVouchersUpdated
}: AnalisisCuentasViewProps) {
  // --- ESTADOS DE SELECCIÓN Y FILTRO ---
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<'TODAS' | 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto'>('TODAS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<string>('TODOS');
  const [viewMode, setViewMode] = useState<'PENDIENTES' | 'CALZADAS' | 'TODAS'>('PENDIENTES');
  
  // --- ESTADOS DE MATCHES Y FIRESTORE ---
  const [matches, setMatches] = useState<AccountMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'SAVED' | 'SAVING' | 'ERROR' | 'IDLE'>('SAVED');

  // --- ESTADOS DE CALCE MANUAL ---
  const [selectedDebitKeys, setSelectedDebitKeys] = useState<string[]>([]);
  const [selectedCreditKeys, setSelectedCreditKeys] = useState<string[]>([]);
  const [matchNotes, setMatchNotes] = useState<string>('');

  // --- ESTADOS DE CALCE INTELIGENTE (SUGERENCIAS) ---
  const [isAutoMatching, setIsAutoMatching] = useState<boolean>(false);
  const [suggestedMatches, setSuggestedMatches] = useState<{
    id: string;
    debitLines: ExtVoucherLine[];
    creditLines: ExtVoucherLine[];
    totalAmount: number;
    rule: string;
  }[] | null>(null);

  // --- CARGAR MATCHES DESDE FIRESTORE ---
  const fetchMatches = useCallback(async () => {
    if (!studyId || !company.id) return;
    setLoadingMatches(true);
    try {
      const matchesRef = collection(db, 'studies', studyId, 'companies', company.id, 'accountMatches');
      const snap = await getDocs(matchesRef);
      const loaded: AccountMatch[] = [];
      snap.forEach(docSnap => {
        const data = docSnap.data() as AccountMatch;
        if (data.status !== 'DESCALZADO') {
          loaded.push({ ...data, id: docSnap.id });
        }
      });
      setMatches(loaded);
    } catch (err) {
      console.error('Error cargando calces de cuentas:', err);
    } finally {
      setLoadingMatches(false);
    }
  }, [studyId, company.id]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // --- CUENTAS IMPUTABLES FILTRADAS ---
  const imputableAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (!acc.isImputable) return false;
      if (accountTypeFilter !== 'TODAS' && acc.type !== accountTypeFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return acc.code.toLowerCase().includes(term) || acc.name.toLowerCase().includes(term);
      }
      return true;
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts, accountTypeFilter, searchTerm]);

  // Seleccionar automáticamente la primera cuenta útil o de análisis común al cargar
  useEffect(() => {
    if (!selectedAccountId && imputableAccounts.length > 0) {
      // Intentar buscar IVA Crédito, Transbank, o la primera cuenta de activo/pasivo
      const priorityAcc = imputableAccounts.find(a => 
        a.code.startsWith('1103') || 
        a.name.toLowerCase().includes('iva') || 
        a.requiereConciliacionBancaria ||
        a.type === 'Activo' || 
        a.type === 'Pasivo'
      );
      setSelectedAccountId(priorityAcc ? priorityAcc.id : imputableAccounts[0].id);
    }
  }, [imputableAccounts, selectedAccountId]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  // --- MAPEAR LINEAS DE COMPROBANTES DE LA CUENTA SELECCIONADA ---
  const accountLines = useMemo(() => {
    if (!selectedAccountId) return [];
    
    // Mapa rápido de lineKeys calzadas -> AccountMatch
    const matchedMap = new Map<string, AccountMatch>();
    matches.forEach(m => {
      if (m.status !== 'DESCALZADO') {
        m.matchedLines.forEach(l => {
          const key = `${l.voucherId}_${l.lineIndex}`;
          matchedMap.set(key, m);
        });
      }
    });

    const lines: ExtVoucherLine[] = [];

    vouchers.forEach(voucher => {
      if (voucher.status === 'Anulado') return;
      if (periodFilter !== 'TODOS' && voucher.period !== periodFilter) return;

      voucher.lines.forEach((line, index) => {
        if (line.accountId === selectedAccountId) {
          const lineKey = `${voucher.id}_${index}`;
          const matchGroup = matchedMap.get(lineKey) || null;
          
          lines.push({
            key: lineKey,
            voucherId: voucher.id,
            voucherNumber: voucher.voucherNumber,
            voucherDate: voucher.date,
            voucherPeriod: voucher.period,
            voucherType: voucher.type,
            lineIndex: index,
            accountId: line.accountId,
            accountCode: line.accountCode,
            accountName: line.accountName,
            debit: line.debit || 0,
            credit: line.credit || 0,
            gloss: line.gloss || voucher.gloss || '',
            documentRef: line.documentRef,
            auxiliaryRut: line.auxiliaryRut,
            auxiliaryName: line.auxiliaryName,
            matchId: matchGroup ? matchGroup.id : null,
            matchGroup: matchGroup
          });
        }
      });
    });

    // Ordenar por fecha de comprobante y número
    return lines.sort((a, b) => {
      const dateComp = a.voucherDate.localeCompare(b.voucherDate);
      if (dateComp !== 0) return dateComp;
      return a.voucherNumber - b.voucherNumber;
    });
  }, [selectedAccountId, vouchers, periodFilter, matches]);

  // --- LÍNEAS FILTRADAS SEGÚN VIEW MODE (PENDIENTES, CALZADAS, TODAS) ---
  const displayedLines = useMemo(() => {
    if (viewMode === 'PENDIENTES') {
      return accountLines.filter(l => !l.matchId);
    }
    if (viewMode === 'CALZADAS') {
      return accountLines.filter(l => !!l.matchId);
    }
    return accountLines;
  }, [accountLines, viewMode]);

  // Dividir líneas mostradas en Cargos (Debes) y Abonos (Haberes)
  const debitLines = useMemo(() => {
    return displayedLines.filter(l => l.debit > 0);
  }, [displayedLines]);

  const creditLines = useMemo(() => {
    return displayedLines.filter(l => l.credit > 0);
  }, [displayedLines]);

  // --- KPIS Y METRICAS DE LA CUENTA ---
  const accountStats = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let pendingDebit = 0;
    let pendingCredit = 0;
    let matchedDebit = 0;
    let matchedCredit = 0;

    accountLines.forEach(l => {
      totalDebit += l.debit;
      totalCredit += l.credit;
      if (l.matchId) {
        matchedDebit += l.debit;
        matchedCredit += l.credit;
      } else {
        pendingDebit += l.debit;
        pendingCredit += l.credit;
      }
    });

    const netLedgerBalance = totalDebit - totalCredit;
    const netPendingBalance = pendingDebit - pendingCredit;
    const totalMatchedAmount = (matchedDebit + matchedCredit) / 2;
    const matchPercentage = (totalDebit + totalCredit) > 0 
      ? Math.round(((matchedDebit + matchedCredit) / (totalDebit + totalCredit)) * 100) 
      : 100;

    return {
      totalLinesCount: accountLines.length,
      pendingCount: accountLines.filter(l => !l.matchId).length,
      matchedCount: accountLines.filter(l => !!l.matchId).length,
      totalDebit,
      totalCredit,
      netLedgerBalance,
      pendingDebit,
      pendingCredit,
      netPendingBalance,
      totalMatchedAmount,
      matchPercentage
    };
  }, [accountLines]);

  // --- CÁLCULO DINÁMICO DE SELECCIÓN MANUAL DE CARGOS Y ABONOS ---
  const selectionMath = useMemo(() => {
    let sumDebits = 0;
    let sumCredits = 0;

    const selectedDebitsList = accountLines.filter(l => selectedDebitKeys.includes(l.key));
    const selectedCreditsList = accountLines.filter(l => selectedCreditKeys.includes(l.key));

    selectedDebitsList.forEach(l => { sumDebits += l.debit; });
    selectedCreditsList.forEach(l => { sumCredits += l.credit; });

    const diff = Math.abs(sumDebits - sumCredits);
    const isMatchedPair = (selectedDebitKeys.length > 0 || selectedCreditKeys.length > 0) && diff === 0 && sumDebits > 0;

    return {
      sumDebits,
      sumCredits,
      diff,
      isMatchedPair,
      selectedDebitsCount: selectedDebitKeys.length,
      selectedCreditsCount: selectedCreditKeys.length,
      selectedDebitsList,
      selectedCreditsList
    };
  }, [accountLines, selectedDebitKeys, selectedCreditKeys]);

  // --- GUARDAR O CREAR UN CALCE MANUAL ---
  const handleCreateManualMatch = async () => {
    if (!selectionMath.isMatchedPair || !selectedAccount) return;

    setSaveStatus('SAVING');
    try {
      const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const matchedLinesRef: MatchedLineRef[] = [
        ...selectionMath.selectedDebitsList.map(l => ({
          voucherId: l.voucherId,
          voucherNumber: l.voucherNumber,
          voucherDate: l.voucherDate,
          voucherPeriod: l.voucherPeriod,
          lineIndex: l.lineIndex,
          accountId: l.accountId,
          accountCode: l.accountCode,
          debit: l.debit,
          credit: l.credit,
          gloss: l.gloss,
          documentRef: l.documentRef,
          auxiliaryRut: l.auxiliaryRut,
          auxiliaryName: l.auxiliaryName
        })),
        ...selectionMath.selectedCreditsList.map(l => ({
          voucherId: l.voucherId,
          voucherNumber: l.voucherNumber,
          voucherDate: l.voucherDate,
          voucherPeriod: l.voucherPeriod,
          lineIndex: l.lineIndex,
          accountId: l.accountId,
          accountCode: l.accountCode,
          debit: l.debit,
          credit: l.credit,
          gloss: l.gloss,
          documentRef: l.documentRef,
          auxiliaryRut: l.auxiliaryRut,
          auxiliaryName: l.auxiliaryName
        }))
      ];

      const newMatch: AccountMatch = {
        id: matchId,
        accountId: selectedAccount.id,
        accountCode: selectedAccount.code,
        accountName: selectedAccount.name,
        matchedLines: matchedLinesRef,
        totalAmount: selectionMath.sumDebits,
        matchDate: new Date().toISOString(),
        matchedBy: auth.currentUser?.email || 'Usuario Contable',
        notes: matchNotes.trim() || 'Calce manual de partidas',
        creationMode: 'MANUAL',
        status: 'CALZADO'
      };

      // Firestore persistence
      const matchDocRef = doc(db, 'studies', studyId, 'companies', company.id, 'accountMatches', matchId);
      await setDoc(matchDocRef, newMatch);

      // Actualizar estado local
      setMatches(prev => [...prev, newMatch]);
      setSelectedDebitKeys([]);
      setSelectedCreditKeys([]);
      setMatchNotes('');
      setSaveStatus('SAVED');

      // Auditoría
      logAuditEvent({
        userId: auth.currentUser?.uid || 'user',
        userEmail: auth.currentUser?.email || 'usuario@gestok.cl',
        studyId,
        companyId: company.id,
        action: 'CONTABILIZAR',
        module: 'PLAN_CUENTAS',
        details: `Calce de cuenta ${selectedAccount.code} - ${selectedAccount.name} por $${selectionMath.sumDebits.toLocaleString('es-CL')} (${matchedLinesRef.length} líneas pareadas)`
      });

    } catch (err) {
      console.error('Error al guardar calce manual:', err);
      setSaveStatus('ERROR');
    }
  };

  // --- DESCALZAR / DESHACER UN CALCE DE CUENTA ---
  const handleUnmatchGroup = async (matchId: string) => {
    if (!window.confirm('¿Está seguro de deshacer este calce de cuenta? Las partidas volverán a quedar pendientes.')) return;

    setSaveStatus('SAVING');
    try {
      const matchDocRef = doc(db, 'studies', studyId, 'companies', company.id, 'accountMatches', matchId);
      await deleteDoc(matchDocRef);

      setMatches(prev => prev.filter(m => m.id !== matchId));
      setSaveStatus('SAVED');

      logAuditEvent({
        userId: auth.currentUser?.uid || 'user',
        userEmail: auth.currentUser?.email || 'usuario@gestok.cl',
        studyId,
        companyId: company.id,
        action: 'MODIFICAR',
        module: 'PLAN_CUENTAS',
        details: `Descalzado de grupo ${matchId} en cuenta ${selectedAccount?.code}`
      });
    } catch (err) {
      console.error('Error al deshacer calce:', err);
      setSaveStatus('ERROR');
    }
  };

  // --- MOTOR DE CALCE INTELIGENTE (ALGORITMO DE SUGERENCIAS) ---
  const handleRunSmartAutoMatch = () => {
    if (!selectedAccount) return;
    setIsAutoMatching(true);

    const pendingLines = accountLines.filter(l => !l.matchId);
    const pendDebits = pendingLines.filter(l => l.debit > 0);
    const pendCredits = pendingLines.filter(l => l.credit > 0);

    const suggestions: {
      id: string;
      debitLines: ExtVoucherLine[];
      creditLines: ExtVoucherLine[];
      totalAmount: number;
      rule: string;
    }[] = [];

    const usedKeys = new Set<string>();

    // REGLA 1: Match 1 a 1 por RUT + Documento de Referencia
    pendDebits.forEach(d => {
      if (usedKeys.has(d.key)) return;
      if (d.auxiliaryRut && d.documentRef) {
        const matchingCredit = pendCredits.find(c => 
          !usedKeys.has(c.key) &&
          c.auxiliaryRut === d.auxiliaryRut &&
          c.documentRef === d.documentRef &&
          c.credit === d.debit
        );
        if (matchingCredit) {
          usedKeys.add(d.key);
          usedKeys.add(matchingCredit.key);
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            debitLines: [d],
            creditLines: [matchingCredit],
            totalAmount: d.debit,
            rule: `RUT (${d.auxiliaryRut}) + Documento (#${d.documentRef})`
          });
        }
      }
    });

    // REGLA 2: Match 1 a 1 por Monto Exacto dentro de la misma cuenta
    pendDebits.forEach(d => {
      if (usedKeys.has(d.key)) return;
      const matchingCredit = pendCredits.find(c => 
        !usedKeys.has(c.key) &&
        c.credit === d.debit
      );
      if (matchingCredit) {
        usedKeys.add(d.key);
        usedKeys.add(matchingCredit.key);
        suggestions.push({
          id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          debitLines: [d],
          creditLines: [matchingCredit],
          totalAmount: d.debit,
          rule: `Monto Exacto ($${d.debit.toLocaleString('es-CL')})`
        });
      }
    });

    // REGLA 3: Match por Glosa o Referencia F29 / Impuestos (ej. "F29-2026-02" o "F29 02/2026")
    pendDebits.forEach(d => {
      if (usedKeys.has(d.key)) return;
      const cleanGlossD = d.gloss.toLowerCase();
      if (cleanGlossD.includes('f29') || cleanGlossD.includes('impuesto') || cleanGlossD.includes('formulario 29')) {
        const matchingCredit = pendCredits.find(c => {
          if (usedKeys.has(c.key)) return false;
          const cleanGlossC = c.gloss.toLowerCase();
          return (cleanGlossC.includes('f29') || cleanGlossC.includes('impuesto')) && c.credit === d.debit;
        });
        if (matchingCredit) {
          usedKeys.add(d.key);
          usedKeys.add(matchingCredit.key);
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            debitLines: [d],
            creditLines: [matchingCredit],
            totalAmount: d.debit,
            rule: `Coincidencia de Glosa Impuestos F29`
          });
        }
      }
    });

    setSuggestedMatches(suggestions);
    setIsAutoMatching(false);
  };

  // --- APLICAR TODAS O INDIVIDUALES SUGERENCIAS DE CALCE ---
  const handleApplySuggestedMatches = async (toApply = suggestedMatches) => {
    if (!toApply || toApply.length === 0 || !selectedAccount) return;

    setSaveStatus('SAVING');
    try {
      const newMatches: AccountMatch[] = [];

      for (const sug of toApply) {
        const matchId = `match_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const matchedLinesRef: MatchedLineRef[] = [
          ...sug.debitLines.map(l => ({
            voucherId: l.voucherId,
            voucherNumber: l.voucherNumber,
            voucherDate: l.voucherDate,
            voucherPeriod: l.voucherPeriod,
            lineIndex: l.lineIndex,
            accountId: l.accountId,
            accountCode: l.accountCode,
            debit: l.debit,
            credit: l.credit,
            gloss: l.gloss,
            documentRef: l.documentRef,
            auxiliaryRut: l.auxiliaryRut,
            auxiliaryName: l.auxiliaryName
          })),
          ...sug.creditLines.map(l => ({
            voucherId: l.voucherId,
            voucherNumber: l.voucherNumber,
            voucherDate: l.voucherDate,
            voucherPeriod: l.voucherPeriod,
            lineIndex: l.lineIndex,
            accountId: l.accountId,
            accountCode: l.accountCode,
            debit: l.debit,
            credit: l.credit,
            gloss: l.gloss,
            documentRef: l.documentRef,
            auxiliaryRut: l.auxiliaryRut,
            auxiliaryName: l.auxiliaryName
          }))
        ];

        const matchObj: AccountMatch = {
          id: matchId,
          accountId: selectedAccount.id,
          accountCode: selectedAccount.code,
          accountName: selectedAccount.name,
          matchedLines: matchedLinesRef,
          totalAmount: sug.totalAmount,
          matchDate: new Date().toISOString(),
          matchedBy: auth.currentUser?.email || 'Sistema Inteligente Gest_OK',
          notes: `Calce automático por ${sug.rule}`,
          creationMode: 'AUTOMATICO',
          status: 'CALZADO'
        };

        const matchDocRef = doc(db, 'studies', studyId, 'companies', company.id, 'accountMatches', matchId);
        await setDoc(matchDocRef, matchObj);
        newMatches.push(matchObj);
      }

      setMatches(prev => [...prev, ...newMatches]);
      setSuggestedMatches(null);
      setSaveStatus('SAVED');
    } catch (err) {
      console.error('Error aplicando sugerencias de calce:', err);
      setSaveStatus('ERROR');
    }
  };

  // --- EXPORTAR A EXCEL / REPORT EN VENTANA DE IMPRESIÓN ---
  const handleExportAccountAnalysis = () => {
    if (!selectedAccount) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const openLines = accountLines.filter(l => !l.matchId);
    const dateStr = new Date().toLocaleDateString('es-CL');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Análisis de Cuenta - ${selectedAccount.code} ${selectedAccount.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; color: #1e293b; padding: 20px; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 18px; color: #0f172a; }
            .header p { margin: 4px 0 0 0; color: #64748b; font-size: 11px; }
            .kpi-row { display: flex; gap: 15px; margin-bottom: 20px; }
            .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 6px; flex: 1; }
            .kpi-card .label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
            .kpi-card .val { font-size: 16px; font-weight: bold; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #cbd5e1; font-weight: 600; color: #334155; }
            td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
            .num { text-align: right; font-family: monospace; }
            .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>ANÁLISIS DE CUENTA CONTABLE: ${selectedAccount.code} - ${selectedAccount.name}</h1>
            <p>Empresa: <strong>${company.name}</strong> (RUT: ${company.rut}) | Fecha de Emisión: ${dateStr}</p>
          </div>

          <div class="kpi-row">
            <div class="kpi-card">
              <div class="label">Saldo Libro Mayor</div>
              <div class="val">$${accountStats.netLedgerBalance.toLocaleString('es-CL')}</div>
            </div>
            <div class="kpi-card">
              <div class="label">Composición Saldo Pendiente</div>
              <div class="val">$${accountStats.netPendingBalance.toLocaleString('es-CL')}</div>
            </div>
            <div class="kpi-card">
              <div class="label">Partidas Abiertas</div>
              <div class="val">${accountStats.pendingCount} / ${accountStats.totalLinesCount} (${accountStats.matchPercentage}% Conciliado)</div>
            </div>
          </div>

          <h3>Detalle de Partidas Abiertas (Composición del Saldo)</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Voucher</th>
                <th>Tipo</th>
                <th>RUT / Auxiliar</th>
                <th>Documento</th>
                <th>Glosa / Detalle</th>
                <th class="num">Cargo (Debe)</th>
                <th class="num">Abono (Haber)</th>
              </tr>
            </thead>
            <tbody>
              ${openLines.map(l => `
                <tr>
                  <td>${l.voucherDate}</td>
                  <td>#${l.voucherNumber}</td>
                  <td>${l.voucherType}</td>
                  <td>${l.auxiliaryRut ? `${l.auxiliaryRut} - ${l.auxiliaryName || ''}` : '-'}</td>
                  <td>${l.documentRef || '-'}</td>
                  <td>${l.gloss}</td>
                  <td class="num">${l.debit > 0 ? '$' + l.debit.toLocaleString('es-CL') : '-'}</td>
                  <td class="num">${l.credit > 0 ? '$' + l.credit.toLocaleString('es-CL') : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <span>Gest_OK Contabilidad Integral Chile</span>
            <span>Informe firmado y preparado por el departamento contable</span>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="space-y-4">
      {/* --- CABECERA PRINCIPAL --- */}
      <div className="bg-slate-900 text-white p-4 rounded-lg shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">Análisis y Calce de Cuentas Contables</h2>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded-full uppercase tracking-wider">
              Finanzas & Auditoría
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Calce automático y manual de cargos vs abonos para justificar la composición exacta del saldo de cualquier cuenta del Libro Mayor.
          </p>
        </div>

        {/* Botones Globales de Acción */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleRunSmartAutoMatch}
            disabled={!selectedAccount || accountLines.length === 0}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
            title="Ejecutar motor inteligente para encontrar coincidencias de montos exactos, RUT, documento y F29"
          >
            <Sparkles className="w-4 h-4 text-emerald-200 animate-pulse" />
            <span>Calce Inteligente</span>
          </button>

          <button
            onClick={handleExportAccountAnalysis}
            disabled={!selectedAccount || accountLines.length === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Exportar informe impreso con la composición detallada del saldo"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Informe Composición</span>
          </button>

          <button
            onClick={fetchMatches}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors"
            title="Refrescar estado de calces"
          >
            <RefreshCw className={`w-4 h-4 ${loadingMatches ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* --- BARRA SUPERIOR DE BUSQUEDA DE CUENTA Y ACCESOS RAPIDOS --- */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* Selector principal de cuenta contable */}
          <div className="md:col-span-5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Seleccionar Cuenta Contable a Analizar
            </label>
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setSelectedDebitKeys([]);
                  setSelectedCreditKeys([]);
                }}
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-300 rounded font-medium text-xs text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none"
              >
                {imputableAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.type}) {acc.requiereAuxiliarRUT ? '• [Exige Auxiliar]' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filtro rápido por tipo de cuenta */}
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Filtrar Catálogo por Grupo
            </label>
            <div className="flex items-center gap-1 overflow-x-auto">
              {(['TODAS', 'Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setAccountTypeFilter(type)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors ${
                    accountTypeFilter === type
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Buscador de código o nombre de cuenta */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Buscar Cuenta por Código/Nombre
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ej: 1103001, IVA, Transbank..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded text-xs focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

        </div>

        {/* Sugerencias de cuentas típicas para análisis inmediato */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Cuentas Sugeridas para "Limpiar":
          </span>
          {imputableAccounts.filter(a => 
            a.code.startsWith('1103') || 
            a.name.toLowerCase().includes('iva') ||
            a.name.toLowerCase().includes('transbank') ||
            a.name.toLowerCase().includes('f29') ||
            a.name.toLowerCase().includes('anticipo') ||
            a.name.toLowerCase().includes('fondo') ||
            a.name.toLowerCase().includes('retencion')
          ).slice(0, 6).map(acc => (
            <button
              key={acc.id}
              onClick={() => {
                setSelectedAccountId(acc.id);
                setSelectedDebitKeys([]);
                setSelectedCreditKeys([]);
              }}
              className={`px-2 py-0.5 rounded border text-[11px] font-mono transition-colors ${
                selectedAccountId === acc.id
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {acc.code} - {acc.name}
            </button>
          ))}
        </div>
      </div>

      {/* --- TARJETAS KPI DE LA CUENTA SELECCIONADA --- */}
      {selectedAccount && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Card 1: Saldo Mayor Total */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Saldo Libro Mayor</span>
                <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
                  ${accountStats.netLedgerBalance.toLocaleString('es-CL')}
                </div>
              </div>
              <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mt-2 flex justify-between">
              <span>Debes: ${accountStats.totalDebit.toLocaleString('es-CL')}</span>
              <span>Haberes: ${accountStats.totalCredit.toLocaleString('es-CL')}</span>
            </div>
          </div>

          {/* Card 2: Saldo Pendiente de Calce */}
          <div className="bg-white p-3.5 rounded-lg border border-amber-200 bg-amber-50/20 shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Saldo Partidas Abiertas</span>
                <div className="text-lg font-bold text-amber-900 mt-0.5 font-mono">
                  ${accountStats.netPendingBalance.toLocaleString('es-CL')}
                </div>
              </div>
              <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[11px] text-amber-800 font-medium mt-2">
              {accountStats.pendingCount} de {accountStats.totalLinesCount} movimientos sin parear
            </div>
          </div>

          {/* Card 3: Monto Total Conciliado */}
          <div className="bg-white p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/20 shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Monto Calzado (Pareado)</span>
                <div className="text-lg font-bold text-emerald-900 mt-0.5 font-mono">
                  ${accountStats.totalMatchedAmount.toLocaleString('es-CL')}
                </div>
              </div>
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-[11px] text-emerald-800 font-medium mt-2">
              {accountStats.matchedCount} movimientos regularizados
            </div>
          </div>

          {/* Card 4: % de Conciliación de la Cuenta */}
          <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nivel de Análisis</span>
                <div className="text-lg font-bold text-indigo-700 mt-0.5 font-mono">
                  {accountStats.matchPercentage}%
                </div>
              </div>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${accountStats.matchPercentage}%` }}
              />
            </div>
          </div>

        </div>
      )}

      {/* --- PREDICCIONES / SUGERENCIAS DE CALCE AUTOMÁTICO (MODAL O SECCIÓN FLOJANTE) --- */}
      {suggestedMatches && (
        <div className="bg-indigo-900 text-white p-4 rounded-lg shadow-lg border border-indigo-700 animate-fadeIn">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
              <h3 className="font-bold text-sm">
                Sugerencias del Motor de Calce Automático ({suggestedMatches.length} coincidencias encontradas)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleApplySuggestedMatches()}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded font-bold text-xs flex items-center gap-1 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Aplicar Todos los Calces</span>
              </button>
              <button
                onClick={() => setSuggestedMatches(null)}
                className="p-1 text-slate-300 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>

          {suggestedMatches.length === 0 ? (
            <p className="text-xs text-indigo-200">
              No se encontraron coincidencias exactas 1-a-1 de debito vs crédito no pareadas en esta cuenta. Realice el calce manual seleccionando las líneas inferiores.
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
              {suggestedMatches.map((sug, idx) => (
                <div key={sug.id} className="bg-indigo-800/80 p-2.5 rounded border border-indigo-600/50 flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-indigo-700 text-indigo-200 rounded text-[10px] font-mono">
                        Rule: {sug.rule}
                      </span>
                      <span className="font-bold text-emerald-300">
                        Monto: ${sug.totalAmount.toLocaleString('es-CL')}
                      </span>
                    </div>
                    <div className="text-[11px] text-indigo-200">
                      <strong>Debe:</strong> Vch #{sug.debitLines[0].voucherNumber} ({sug.debitLines[0].voucherDate}) - {sug.debitLines[0].gloss}
                      {' ↔ '}
                      <strong>Haber:</strong> Vch #{sug.creditLines[0].voucherNumber} ({sug.creditLines[0].voucherDate}) - {sug.creditLines[0].gloss}
                    </div>
                  </div>

                  <button
                    onClick={() => handleApplySuggestedMatches([sug])}
                    className="px-2.5 py-1 bg-indigo-700 hover:bg-emerald-600 text-white rounded font-bold text-[11px] transition-colors"
                  >
                    Calzar Este
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- SECTORES DE NAVEGACIÓN Y FILTROS DE VISTA (PENDIENTES vs CALZADAS) --- */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3">
        
        {/* Toggle de vistas */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => setViewMode('PENDIENTES')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              viewMode === 'PENDIENTES'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Partidas Abiertas / Pendientes ({accountStats.pendingCount})</span>
          </button>

          <button
            onClick={() => setViewMode('CALZADAS')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              viewMode === 'CALZADAS'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Partidas Calzadas ({accountStats.matchedCount})</span>
          </button>

          <button
            onClick={() => setViewMode('TODAS')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              viewMode === 'TODAS'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Todas las Partidas ({accountLines.length})</span>
          </button>
        </div>

        {/* Info y deselección rápida */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {(selectedDebitKeys.length > 0 || selectedCreditKeys.length > 0) && (
            <button
              onClick={() => {
                setSelectedDebitKeys([]);
                setSelectedCreditKeys([]);
              }}
              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1"
            >
              <XCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Limpiar Selección ({selectedDebitKeys.length + selectedCreditKeys.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* --- TABLA PRINCIPAL DE MOVIMIENTOS CARGOS VS ABONOS --- */}
      {viewMode === 'CALZADAS' ? (
        /* VISTA DE MOVIMIENTOS YA CALZADOS Y SUS GRUPOS */
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800 flex justify-between items-center">
            <span>Histórico de Pareos y Calces Registrados</span>
            <span className="text-slate-500 text-[11px] font-normal">
              Mostrando grupos de movimientos calzados para la cuenta
            </span>
          </div>

          <div className="divide-y divide-slate-200 max-h-[550px] overflow-y-auto">
            {matches.filter(m => m.accountId === selectedAccountId).length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No hay calces registrados para esta cuenta contable aún.
              </div>
            ) : (
              matches.filter(m => m.accountId === selectedAccountId).map((m) => (
                <div key={m.id} className="p-3.5 hover:bg-slate-50/80 transition-colors">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] rounded border border-emerald-300">
                        Match ID: {m.id.substr(0, 14)}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        Fecha: {new Date(m.matchDate).toLocaleDateString('es-CL')} | Por: {m.matchedBy}
                      </span>
                      {m.creationMode === 'AUTOMATICO' && (
                        <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded">
                          Automático
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        Monto: ${m.totalAmount.toLocaleString('es-CL')}
                      </span>
                      <button
                        onClick={() => handleUnmatchGroup(m.id)}
                        className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-semibold text-[11px] flex items-center gap-1 transition-colors"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>Descalzar Partidas</span>
                      </button>
                    </div>
                  </div>

                  {m.notes && (
                    <div className="text-[11px] text-slate-600 bg-slate-100/70 p-1.5 rounded mb-2 italic">
                      Nota: "{m.notes}"
                    </div>
                  )}

                  {/* Tabla interna de las líneas involucradas */}
                  <div className="overflow-x-auto rounded border border-slate-200">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-1.5">Fecha</th>
                          <th className="p-1.5">Voucher</th>
                          <th className="p-1.5">RUT / Auxiliar</th>
                          <th className="p-1.5">Documento</th>
                          <th className="p-1.5">Glosa</th>
                          <th className="p-1.5 text-right">Cargo (Debe)</th>
                          <th className="p-1.5 text-right">Abono (Haber)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {m.matchedLines.map((l, idx) => (
                          <tr key={idx} className="bg-white hover:bg-slate-50">
                            <td className="p-1.5 font-mono">{l.voucherDate}</td>
                            <td className="p-1.5 font-semibold">#{l.voucherNumber}</td>
                            <td className="p-1.5">{l.auxiliaryRut ? `${l.auxiliaryRut}` : '-'}</td>
                            <td className="p-1.5">{l.documentRef || '-'}</td>
                            <td className="p-1.5 text-slate-700 max-w-xs truncate">{l.gloss}</td>
                            <td className="p-1.5 text-right font-mono font-bold text-slate-900">
                              {l.debit > 0 ? `$${l.debit.toLocaleString('es-CL')}` : '-'}
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold text-slate-900">
                              {l.credit > 0 ? `$${l.credit.toLocaleString('es-CL')}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* VISTA DIVIDIDA 2 COLUMNAS (CARGOS DEBES IZQUIERDA VS ABONOS HABERES DERECHA) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* COLUMNA IZQUIERDA: CARGOS (DEBES) */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="p-3 bg-slate-900 text-white font-bold text-xs flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Cargos (Debes) ({debitLines.length})</span>
              </div>
              <span className="font-mono text-emerald-300">
                Total: ${debitLines.reduce((acc, curr) => acc + curr.debit, 0).toLocaleString('es-CL')}
              </span>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[500px] flex-1">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-2 w-8 text-center">Sel</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Voucher</th>
                    <th className="p-2">RUT / Doc</th>
                    <th className="p-2">Glosa</th>
                    <th className="p-2 text-right">Monto Cargo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debitLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 text-xs">
                        No hay movimientos de cargo en esta selección.
                      </td>
                    </tr>
                  ) : (
                    debitLines.map((l) => {
                      const isSelected = selectedDebitKeys.includes(l.key);
                      return (
                        <tr
                          key={l.key}
                          onClick={() => {
                            if (l.matchId) return;
                            setSelectedDebitKeys(prev => 
                              prev.includes(l.key) ? prev.filter(k => k !== l.key) : [...prev, l.key]
                            );
                          }}
                          className={`cursor-pointer transition-colors ${
                            l.matchId 
                              ? 'bg-emerald-50/40 text-slate-400' 
                              : isSelected
                              ? 'bg-amber-100/90 font-medium text-amber-900'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              disabled={!!l.matchId}
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDebitKeys(prev => [...prev, l.key]);
                                } else {
                                  setSelectedDebitKeys(prev => prev.filter(k => k !== l.key));
                                }
                              }}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                          <td className="p-2 font-mono text-[11px] whitespace-nowrap">{l.voucherDate}</td>
                          <td className="p-2 font-semibold">#{l.voucherNumber}</td>
                          <td className="p-2 text-[11px]">
                            {l.auxiliaryRut ? (
                              <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">{l.auxiliaryRut}</span>
                            ) : null}
                            {l.documentRef ? (
                              <span className="ml-1 text-slate-500">#{l.documentRef}</span>
                            ) : null}
                          </td>
                          <td className="p-2 max-w-xs truncate text-[11px] text-slate-700" title={l.gloss}>
                            {l.gloss}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            ${l.debit.toLocaleString('es-CL')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* COLUMNA DERECHA: ABONOS (HABERES) */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="p-3 bg-slate-900 text-white font-bold text-xs flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4 text-amber-400" />
                <span>Abonos (Haberes) ({creditLines.length})</span>
              </div>
              <span className="font-mono text-amber-300">
                Total: ${creditLines.reduce((acc, curr) => acc + curr.credit, 0).toLocaleString('es-CL')}
              </span>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[500px] flex-1">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-2 w-8 text-center">Sel</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Voucher</th>
                    <th className="p-2">RUT / Doc</th>
                    <th className="p-2">Glosa</th>
                    <th className="p-2 text-right">Monto Abono</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {creditLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 text-xs">
                        No hay movimientos de abono en esta selección.
                      </td>
                    </tr>
                  ) : (
                    creditLines.map((l) => {
                      const isSelected = selectedCreditKeys.includes(l.key);
                      return (
                        <tr
                          key={l.key}
                          onClick={() => {
                            if (l.matchId) return;
                            setSelectedCreditKeys(prev => 
                              prev.includes(l.key) ? prev.filter(k => k !== l.key) : [...prev, l.key]
                            );
                          }}
                          className={`cursor-pointer transition-colors ${
                            l.matchId 
                              ? 'bg-emerald-50/40 text-slate-400' 
                              : isSelected
                              ? 'bg-amber-100/90 font-medium text-amber-900'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              disabled={!!l.matchId}
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCreditKeys(prev => [...prev, l.key]);
                                } else {
                                  setSelectedCreditKeys(prev => prev.filter(k => k !== l.key));
                                }
                              }}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                          <td className="p-2 font-mono text-[11px] whitespace-nowrap">{l.voucherDate}</td>
                          <td className="p-2 font-semibold">#{l.voucherNumber}</td>
                          <td className="p-2 text-[11px]">
                            {l.auxiliaryRut ? (
                              <span className="font-mono bg-slate-100 px-1 rounded text-slate-700">{l.auxiliaryRut}</span>
                            ) : null}
                            {l.documentRef ? (
                              <span className="ml-1 text-slate-500">#{l.documentRef}</span>
                            ) : null}
                          </td>
                          <td className="p-2 max-w-xs truncate text-[11px] text-slate-700" title={l.gloss}>
                            {l.gloss}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            ${l.credit.toLocaleString('es-CL')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* --- PANEL STICKY INFERIOR DE CONFIRMACIÓN DE PAREO DE PARTIDAS --- */}
      {(selectedDebitKeys.length > 0 || selectedCreditKeys.length > 0) && (
        <div className="fixed bottom-4 right-4 left-4 md:left-64 z-40 bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 animate-slideUp">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            {/* Resumen matemático de la selección */}
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Selección Activa de Calce
                </span>
                <span className="px-2 py-0.5 bg-slate-800 text-amber-400 rounded text-xs font-mono font-bold">
                  {selectionMath.selectedDebitsCount} Cargo(s): ${selectionMath.sumDebits.toLocaleString('es-CL')}
                </span>
                <span className="text-slate-500 font-bold">↔</span>
                <span className="px-2 py-0.5 bg-slate-800 text-amber-400 rounded text-xs font-mono font-bold">
                  {selectionMath.selectedCreditsCount} Abono(s): ${selectionMath.sumCredits.toLocaleString('es-CL')}
                </span>
              </div>

              <div className="text-xs flex items-center gap-2">
                <span>Diferencia para Calce:</span>
                <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${
                  selectionMath.diff === 0 && selectionMath.sumDebits > 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  ${selectionMath.diff.toLocaleString('es-CL')}
                </span>
                {selectionMath.diff === 0 && selectionMath.sumDebits > 0 ? (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> Cuadrado Perfecto
                  </span>
                ) : (
                  <span className="text-rose-400 text-[11px]">
                    (Los cargos y abonos deben sumar exactamente igual para poder calzar)
                  </span>
                )}
              </div>
            </div>

            {/* Ingrese nota y botón final de Calzar */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                placeholder="Nota / Ref (Ej: F29 Febrero)..."
                value={matchNotes}
                onChange={(e) => setMatchNotes(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white placeholder-slate-400 text-xs px-3 py-2 rounded focus:outline-none focus:border-amber-400 flex-1 md:w-56"
              />

              <button
                onClick={handleCreateManualMatch}
                disabled={!selectionMath.isMatchedPair}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded font-bold text-xs flex items-center gap-1.5 transition-colors flex-shrink-0 shadow-lg"
              >
                <Link2 className="w-4 h-4" />
                <span>Calzar Partidas</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
