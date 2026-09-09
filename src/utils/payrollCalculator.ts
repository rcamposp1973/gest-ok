// Motor de Cálculo de Remuneraciones y Nómina de Sueldos para Chile
// Conforme a la legislación laboral y previsional vigente (Código del Trabajo, D.L. 3.500, Ley 19.728, Art. 43 LIR SII, DT y Previred)

import { 
  Employee, PayrollParameters, PayrollSlip, PensionSystem, HealthSystem, 
  HealthPlanType, ContractType, PayrollConcept, AnnualReliquidation, ReliquidationMonthDetail 
} from '../types';
import { OFFICIAL_UF_MONTHLY_START, OFFICIAL_MONTHLY_UTM, OFFICIAL_MONTHLY_IMM, getOfficialIMM } from './chileanEconomicIndicators';

export const DEFAULT_AFP_COMMISSIONS: Record<PensionSystem, number> = {
  CAPITAL: 11.44, // 10% Fondo + 1.44% Comisión
  CUPRUM: 11.44, // 10% Fondo + 1.44% Comisión
  HABITAT: 11.27, // 10% Fondo + 1.27% Comisión
  MODELO: 10.58, // 10% Fondo + 0.58% Comisión
  PLANVITAL: 11.16, // 10% Fondo + 1.16% Comisión
  PROVIDA: 11.45, // 10% Fondo + 1.45% Comisión
  UNO: 10.49, // 10% Fondo + 0.49% Comisión
  INP: 18.84,
  JUBILADO_COTIZA: 1.44,
  JUBILADO_NO_COTIZA: 0.0
};

export const PREVIRED_AFP_CODES: Record<PensionSystem, string> = {
  CAPITAL: '34',
  CUPRUM: '03',
  HABITAT: '05',
  MODELO: '32',
  PLANVITAL: '08',
  PROVIDA: '29',
  UNO: '33',
  INP: '01',
  JUBILADO_COTIZA: '34',
  JUBILADO_NO_COTIZA: '00'
};

export const PREVIRED_HEALTH_CODES: Record<HealthSystem, string> = {
  FONASA: '01',
  BANMEDICA: '02',
  COLMENA: '03',
  CONSALUD: '04',
  CRUZ_BLANCA: '05',
  NUEVA_MASVIDA: '06',
  VIDA_TRES: '07',
  ESENCIAL: '08',
  ISALUD: '09'
};

export const DEFAULT_PAYROLL_PARAMS_2026: PayrollParameters = {
  period: '2026-09',
  uf: 40030,
  utm: 70730,
  imm: 539000, // Ingreso Mínimo Mensual Reajustado 2026
  topeImponibleAfpUf: 84.3, // Tope AFP / Salud en UF
  topeImponibleAfcUf: 126.6, // Tope AFC en UF
  tasaSisPercent: 1.49, // SIS Empleador
  tasaMutualPercent: 0.93, // Mutual de Seguridad Básica + Ley SANNA
  afpCommissions: DEFAULT_AFP_COMMISSIONS,
  tramosAsignacionFamiliar: {
    tramoA: 20328,
    tramoB: 12475,
    tramoC: 3943,
    tramoD: 0,
    limiteA: 539328,
    limiteB: 787746,
    limiteC: 1228614
  }
};

/**
 * Retorna los parámetros previsionales e indicadores oficiales (UF, UTM, Sueldo Mínimo, Topes, SIS)
 * correspondientes de forma exacta para cada mes y año según Previred / SII / Banco Central.
 */
export function getPrevisionalParametersForPeriod(periodStr: string): PayrollParameters {
  const parts = (periodStr || '2026-01').split('-');
  const year = parseInt(parts[0], 10) || 2026;
  const month = parseInt(parts[1], 10) || 1;

  // Valor UF oficial para el período (primer día del mes)
  const uf = (OFFICIAL_UF_MONTHLY_START as Record<string, number>)[periodStr] || 
    (year >= 2026 ? 39710 + (month - 1) * 40 : 38000);

  // Valor UTM oficial para el mes
  const utm = (OFFICIAL_MONTHLY_UTM as Record<string, number>)[periodStr] || 
    (year >= 2026 ? 69751 + (month - 1) * 140 : 65000);

  // Ingreso Mínimo Mensual (IMM) según fecha y ley de reajuste vigente (Leyes N° 21.456, 21.578, etc.)
  const imm = (OFFICIAL_MONTHLY_IMM as Record<string, number>)[periodStr] || getOfficialIMM(periodStr);

  // Topes Imponibles Previsionales (UF)
  let topeImponibleAfpUf = 84.3;
  let topeImponibleAfcUf = 126.6;
  if (year <= 2023) {
    topeImponibleAfpUf = 81.6;
    topeImponibleAfcUf = 122.6;
  }

  // Tasa SIS Empleador
  let tasaSisPercent = 1.49;
  if (year <= 2023) tasaSisPercent = 1.53;

  return {
    period: periodStr,
    uf,
    utm,
    imm,
    topeImponibleAfpUf,
    topeImponibleAfcUf,
    tasaSisPercent,
    tasaMutualPercent: 0.93,
    afpCommissions: DEFAULT_AFP_COMMISSIONS,
    tramosAsignacionFamiliar: {
      tramoA: year >= 2024 ? 20328 : 17316,
      tramoB: year >= 2024 ? 12475 : 10627,
      tramoC: year >= 2024 ? 3943 : 3360,
      tramoD: 0,
      limiteA: year >= 2024 ? 539328 : 429899,
      limiteB: year >= 2024 ? 787746 : 627913,
      limiteC: year >= 2024 ? 1228614 : 979203
    }
  };
}

