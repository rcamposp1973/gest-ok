import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear } from '../types';
import { 
  Scale, 
  Download, 
  Printer, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  AlertTriangle,
  FolderTree,
  Eye,
  EyeOff,
  Layers,
  ShieldCheck
} from 'lucide-react';

interface BalanceIFRSViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  onOpenAuditor?: () => void;
}

interface IFRSAccountLine {
  id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

interface IFRSParentRubro {
  id: string;
  code: string;
  name: string;
  total: number;
  accounts: IFRSAccountLine[];
}

export default function BalanceIFRSView({
  company,
  vouchers,
  accounts,
  fiscalYears,
  onOpenAuditor
}: BalanceIFRSViewProps) {
  const [periodFilter, setPeriodFilter] = useState<string>('Todos');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showZeroBalances, setShowZeroBalances] = useState<boolean>(false);
  const [showAccountDetails, setShowAccountDetails] = useState<boolean>(true);
  const [expandedRubros, setExpandedRubros] = useState<Record<string, boolean>>({
    '1101': true,
    '1102': true,
    '1103': true,
    '1201': true,
    '2101': true,
    '2103': true,
    '2301': true
  });

  const toggleRubro = (rubroId: string) => {
    setExpandedRubros(prev => ({ ...prev, [rubroId]: !prev[rubroId] }));
  };

  // Available periods from vouchers
  const availablePeriods = useMemo(() => {
    const periodsSet = new Set<string>();
    vouchers.forEach(v => {
      if (v.date && v.date.length >= 7) {
        periodsSet.add(v.date.slice(0, 7));
      }
    });
    return Array.from(periodsSet).sort().reverse();
  }, [vouchers]);

