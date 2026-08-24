import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, setDoc } from 'firebase/firestore';
import { Company, ChartOfAccount, Voucher, BankStatementLine, BankReconciliation, FiscalPeriodYear } from '../types';

interface ConciliacionBancariaViewProps {
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  vouchers: Voucher[];
  fiscalYears: FiscalPeriodYear[];
  onVouchersUpdated?: () => void;
}

export default function ConciliacionBancariaView({
  studyId,
  company,
  accounts,
  vouchers,
  fiscalYears,
  onVouchersUpdated
}: ConciliacionBancariaViewProps) {
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(new Date().toISOString().slice(0, 7));
  const [statementLines, setStatementLines] = useState<BankStatementLine[]>([]);
  const [bankFinalBalanceInput, setBankFinalBalanceInput] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [savedReconciliations, setSavedReconciliations] = useState<BankReconciliation[]>([]);

  // CSV Paste / Import Modal
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [pastedCSV, setPastedCSV] = useState<string>('');

  // Quick Voucher Modal for Unaccounted Bank Line
  const [quickVoucherLine, setQuickVoucherLine] = useState<BankStatementLine | null>(null);
  const [quickExpenseAccountId, setQuickExpenseAccountId] = useState<string>('');
  const [quickGloss, setQuickGloss] = useState<string>('');

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Bank Accounts from chart of accounts
  const bankAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const code = acc.code || '';
      const name = (acc.name || '').toLowerCase();
      const type = (acc.type || '').toLowerCase();
      return (
        acc.estado !== 'Inactivo' &&
        (type.includes('activo') || code.startsWith('1')) &&
        (name.includes('banco') || name.includes('caja') || name.includes('cuenta corriente') || name.includes('tesoreria') || code.startsWith('1-1-01'))
      );
    });
  }, [accounts]);

  // Set default bank account
  useEffect(() => {
    if (bankAccounts.length > 0 && !selectedBankAccountId) {
      setSelectedBankAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankAccountId]);

  const selectedBankAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedBankAccountId);
  }, [accounts, selectedBankAccountId]);

  // Fetch Existing Reconciliations from Firestore
  const fetchReconciliations = async () => {
    try {
      const snap = await getDocs(collection(companyRef, 'bankReconciliations'));
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as BankReconciliation));
      setSavedReconciliations(recs);

      // Load matching reconciliation if exists for current account and period
      const existing = recs.find(r => r.bankAccountId === selectedBankAccountId && r.period === selectedPeriod);
      if (existing) {
        setStatementLines(existing.lines || []);
        setBankFinalBalanceInput(existing.bankFinalBalance || 0);
        setNotes(existing.notes || '');
      } else {
        setStatementLines([]);
        setBankFinalBalanceInput(0);
        setNotes('');
      }
    } catch (err) {
      console.error('Error loading bank reconciliations:', err);
    }
  };

  useEffect(() => {
    if (selectedBankAccountId) {
      fetchReconciliations();
    }
  }, [selectedBankAccountId, selectedPeriod]);

  // Vouchers affecting the selected bank account in the period
  const bankVouchers = useMemo(() => {
    if (!selectedBankAccount) return [];

    const list: {
      voucher: Voucher;
      line: any;
      debit: number; // Ingreso al banco
      credit: number; // Egreso del banco
      date: string;
      gloss: string;
    }[] = [];

    vouchers.forEach(v => {
      if (v.status !== 'Anulado') {
        const vDate = v.date || '';
        const vPeriod = v.period || vDate.slice(0, 7);
        if (vPeriod === selectedPeriod) {
          v.lines.forEach(l => {
            if (l.accountId === selectedBankAccount.id || l.accountCode === selectedBankAccount.code) {
              list.push({
                voucher: v,
                line: l,
                debit: l.debit || 0,
                credit: l.credit || 0,
                date: v.date,
                gloss: l.gloss || v.gloss
              });
            }
          });
        }
      }
    });

    return list;
  }, [vouchers, selectedBankAccount, selectedPeriod]);

  // Calculate Book Balance (Saldo según Libro Mayor) for the bank account
  const bookFinalBalance = useMemo(() => {
    if (!selectedBankAccount) return 0;
    let totalDebit = 0;
    let totalCredit = 0;

    vouchers.forEach(v => {
      if (v.status !== 'Anulado') {
        const vPeriod = v.period || v.date.slice(0, 7);
        // Include movements up to selected period
        if (vPeriod <= selectedPeriod) {
          v.lines.forEach(l => {
            if (l.accountId === selectedBankAccount.id || l.accountCode === selectedBankAccount.code) {
              totalDebit += l.debit || 0;
              totalCredit += l.credit || 0;
            }
          });
        }
      }
    });

    return totalDebit - totalCredit;
  }, [vouchers, selectedBankAccount, selectedPeriod]);

  // Auto-Match Algorithm
  const handleAutoMatch = () => {
    const matchedVoucherIds = new Set<string>();

    const updatedLines = statementLines.map(line => {
      // Find matching voucher
      const match = bankVouchers.find(bv => {
        if (matchedVoucherIds.has(bv.voucher.id)) return false;

        // Check if amounts match
        if (line.deposit > 0 && bv.debit === line.deposit) return true;
        if (line.charge > 0 && bv.credit === line.charge) return true;

        return false;
      });

      if (match) {
        matchedVoucherIds.add(match.voucher.id);
        return {
          ...line,
          matchedVoucherId: match.voucher.id,
          matchedVoucherNumber: match.voucher.voucherNumber,
          matchedStatus: 'Conciliado' as const
        };
      }

      return line;
    });

    setStatementLines(updatedLines);
    alert('⚡ Match automático completado. Se cruzaron las partidas con coincidencia exacta de montos.');
  };

  // Toggle manual match
  const handleToggleManualMatch = (lineId: string) => {
    setStatementLines(prev =>
      prev.map(l => {
        if (l.id === lineId) {
          const nextStatus = l.matchedStatus === 'Conciliado' ? 'Pendiente' : 'Conciliado';
          return {
            ...l,
            matchedStatus: nextStatus,
            matchedVoucherId: nextStatus === 'Pendiente' ? undefined : l.matchedVoucherId,
            matchedVoucherNumber: nextStatus === 'Pendiente' ? undefined : l.matchedVoucherNumber
          };
        }
        return l;
      })
    );
  };

  // Parse pasted CSV cartola
  const handleImportPastedCSV = () => {
    if (!pastedCSV.trim()) {
      alert('Pegue el contenido de la cartola bancaria.');
      return;
    }

    const lines = pastedCSV.trim().split('\n');
    const newItems: BankStatementLine[] = [];
    let runningBalance = 0;

    lines.forEach((rawLine, idx) => {
      const parts = rawLine.split(/[;\t,]/).map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 3) {
        const date = parts[0] || `${selectedPeriod}-01`;
        const desc = parts[1] || 'MOVIMIENTO BANCARIO';
        const docNum = parts.length >= 4 ? parts[2] : '';
        const chargeStr = parts.length >= 4 ? parts[3] : parts[2];
        const depositStr = parts.length >= 5 ? parts[4] : '0';

        const charge = Math.abs(parseFloat(chargeStr.replace(/[^0-9.-]/g, '')) || 0);
        const deposit = Math.abs(parseFloat(depositStr.replace(/[^0-9.-]/g, '')) || 0);

        runningBalance += deposit - charge;

        newItems.push({
          id: `csv_${Date.now()}_${idx}`,
          date,
          description: desc,
          documentNumber: docNum,
          charge,
          deposit,
          balance: runningBalance,
          matchedStatus: 'Pendiente'
        });
      }
    });

    if (newItems.length > 0) {
      setStatementLines(newItems);
      setBankFinalBalanceInput(runningBalance);
      setShowImportModal(false);
      setPastedCSV('');
      alert(`✅ Se importaron ${newItems.length} movimientos de la cartola bancaria.`);
    } else {
      alert('No se pudieron procesar las líneas. Formato esperado: Fecha; Descripción; N° Doc; Cargo; Abono');
    }
  };

  // Quick Post Unaccounted Bank Fee or Income
  const handleQuickPostVoucher = async () => {
    if (!quickVoucherLine || !selectedBankAccount || !quickExpenseAccountId) {
      alert('Seleccione la cuenta de contrapartida (Gasto Bancario / Ingreso).');
      return;
    }

    const counterAcc = accounts.find(a => a.id === quickExpenseAccountId);
    if (!counterAcc) return;

    try {
      const nextVoucherNumber = (vouchers.length > 0 ? Math.max(...vouchers.map(v => v.voucherNumber || 0)) : 0) + 1;
      const isCharge = quickVoucherLine.charge > 0;
      const amount = isCharge ? quickVoucherLine.charge : quickVoucherLine.deposit;

      let voucherLines = [];
      if (isCharge) {
        // Egreso por Comisión / Gasto
        voucherLines = [
          {
            id: 'l1',
            accountId: counterAcc.id,
            accountCode: counterAcc.code,
            accountName: counterAcc.name,
            debit: amount,
            credit: 0,
            documentRef: quickVoucherLine.documentNumber || 'BANCO',
            gloss: quickGloss || quickVoucherLine.description
          },
          {
            id: 'l2',
            accountId: selectedBankAccount.id,
            accountCode: selectedBankAccount.code,
            accountName: selectedBankAccount.name,
            debit: 0,
            credit: amount,
            documentRef: quickVoucherLine.documentNumber || 'BANCO',
            gloss: quickGloss || quickVoucherLine.description
          }
        ];
      } else {
        // Ingreso por Abono Bancario
        voucherLines = [
          {
            id: 'l1',
            accountId: selectedBankAccount.id,
            accountCode: selectedBankAccount.code,
            accountName: selectedBankAccount.name,
            debit: amount,
            credit: 0,
            documentRef: quickVoucherLine.documentNumber || 'BANCO',
            gloss: quickGloss || quickVoucherLine.description
          },
          {
            id: 'l2',
            accountId: counterAcc.id,
            accountCode: counterAcc.code,
            accountName: counterAcc.name,
            debit: 0,
            credit: amount,
            documentRef: quickVoucherLine.documentNumber || 'BANCO',
            gloss: quickGloss || quickVoucherLine.description
          }
        ];
      }

      const newVoucherData = {
        voucherNumber: nextVoucherNumber,
        date: quickVoucherLine.date,
        period: selectedPeriod,
        type: isCharge ? 'Egreso' : 'Ingreso',
        gloss: `Ajuste Conciliación Bancaria - ${quickGloss || quickVoucherLine.description}`,
        lines: voucherLines,
        totalDebit: amount,
        totalCredit: amount,
        status: 'Valido',
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(companyRef, 'vouchers'), newVoucherData);

      // Automatically match this line
      setStatementLines(prev =>
        prev.map(l => {
          if (l.id === quickVoucherLine.id) {
            return {
              ...l,
              matchedStatus: 'Conciliado',
              matchedVoucherId: docRef.id,
              matchedVoucherNumber: nextVoucherNumber
            };
          }
          return l;
        })
      );

      setQuickVoucherLine(null);
      alert(`✅ Comprobante N° ${nextVoucherNumber} generado y conciliado automáticamente.`);
      if (onVouchersUpdated) onVouchersUpdated();
    } catch (err: any) {
      console.error('Error posting quick voucher:', err);
      alert('Error: ' + err.message);
    }
  };

  // Reconciliation Mathematical Calculations
  const reconciliationSummary = useMemo(() => {
    // 1. Unmatched statement charges (cargos del banco no contabilizados)
    const unmatchedCharges = statementLines
      .filter(l => l.matchedStatus === 'Pendiente' && l.charge > 0)
      .reduce((sum, l) => sum + l.charge, 0);

    // 2. Unmatched statement deposits (abonos del banco no contabilizados)
    const unmatchedDeposits = statementLines
      .filter(l => l.matchedStatus === 'Pendiente' && l.deposit > 0)
      .reduce((sum, l) => sum + l.deposit, 0);

    // 3. Matched Statement Line IDs
    const matchedVoucherIds = new Set(
      statementLines.filter(l => l.matchedStatus === 'Conciliado' && l.matchedVoucherId).map(l => l.matchedVoucherId)
    );

    // 4. Deposits in transit (Ingresos en libros pero no en cartola)
    const depositsInTransit = bankVouchers
      .filter(bv => bv.debit > 0 && !matchedVoucherIds.has(bv.voucher.id))
      .reduce((sum, bv) => sum + bv.debit, 0);

    // 5. Outstanding checks / Egresos in transit (Egresos en libros pero no cobrados en banco)
    const outstandingChecks = bankVouchers
      .filter(bv => bv.credit > 0 && !matchedVoucherIds.has(bv.voucher.id))
      .reduce((sum, bv) => sum + bv.credit, 0);

    // Reconciled Statement Balance Equation:
    // Saldo Cartola + Depósitos en Tránsito - Cheques en Tránsito
    const reconciledStatementBalance = bankFinalBalanceInput + depositsInTransit - outstandingChecks;

    // Adjusted Book Balance:
    // Saldo Libros + Abonos no contabilizados - Cargos no contabilizados
    const adjustedBookBalance = bookFinalBalance + unmatchedDeposits - unmatchedCharges;

    // Final Difference
    const difference = Math.abs(reconciledStatementBalance - adjustedBookBalance);
    const isBalanced = difference === 0;

    return {
      unmatchedCharges,
      unmatchedDeposits,
      depositsInTransit,
      outstandingChecks,
      reconciledStatementBalance,
      adjustedBookBalance,
      difference,
      isBalanced
    };
  }, [statementLines, bankVouchers, bankFinalBalanceInput, bookFinalBalance]);

  // Save Reconciliation State to Firestore
  const handleSaveReconciliation = async () => {
    if (!selectedBankAccount) return;
    setLoading(true);

    try {
      const recId = `${selectedBankAccount.code}_${selectedPeriod}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const recData: BankReconciliation = {
        id: recId,
        period: selectedPeriod,
        bankAccountId: selectedBankAccount.id,
        bankAccountCode: selectedBankAccount.code,
        bankAccountName: selectedBankAccount.name,
        statementDate: `${selectedPeriod}-28`,
        bankFinalBalance: bankFinalBalanceInput,
        bookFinalBalance: bookFinalBalance,
        unmatchedCharges: reconciliationSummary.unmatchedCharges,
        unmatchedDeposits: reconciliationSummary.unmatchedDeposits,
        outstandingChecks: reconciliationSummary.outstandingChecks,
        depositsInTransit: reconciliationSummary.depositsInTransit,
        reconciledBalance: reconciliationSummary.reconciledStatementBalance,
        difference: reconciliationSummary.difference,
        status: reconciliationSummary.isBalanced ? 'Cuadrado' : 'Descuadrado',
        notes,
        lines: statementLines,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(companyRef, 'bankReconciliations', recId), recData);
      alert('💾 Conciliación bancaria guardada exitosamente en el sistema.');
      fetchReconciliations();
    } catch (err: any) {
      console.error('Error saving reconciliation:', err);
      alert('Error al guardar conciliación: ' + err.message);
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
            <span className="text-xl">🏦</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Conciliación Bancaria Automatizada</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cruce inteligente entre Cartola Bancaria y Libro Mayor con cuadratura automática de saldos ({company.name})
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              const csvContent = 'data:text/csv;charset=utf-8,\uFEFFFecha;Descripcion;N_Doc;Cargo;Abono;Saldo\n2026-08-01;PAGO PROVEEDOR FACTURA 1024;1024;50000;0;450000\n2026-08-02;ABONO CLIENTE TRANSFERENCIA;TR-12;0;120000;570000\n2026-08-05;COMISION MANTENCION CTA;COM;5500;0;564500';
              const encodedUri = encodeURI(csvContent);
              const link = document.createElement('a');
              link.setAttribute('href', encodedUri);
              link.setAttribute('download', `Plantilla_Cartola_Bancaria.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
            title="Descargar plantilla CSV para subir cartolas"
          >
            <span>📊</span>
            <span>Plantilla Excel/CSV</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Importar Cartola CSV</span>
          </button>

          <button
            onClick={handleAutoMatch}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>Match Automático</span>
          </button>

          <button
            onClick={handleSaveReconciliation}
            disabled={loading}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>💾</span>
            <span>{loading ? 'Guardando...' : 'Guardar Conciliación'}</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Account & Period Selectors */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Cuenta Bancaria a Conciliar:</label>
          <select
            value={selectedBankAccountId}
            onChange={(e) => setSelectedBankAccountId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
          >
            {bankAccounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.code} - {acc.name}
              </option>
            ))}
          </select>
          {selectedBankAccount && (
            <div className="mt-1.5 text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                {selectedBankAccount.bankInstitution || 'Institución Bancaria'}
              </span>
              {selectedBankAccount.bankAccountNumber && (
                <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded text-slate-800">
                  N° Cta: {selectedBankAccount.bankAccountNumber}
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Período Contable:</label>
          <input
            type="month"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 font-semibold"
          />
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Saldo Final Cartola Banco ($):</label>
          <input
            type="number"
            value={bankFinalBalanceInput}
            onChange={(e) => setBankFinalBalanceInput(Number(e.target.value))}
            className="w-full bg-white border border-slate-300 rounded-md px-3 py-1.5 font-mono font-black text-indigo-900"
          />
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Saldo según Libro Mayor ($):</label>
          <div className="w-full bg-slate-200 border border-slate-300 rounded-md px-3 py-1.5 font-mono font-black text-slate-900">
            ${bookFinalBalance.toLocaleString('es-CL')}
          </div>
        </div>
      </div>

      {/* RECONCILIATION SUMMARY BOX / AUDIT REPORT */}
      <div className={`p-4 rounded-xl border transition-all ${
        reconciliationSummary.isBalanced
          ? 'bg-emerald-50/80 border-emerald-300'
          : 'bg-rose-50/80 border-rose-300'
      }`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-3 mb-3 border-slate-200">
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700 flex items-center gap-2">
              <span>📋</span> Resumen y Acta de Conciliación Bancaria ({selectedPeriod})
            </span>
            <span className="text-xs text-slate-500 font-sans">
              Cuenta: {selectedBankAccount?.code} - {selectedBankAccount?.name}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
              reconciliationSummary.isBalanced
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            }`}>
              <span>{reconciliationSummary.isBalanced ? '✓' : '⚠️'}</span>
              <span>{reconciliationSummary.isBalanced ? 'Conciliación Cuadrada (Diferencia $0)' : `Descuadrado por $${reconciliationSummary.difference.toLocaleString('es-CL')}`}</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
          {/* Lado 1: Saldo Cartola */}
          <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
            <div className="font-bold text-slate-900 font-sans border-b pb-1 text-[11px] uppercase">
              1. Enfoque Saldo según Banco
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 font-sans">Saldo según Cartola Bancaria:</span>
              <span className="font-bold text-slate-900">${bankFinalBalanceInput.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span className="font-sans">(+) Depósitos en Tránsito:</span>
              <span className="font-bold">+${reconciliationSummary.depositsInTransit.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-rose-700">
              <span className="font-sans">(-) Cheques / Egresos en Tránsito:</span>
              <span className="font-bold">-${reconciliationSummary.outstandingChecks.toLocaleString('es-CL')}</span>
            </div>
            <div className="border-t pt-1 flex justify-between font-black text-slate-900 bg-slate-50 px-2 py-0.5 rounded">
              <span className="font-sans">(=) Saldo Banco Ajustado:</span>
              <span className="text-indigo-700">${reconciliationSummary.reconciledStatementBalance.toLocaleString('es-CL')}</span>
            </div>
          </div>

          {/* Lado 2: Saldo Libros */}
          <div className="space-y-1.5 bg-white p-3 rounded-lg border border-slate-200">
            <div className="font-bold text-slate-900 font-sans border-b pb-1 text-[11px] uppercase">
              2. Enfoque Saldo según Libro Mayor
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 font-sans">Saldo según Libro Mayor:</span>
              <span className="font-bold text-slate-900">${bookFinalBalance.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span className="font-sans">(+) Abonos Banco no en Libros:</span>
              <span className="font-bold">+${reconciliationSummary.unmatchedDeposits.toLocaleString('es-CL')}</span>
            </div>
            <div className="flex justify-between text-rose-700">
              <span className="font-sans">(-) Cargos / Comisiones no en Libros:</span>
              <span className="font-bold">-${reconciliationSummary.unmatchedCharges.toLocaleString('es-CL')}</span>
            </div>
            <div className="border-t pt-1 flex justify-between font-black text-slate-900 bg-slate-50 px-2 py-0.5 rounded">
              <span className="font-sans">(=) Saldo Libros Ajustado:</span>
              <span className="text-indigo-700">${reconciliationSummary.adjustedBookBalance.toLocaleString('es-CL')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* DUAL VIEW: CARTOLA BANCARIA VS MOVIMIENTOS EN LIBROS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Cartola Bancaria */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-3 bg-slate-900 text-white flex justify-between items-center">
            <div>
              <span className="font-bold text-xs uppercase tracking-wide">Cartola Bancaria ({statementLines.length} líneas)</span>
            </div>
            <button
              onClick={() => {
                const updated = statementLines.map(l => ({ ...l, matchedStatus: 'Conciliado' as const }));
                setStatementLines(updated);
              }}
              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded"
            >
              Conciliar Todos
            </button>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-2 px-2.5">Fecha</th>
                  <th className="py-2 px-2.5">Glosa Banco</th>
                  <th className="py-2 px-2 text-right">Cargo ($)</th>
                  <th className="py-2 px-2 text-right">Abono ($)</th>
                  <th className="py-2 px-2.5 text-center">Estado</th>
                  <th className="py-2 px-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {statementLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay movimientos de cartola cargados. Utiliza el botón "📥 Importar Cartola Bancaria" para cargar el extracto bancario en Excel/CSV o agrega una línea manual.
                    </td>
                  </tr>
                ) : (
                  statementLines.map(l => (
                  <tr key={l.id} className={l.matchedStatus === 'Conciliado' ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}>
                    <td className="py-2 px-2.5 text-slate-600">{l.date}</td>
                    <td className="py-2 px-2.5 font-sans truncate max-w-[140px] text-slate-900 font-medium">
                      {l.description}
                    </td>
                    <td className="py-2 px-2 text-right text-rose-700 font-bold">
                      {l.charge > 0 ? `$${l.charge.toLocaleString('es-CL')}` : '-'}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-700 font-bold">
                      {l.deposit > 0 ? `$${l.deposit.toLocaleString('es-CL')}` : '-'}
                    </td>
                    <td className="py-2 px-2.5 text-center">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                        l.matchedStatus === 'Conciliado'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {l.matchedStatus === 'Conciliado' ? '✓ Conciliado' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center font-sans">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleToggleManualMatch(l.id)}
                          className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px]"
                          title="Alternar estado"
                        >
                          {l.matchedStatus === 'Conciliado' ? 'Desvincular' : 'Match'}
                        </button>
                        {l.matchedStatus === 'Pendiente' && (
                          <button
                            onClick={() => {
                              setQuickVoucherLine(l);
                              setQuickGloss(l.description);
                              const defaultExpense = accounts.find(a => a.code.startsWith('4-2-01') || a.name.toLowerCase().includes('comision') || a.name.toLowerCase().includes('bancari'));
                              if (defaultExpense) setQuickExpenseAccountId(defaultExpense.id);
                            }}
                            className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded text-[10px]"
                            title="Contabilizar rápido en Libros"
                          >
                            + Asiento
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Movimientos en Libro Mayor */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-3 bg-slate-900 text-white flex justify-between items-center">
            <div>
              <span className="font-bold text-xs uppercase tracking-wide">
                Movimientos en Libros ({bankVouchers.length} asientos)
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              Saldo: ${bookFinalBalance.toLocaleString('es-CL')}
            </span>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="py-2 px-2.5">Fecha</th>
                  <th className="py-2 px-2.5">N° Asiento</th>
                  <th className="py-2 px-2.5">Glosa / Concepto</th>
                  <th className="py-2 px-2 text-right">Debe / Ingreso ($)</th>
                  <th className="py-2 px-2 text-right">Haber / Egreso ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-[11px]">
                {bankVouchers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-sans italic">
                      No hay comprobantes contables registrados para esta cuenta en el período.
                    </td>
                  </tr>
                ) : (
                  bankVouchers.map((bv, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 text-slate-600">{bv.date}</td>
                      <td className="py-2 px-2.5 font-bold text-indigo-700">N° {bv.voucher.voucherNumber}</td>
                      <td className="py-2 px-2.5 font-sans truncate max-w-[140px] text-slate-900 font-medium">
                        {bv.gloss}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-emerald-700">
                        {bv.debit > 0 ? `$${bv.debit.toLocaleString('es-CL')}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-rose-700">
                        {bv.credit > 0 ? `$${bv.credit.toLocaleString('es-CL')}` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* IMPORT CSV MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="text-sm font-black text-slate-900 uppercase">
                Importar Cartola Bancaria (CSV o Pegar Texto)
              </h4>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Pegue las líneas copiadas de la cartola de su banco o archivo CSV con formato:
              <br />
              <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-800 font-mono text-[11px]">
                Fecha; Descripción; N° Documento; Cargo; Abono
              </code>
            </p>

            <textarea
              rows={8}
              value={pastedCSV}
              onChange={(e) => setPastedCSV(e.target.value)}
              placeholder={`2026-08-01;PAGO PROVEEDOR TRANSFERENCIA;10293;450000;0\n2026-08-03;DEPOSITO CLIENTE FACTURA 55;44812;0;1200000\n2026-08-05;COMISION MANTENCION CUENTA;0;15000;0`}
              className="w-full font-mono text-xs border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleImportPastedCSV}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-xs"
              >
                Procesar e Importar Líneas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK VOUCHER MODAL */}
      {quickVoucherLine && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="text-sm font-black text-slate-900 uppercase">
                Contabilizar Partida Bancaria Automática
              </h4>
              <button
                onClick={() => setQuickVoucherLine(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border text-xs space-y-1">
              <div><span className="font-bold">Glosa Banco:</span> {quickVoucherLine.description}</div>
              <div><span className="font-bold">Fecha:</span> {quickVoucherLine.date}</div>
              <div>
                <span className="font-bold">Monto:</span> ${((quickVoucherLine.charge || 0) + (quickVoucherLine.deposit || 0)).toLocaleString('es-CL')} (
                {quickVoucherLine.charge > 0 ? 'Cargo / Egreso Bancario' : 'Abono / Ingreso Bancario'})
              </div>
            </div>

            <div className="space-y-3 text-xs">
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

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setQuickVoucherLine(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded"
              >
                Cancelar
              </button>
              <button
                onClick={handleQuickPostVoucher}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded shadow-xs"
              >
                Crear Asiento y Conciliar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