export interface MonthPayrollInput {
  diasTrabajados?: number; // default 30
  diasLicencia?: number;
  diasInasistencia?: number;
  horasExtras50Qty?: number;
  bonosImponibles?: number;
  comisionesVentas?: number;
  semanaCorrida?: number;
  otrosImponibles?: number;
  asignacionColacion?: number;
  asignacionMovilizacion?: number;
  viaticos?: number;
  otrosNoImponibles?: number;
  anticipos?: number;
  prestamosEmpresa?: number;
  otrosDescuentos?: number;
  observations?: string;
  conceptValues?: Record<string, number>; // Código o ID de concepto -> monto en CLP
}

export const DEFAULT_PAYROLL_CONCEPTS: PayrollConcept[] = [
  {
    id: 'concept_bono_prod',
    companyId: '',
    code: 'BONO_PROD',
    name: 'Bono de Producción y Metas',
    type: 'HABER_IMPONIBLE',
    tributable: true,
    imponible: true,
    aplicaGratificacion: true,
    reliquidable: true,
    accountingAccountId: '',
    defaultAmount: 0,
    active: true
  },
  {
    id: 'concept_com_vtas',
    companyId: '',
    code: 'COM_VTAS',
    name: 'Comisiones por Ventas',
    type: 'HABER_IMPONIBLE',
    tributable: true,
    imponible: true,
    aplicaGratificacion: true,
    reliquidable: false,
    accountingAccountId: '',
    defaultAmount: 0,
    active: true
  },
  {
    id: 'concept_bono_resp',
    companyId: '',
    code: 'BONO_RESP',
    name: 'Bono de Responsabilidad / Jefatura',
    type: 'HABER_IMPONIBLE',
    tributable: true,
    imponible: true,
    aplicaGratificacion: true,
    reliquidable: false,
    accountingAccountId: '',
    defaultAmount: 0,
    active: true
  },
  {
    id: 'concept_bono_asist',
    companyId: '',
    code: 'BONO_ASIST',
    name: 'Bono de Asistencia y Puntualidad',
    type: 'HABER_IMPONIBLE',
    tributable: true,
    imponible: true,
    aplicaGratificacion: true,
    reliquidable: false,
    accountingAccountId: '',
    defaultAmount: 0,
    active: true
  },
  {
    id: 'concept_viatico',
    companyId: '',
    code: 'VIATICO_FAENA',
    name: 'Viático de Traslado / Faena',
    type: 'HABER_NO_IMPONIBLE',
    tributable: false,
    imponible: false,
    aplicaGratificacion: false,
    reliquidable: false,
    accountingAccountId: '',
    defaultAmount: 0,
    active: true
  },
  {
    id: 'concept_asig_herram',
    companyId: '',
    code: 'ASIG_HERRAM',
    name: 'Asignación Pérdida de Caja / Desgaste Herramientas',
    type: 'HABER_NO_IMPONIBLE',
    tributable: false,
    imponible: false,
    aplicaGratificacion: false,
    reliquidable: false,
    accountingAccountId: '',
    defaultAmount: 0,
    active: true
  },
  {
    id: 'concept_bono_anual',
    companyId: '',
    code: 'BONO_ANUAL',
    name: 'Bono Anual de Desempeño (Reliquidable)',
    type: 'HABER_IMPONIBLE',
    tributable: true,
    imponible: true,
    aplicaGratificacion: true,
    reliquidable: true,
    accountingAccountId: '',
    defaultAmount: 0,
    active: true
  }
];

/**
 * Calcula el valor hora ordinaria y extra al 50%
 */
export function calculateOvertimeRate(baseSalary: number, workHoursPerWeek: number = 45): { hourlyRate: number; overtimeRate50: number } {
  const hours = workHoursPerWeek > 0 ? workHoursPerWeek : 45;
  // Factor legal: (Sueldo Base / 30) * (28 / horas semanales)
  const hourlyRate = (baseSalary / 30) * (28 / hours);
  const overtimeRate50 = hourlyRate * 1.5;
  return { hourlyRate, overtimeRate50 };
}

/**
 * Calcula el Impuesto Único de Segunda Categoría (Art. 43 LIR) según tabla mensual SII
 */
