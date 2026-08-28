import React, { useState, useMemo } from 'react';
import { Company, Voucher, ChartOfAccount, FiscalPeriodYear, BankReconciliation, RCVDocument } from '../types';

interface IndicadoresFinancierosViewProps {
  company: Company;
  vouchers: Voucher[];
  accounts: ChartOfAccount[];
  fiscalYears: FiscalPeriodYear[];
  bankReconciliations?: BankReconciliation[];
  rcvDocuments?: RCVDocument[];
}

export default function IndicadoresFinancierosView({
  company,
  vouchers,
  accounts,
  fiscalYears,
  bankReconciliations = [],
  rcvDocuments = []
}: IndicadoresFinancierosViewProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Todos');

  // Account Map
  const accountMap = useMemo(() => {
    const map = new Map<string, ChartOfAccount>();
    accounts.forEach(acc => {
      map.set(acc.id, acc);
      map.set(acc.code, acc);
    });
    return map;
  }, [accounts]);

  // Compute Base Financial Aggregates
  const stats = useMemo(() => {
    const accSums = new Map<string, { debit: number; credit: number; account: ChartOfAccount }>();

    // Inicializar cuentas
    accounts.forEach(acc => {
      accSums.set(acc.id, { debit: 0, credit: 0, account: acc });
    });

    const validVouchers = vouchers.filter(v => {
      if (v.status === 'Anulado') return false;
      const vYear = v.date ? parseInt(v.date.slice(0, 4)) : selectedYear;
      if (vYear !== selectedYear) return false;
      if (selectedPeriod !== 'Todos' && v.period !== selectedPeriod) return false;
      return true;
    });

    validVouchers.forEach(v => {
      if (!v.lines) return;
      v.lines.forEach(l => {
        const debit = Number(l.debit) || 0;
        const credit = Number(l.credit) || 0;
        if (debit === 0 && credit === 0) return;

        let targetAcc = accountMap.get(l.accountId) || accountMap.get(l.accountCode);
        if (!targetAcc) {
          const accCodeStr = l.accountCode || 'S/C';
          const prefix = accCodeStr.trim().charAt(0);
          let inferredType: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' = 'Activo';
          if (prefix === '1') inferredType = 'Activo';
          else if (prefix === '2') {
            inferredType = (accCodeStr.startsWith('23') || accCodeStr.startsWith('2.3') || accCodeStr.startsWith('2-3')) ? 'Patrimonio' : 'Pasivo';
          }
          else if (prefix === '3') inferredType = 'Ingreso';
          else if (prefix === '4' || prefix === '5') inferredType = 'Gasto';

          targetAcc = {
            id: l.accountId || l.accountCode || 'unknown',
            code: accCodeStr,
            name: l.accountName || 'Cuenta S/C',
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

    let activoCorriente = 0;
    let inventarios = 0;
    let disponibleLibros = 0; // Caja y Bancos según contabilidad
    let cuentasPorCobrar = 0;
    let activoNoCorriente = 0;
    let pasivoCorriente = 0;
    let pasivoNoCorriente = 0;
    let patrimonio = 0;

    let ventasTotales = 0;
    let costoVentas = 0;
    let gastosOperacionales = 0;
    let depreciacionAmortizacion = 0;
    let gastosFinancieros = 0;
    let otrosIngresos = 0;
    let otrosGastos = 0;

    accSums.forEach(({ debit, credit, account }) => {
      const code = (account.code || '').trim();
      const codePrefix = code.charAt(0);
      const name = (account.name || '').toLowerCase();
      const normType = (account.type || '').toLowerCase();

      // Criterios de Clasificación: 1 = Activos, 2 = Pasivos (23 = Patrimonio), 3 = Ingresos, 4 / 5 = Gastos
      const isPatrimonio = 
        code.startsWith('23') || 
        code.startsWith('2.3') || 
        code.startsWith('2-3') || 
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

      // Activos (1)
      if (isActivo) {
        const balance = debit - credit;
        const isNoCorriente = 
          code.startsWith('1.2') || code.startsWith('1-2') || code.startsWith('12') ||
          name.includes('fijo') || name.includes('propiedad') || name.includes('intangible') || name.includes('depreciaci');

        if (isNoCorriente) {
          activoNoCorriente += balance;
        } else {
          activoCorriente += balance;
          if (name.includes('mercader') || name.includes('inventario') || name.includes('existencia') || code.startsWith('1-1-03') || code.startsWith('1.1.03')) {
            inventarios += balance;
          }
          if (name.includes('banco') || name.includes('caja') || name.includes('cuenta corriente') || name.includes('tesoreria') || code.startsWith('1-1-01') || code.startsWith('1.1.01')) {
            disponibleLibros += balance;
          }
          if (name.includes('cliente') || name.includes('deudor') || name.includes('cuenta por cobrar') || code.startsWith('1-1-02') || code.startsWith('1.1.02')) {
            cuentasPorCobrar += balance;
          }
        }
      }
      // Pasivos (2 excepto 23)
      else if (isPasivo) {
        const balance = credit - debit;
        const isNoCorriente = 
          code.startsWith('2.2') || code.startsWith('2-2') || code.startsWith('22') ||
          name.includes('largo plazo') || name.includes('hipotecario');

        if (isNoCorriente) {
          pasivoNoCorriente += balance;
        } else {
          pasivoCorriente += balance;
        }
      }
      // Patrimonio (23 / 2.3)
      else if (isPatrimonio) {
        patrimonio += (credit - debit);
      }
      // Ingresos (3)
      else if (isIngreso) {
        const balance = credit - debit;
        if (name.includes('no operacional') || name.includes('financiero') || name.includes('fuera de explotacion') || code.startsWith('3.2') || code.startsWith('3.3')) {
          otrosIngresos += balance;
        } else {
          ventasTotales += balance;
        }
      }
      // Gastos y Costos (4 / 5)
      else if (isGasto) {
        const balance = debit - credit;
        if (name.includes('costo de venta') || name.includes('costo directo') || name.includes('costo explotacion') || code.startsWith('4.1') || code.startsWith('41') || code.startsWith('5-1') || code.startsWith('5.1')) {
          costoVentas += balance;
        } else if (name.includes('depreciaci') || name.includes('amortizaci') || code.startsWith('4.2.02') || code.startsWith('4202')) {
          depreciacionAmortizacion += balance;
          gastosOperacionales += balance;
        } else if (name.includes('interes') || name.includes('financiero') || name.includes('gasto bancario') || code.startsWith('4.3') || code.startsWith('43') || code.startsWith('5.3')) {
          gastosFinancieros += balance;
          otrosGastos += balance;
        } else {
          gastosOperacionales += balance;
        }
      }
    });

    const margenBruto = ventasTotales - costoVentas;
    const ebit = margenBruto - gastosOperacionales; // Resultado Operacional
    const ebitda = ebit + depreciacionAmortizacion; // EBITDA
    const utilidadNeta = ebit + otrosIngresos - otrosGastos;

    // Ratios de Liquidez
    const razonCorriente = pasivoCorriente > 0 ? (activoCorriente / pasivoCorriente) : 0;
    const pruebaAcida = pasivoCorriente > 0 ? ((activoCorriente - inventarios) / pasivoCorriente) : 0;
    const capitalTrabajo = activoCorriente - pasivoCorriente;

    // Días Calle (DSO - Days Sales Outstanding)
    // DSO = (Cuentas por Cobrar / Ventas Totales) * 365
    const diasCalle = ventasTotales > 0 ? (cuentasPorCobrar / ventasTotales) * 365 : 0;

    // Margenes %
    const margenBrutoPct = ventasTotales > 0 ? (margenBruto / ventasTotales) * 100 : 0;
    const margenOperacionalPct = ventasTotales > 0 ? (ebit / ventasTotales) * 100 : 0;
    const margenEbitdaPct = ventasTotales > 0 ? (ebitda / ventasTotales) * 100 : 0;
    const margenNetoPct = ventasTotales > 0 ? (utilidadNeta / ventasTotales) * 100 : 0;

    // Endeudamiento y Apalancamiento (Leverage)
    const pasivoTotal = pasivoCorriente + pasivoNoCorriente;
    const activoTotal = activoCorriente + activoNoCorriente;
    const patrimonioTotal = patrimonio + utilidadNeta;
    const leverage = patrimonioTotal > 0 ? (pasivoTotal / patrimonioTotal) : 0;
    const razonEndeudamiento = activoTotal > 0 ? (pasivoTotal / activoTotal) * 100 : 0;

    // Conciliación Bancaria y Disponible Real
    // Buscar la última conciliación guardada
    const latestReconciliations = bankReconciliations.filter(r => r.period?.startsWith(String(selectedYear)));
    let saldoCartolasBancarias = 0;
    let abonosPendientesContabilizar = 0; // Cobros de clientes o préstamos en banco no ingresados a libros
    let cargosPendientesContabilizar = 0; // Pagos/comisiones en banco no ingresados a libros
    let chequesGiradosYNoCobrados = 0; // Pagos en libros no descontados aún por el banco

    latestReconciliations.forEach(rec => {
      saldoCartolasBancarias += (rec.bankFinalBalance || 0);
      if (rec.lines) {
        rec.lines.forEach(l => {
          if (l.matchedStatus !== 'Conciliado') {
            if ((l.deposit || 0) > 0) abonosPendientesContabilizar += (l.deposit || 0);
            if ((l.charge || 0) > 0) cargosPendientesContabilizar += (l.charge || 0);
          }
        });
      }
    });

    const saldoDisponibleReal = saldoCartolasBancarias + abonosPendientesContabilizar - cargosPendientesContabilizar;
    const diferenciaDisponibleVsLibros = saldoDisponibleReal - disponibleLibros;

    return {
      activoCorriente,
      activoNoCorriente,
      activoTotal,
      inventarios,
      disponibleLibros,
      cuentasPorCobrar,
      pasivoCorriente,
      pasivoNoCorriente,
      pasivoTotal,
      patrimonioTotal,
      ventasTotales,
      costoVentas,
      margenBruto,
      margenBrutoPct,
      gastosOperacionales,
      ebit,
      ebitda,
      depreciacionAmortizacion,
      utilidadNeta,
      razonCorriente,
      pruebaAcida,
      capitalTrabajo,
      diasCalle,
      margenOperacionalPct,
      margenEbitdaPct,
      margenNetoPct,
      leverage,
      razonEndeudamiento,
      saldoCartolasBancarias,
      abonosPendientesContabilizar,
      cargosPendientesContabilizar,
      saldoDisponibleReal,
      diferenciaDisponibleVsLibros,
      hasReconciliationData: latestReconciliations.length > 0
    };
  }, [accounts, vouchers, accountMap, selectedYear, selectedPeriod, bankReconciliations]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">
              Tablero de Indicadores Financieros & KPIs
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ratios de Liquidez, Rentabilidad (EBITDA, EBIT), Gestión de Cartera (Días Calle) y Conciliación del Disponible ({company.name} - RUT: {company.rut})
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-xs">
            <label className="font-semibold text-slate-600">Año:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-white border border-slate-300 rounded font-bold px-2 py-0.5 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
            >
              {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold rounded-lg border border-indigo-300 flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>🖨️</span>
            <span>Imprimir Informe</span>
          </button>
        </div>
      </div>

      {/* SECCIÓN ESPECIAL: SALDOS DISPONIBLES Y CONCILIACIÓN BANCARIA */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-xl p-4 shadow-md border border-slate-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 border-b border-slate-700 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏦</span>
            <h4 className="font-black text-sm uppercase tracking-wide text-indigo-300">
              Análisis del Saldo Disponible Real vs. Contabilidad (Tesoreria & Bancos)
            </h4>
          </div>
          <span className="text-[11px] bg-indigo-900/80 text-indigo-200 px-2.5 py-0.5 rounded-full border border-indigo-700 font-mono">
            Año Fiscal {selectedYear}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          {/* Card 1: Disponible según Libros Contables */}
          <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              1. Disponible en Contabilidad
            </span>
            <p className="text-lg font-black text-white font-mono mt-1">
              ${stats.disponibleLibros.toLocaleString('es-CL')}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Saldo Libro Mayor (Cuentas Banco/Caja)
            </span>
          </div>

          {/* Card 2: Saldo Cartolas Bancarias */}
          <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
            <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">
              2. Saldo Cartolas Bancarias
            </span>
            <p className="text-lg font-black text-indigo-200 font-mono mt-1">
              ${stats.saldoCartolasBancarias.toLocaleString('es-CL')}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {stats.hasReconciliationData ? 'Según módulo Conciliación' : 'Pendiente cargar cartola bancaria'}
            </span>
          </div>

          {/* Card 3: Partidas Conciliatorias Pendientes */}
          <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
            <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider block">
              3. Partidas Pendientes de Registro
            </span>
            <div className="text-[11px] font-mono mt-1 space-y-0.5">
              <div className="flex justify-between text-emerald-400">
                <span>(+) Abonos/Cobros banco:</span>
                <span>+${stats.abonosPendientesContabilizar.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between text-rose-400">
                <span>(-) Cargos/Gastos banco:</span>
                <span>-${stats.cargosPendientesContabilizar.toLocaleString('es-CL')}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Saldo Efectivamente Disponible */}
          <div className="bg-indigo-900/90 p-3 rounded-lg border border-indigo-500/60 shadow-inner">
            <span className="text-[10px] text-emerald-300 font-black uppercase tracking-wider block">
              4. DISPONIBLE REAL CONCILIADO
            </span>
            <p className="text-xl font-black text-emerald-400 font-mono mt-1">
              ${stats.saldoDisponibleReal.toLocaleString('es-CL')}
            </p>
            <span className="text-[10px] text-indigo-200 block mt-0.5 font-medium">
              Fondos líquidos listos para girar
            </span>
          </div>
        </div>

        {Math.abs(stats.diferenciaDisponibleVsLibros) > 0 && stats.hasReconciliationData && (
          <div className="mt-3 p-2 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-200 text-xs flex items-center gap-2">
            <span>ℹ️</span>
            <span>
              <strong>Diferencia de conciliación detectada:</strong> Existen ${Math.abs(stats.diferenciaDisponibleVsLibros).toLocaleString('es-CL')} de diferencia entre el saldo contable y el banco. Recomendamos revisar el módulo <em>Conciliación Bancaria</em> para incorporar cobranzas pendientes o préstamos bancarios recién abonados.
            </span>
          </div>
        )}
      </div>

      {/* BLOQUE 1: RATIOS DE LIQUIDEZ Y SOLVENCIA */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 mb-3 border-b border-slate-200 pb-2">
          <span className="text-base">💧</span>
          <h4 className="font-black text-sm uppercase text-slate-900 tracking-wide">
            1. Ratios de Liquidez y Capital de Trabajo
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Razón Corriente */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-700 block">Razón Corriente</span>
                <span className="text-[10px] text-slate-500">Activo Corriente / Pasivo Corriente</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                stats.razonCorriente >= 1.5 ? 'bg-emerald-100 text-emerald-800' :
                stats.razonCorriente >= 1.0 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {stats.razonCorriente >= 1.5 ? 'Excelente' : stats.razonCorriente >= 1.0 ? 'Aceptable' : 'Riesgo Iliquidez'}
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 font-mono mt-2">{stats.razonCorriente.toFixed(2)}x</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Por cada $1 de deuda de corto plazo, la empresa cuenta con <strong>${stats.razonCorriente.toFixed(2)}</strong> de respaldo en activos circulantes.
            </p>
          </div>

          {/* Prueba Ácida */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-700 block">Prueba Ácida (Quick Ratio)</span>
                <span className="text-[10px] text-slate-500">(Activo Cte. - Inventarios) / Pasivo Cte.</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                stats.pruebaAcida >= 1.0 ? 'bg-emerald-100 text-emerald-800' :
                stats.pruebaAcida >= 0.7 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {stats.pruebaAcida >= 1.0 ? 'Óptima' : stats.pruebaAcida >= 0.7 ? 'Moderada' : 'Ajustada'}
              </span>
            </div>
            <p className="text-2xl font-black text-slate-900 font-mono mt-2">{stats.pruebaAcida.toFixed(2)}x</p>
            <p className="text-[11px] text-slate-600 mt-1">
              Capacidad de cumplir compromisos inmediatos sin depender de la venta o liquidación de existencias/stock.
            </p>
          </div>

          {/* Capital de Trabajo Neto */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-slate-700 block">Capital de Trabajo Neto</span>
                <span className="text-[10px] text-slate-500">Activo Corriente - Pasivo Corriente</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                stats.capitalTrabajo >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {stats.capitalTrabajo >= 0 ? 'Superávit' : 'Déficit'}
              </span>
            </div>
            <p className={`text-2xl font-black font-mono mt-2 ${stats.capitalTrabajo >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              ${stats.capitalTrabajo.toLocaleString('es-CL')}
            </p>
            <p className="text-[11px] text-slate-600 mt-1">
              Recursos operacionales netos disponibles para financiar el giro continuo de la empresa.
            </p>
          </div>
        </div>
      </div>

      {/* BLOQUE 2: RENTABILIDAD OPERACIONAL, EBIT Y EBITDA */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 mb-3 border-b border-slate-200 pb-2">
          <span className="text-base">🚀</span>
          <h4 className="font-black text-sm uppercase text-slate-900 tracking-wide">
            2. Desempeño Operacional, EBIT & EBITDA
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Margen Bruto */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[11px] font-bold text-slate-700 uppercase block">Margen Bruto</span>
            <p className="text-lg font-black text-slate-900 font-mono mt-1">${stats.margenBruto.toLocaleString('es-CL')}</p>
            <div className="flex justify-between items-center text-[11px] text-slate-600 mt-1">
              <span>Margen %:</span>
              <span className="font-bold text-indigo-600">{stats.margenBrutoPct.toFixed(1)}%</span>
            </div>
          </div>

          {/* EBIT */}
          <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-200">
            <span className="text-[11px] font-bold text-indigo-900 uppercase block">EBIT (Res. Operacional)</span>
            <p className="text-lg font-black text-indigo-950 font-mono mt-1">${stats.ebit.toLocaleString('es-CL')}</p>
            <div className="flex justify-between items-center text-[11px] text-indigo-900 mt-1">
              <span>Margen EBIT:</span>
              <span className="font-bold">{stats.margenOperacionalPct.toFixed(1)}%</span>
            </div>
          </div>

          {/* EBITDA */}
          <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200">
            <span className="text-[11px] font-bold text-emerald-950 uppercase block">EBITDA Operacional</span>
            <p className="text-lg font-black text-emerald-950 font-mono mt-1">${stats.ebitda.toLocaleString('es-CL')}</p>
            <div className="flex justify-between items-center text-[11px] text-emerald-900 mt-1">
              <span>Margen EBITDA:</span>
              <span className="font-bold">{stats.margenEbitdaPct.toFixed(1)}%</span>
            </div>
          </div>

          {/* Utilidad Neta */}
          <div className={`p-3 rounded-lg border ${stats.utilidadNeta >= 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'}`}>
            <span className="text-[11px] font-bold uppercase block text-slate-800">Resultado Neto Final</span>
            <p className={`text-lg font-black font-mono mt-1 ${stats.utilidadNeta >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              ${stats.utilidadNeta.toLocaleString('es-CL')}
            </p>
            <div className="flex justify-between items-center text-[11px] text-slate-700 mt-1">
              <span>Margen Neto:</span>
              <span className="font-bold">{stats.margenNetoPct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* BLOQUE 3: GESTIÓN DE CARTERA Y DÍAS CALLE (DSO) + ENDEUDAMIENTO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Días Calle de Cuentas por Cobrar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-200 pb-2">
            <span className="text-base">⏳</span>
            <h4 className="font-black text-sm uppercase text-slate-900 tracking-wide">
              3. Gestión de Cartera & Días Calle (DSO)
            </h4>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <span className="font-bold text-slate-800 text-sm block">Días Calle (DSO)</span>
                <span className="text-slate-500 text-[11px]">Días promedio que tarda la empresa en cobrar sus facturas</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-indigo-700 font-mono">{stats.diasCalle.toFixed(0)}</span>
                <span className="text-xs text-slate-600 ml-1 font-bold">días</span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 font-mono">
              <div className="flex justify-between py-1.5 text-slate-600">
                <span className="font-sans">Cuentas por Cobrar Vigentes:</span>
                <span className="font-bold text-slate-900">${stats.cuentasPorCobrar.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between py-1.5 text-slate-600">
                <span className="font-sans">Ventas Totales del Período:</span>
                <span className="font-bold text-slate-900">${stats.ventasTotales.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between py-1.5 text-slate-600">
                <span className="font-sans">Rotación de Cartera (Veces al Año):</span>
                <span className="font-bold text-indigo-700">
                  {stats.cuentasPorCobrar > 0 ? (stats.ventasTotales / stats.cuentasPorCobrar).toFixed(2) : '0.00'} veces
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Endeudamiento y Apalancamiento */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 mb-3 border-b border-slate-200 pb-2">
            <span className="text-base">⚖️</span>
            <h4 className="font-black text-sm uppercase text-slate-900 tracking-wide">
              4. Endeudamiento & Apalancamiento (Leverage)
            </h4>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Leverage Financiero</span>
                <p className="text-xl font-black text-slate-900 font-mono mt-1">{stats.leverage.toFixed(2)}x</p>
                <span className="text-[10px] text-slate-500">Pasivo Total / Patrimonio</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">Razón de Endeudamiento</span>
                <p className="text-xl font-black text-slate-900 font-mono mt-1">{stats.razonEndeudamiento.toFixed(1)}%</p>
                <span className="text-[10px] text-slate-500">Pasivo Total / Activo Total</span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 font-mono">
              <div className="flex justify-between py-1.5 text-slate-600">
                <span className="font-sans">Total Deuda (Pasivos):</span>
                <span className="font-bold text-rose-800">${stats.pasivoTotal.toLocaleString('es-CL')}</span>
              </div>
              <div className="flex justify-between py-1.5 text-slate-600">
                <span className="font-sans">Patrimonio Neto:</span>
                <span className="font-bold text-emerald-800">${stats.patrimonioTotal.toLocaleString('es-CL')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