  // Account map
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(a => {
      map.set(a.id, a);
      map.set(a.code, a);
    });
    return map;
  }, [accounts]);

  // Classification & Grouping by Parent Rubros (Cuentas Padre IFRS)
  const {
    activosCorrientesRubros,
    activosNoCorrientesRubros,
    pasivosCorrientesRubros,
    pasivosNoCorrientesRubros,
    patrimonioRubros,
    totalActivosCorrientes,
    totalActivosNoCorrientes,
    totalActivos,
    totalPasivosCorrientes,
    totalPasivosNoCorrientes,
    totalPasivos,
    totalPatrimonioNeto,
    resultadoEjercicio,
    totalPasivoMasPatrimonio,
    diferenciaCuadratura,
    isBalanced,
    descuadradosCount
  } = useMemo(() => {
    // 1. Filtrar comprobantes válidos y equilibrados
    const validVouchers: Voucher[] = [];
    const descuadradosVouchers: Voucher[] = [];

    vouchers.forEach(v => {
      if (v.status === 'Anulado') return;

      if (periodFilter !== 'Todos' && v.date && !v.date.startsWith(periodFilter)) return;
      if (dateFrom && v.date && v.date < dateFrom) return;
      if (dateTo && v.date && v.date > dateTo) return;

      const vDebe = (v.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
      const vHaber = (v.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);

      if (Math.abs(vDebe - vHaber) > 0.01) {
        descuadradosVouchers.push(v);
      } else {
        validVouchers.push(v);
      }
    });

    // 2. Acumular movimientos por cuenta
    const accSums = new Map<string, { debit: number; credit: number; account: ChartOfAccount }>();

    accounts.forEach(a => {
      accSums.set(a.id, { debit: 0, credit: 0, account: a });
    });

    validVouchers.forEach(v => {
      (v.lines || []).forEach(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        if (debit === 0 && credit === 0) return;

        let targetAcc = accountMap.get(l.accountId) || accountMap.get(l.accountCode);
        if (!targetAcc) {
          const accCodeStr = (l.accountCode || '9999999').trim();
          const p = accCodeStr.charAt(0);
          let inferredType: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' = 'Gasto';
          if (p === '1') inferredType = 'Activo';
          else if (p === '2') {
            inferredType = (accCodeStr.startsWith('23') || accCodeStr.startsWith('2.3')) ? 'Patrimonio' : 'Pasivo';
          }
          else if (p === '3') inferredType = 'Ingreso';
          else if (p === '4' || p === '5') inferredType = 'Gasto';

          targetAcc = {
            id: l.accountId || l.accountCode || 'unknown',
            code: accCodeStr,
            name: l.accountName || 'Cuenta no clasificada',
            type: inferredType,
            requiereCentroCosto: false,
            requiereAuxiliarRUT: false,
            requiereConciliacionBancaria: false,
            requiereDocumento: false,
            estado: 'Activo'
          };
        }

        let entry = accSums.get(targetAcc.id);
        if (!entry) {
          entry = { debit: 0, credit: 0, account: targetAcc };
          accSums.set(targetAcc.id, entry);
        }

        entry.debit += debit;
        entry.credit += credit;
      });
    });

    // 3. Estructura de Rubros Padre IFRS
    // Activo Corriente (11xxxxx)
    const rubroEfectivo: IFRSParentRubro = { id: '1101', code: '1101000', name: 'Efectivo y Equivalentes al Efectivo', total: 0, accounts: [] };
    const rubroDeudores: IFRSParentRubro = { id: '1102', code: '1102000', name: 'Deudores Comerciales y Otras Cuentas por Cobrar', total: 0, accounts: [] };
    const rubroInventarios: IFRSParentRubro = { id: '1103', code: '1103000', name: 'Inventarios / Existencias', total: 0, accounts: [] };
    const rubroImpuestosActivos: IFRSParentRubro = { id: '1104', code: '1104000', name: 'Activos por Impuestos Corrientes (IVA CF, PPM, Remanente)', total: 0, accounts: [] };
    const rubroOtrosActivosCorr: IFRSParentRubro = { id: '1105', code: '1105000', name: 'Otros Activos Financieros Corrientes', total: 0, accounts: [] };

    // Activo No Corriente (12xxxxx)
    const rubroPPE: IFRSParentRubro = { id: '1201', code: '1201000', name: 'Propiedades, Planta y Equipo (PPE)', total: 0, accounts: [] };
    const rubroIntangibles: IFRSParentRubro = { id: '1202', code: '1202000', name: 'Activos Intangibles y Plusvalía', total: 0, accounts: [] };
    const rubroInversionesNoCorr: IFRSParentRubro = { id: '1203', code: '1203000', name: 'Propiedades de Inversión y Otros Activos No Corrientes', total: 0, accounts: [] };

    // Pasivo Corriente (21xxxxx)
    const rubroProveedores: IFRSParentRubro = { id: '2101', code: '2101000', name: 'Cuentas Comerciales y Otras Cuentas por Pagar', total: 0, accounts: [] };
    const rubroPrestamosCorto: IFRSParentRubro = { id: '2102', code: '2102000', name: 'Obligaciones con Instituciones de Crédito a Corto Plazo', total: 0, accounts: [] };
    const rubroImpuestosPasivos: IFRSParentRubro = { id: '2103', code: '2103000', name: 'Pasivos por Impuestos Corrientes (IVA DF, Retenciones, F29)', total: 0, accounts: [] };
    const rubroProvisionesLaborales: IFRSParentRubro = { id: '2104', code: '2104000', name: 'Provisiones y Beneficios a los Empleados (Leyes Sociales)', total: 0, accounts: [] };
    const rubroOtrosPasivosCorr: IFRSParentRubro = { id: '2105', code: '2105000', name: 'Otros Pasivos Corrientes', total: 0, accounts: [] };

    // Pasivo No Corriente (22xxxxx)
    const rubroDeudasLargo: IFRSParentRubro = { id: '2201', code: '2201000', name: 'Obligaciones Financieras a Largo Plazo', total: 0, accounts: [] };
    const rubroPasivosDiferidos: IFRSParentRubro = { id: '2202', code: '2202000', name: 'Pasivos por Impuestos Diferidos y Otros a Largo Plazo', total: 0, accounts: [] };

    // Patrimonio (23xxxxx)
    const rubroCapital: IFRSParentRubro = { id: '2301', code: '2301000', name: 'Capital Emitido y Pagado', total: 0, accounts: [] };
    const rubroReservas: IFRSParentRubro = { id: '2302', code: '2302000', name: 'Reservas y Otras Ganancias Integrales', total: 0, accounts: [] };
    const rubroResultadosAcum: IFRSParentRubro = { id: '2303', code: '2303000', name: 'Ganancias / Pérdidas Acumuladas de Ejercicios Anteriores', total: 0, accounts: [] };

    let totalIngresos = 0;
    let totalGastos = 0;

    accSums.forEach(({ debit, credit, account }) => {
      const code = (account.code || '').trim();
      const name = (account.name || '').toLowerCase();
      const normType = (account.type || '').toLowerCase();
      const codePrefix = code.charAt(0);

      // Criterios IFRS Chilenos:
      // Activos = 1, Pasivos = 2 (excepto 23), Patrimonio = 23, Ingresos = 3, Gastos/Costos = 4 ó 5
      const isPatrimonio = 
        code.startsWith('23') || 
        code.startsWith('2.3') || 
        normType.includes('patrimonio') || 
        normType.includes('capital');

      const isActivo = 
        codePrefix === '1' || 
        (!['2', '3', '4', '5'].includes(codePrefix) && normType.includes('activo'));

      const isPasivo = 
        !isPatrimonio && 
        (codePrefix === '2' || (!['1', '3', '4', '5'].includes(codePrefix) && normType.includes('pasivo')));

      const isIngreso = 
        codePrefix === '3' || 
        (!['1', '2', '4', '5'].includes(codePrefix) && (normType.includes('ingreso') || normType.includes('ganancia') || normType.includes('venta')));

      const isGasto = 
        codePrefix === '4' || 
        codePrefix === '5' || 
        (!['1', '2', '3'].includes(codePrefix) && (normType.includes('gasto') || normType.includes('costo') || normType.includes('perdida')));

      // 1. ACTIVOS
      if (isActivo) {
        const balance = debit - credit;
        if (!showZeroBalances && balance === 0) return;

        const lineItem: IFRSAccountLine = {
          id: account.id,
          code: account.code,
          name: account.name,
          debit,
          credit,
          balance
        };

        const isNoCorriente = 
          code.startsWith('12') || code.startsWith('1.2') ||
          name.includes('fijo') || name.includes('propiedad') || name.includes('planta') || 
          name.includes('equipo') || name.includes('intangible') || name.includes('largo plazo') ||
          name.includes('terreno') || name.includes('vehiculo') || name.includes('maquinaria');

        if (isNoCorriente) {
          if (name.includes('intangible') || name.includes('software') || name.includes('marca') || code.startsWith('1202') || code.startsWith('1.2.02')) {
            rubroIntangibles.accounts.push(lineItem);
            rubroIntangibles.total += balance;
          } else if (name.includes('inversion') || name.includes('asociada') || code.startsWith('1203') || code.startsWith('1.2.03')) {
            rubroInversionesNoCorr.accounts.push(lineItem);
            rubroInversionesNoCorr.total += balance;
          } else {
            rubroPPE.accounts.push(lineItem);
            rubroPPE.total += balance;
          }
        } else {
          if (name.includes('caja') || name.includes('banco') || name.includes('efectivo') || name.includes('tesoreria') || code.startsWith('1101') || code.startsWith('1.1.01')) {
            rubroEfectivo.accounts.push(lineItem);
            rubroEfectivo.total += balance;
          } else if (name.includes('iva') || name.includes('ppm') || name.includes('remanente') || name.includes('credito fiscal') || code.startsWith('1104') || code.startsWith('1.1.04')) {
            rubroImpuestosActivos.accounts.push(lineItem);
            rubroImpuestosActivos.total += balance;
          } else if (name.includes('inventario') || name.includes('mercaderia') || name.includes('existencia') || name.includes('materia prima') || code.startsWith('1103') || code.startsWith('1.1.03')) {
            rubroInventarios.accounts.push(lineItem);
            rubroInventarios.total += balance;
          } else if (name.includes('cliente') || name.includes('deudor') || name.includes('por cobrar') || name.includes('anticipo') || code.startsWith('1102') || code.startsWith('1.1.02')) {
            rubroDeudores.accounts.push(lineItem);
            rubroDeudores.total += balance;
          } else {
            rubroOtrosActivosCorr.accounts.push(lineItem);
            rubroOtrosActivosCorr.total += balance;
          }
        }
      }
      // 2. PASIVOS
      else if (isPasivo) {
        const balance = credit - debit;
        if (!showZeroBalances && balance === 0) return;

        const lineItem: IFRSAccountLine = {
          id: account.id,
          code: account.code,
          name: account.name,
          debit,
          credit,
          balance
        };

        const isNoCorriente = 
          code.startsWith('22') || code.startsWith('2.2') ||
          name.includes('largo plazo') || name.includes('hipotecario') || name.includes('diferido');

        if (isNoCorriente) {
          if (name.includes('diferido') || code.startsWith('2202') || code.startsWith('2.2.02')) {
            rubroPasivosDiferidos.accounts.push(lineItem);
            rubroPasivosDiferidos.total += balance;
          } else {
            rubroDeudasLargo.accounts.push(lineItem);
            rubroDeudasLargo.total += balance;
          }
        } else {
          if (name.includes('iva') || name.includes('debito fiscal') || name.includes('retencion') || name.includes('impuesto') || name.includes('f29') || code.startsWith('2103') || code.startsWith('2.1.03')) {
            rubroImpuestosPasivos.accounts.push(lineItem);
            rubroImpuestosPasivos.total += balance;
          } else if (name.includes('sueldo') || name.includes('leyes sociales') || name.includes('imposicion') || name.includes('previred') || name.includes('honorarios') || code.startsWith('2104') || code.startsWith('2.1.04')) {
            rubroProvisionesLaborales.accounts.push(lineItem);
            rubroProvisionesLaborales.total += balance;
          } else if (name.includes('prestamo') || name.includes('credito') || name.includes('banco') || name.includes('linea') || code.startsWith('2102') || code.startsWith('2.1.02')) {
            rubroPrestamosCorto.accounts.push(lineItem);
            rubroPrestamosCorto.total += balance;
          } else if (name.includes('proveedor') || name.includes('por pagar') || code.startsWith('2101') || code.startsWith('2.1.01')) {
            rubroProveedores.accounts.push(lineItem);
            rubroProveedores.total += balance;
          } else {
            rubroOtrosPasivosCorr.accounts.push(lineItem);
            rubroOtrosPasivosCorr.total += balance;
          }
        }
      }
      // 3. PATRIMONIO
      else if (isPatrimonio) {
        const balance = credit - debit;
        if (!showZeroBalances && balance === 0) return;

        const lineItem: IFRSAccountLine = {
          id: account.id,
          code: account.code,
          name: account.name,
          debit,
          credit,
          balance
        };

        if (name.includes('capital') || code.startsWith('2301') || code.startsWith('2.3.01')) {
          rubroCapital.accounts.push(lineItem);
          rubroCapital.total += balance;
        } else if (name.includes('reserva') || code.startsWith('2302') || code.startsWith('2.3.02')) {
          rubroReservas.accounts.push(lineItem);
          rubroReservas.total += balance;
        } else {
          rubroResultadosAcum.accounts.push(lineItem);
          rubroResultadosAcum.total += balance;
        }
      }
      // 4. INGRESOS
      else if (isIngreso) {
        totalIngresos += (credit - debit);
      }
      // 5. GASTOS / COSTOS
      else if (isGasto) {
        totalGastos += (debit - credit);
      }
    });

    const activosCorrientesRubros = [rubroEfectivo, rubroDeudores, rubroInventarios, rubroImpuestosActivos, rubroOtrosActivosCorr].filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);
    const activosNoCorrientesRubros = [rubroPPE, rubroIntangibles, rubroInversionesNoCorr].filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);

    const pasivosCorrientesRubros = [rubroProveedores, rubroPrestamosCorto, rubroImpuestosPasivos, rubroProvisionesLaborales, rubroOtrosPasivosCorr].filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);
    const pasivosNoCorrientesRubros = [rubroDeudasLargo, rubroPasivosDiferidos].filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);

    const patrimonioRubros = [rubroCapital, rubroReservas, rubroResultadosAcum].filter(r => showZeroBalances || r.total !== 0 || r.accounts.length > 0);

    const totalActivosCorrientes = activosCorrientesRubros.reduce((s, r) => s + r.total, 0);
    const totalActivosNoCorrientes = activosNoCorrientesRubros.reduce((s, r) => s + r.total, 0);
    const totalActivos = totalActivosCorrientes + totalActivosNoCorrientes;

    const totalPasivosCorrientes = pasivosCorrientesRubros.reduce((s, r) => s + r.total, 0);
    const totalPasivosNoCorrientes = pasivosNoCorrientesRubros.reduce((s, r) => s + r.total, 0);
    const totalPasivos = totalPasivosCorrientes + totalPasivosNoCorrientes;

    const totalPatrimonioDirecto = patrimonioRubros.reduce((s, r) => s + r.total, 0);
    const resultadoEjercicio = totalIngresos - totalGastos;
    const totalPatrimonioNeto = totalPatrimonioDirecto + resultadoEjercicio;

    const totalPasivoMasPatrimonio = totalPasivos + totalPatrimonioNeto;
    const diferenciaCuadratura = Math.abs(totalActivos - totalPasivoMasPatrimonio);
    const isBalanced = diferenciaCuadratura < 1;

    return {
      activosCorrientesRubros,
      activosNoCorrientesRubros,
      pasivosCorrientesRubros,
      pasivosNoCorrientesRubros,
      patrimonioRubros,
      totalActivosCorrientes,
      totalActivosNoCorrientes,
      totalActivos,
      totalPasivosCorrientes,
      totalPasivosNoCorrientes,
      totalPasivos,
      totalPatrimonioNeto,
      resultadoEjercicio,
      totalPasivoMasPatrimonio,
      diferenciaCuadratura,
      isBalanced,
      descuadradosCount: descuadradosVouchers.length
    };
  }, [accounts, vouchers, accountMap, periodFilter, dateFrom, dateTo, showZeroBalances]);

  // Export CSV
  const handleExportCSV = () => {
    const rows = [
      ['BALANCE CLASIFICADO IFRS / FECU (ESTADO DE SITUACIÓN FINANCIERA)', `"${company.name}"`, `RUT: ${company.rut}`],
      ['Período:', periodFilter !== 'Todos' ? periodFilter : 'Todo el Ejercicio'],
      ['Principio Contable:', 'Partida Doble: Activo = Pasivo + Patrimonio Neto'],
      [''],
      ['CÓDIGO RUBRO', 'RUBRO / CUENTA PADRE IFRS', 'SALDO ($)'],
      ['1. ACTIVOS', '', totalActivos.toString()],
      ['1.1. ACTIVOS CORRIENTES', '', totalActivosCorrientes.toString()],
      ...activosCorrientesRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['1.2. ACTIVOS NO CORRIENTES', '', totalActivosNoCorrientes.toString()],
      ...activosNoCorrientesRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['TOTAL ACTIVOS', '', totalActivos.toString()],
      [''],
      ['2. PASIVOS', '', totalPasivos.toString()],
      ['2.1. PASIVOS CORRIENTES', '', totalPasivosCorrientes.toString()],
      ...pasivosCorrientesRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['2.2. PASIVOS NO CORRIENTES', '', totalPasivosNoCorrientes.toString()],
      ...pasivosNoCorrientesRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['TOTAL PASIVOS', '', totalPasivos.toString()],
      [''],
      ['3. PATRIMONIO NETO', '', totalPatrimonioNeto.toString()],
      ...patrimonioRubros.flatMap(r => [
        [`"${r.code}"`, `"${r.name}"`, r.total.toString()],
        ...r.accounts.map(a => [`  "${a.code}"`, `  "${a.name}"`, a.balance.toString()])
      ]),
      ['3.9. RESULTADO DEL EJERCICIO (GANANCIA/PÉRDIDA)', '', resultadoEjercicio.toString()],
      ['TOTAL PATRIMONIO NETO', '', totalPatrimonioNeto.toString()],
      ['TOTAL PASIVO + PATRIMONIO NETO', '', totalPasivoMasPatrimonio.toString()],
      ['DIFERENCIA CUADRATURA', '', diferenciaCuadratura.toString()]
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(e => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Balance_Clasificado_IFRS_${company.rut}_${periodFilter !== 'Todos' ? periodFilter : 'General'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Renderizador de Rubros Padre con Cuentas Hijas
  const renderRubroBlock = (rubro: IFRSParentRubro, colorTheme: 'indigo' | 'rose' | 'emerald') => {
    const isExpanded = expandedRubros[rubro.id] ?? true;
    const borderCls = colorTheme === 'indigo' ? 'border-indigo-100 hover:border-indigo-200' : colorTheme === 'rose' ? 'border-rose-100 hover:border-rose-200' : 'border-emerald-100 hover:border-emerald-200';
    const bgHeaderCls = colorTheme === 'indigo' ? 'bg-indigo-50/70 text-indigo-950' : colorTheme === 'rose' ? 'bg-rose-50/70 text-rose-950' : 'bg-emerald-50/70 text-emerald-950';
    const tagCls = colorTheme === 'indigo' ? 'bg-indigo-100 text-indigo-800' : colorTheme === 'rose' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800';

    return (
      <div key={rubro.id} className={`border rounded-lg overflow-hidden transition-all ${borderCls} mb-2 bg-white shadow-2xs`}>
        {/* Cabecera del Rubro Padre */}
        <div 
          onClick={() => toggleRubro(rubro.id)}
          className={`px-3 py-2 flex items-center justify-between cursor-pointer select-none transition-colors ${bgHeaderCls}`}
        >
          <div className="flex items-center gap-2">
            <button className="text-slate-500 hover:text-slate-800 p-0.5">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${tagCls}`}>
              {rubro.code}
            </span>
            <span className="font-bold text-xs">
              {rubro.name}
            </span>
            <span className="text-[10px] text-slate-500 font-sans font-normal">
              ({rubro.accounts.length} {rubro.accounts.length === 1 ? 'cuenta' : 'cuentas'})
            </span>
          </div>

          <div className="font-mono font-black text-xs">
            ${rubro.total.toLocaleString('es-CL')}
          </div>
        </div>

        {/* Cuentas Hijas Analíticas de 7 Dígitos */}
        {isExpanded && showAccountDetails && rubro.accounts.length > 0 && (
          <div className="divide-y divide-slate-100 bg-slate-50/40 text-[11px] font-mono">
            {rubro.accounts.map(acc => (
              <div key={acc.id} className="px-3 py-1.5 flex justify-between items-center hover:bg-slate-100/80 transition-colors pl-8">
                <div className="flex items-center gap-2 truncate max-w-[320px]">
                  <span className="text-slate-500 font-semibold">{acc.code}</span>
                  <span className="font-sans text-slate-800 truncate">{acc.name}</span>
                </div>
                <div className="font-bold text-slate-900">
                  ${acc.balance.toLocaleString('es-CL')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
                Balance Clasificado IFRS / FECU
              </h3>
              <p className="text-xs text-slate-500">
                Estado de Situación Financiera agrupado por Cuentas Padre IFRS ({company.name} - RUT: {company.rut})
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenAuditor && (
            <button
              onClick={onOpenAuditor}
              className="px-3 py-1.5 bg-indigo-900 hover:bg-indigo-950 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs border border-indigo-700"
              title="Auditar Balance Clasificado IFRS y emitir Dictamen Oficial"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-300" />
              <span>Auditar Estados Financieros</span>
            </button>
          )}
          <button
            onClick={() => setShowAccountDetails(!showAccountDetails)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            {showAccountDetails ? <EyeOff className="w-3.5 h-3.5 text-slate-600" /> : <Eye className="w-3.5 h-3.5 text-slate-600" />}
            <span>{showAccountDetails ? 'Ver Sólo Rubros Padre' : 'Mostrar Cuentas Analíticas'}</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Exportar CSV / Excel</span>
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-lg border border-indigo-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-700" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Alerta de cuadratura */}
      {descuadradosCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl text-amber-900 text-xs flex items-center gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <span className="font-bold">Partida Doble Estricta:</span> Se han excluido automáticamente <strong>{descuadradosCount}</strong> comprobante(s) con descuadre en el Libro Diario para garantizar un balance fidedigno bajo IFRS.
          </div>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Período:</label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2.5 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="Todos">Todo el Ejercicio</option>
              {availablePeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Desde:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="font-semibold text-slate-700">Hasta:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showZeroBalances}
              onChange={(e) => setShowZeroBalances(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Mostrar rubros en $0</span>
          </label>
        </div>

        {/* Ecuación Fundamental del Balance IFRS */}
        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border ${
          isBalanced ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <Scale className="w-4 h-4" />
          <span>{isBalanced ? '✅ Ecuación IFRS Cuadrada: Activo = Pasivo + Patrimonio' : '⚠️ Descuadre Patrimonial'}</span>
          {!isBalanced && (
            <span className="font-mono ml-1 bg-rose-200 px-1.5 py-0.5 rounded text-[11px]">Diff: ${diferenciaCuadratura.toLocaleString('es-CL')}</span>
          )}
        </div>
      </div>

      {/* KPI Cards de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-indigo-200 shadow-2xs">
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-indigo-700">
            <span>1. Total Activos</span>
            <span className="px-1.5 py-0.5 bg-indigo-50 rounded text-indigo-900 font-mono">1000000</span>
          </div>
          <p className="text-xl font-black text-indigo-950 mt-1 font-mono">${totalActivos.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>Corr: ${totalActivosCorrientes.toLocaleString('es-CL')}</span>
            <span>No Corr: ${totalActivosNoCorrientes.toLocaleString('es-CL')}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-2xs">
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-rose-700">
            <span>2. Total Pasivos</span>
            <span className="px-1.5 py-0.5 bg-rose-50 rounded text-rose-900 font-mono">2000000</span>
          </div>
          <p className="text-xl font-black text-rose-950 mt-1 font-mono">${totalPasivos.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>Corr: ${totalPasivosCorrientes.toLocaleString('es-CL')}</span>
            <span>No Corr: ${totalPasivosNoCorrientes.toLocaleString('es-CL')}</span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            <span>3. Patrimonio Neto</span>
            <span className="px-1.5 py-0.5 bg-emerald-50 rounded text-emerald-900 font-mono">2300000</span>
          </div>
          <p className="text-xl font-black text-emerald-950 mt-1 font-mono">${totalPatrimonioNeto.toLocaleString('es-CL')}</p>
          <div className="flex justify-between text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-100 font-mono">
            <span>Res. Ejercicio: ${resultadoEjercicio.toLocaleString('es-CL')}</span>
            <span>Base: ${(totalPatrimonioNeto - resultadoEjercicio).toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column IFRS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* COLUMNA 1: ACTIVOS */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="divide-y divide-slate-200 text-xs">
            <div className="bg-indigo-900 text-white p-3 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <FolderTree className="w-4 h-4 text-indigo-300" />
                <span>1. ESTRUCTURA DE ACTIVOS (IFRS)</span>
              </span>
              <span className="font-mono text-sm font-black">${totalActivos.toLocaleString('es-CL')}</span>
            </div>

            {/* 1.1 Activos Corrientes */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-indigo-200 pb-1.5">
                <span className="text-indigo-900 uppercase font-black tracking-wide text-xs">1.1. ACTIVOS CORRIENTES (CIRCULANTES)</span>
                <span className="font-mono text-indigo-900 font-bold text-xs">${totalActivosCorrientes.toLocaleString('es-CL')}</span>
              </div>
              
              {activosCorrientesRubros.length > 0 ? (
                <div>
                  {activosCorrientesRubros.map(rubro => renderRubroBlock(rubro, 'indigo'))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2 py-2">Sin activos corrientes registrados en el período</p>
              )}
            </div>

            {/* 1.2 Activos No Corrientes */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1.5">
                <span className="text-slate-800 uppercase font-black tracking-wide text-xs">1.2. ACTIVOS NO CORRIENTES (FIJOS E INTANGIBLES)</span>
                <span className="font-mono text-slate-800 font-bold text-xs">${totalActivosNoCorrientes.toLocaleString('es-CL')}</span>
              </div>
              
              {activosNoCorrientesRubros.length > 0 ? (
                <div>
                  {activosNoCorrientesRubros.map(rubro => renderRubroBlock(rubro, 'indigo'))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2 py-2">Sin activos no corrientes registrados en el período</p>
              )}
            </div>
          </div>

          <div className="bg-indigo-950 text-white p-3 font-black text-xs flex justify-between items-center uppercase tracking-wider">
            <span>TOTAL ACTIVOS (1.1 + 1.2)</span>
            <span className="font-mono text-base text-amber-300">${totalActivos.toLocaleString('es-CL')}</span>
          </div>
        </div>

        {/* COLUMNA 2: PASIVOS Y PATRIMONIO NETO */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="divide-y divide-slate-200 text-xs">
            <div className="bg-slate-900 text-white p-3 font-bold uppercase tracking-wider text-xs flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-300" />
                <span>2. PASIVOS Y PATRIMONIO NETO (IFRS)</span>
              </span>
              <span className="font-mono text-sm font-black">${totalPasivoMasPatrimonio.toLocaleString('es-CL')}</span>
            </div>

            {/* 2.1 Pasivos Corrientes */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-rose-200 pb-1.5">
                <span className="text-rose-900 uppercase font-black tracking-wide text-xs">2.1. PASIVOS CORRIENTES (CORTO PLAZO)</span>
                <span className="font-mono text-rose-900 font-bold text-xs">${totalPasivosCorrientes.toLocaleString('es-CL')}</span>
              </div>
              
              {pasivosCorrientesRubros.length > 0 ? (
                <div>
                  {pasivosCorrientesRubros.map(rubro => renderRubroBlock(rubro, 'rose'))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2 py-2">Sin pasivos corrientes registrados en el período</p>
              )}
            </div>

            {/* 2.2 Pasivos No Corrientes */}
            <div className="p-3 bg-slate-50/50">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-slate-300 pb-1.5">
                <span className="text-slate-800 uppercase font-black tracking-wide text-xs">2.2. PASIVOS NO CORRIENTES (LARGO PLAZO)</span>
                <span className="font-mono text-slate-800 font-bold text-xs">${totalPasivosNoCorrientes.toLocaleString('es-CL')}</span>
              </div>
              
              {pasivosNoCorrientesRubros.length > 0 ? (
                <div>
                  {pasivosNoCorrientesRubros.map(rubro => renderRubroBlock(rubro, 'rose'))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-[11px] pl-2 py-2">Sin pasivos no corrientes registrados en el período</p>
              )}
            </div>

            {/* 3. Patrimonio Neto */}
            <div className="p-3 bg-emerald-50/30">
              <div className="flex justify-between items-center font-bold text-slate-900 mb-2 border-b border-emerald-300 pb-1.5">
                <span className="text-emerald-950 uppercase font-black tracking-wide text-xs">3. PATRIMONIO NETO</span>
                <span className="font-mono text-emerald-950 font-bold text-xs">${totalPatrimonioNeto.toLocaleString('es-CL')}</span>
              </div>
              
              {patrimonioRubros.length > 0 && (
                <div>
                  {patrimonioRubros.map(rubro => renderRubroBlock(rubro, 'emerald'))}
                </div>
              )}

              {/* Resultado del Ejercicio */}
              <div className="border border-emerald-200 bg-white rounded-lg p-2.5 flex justify-between items-center mt-2 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">2304000</span>
                  <span className="font-bold text-xs text-slate-900">Resultado del Ejercicio (Utilidad / Pérdida)</span>
                </div>
                <span className={`font-mono font-black text-xs ${resultadoEjercicio >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  ${resultadoEjercicio.toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 text-white p-3 font-black text-xs flex justify-between items-center uppercase tracking-wider">
            <span>TOTAL PASIVO + PATRIMONIO (2 + 3)</span>
            <span className="font-mono text-base text-amber-300">${totalPasivoMasPatrimonio.toLocaleString('es-CL')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