export function calculateImpuestoUnicoSegundaCategoria(taxableBaseClp: number, utmValue: number): { taxAmount: number; bracketName: string } {
  if (taxableBaseClp <= 0 || utmValue <= 0) {
    return { taxAmount: 0, bracketName: 'Tramo 1: Exento' };
  }

  const baseUtm = taxableBaseClp / utmValue;

  if (baseUtm <= 13.5) {
    return { taxAmount: 0, bracketName: 'Tramo 1 (0 a 13.5 UTM): Exento' };
  } else if (baseUtm <= 30) {
    const taxUtm = (baseUtm * 0.04) - 0.54;
    return { taxAmount: Math.max(0, Math.round(taxUtm * utmValue)), bracketName: 'Tramo 2 (13.5 a 30 UTM): 4%' };
  } else if (baseUtm <= 50) {
    const taxUtm = (baseUtm * 0.08) - 1.74;
    return { taxAmount: Math.max(0, Math.round(taxUtm * utmValue)), bracketName: 'Tramo 3 (30 a 50 UTM): 8%' };
  } else if (baseUtm <= 70) {
    const taxUtm = (baseUtm * 0.135) - 4.49;
    return { taxAmount: Math.max(0, Math.round(taxUtm * utmValue)), bracketName: 'Tramo 4 (50 a 70 UTM): 13.5%' };
  } else if (baseUtm <= 90) {
    const taxUtm = (baseUtm * 0.23) - 11.14;
    return { taxAmount: Math.max(0, Math.round(taxUtm * utmValue)), bracketName: 'Tramo 5 (70 a 90 UTM): 23%' };
  } else if (baseUtm <= 120) {
    const taxUtm = (baseUtm * 0.304) - 17.80;
    return { taxAmount: Math.max(0, Math.round(taxUtm * utmValue)), bracketName: 'Tramo 6 (90 a 120 UTM): 30.4%' };
  } else if (baseUtm <= 310) {
    const taxUtm = (baseUtm * 0.35) - 23.32;
    return { taxAmount: Math.max(0, Math.round(taxUtm * utmValue)), bracketName: 'Tramo 7 (120 a 310 UTM): 35%' };
  } else {
    const taxUtm = (baseUtm * 0.40) - 38.82;
    return { taxAmount: Math.max(0, Math.round(taxUtm * utmValue)), bracketName: 'Tramo 8 (Más de 310 UTM): 40%' };
  }
}

/**
 * Calcula la liquidación de sueldo completa para un trabajador en un período específico
 */
