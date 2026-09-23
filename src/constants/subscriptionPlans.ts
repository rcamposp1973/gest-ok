import { StudyModulePermissions } from '../types';

export type StudyPlanCode = 
  | 'PLAN_ENTRADA' 
  | 'PLAN_ESTUDIO_10' 
  | 'PLAN_ESTUDIO_FULL' 
  | 'PLAN_CORPORATIVO' 
  | 'CUSTOM';

export interface SubscriptionPlanDefinition {
  code: StudyPlanCode;
  name: string;
  priceUF: number | null; // null = A Convenir
  priceText: string;
  period: string;
  popular?: boolean;
  badge?: string;
  subtitle: string;
  description: string;
  maxCompanies: number;
  maxUsers: number;
  features: string[];
  defaultModules: StudyModulePermissions;
  order: number;
}

export interface SystemModuleMetadata {
  key: keyof StudyModulePermissions;
  label: string;
  category: 'CONTABILIDAD' | 'TRIBUTARIO' | 'BANCOS_TESORERIA' | 'GESTION_COMERCIAL' | 'RECURSOS_HUMANOS' | 'AVANZADO';
  description: string;
  icon: string;
  isAddonForBasic?: boolean;
}

export const SYSTEM_MODULES_CATALOG: SystemModuleMetadata[] = [
  // 1. Contabilidad Base
  {
    key: 'contabilidadBase',
    label: 'Contabilidad Base & Libros Oficiales',
    category: 'CONTABILIDAD',
    description: 'Vouchers contables, Libro Diario, Libro Mayor, Auxiliares de Cuentas Corrientes y Balance 8 Columnas Tributario.',
    icon: '📚'
  },
  {
    key: 'ifrsAuditoria',
    label: 'Balance IFRS & Auditor de EEFF',
    category: 'CONTABILIDAD',
    description: 'Balance Clasificado IFRS, Estado de Resultados por Función/Naturaleza y Auditoría de Estados Financieros con dictamen.',
    icon: '⚖️',
    isAddonForBasic: true
  },
  // 2. Tributario
  {
    key: 'rcvSii',
    label: 'Registro de Compras y Ventas (RCV SII)',
    category: 'TRIBUTARIO',
    description: 'Sincronización e importación automática RCV (Compras, Ventas, Honorarios BHR), centralización contable en 1 click.',
    icon: '⚡'
  },
  {
    key: 'formulario29',
    label: 'Formulario 29 Mensual (F29 Oficial)',
    category: 'TRIBUTARIO',
    description: 'Propuesta automática F29 con Códigos SII oficiales (538, 537, 504, 151, 62), PPM dinámico y exportación.',
    icon: '📋'
  },
  // 3. Bancos y Tesorería
  {
    key: 'cartolasBancarias',
    label: 'Importación Masiva de Cartolas Bancarias',
    category: 'BANCOS_TESORERIA',
    description: 'Carga de extractos bancarios en Excel/CSV (Banco de Chile, Santander, BCI, BancoEstado, Scotiabank, Itaú, etc.).',
    icon: '🏦'
  },
  {
    key: 'conciliacionBancaria',
    label: 'Conciliación Bancaria Inteligente',
    category: 'BANCOS_TESORERIA',
    description: 'Cruce automático de movimientos bancarios contra comprobantes contables por monto, fecha y número de documento.',
    icon: '🔍',
    isAddonForBasic: true
  },
  {
    key: 'tesoreria',
    label: 'Tesorería, Nóminas de Pago & Cobranza',
    category: 'BANCOS_TESORERIA',
    description: 'Generación de nóminas bancarias para proveedores, seguimiento de cuentas por cobrar y gestión de cobranza.',
    icon: '💳',
    isAddonForBasic: true
  },
  // 4. Reportes & KPIs
  {
    key: 'kpisIndicadores',
    label: 'Indicadores Financieros (KPIs) & Flujo de Caja',
    category: 'AVANZADO',
    description: 'Tablero ejecutivo con ratios de liquidez, solvencia, rentabilidad, EBITDA y proyección de flujo de caja.',
    icon: '📊',
    isAddonForBasic: true
  },
  // 5. Comercial & Inventario
  {
    key: 'comercialInventario',
    label: 'Módulo Comercial, Emisión DTE & Kardex',
    category: 'GESTION_COMERCIAL',
    description: 'Facturación Electrónica DTE, catálogo de productos/servicios, cotizaciones, órdenes de compra e inventario Kardex PMP.',
    icon: '📦',
    isAddonForBasic: true
  },
  // 6. Personal & Remuneraciones
  {
    key: 'remuneraciones',
    label: 'Personal, Liquidaciones & Previred',
    category: 'RECURSOS_HUMANOS',
    description: 'Fichas de empleados, contratos, cálculo de liquidaciones de sueldo con topes legales, archivo Previred (105 campos) y LRD DT.',
    icon: '👥',
    isAddonForBasic: true
  },
  // 7. Visor para Clientes
  {
    key: 'visorClientes',
    label: 'Visor / Portal de Clientes',
    category: 'AVANZADO',
    description: 'Acceso seguro para que los clientes del estudio o empresa consulten sus balances, F29 y reportes en tiempo real.',
    icon: '🌐',
    isAddonForBasic: true
  },
  // 8. Copiloto IA
  {
    key: 'copilotoIA',
    label: 'Copiloto de Auditoría IA & Cuadernos',
    category: 'AVANZADO',
    description: 'Asistente de inteligencia artificial para detección preventiva de inconsistencias tributarias y cuadernos de análisis.',
    icon: '✨',
    isAddonForBasic: true
  }
];