export function calculatePayrollSlip(
  employee: Employee,
  params: PayrollParameters,
  input: MonthPayrollInput = {},
  conceptsList: PayrollConcept[] = []
): PayrollSlip {
  const [yearStr, monthStr] = params.period.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

  const diasTrabajados = input.diasTrabajados !== undefined ? Math.min(30, Math.max(0, input.diasTrabajados)) : 30;
  const diasLicencia = input.diasLicencia || 0;
  const diasInasistencia = input.diasInasistencia || 0;

  // 1. Sueldo Base Pactado según Vigencia Histórica o Salario Base Actual
  let sueldoBasePactado = employee.baseSalary || 0;
  if (employee.salaryHistory && employee.salaryHistory.length > 0) {
    const targetPeriod = params.period; // YYYY-MM
    // Ordenar de más reciente a más antigua
    const sortedHistory = [...employee.salaryHistory].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const matchingEntry = sortedHistory.find(entry => {
      const entryStartMonth = entry.startDate.slice(0, 7);
      const entryEndMonth = entry.endDate ? entry.endDate.slice(0, 7) : null;
      if (entryStartMonth <= targetPeriod) {
        if (!entryEndMonth || entryEndMonth >= targetPeriod) {
          return true;
        }
      }
      return false;
    });

    if (matchingEntry && matchingEntry.baseSalary > 0) {
      sueldoBasePactado = matchingEntry.baseSalary;
    }
  }

  const sueldoBaseProporcional = Math.round((sueldoBasePactado / 30) * diasTrabajados);

  // 2. Horas Extras
  const horasExtras50Qty = input.horasExtras50Qty || 0;
  const { overtimeRate50 } = calculateOvertimeRate(sueldoBasePactado, employee.workHoursPerWeek || 45);
  const montoHorasExtras50 = horasExtras50Qty > 0 ? Math.round(horasExtras50Qty * overtimeRate50) : 0;

  // 3. Bonos y Otros Imponibles (incluye haberes dinámicos del Excel tabulado)
  let extraBonosFromConcepts = 0;
  let extraNoImponiblesFromConcepts = 0;
  let extraDescuentosFromConcepts = 0;

  if (input.conceptValues) {
    for (const [code, val] of Object.entries(input.conceptValues)) {
      const upperCode = code.toUpperCase();
      const numVal = typeof val === 'number' ? val : parseFloat(val) || 0;
      if (numVal !== 0) {
        if (upperCode.includes('VIAT') || upperCode.includes('COLAC') || upperCode.includes('MOVIL') || upperCode.includes('ASIG_HERR') || upperCode.includes('NO_IMP')) {
          extraNoImponiblesFromConcepts += numVal;
        } else if (upperCode.includes('DESC') || upperCode.includes('ANTIC') || upperCode.includes('PREST')) {
          extraDescuentosFromConcepts += numVal;
        } else {
          extraBonosFromConcepts += numVal;
        }
      }
    }
  }

  const bonosImponibles = (input.bonosImponibles !== undefined ? input.bonosImponibles : (employee.bonosPactados || 0)) + extraBonosFromConcepts;
  const comisionesVentas = input.comisionesVentas || 0;
  const semanaCorrida = input.semanaCorrida || 0;
  const otrosImponibles = input.otrosImponibles !== undefined ? input.otrosImponibles : (employee.otrosImponiblesPactados || 0);

  // 4. Gratificación Legal (Art. 50 Código del Trabajo: 25% con tope de 4.75 IMM / 12) o Convenida
  let gratificacionLegal = 0;
  const gratType = employee.gratificacionType || (employee.hasGratificacionLegal ? 'ART_50' : 'SIN_GRATIFICACION');

  if (gratType === 'ART_50' && (employee.hasGratificacionLegal ?? true)) {
    const subtotalImponibleParaGratif = sueldoBaseProporcional + montoHorasExtras50 + bonosImponibles + comisionesVentas;
    const gratif25 = subtotalImponibleParaGratif * 0.25;
    const topeMensualGratif = Math.round((4.75 * params.imm) / 12);
    gratificacionLegal = Math.round(Math.min(gratif25, topeMensualGratif));
  } else if (gratType === 'CONVENIDA') {
    const subtotalImponibleParaGratif = sueldoBaseProporcional + montoHorasExtras50 + bonosImponibles + comisionesVentas;
    gratificacionLegal = Math.round(subtotalImponibleParaGratif * 0.25);
  } else {
    // SIN_GRATIFICACION / EXENTO / ART_47 (Gratificación Anual) -> 0 en liquidación mensual
    gratificacionLegal = 0;
  }

  // TOTAL HABERES IMPONIBLES
  const totalHaberesImponibles = sueldoBaseProporcional + montoHorasExtras50 + gratificacionLegal + bonosImponibles + comisionesVentas + semanaCorrida + otrosImponibles;

  // 5. Haberes No Imponibles
  const asignacionColacion = input.asignacionColacion !== undefined ? input.asignacionColacion : (employee.colacionPactada ? Math.round((employee.colacionPactada / 30) * diasTrabajados) : 0);
  const asignacionMovilizacion = input.asignacionMovilizacion !== undefined ? input.asignacionMovilizacion : (employee.movilizacionPactada ? Math.round((employee.movilizacionPactada / 30) * diasTrabajados) : 0);
  const viaticos = (input.viaticos !== undefined ? input.viaticos : (employee.viaticosPactados || 0)) + extraNoImponiblesFromConcepts;
  const otrosNoImponibles = input.otrosNoImponibles !== undefined ? input.otrosNoImponibles : (employee.otrosNoImponiblesPactados || 0);

  // Asignación Familiar
  let montoUnitarioCarga = 0;
  if (employee.cargasFamiliares > 0) {
    if (employee.tramoCargaFamiliar === 'A') montoUnitarioCarga = params.tramosAsignacionFamiliar.tramoA;
    else if (employee.tramoCargaFamiliar === 'B') montoUnitarioCarga = params.tramosAsignacionFamiliar.tramoB;
    else if (employee.tramoCargaFamiliar === 'C') montoUnitarioCarga = params.tramosAsignacionFamiliar.tramoC;
    else if (employee.tramoCargaFamiliar === 'D' || employee.tramoCargaFamiliar === 'SIN_TRAMO') montoUnitarioCarga = 0;
    else {
      // Auto-detección por total imponible
      if (totalHaberesImponibles <= params.tramosAsignacionFamiliar.limiteA) montoUnitarioCarga = params.tramosAsignacionFamiliar.tramoA;
      else if (totalHaberesImponibles <= params.tramosAsignacionFamiliar.limiteB) montoUnitarioCarga = params.tramosAsignacionFamiliar.tramoB;
      else if (totalHaberesImponibles <= params.tramosAsignacionFamiliar.limiteC) montoUnitarioCarga = params.tramosAsignacionFamiliar.tramoC;
      else montoUnitarioCarga = 0;
    }
  }
  const asignacionFamiliar = montoUnitarioCarga * (employee.cargasFamiliares || 0);

  const totalHaberesNoImponibles = asignacionColacion + asignacionMovilizacion + asignacionFamiliar + viaticos + otrosNoImponibles;
  const totalHaberes = totalHaberesImponibles + totalHaberesNoImponibles;

  // 6. Topes Imponibles en CLP
  const topeAfpClp = Math.round(params.topeImponibleAfpUf * params.uf);
  const topeAfcClp = Math.round(params.topeImponibleAfcUf * params.uf);

  const baseImponibleAfp = Math.min(totalHaberesImponibles, topeAfpClp);
  const baseImponibleAfc = Math.min(totalHaberesImponibles, topeAfcClp);

  // 7. Descuentos Previsionales (Cargo Trabajador)
  // AFP
  const afpTasa = employee.pensionCommissionPercent || params.afpCommissions[employee.pensionSystem] || DEFAULT_AFP_COMMISSIONS[employee.pensionSystem] || 11.44;
  const afpMonto = employee.pensionSystem === 'JUBILADO_NO_COTIZA' ? 0 : Math.round(baseImponibleAfp * (afpTasa / 100));

  // Salud
  let saludLegal7 = 0;
  let saludAdicionalIsapre = 0;
  let saludMontoTotal = 0;

  if (employee.healthSystem === 'FONASA') {
    saludLegal7 = Math.round(baseImponibleAfp * 0.07);
    saludMontoTotal = saludLegal7;
  } else {
    // Isapre
    saludLegal7 = Math.round(baseImponibleAfp * 0.07);
    let planPactadoClp = 0;

    if (employee.healthPlanType === 'ISAPRE_UF') {
      planPactadoClp = Math.round((employee.healthPlanValue || 0) * params.uf);
    } else if (employee.healthPlanType === 'ISAPRE_PESOS') {
      planPactadoClp = Math.round(employee.healthPlanValue || 0);
    } else if (employee.healthPlanType === 'ISAPRE_PORCENTAJE') {
      planPactadoClp = Math.round(baseImponibleAfp * ((employee.healthPlanValue || 7) / 100));
    } else {
      planPactadoClp = saludLegal7;
    }

    if (planPactadoClp > saludLegal7) {
      saludAdicionalIsapre = planPactadoClp - saludLegal7;
      saludMontoTotal = planPactadoClp;
    } else {
      saludMontoTotal = saludLegal7; // Mínimo legal 7%
    }
  }

  // AFC Trabajador (0.6% Indefinido, 0% Plazo Fijo / Obra)
  let afcTrabajadorTasa = 0;
  if (employee.hasCesantiaAFC && employee.pensionSystem !== 'JUBILADO_NO_COTIZA') {
    if (employee.contractType === 'INDEFINIDO') {
      afcTrabajadorTasa = 0.6;
    } else {
      afcTrabajadorTasa = 0.0;
    }
  }
  const afcTrabajadorMonto = Math.round(baseImponibleAfc * (afcTrabajadorTasa / 100));

  // APV (Ahorro Previsional Voluntario)
  const apvMonto = Math.round(employee.apvAmount || 0);

  const totalDescuentosPrevisionales = afpMonto + saludMontoTotal + afcTrabajadorMonto + apvMonto;

  // 8. Base Tributable e Impuesto Único de Segunda Categoría
  // Rebaja legal salud: máximo 7% del tope previsional
  const topeSaludDeducibleClp = Math.round(topeAfpClp * 0.07);
  const saludDeducibleImpuesto = Math.min(saludMontoTotal, topeSaludDeducibleClp);
  const apvDeducibleImpuesto = employee.apvType === 'REGIMEN_B' ? apvMonto : 0;

  const rentaAfectaImpuesto = Math.max(0, totalHaberesImponibles - afpMonto - saludDeducibleImpuesto - afcTrabajadorMonto - apvDeducibleImpuesto);
  const { taxAmount: impuestoUnicoSegundaCategoria, bracketName: tramoImpuestoUnico } = calculateImpuestoUnicoSegundaCategoria(rentaAfectaImpuesto, params.utm);

  // 9. Otros Descuentos
  const anticipos = input.anticipos || 0;
  const prestamosEmpresa = input.prestamosEmpresa !== undefined ? input.prestamosEmpresa : (employee.descuentoPrestamoCuota || 0);
  const seguroComp = employee.descuentoSeguroComplementario || 0;
  const ahorroBienestar = employee.descuentoAhorroBienestar || 0;
  const otrosDescBase = input.otrosDescuentos !== undefined ? input.otrosDescuentos : (employee.otrosDescuentosPactados || 0);
  const otrosDescuentos = otrosDescBase + seguroComp + ahorroBienestar + extraDescuentosFromConcepts;
  const totalOtrosDescuentos = anticipos + prestamosEmpresa + otrosDescuentos;

  // 10. Totales y Líquido
  const totalDescuentos = totalDescuentosPrevisionales + impuestoUnicoSegundaCategoria + totalOtrosDescuentos;
  const alcanceLiquido = totalHaberes - (totalDescuentosPrevisionales + impuestoUnicoSegundaCategoria);
  const liquidoAPagar = Math.max(0, totalHaberes - totalDescuentos);

  // 11. Aportes Patronales (Costo Empleador)
  // SIS Empleador: 1.49% sobre base imponible AFP (excepto jubilados no cotizantes)
  const sisMonto = employee.pensionSystem === 'JUBILADO_NO_COTIZA' ? 0 : Math.round(baseImponibleAfp * (params.tasaSisPercent / 100));

  // AFC Empleador: 2.4% indefinido (1.6% individual + 0.8% solidario), 3.0% plazo fijo (solidario)
  let afcEmpleadorTasa = 0;
  if (employee.hasCesantiaAFC && employee.pensionSystem !== 'JUBILADO_NO_COTIZA') {
    if (employee.contractType === 'INDEFINIDO') {
      afcEmpleadorTasa = 2.4;
    } else {
      afcEmpleadorTasa = 3.0;
    }
  }
  const afcEmpleadorMonto = Math.round(baseImponibleAfc * (afcEmpleadorTasa / 100));

  // Mutual de Seguridad / Accidentes del Trabajo: 0.93% sobre total imponible
  const mutualMonto = Math.round(baseImponibleAfp * (params.tasaMutualPercent / 100));

  const totalAportesPatronales = sisMonto + afcEmpleadorMonto + mutualMonto;
  const costoTotalEmpresa = totalHaberes + totalAportesPatronales;

  return {
    id: `${employee.id}_${params.period}`,
    companyId: employee.companyId,
    period: params.period,
    year,
    month,
    employeeId: employee.id,
    employeeRut: employee.rut,
    employeeName: employee.name,
    employeePosition: employee.position,
    employeeDepartment: employee.department,
    employeeCostCenterId: employee.costCenterId,
    contractType: employee.contractType,

    ufValue: params.uf,
    utmValue: params.utm,
    immValue: params.imm,

    diasTrabajados,
    diasLicencia,
    diasInasistencia,
    sueldoBasePactado,
    sueldoBaseProporcional,
    horasExtras50Qty,
    montoHorasExtras50,
    gratificacionLegal,
    bonosImponibles,
    comisionesVentas,
    semanaCorrida,
    otrosImponibles,
    totalHaberesImponibles,

    asignacionColacion,
    asignacionMovilizacion,
    asignacionFamiliar,
    viaticos,
    otrosNoImponibles,
    totalHaberesNoImponibles,

    totalHaberes,

    pensionSystem: employee.pensionSystem,
    afpTasa,
    baseImponibleAfp,
    afpMonto,
    healthSystem: employee.healthSystem,
    healthPlanType: employee.healthPlanType,
    saludLegal7,
    saludAdicionalIsapre,
    saludMontoTotal,
    afcTrabajadorTasa,
    baseImponibleAfc,
    afcTrabajadorMonto,
    apvMonto,
    apvType: employee.apvType,
    totalDescuentosPrevisionales,

    rentaAfectaImpuesto,
    impuestoUnicoSegundaCategoria,
    tramoImpuestoUnico,

    anticipos,
    prestamosEmpresa,
    otrosDescuentos,
    totalOtrosDescuentos,

    totalDescuentos,
    alcanceLiquido,
    liquidoAPagar,

    conceptValues: input.conceptValues || {},

    sisMonto,
    afcEmpleadorTasa,
    afcEmpleadorMonto,
    mutualMonto,
    totalAportesPatronales,
    costoTotalEmpresa,

    estado: 'BORRADOR',
    observations: input.observations,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Generador de Archivo Plano Previred (Formato 105 campos estándar)
 */
export function generatePreviredTxt(slips: PayrollSlip[], companyRut: string, periodStr: string): string {
  // Período en formato AAAAMM (ej. 202609)
  const formattedPeriod = periodStr.replace('-', '');
  
  const lines: string[] = [];

  for (const slip of slips) {
    const rawRut = slip.employeeRut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
    const rutBody = rawRut.slice(0, -1).padStart(11, '0');
    const rutDv = rawRut.slice(-1);

    // Separar nombres y apellidos (aproximación si viene todo en name)
    const nameParts = (slip.employeeName || '').trim().split(' ');
    const apellidoPaterno = (nameParts[0] || '').toUpperCase().slice(0, 30).padEnd(30, ' ');
    const apellidoMaterno = (nameParts[1] || '').toUpperCase().slice(0, 30).padEnd(30, ' ');
    const nombres = (nameParts.slice(2).join(' ') || nameParts[0] || '').toUpperCase().slice(0, 30).padEnd(30, ' ');

    const codAfp = PREVIRED_AFP_CODES[slip.pensionSystem] || '34';
    const codSalud = PREVIRED_HEALTH_CODES[slip.healthSystem] || '01';

    // Construcción de línea estándar Previred de 105 campos (separados o de ancho fijo según especificación)
    // Usamos formato estructurado delimitado por punto y coma o formato ancho fijo oficial
    const row = [
      rutBody,
      rutDv,
      apellidoPaterno.trim(),
      apellidoMaterno.trim(),
      nombres.trim(),
      'M', // Sexo (por defecto)
      'CHL', // Nacionalidad
      '01', // Tipo Pago (01=Remuneraciones mes)
      formattedPeriod, // Periodo desde AAAAMM
      formattedPeriod, // Periodo hasta AAAAMM
      '0', // Regimen Previsional (0=AFP)
      '0', // Tipo Trabajador (0=Activo)
      String(slip.diasTrabajados).padStart(2, '0'),
      '0', // Tipo Línea
      codAfp, // Código AFP
      String(Math.round(slip.baseImponibleAfp)), // Renta Imponible AFP
      String(Math.round(slip.afpMonto)), // Cotización Obligatoria AFP
      '0', // Cotización Voluntaria
      '0', // Ahorro AFP
      String(Math.round(slip.sisMonto)), // SIS Empleador
      '0', // Cuenta 2
      '0', // Cotización Trabajo Pesado
      codSalud, // Código Institución Salud
      '0', // Tipo Moneda Plan Isapre (0=Pesos, 1=UF)
      String(Math.round(slip.baseImponibleAfp)), // Renta Imponible Salud
      String(Math.round(slip.saludLegal7)), // Cotización 7% Obligatoria
      String(Math.round(slip.saludAdicionalIsapre)), // Cotización Adicional Isapre
      '0', // Monto Garantía GES
      '0', // Cargas Familiares
      String(Math.round(slip.asignacionFamiliar)), // Asignación Familiar
      String(Math.round(slip.baseImponibleAfc)), // Renta Imponible AFC
      String(Math.round(slip.afcTrabajadorMonto)), // Cotización AFC Trabajador
      String(Math.round(slip.afcEmpleadorMonto)), // Cotización AFC Empleador
      String(Math.round(slip.mutualMonto)), // Mutualidad
      String(Math.round(slip.impuestoUnicoSegundaCategoria)), // Impuesto Único
      String(Math.round(slip.liquidoAPagar)) // Monto Líquido Pagado
    ].join(';');

    lines.push(row);
  }

  return lines.join('\r\n');
}

/**
 * Generador del Libro de Remuneraciones Digital (LRD - Dirección del Trabajo DT)
 */
export function generateLrdCsv(slips: PayrollSlip[], companyRut: string, periodStr: string): string {
  // Cabecera oficial DT de conceptos estandarizados
  const headers = [
    'RUT Trabajador',
    'DV',
    'Nombre Completo',
    'Cargo',
    'Tipo Contrato',
    'Días Trabajados',
    '1101 Sueldo Base',
    '1102 Horas Extras',
    '1104 Gratificacion Legal Art 50',
    '1105 Bonos Imponibles',
    '1106 Comisiones',
    '1108 Otros Imponibles',
    '1000 Total Haberes Imponibles',
    '2101 Colacion',
    '2102 Movilizacion',
    '2103 Viaticos',
    '2201 Asignacion Familiar',
    '2000 Total Haberes No Imponibles',
    'Total Haberes Bruto',
    '3101 Cotizacion Obligatoria AFP',
    '3102 APV',
    '3103 Salud Fonasa Isapre 7pct',
    '3104 Adicional Isapre',
    '3105 AFC Trabajador',
    '3000 Total Descuentos Previsionales',
    '4101 Impuesto Unico 2da Categoria',
    '5101 Anticipos',
    '5102 Prestamos',
    '5103 Otros Descuentos',
    '5000 Total Otros Descuentos',
    'Total Descuentos',
    '7003 Liquido a Pagar',
    '6101 SIS Empleador',
    '6102 AFC Empleador',
    '6103 Mutualidad Empleador',
    '6000 Total Aportes Patronales',
    'Costo Total Empresa'
  ];

  const rows: string[] = [headers.join(';')];

  for (const s of slips) {
    const rawRut = s.employeeRut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
    const rutBody = rawRut.slice(0, -1);
    const rutDv = rawRut.slice(-1);

    const values = [
      rutBody,
      rutDv,
      `"${s.employeeName}"`,
      `"${s.employeePosition}"`,
      s.contractType,
      s.diasTrabajados,
      s.sueldoBaseProporcional,
      s.montoHorasExtras50,
      s.gratificacionLegal,
      s.bonosImponibles,
      s.comisionesVentas,
      s.otrosImponibles,
      s.totalHaberesImponibles,
      s.asignacionColacion,
      s.asignacionMovilizacion,
      s.viaticos,
      s.asignacionFamiliar,
      s.totalHaberesNoImponibles,
      s.totalHaberes,
      s.afpMonto,
      s.apvMonto,
      s.saludLegal7,
      s.saludAdicionalIsapre,
      s.afcTrabajadorMonto,
      s.totalDescuentosPrevisionales,
      s.impuestoUnicoSegundaCategoria,
      s.anticipos,
      s.prestamosEmpresa,
      s.otrosDescuentos,
      s.totalOtrosDescuentos,
      s.totalDescuentos,
      s.liquidoAPagar,
      s.sisMonto,
      s.afcEmpleadorMonto,
      s.mutualMonto,
      s.totalAportesPatronales,
      s.costoTotalEmpresa
    ];

    rows.push(values.join(';'));
  }

  return '\uFEFF' + rows.join('\r\n'); // UTF-8 BOM para Excel
}

/**
 * Motor de Reliquidación Legal de Bonos Anuales y Gratificaciones (Art. 43 LIR y Código del Trabajo)
 * Distribuye el bono devengado en los meses correspondientes, recalculando topes previsionales e Impuesto Único.
 */
export function calculateAnnualReliquidation(
  employee: Employee,
  montoTotalBruto: number,
  reliquidationType: 'BONO_ANUAL' | 'GRATIFICACION_ART47' | 'GRATIFICACION_ART50' | 'INCENTIVO_PERIODO',
  conceptName: string,
  periodPayment: string, // YYYY-MM en que se paga
  yearOrigin: number,
  monthsList: string[], // Array de YYYY-MM, ej: 12 meses
  historicalParams: Record<string, { uf: number; utm: number; topeAfpUf?: number; topeAfcUf?: number }>,
  existingSlips: Record<string, PayrollSlip | undefined>
): AnnualReliquidation {
  const monthsCount = Math.max(1, monthsList.length);
  const cuotaMensualBruta = Math.round(montoTotalBruto / monthsCount);

  let totalCotizacionesPrevisionales = 0;
  let totalImpuestoUnicoRetenido = 0;

  const afpTasa = employee.pensionCommissionPercent || DEFAULT_AFP_COMMISSIONS[employee.pensionSystem] || 11.44;
  const isJubiladoNoCotiza = employee.pensionSystem === 'JUBILADO_NO_COTIZA';
  const afcTasa = (employee.hasCesantiaAFC && !isJubiladoNoCotiza && employee.contractType === 'INDEFINIDO') ? 0.6 : 0.0;

  const detallesMesAMes: ReliquidationMonthDetail[] = monthsList.map(monthKey => {
    const slip = existingSlips[monthKey];
    const paramsMes = historicalParams[monthKey] || { uf: 38000, utm: 66000, topeAfpUf: 84.3, topeAfcUf: 126.6 };
    const ufMes = paramsMes.uf || 38000;
    const utmMes = paramsMes.utm || 66000;
    const topeAfpUf = paramsMes.topeAfpUf || 84.3;
    const topeAfpPesos = Math.round(topeAfpUf * ufMes);

    // Sueldo imponible original devengado
    const sueldoImponibleOriginal = slip ? slip.totalHaberesImponibles : (employee.baseSalary || 0);

    // Nueva renta imponible con cuota del bono
    const imponibleSinTope = sueldoImponibleOriginal + cuotaMensualBruta;
    const baseOriginalTopada = Math.min(sueldoImponibleOriginal, topeAfpPesos);
    const baseNuevaTopada = Math.min(imponibleSinTope, topeAfpPesos);
    const incrementoImponibleEfectivo = Math.max(0, baseNuevaTopada - baseOriginalTopada);

    // Diferencia de cotizaciones previsionales sobre el incremento
    const afpDiff = isJubiladoNoCotiza ? 0 : Math.round(incrementoImponibleEfectivo * (afpTasa / 100));
    const saludDiff = Math.round(incrementoImponibleEfectivo * 0.07);
    const afcDiff = Math.round(incrementoImponibleEfectivo * (afcTasa / 100));
    const cotizDiffMes = afpDiff + saludDiff + afcDiff;
    totalCotizacionesPrevisionales += cotizDiffMes;

    // Renta Afecta a Impuesto Único de Segunda Categoría
    const rentaAfectaOriginal = slip ? slip.rentaAfectaImpuesto : Math.max(0, sueldoImponibleOriginal - Math.round(baseOriginalTopada * ((afpTasa + 7 + afcTasa) / 100)));
    const incrementoTributable = Math.max(0, cuotaMensualBruta - cotizDiffMes);
    const rentaAfectaNueva = rentaAfectaOriginal + incrementoTributable;

    // Recalcular Impuesto Único con la UTM del mes de origen
    const { taxAmount: impOriginal } = calculateImpuestoUnicoSegundaCategoria(rentaAfectaOriginal, utmMes);
    const { taxAmount: impNuevo } = calculateImpuestoUnicoSegundaCategoria(rentaAfectaNueva, utmMes);
    const impuestoUnicoDiff = Math.max(0, impNuevo - impOriginal);
    totalImpuestoUnicoRetenido += impuestoUnicoDiff;

    return {
      month: monthKey,
      sueldoImponibleOriginal,
      cuotaBono: cuotaMensualBruta,
      nuevoImponible: imponibleSinTope,
      topeAfpUf,
      ufMes,
      topeAfpPesos,
      afpDiff,
      saludDiff,
      afcDiff,
      totalCotizacionesDiff: cotizDiffMes,
      rentaAfectaOriginal,
      rentaAfectaNueva,
      impuestoUnicoOriginal: impOriginal,
      impuestoUnicoNuevo: impNuevo,
      impuestoUnicoDiff
    };
  });

  const liquidoAPagar = Math.max(0, montoTotalBruto - totalCotizacionesPrevisionales - totalImpuestoUnicoRetenido);

  return {
    id: `reliq_${employee.id}_${yearOrigin}_${Date.now()}`,
    companyId: employee.companyId,
    employeeId: employee.id,
    employeeRut: employee.rut,
    employeeName: employee.name,
    periodPayment,
    yearOrigin,
    monthsCount,
    reliquidationType,
    conceptName,
    montoTotalBruto,
    totalCotizacionesPrevisionales,
    totalImpuestoUnicoRetenido,
    liquidoAPagar,
    detallesMesAMes,
    estado: 'BORRADOR',
    createdAt: new Date().toISOString()
  };
}