export const OFFICIAL_SUBSCRIPTION_PLANS: Record<StudyPlanCode, SubscriptionPlanDefinition> = {
  PLAN_ENTRADA: {
    code: 'PLAN_ENTRADA',
    name: 'Plan de Entrada',
    priceUF: 0.5,
    priceText: 'UF 0,5 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: 'Individual / 1 Empresa',
    subtitle: 'Plan individual para una empresa, solo contabilidad.',
    description: 'Ideal para contadores con empresas individuales o pymes que requieren contabilidad tributaria esencial y RCV.',
    maxCompanies: 1,
    maxUsers: 1,
    features: [
      '1 Empresa / RUT Comercial',
      'Contabilidad Base y Libros Oficiales (Diario, Mayor, Auxiliares)',
      'Sincronización RCV Automática con SII (Compras, Ventas, BHR)',
      'Formulario 29 con Códigos SII oficiales',
      'Importación masiva de cartolas bancarias',
      'Actualizaciones tributarias automáticas'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: false,
      kpisIndicadores: false,
      ifrsAuditoria: false,
      comercialInventario: false,
      tesoreria: false,
      remuneraciones: false,
      visorClientes: false,
      copilotoIA: false
    },
    order: 1
  },
  PLAN_ESTUDIO_10: {
    code: 'PLAN_ESTUDIO_10',
    name: 'Plan Estudio 10',
    priceUF: 1.2,
    priceText: 'UF 1,2 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: '10 Empresas / 2 Usuarios',
    subtitle: 'Plan para 2 usuarios y 10 empresas.',
    description: 'Diseñado para contadores independientes y pequeños estudios contables con cartera en expansión.',
    maxCompanies: 10,
    maxUsers: 2,
    features: [
      '10 Empresas / Clientes',
      '2 Usuarios: 1 Administrador + 1 Analista Contable',
      'Balance 8 Columnas e IFRS Auditado',
      'Conciliación Bancaria Inteligente',
      'Libros Diario, Mayor y Auxiliares analíticos con exportación Excel',
      'Indicadores Financieros (KPIs) y Ratios',
      'Asistencia en la Implementación y puesta en marcha de 5 empresas',
      'Sincronización RCV y Formulario 29 SII'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: false,
      tesoreria: true,
      remuneraciones: false,
      visorClientes: false,
      copilotoIA: false
    },
    order: 2
  },
  PLAN_ESTUDIO_FULL: {
    code: 'PLAN_ESTUDIO_FULL',
    name: 'Plan Estudio Full',
    priceUF: 2.4,
    priceText: 'UF 2,4 + IVA',
    period: '/ mes + IVA',
    popular: true,
    badge: 'Más Popular / 100 Empresas',
    subtitle: 'Plan para 4 usuarios y 100 empresas.',
    description: 'La solución definitiva para estudios contables medianos y consolidados que buscan máxima productividad y servicio al cliente.',
    maxCompanies: 100,
    maxUsers: 4,
    features: [
      '100 Empresas / Clientes',
      '4 Usuarios: 1 Administrador + 3 Analistas',
      'Balance 8 Columnas e IFRS con Dictamen',
      'Conciliación Bancaria Inteligente',
      'Libros Diario, Mayor y Auxiliares analíticos con exportación Excel',
      'Indicadores Financieros (KPIs) y Flujo de Caja',
      'Asistencia en la Implementación y puesta en marcha de 5 empresas',
      'Visor para Clientes (Portal de consulta online)',
      'Todos los módulos contables y tributarios activos'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: true,
      tesoreria: true,
      remuneraciones: true,
      visorClientes: true,
      copilotoIA: true
    },
    order: 3
  },
  PLAN_CORPORATIVO: {
    code: 'PLAN_CORPORATIVO',
    name: 'Plan Corporativo / PYMES',
    priceUF: 4.0,
    priceText: 'Desde UF 4,0 + IVA',
    period: '/ mes + IVA',
    popular: false,
    badge: 'Holding / A Convenir',
    subtitle: 'Módulos y Usuarios a convenir según requerimientos.',
    description: 'Solución empresarial integral para grandes firmas contables, holdings y empresas corporativas con alta volumetría.',
    maxCompanies: 500,
    maxUsers: 20,
    features: [
      'Empresas y Usuarios a convenir (escalable)',
      'Todos los módulos del sistema (Finanzas, Comercial, KPIs, RCV, Personal, Tesorería)',
      'Integración con facturadores electrónicos y ERP',
      'Soporte prioritario 24/7 con SLA garantizado',
      'Capacitación in-company para todo el equipo contable',
      'Servidor y respaldos dedicados con alta disponibilidad'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: true,
      kpisIndicadores: true,
      ifrsAuditoria: true,
      comercialInventario: true,
      tesoreria: true,
      remuneraciones: true,
      visorClientes: true,
      copilotoIA: true
    },
    order: 4
  },
  CUSTOM: {
    code: 'CUSTOM',
    name: 'Plan Personalizado',
    priceUF: null,
    priceText: 'Tarifa a la Medida',
    period: '/ personalizado',
    popular: false,
    badge: 'A Medida',
    subtitle: 'Configuración personalizada de empresas, usuarios y módulos.',
    description: 'Ajuste granular de capacidades y módulos adicionales para clientes con necesidades específicas.',
    maxCompanies: 10,
    maxUsers: 2,
    features: [
      'Capacidades y módulos configurables a medida',
      'Activación de módulos individuales por cobro adicional'
    ],
    defaultModules: {
      contabilidadBase: true,
      rcvSii: true,
      formulario29: true,
      cartolasBancarias: true,
      conciliacionBancaria: false,
      kpisIndicadores: false,
      ifrsAuditoria: false,
      comercialInventario: false,
      tesoreria: false,
      remuneraciones: false,
      visorClientes: false,
      copilotoIA: false
    },
    order: 5
  }
};

/**
 * Obtener la lista ordenada de planes oficiales
 */
export function getOfficialPlansList(): SubscriptionPlanDefinition[] {
  return [
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ENTRADA,
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_10,
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_FULL,
    OFFICIAL_SUBSCRIPTION_PLANS.PLAN_CORPORATIVO
  ];
}

/**
 * Obtener los módulos por defecto según código de plan
 */
export function getDefaultModulesForPlan(planCode?: string | null): StudyModulePermissions {
  if (!planCode) return { ...OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_10.defaultModules };
  const plan = OFFICIAL_SUBSCRIPTION_PLANS[planCode as StudyPlanCode];
  if (plan) {
    return { ...plan.defaultModules };
  }
  return { ...OFFICIAL_SUBSCRIPTION_PLANS.PLAN_ESTUDIO_10.defaultModules };
}

/**
 * Validador de acceso a un módulo específico
 */
export function hasModuleAccess(
  entity: { modules?: StudyModulePermissions; planCode?: string } | null | undefined,
  moduleKey: keyof StudyModulePermissions
): boolean {
  if (!entity) return true; // Por defecto permitir si no hay restricciones explícitas
  if (entity.modules && typeof entity.modules[moduleKey] === 'boolean') {
    return entity.modules[moduleKey] === true;
  }
  // Si no tiene matriz explícita, consultar módulos del plan
  if (entity.planCode && OFFICIAL_SUBSCRIPTION_PLANS[entity.planCode as StudyPlanCode]) {
    const plan = OFFICIAL_SUBSCRIPTION_PLANS[entity.planCode as StudyPlanCode];
    return Boolean(plan.defaultModules[moduleKey]);
  }
  return true;
}
