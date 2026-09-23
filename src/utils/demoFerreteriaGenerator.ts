import { collection, doc, getDocs, writeBatch, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  Company,
  ChartOfAccount,
  Auxiliary,
  CostCenterMaster,
  ExpenseItemMaster,
  ProjectMaster,
  Warehouse,
  ProductService,
  Employee,
  PayrollSlip,
  Voucher,
  VoucherLine,
  RCVDocument,
  PaymentBatch,
  CollectionRecord,
  BankReconciliation,
  BankStatementLine,
  F29Declaration,
  CommercialDocument,
  InventoryMovement,
  FiscalPeriodYear
} from '../types';
import { logAuditEvent } from './auditLogger';

export const DEMO_COMPANY_RUT = '77.654.321-K';
export const DEMO_COMPANY_NAME = 'FERRETERIA DON ALI KT LTDA';
export const DEMO_COMPANY_FANTASY = 'FERRETERIA DON ALI KT';
export const DEMO_COMPANY_ID = 'demo-ferreteria-don-ali-kt-ltda';

/**
 * Validates whether a company is specifically the demo company.
 */
export function isDemoFerreteriaCompany(company: Company | null | undefined): boolean {
  if (!company) return false;
  const name = (company.name || '').trim().toUpperCase();
  const rut = (company.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const id = (company.id || '').toLowerCase();
  
  return (
    Boolean(company.isDemoCompany) ||
    id === DEMO_COMPANY_ID ||
    name.includes('FERRETERIA DON ALI') ||
    rut === '77654321K'
  );
}

/**
 * Creates or resets the complete 2025 demo company 'FERRETERIA DON ALI KT LTDA'
 * with 10 daily transactions, 10 employees with payroll + IUSC, bank cartolas,
 * payment batches, collections, RCV, F29, DDJJ, RLI, stock, projects, cost centers, etc.
 */
export async function generateOrResetDemoFerreteria(
  studyId: string,
  userEmail?: string,
  userId?: string,
  onProgress?: (message: string, percent: number) => void
): Promise<{ success: boolean; companyId: string; message: string }> {
  try {
    onProgress?.('Iniciando preparación de FERRETERIA DON ALI KT LTDA...', 5);

    const studyDocRef = doc(db, 'studies', studyId);
    const studySnap = await getDoc(studyDocRef);
    if (!studySnap.exists()) {
      throw new Error(`Estudio no encontrado (ID: ${studyId})`);
    }

    // 1. Check or Create Company Document
    const compDocRef = doc(studyDocRef, 'companies', DEMO_COMPANY_ID);
    
    const companyPayload: Company = {
      id: DEMO_COMPANY_ID,
      studyId: studyId,
      name: DEMO_COMPANY_NAME,
      fantasyName: DEMO_COMPANY_FANTASY,
      rut: DEMO_COMPANY_RUT,
      giro: 'VENTA AL POR MAYOR Y MENOR DE ARTÍCULOS DE FERRETERÍA, HERRAMIENTAS, MATERIALES DE CONSTRUCCIÓN Y PINTURAS',
      address: 'Av. Los Conquistadores 1840, Local 1-3',
      comuna: 'Providencia',
      ciudad: 'Santiago',
      email: 'contacto@ferreteriadonali.cl',
      phone: '+56 9 8765 4321',
      legalRepName: 'Alí Karim Tapia',
      legalRepRut: '12.345.678-9',
      legalRepEmail: 'alikarim@ferreteriadonali.cl',
      contactName: 'Alí Karim Tapia',
      contactPhone: '+56 9 8765 4321',
      estado: 'Activo',
      regimenTributario: '14_D3_PROPYME_GENERAL',
      isDemoCompany: true,
      assignedAccountantIds: []
    };

    await setDoc(compDocRef, companyPayload, { merge: true });

    onProgress?.('Limpiando transacciones previas de la demo...', 10);

    // 2. Clear previous subcollections in the demo company ONLY
    const subcollectionsToClear = [
      'chartOfAccounts',
      'auxiliaries',
      'costCenters',
      'expenseItems',
      'projects',
      'warehouses',
      'products',
      'employees',
      'payrollSlips',
      'rcvDocuments',
      'vouchers',
      'bankReconciliations',
      'paymentBatches',
      'collectionRecords',
      'commercialDocuments',
      'inventoryMovements',
      'f29Declarations',
      'fiscalPeriods'
    ];

    for (const subCol of subcollectionsToClear) {
      const snap = await getDocs(collection(compDocRef, subCol));
      if (!snap.empty) {
        let batch = writeBatch(db);
        let count = 0;
        for (const d of snap.docs) {
          batch.delete(d.ref);
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      }
    }

    onProgress?.('Configurando Plan de Cuentas y Tablas Maestras...', 20);

    // 3. Setup Fiscal Periods for 2025
    const months2025 = [
      '2025-01', '2025-02', '2025-03', '2025-04',
      '2025-05', '2025-06', '2025-07', '2025-08',
      '2025-09', '2025-10', '2025-11', '2025-12'
    ];

    const fiscalYear2025: FiscalPeriodYear = {
      id: '2025',
      year: 2025,
      months: {
        1: 'Abierto', 2: 'Abierto', 3: 'Abierto', 4: 'Abierto',
        5: 'Abierto', 6: 'Abierto', 7: 'Abierto', 8: 'Abierto',
        9: 'Abierto', 10: 'Abierto', 11: 'Abierto', 12: 'Abierto'
      }
    };
    await setDoc(doc(compDocRef, 'fiscalPeriods', 'fy-2025'), fiscalYear2025);

    // 4. Setup Chart of Accounts
    const standardAccounts: Omit<ChartOfAccount, 'id'>[] = [
      // 1. ACTIVO
      { code: '1', name: 'ACTIVO', type: 'Activo', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1', name: 'ACTIVO CIRCULANTE', type: 'Activo', parentCode: '1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.01', name: 'Disponible y Bancos', type: 'Activo', parentCode: '1.1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: true, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.01.001', name: 'Caja Central Ferretería', type: 'Activo', parentCode: '1.1.01', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.01.002', name: 'Banco Santander Cta Cte 88921-0', type: 'Activo', parentCode: '1.1.01', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: true, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.02', name: 'Deudores por Ventas', type: 'Activo', parentCode: '1.1', requiereCentroCosto: false, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '1.1.02.001', name: 'Clientes Nacionales Ferretería', type: 'Activo', parentCode: '1.1.02', requiereCentroCosto: false, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '1.1.03', name: 'Existencias e Inventario', type: 'Activo', parentCode: '1.1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.03.001', name: 'Mercaderías y Materiales de Construcción', type: 'Activo', parentCode: '1.1.03', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.04', name: 'Impuestos por Recuperar', type: 'Activo', parentCode: '1.1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.04.001', name: 'IVA Crédito Fiscal', type: 'Activo', parentCode: '1.1.04', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.04.002', name: 'PPM Pagos Provisionales Mensuales', type: 'Activo', parentCode: '1.1.04', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.2', name: 'ACTIVO FIJO / INMOVILIZADO', type: 'Activo', parentCode: '1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.2.01.001', name: 'Instalaciones y Local Comercial', type: 'Activo', parentCode: '1.2', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.2.01.002', name: 'Camiones y Flota de Reparto', type: 'Activo', parentCode: '1.2', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.2.01.003', name: 'Racks y Grúa Horquilla Bodega', type: 'Activo', parentCode: '1.2', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.2.02.001', name: 'Depreciación Acumulada Activo Fijo', type: 'Activo', parentCode: '1.2', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },

      // 2. PASIVO
      { code: '2', name: 'PASIVO', type: 'Pasivo', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1', name: 'PASIVO CIRCULANTE', type: 'Pasivo', parentCode: '2', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1.01', name: 'Cuentas por Pagar Comerciales', type: 'Pasivo', parentCode: '2.1', requiereCentroCosto: false, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '2.1.01.001', name: 'Proveedores Nacionales Ferretería', type: 'Pasivo', parentCode: '2.1.01', requiereCentroCosto: false, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '2.1.02', name: 'Impuestos por Pagar', type: 'Pasivo', parentCode: '2.1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1.02.001', name: 'IVA Débito Fiscal', type: 'Pasivo', parentCode: '2.1.02', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1.03.001', name: 'Retención Impuesto Único 2da Categoría', type: 'Pasivo', parentCode: '2.1.02', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1.03.002', name: 'Retención Boletas de Honorarios 13.75%', type: 'Pasivo', parentCode: '2.1.02', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1.04', name: 'Obligaciones Laborales y Previsionales', type: 'Pasivo', parentCode: '2.1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1.04.001', name: 'Leyes Sociales e Imposiciones por Pagar (Previred)', type: 'Pasivo', parentCode: '2.1.04', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1.04.002', name: 'Sueldos Líquidos por Pagar', type: 'Pasivo', parentCode: '2.1.04', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },

      // 3. PATRIMONIO
      { code: '3', name: 'PATRIMONIO', type: 'Patrimonio', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '3.1.01.001', name: 'Capital Social Pagado', type: 'Patrimonio', parentCode: '3', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '3.1.02.001', name: 'Resultados Acumulados / Ejercicios Anteriores', type: 'Patrimonio', parentCode: '3', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },

      // 4. INGRESOS
      { code: '4', name: 'INGRESOS OPERACIONALES', type: 'Ingreso', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '4.1.01.001', name: 'Ventas de Materiales y Ferretería Afectas', type: 'Ingreso', parentCode: '4', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '4.1.02.001', name: 'Ingresos por Servicios de Fletes y Dimensionado', type: 'Ingreso', parentCode: '4', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },

      // 5. COSTOS Y GASTOS
      { code: '5', name: 'COSTOS Y GASTOS DE OPERACIÓN', type: 'Gasto', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.1.01.001', name: 'Costo de Ventas Mercaderías Ferretería', type: 'Costo' as any, parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '5.2.01.001', name: 'Sueldos Base y Remuneraciones', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '5.2.01.002', name: 'Gratificaciones Legales', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '5.2.01.003', name: 'Leyes Sociales Patronales (SIS / Cesantía Empleador)', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '5.2.02.001', name: 'Arriendo Local Comercial y Bodegas', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.2.02.002', name: 'Servicios Básicos (Luz Trifásica, Agua, Internet)', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.2.02.003', name: 'Combustibles y Mantención Vehículos de Despacho', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.2.02.004', name: 'Publicidad, Marketing y Catálogos', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.2.02.005', name: 'Honorarios Profesionales Contables e Informáticos', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.2.02.006', name: 'Seguros Contra Incendio y Suministros Menores', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' }
    ];

    const accountMap = new Map<string, string>(); // code -> id
    for (const acc of standardAccounts) {
      const accId = `acc-${acc.code.replace(/\./g, '_')}`;
      await setDoc(doc(compDocRef, 'chartOfAccounts', accId), { ...acc, id: accId });
      accountMap.set(acc.code, accId);
    }

    // 5. Setup Auxiliaries (Suppliers & Customers)
    const auxiliariesList: Auxiliary[] = [
      { id: 'aux-melon', rut: '90.123.000-4', name: 'CEMENTOS MELÓN S.A.', role: 'Ambos', email: 'ventas@melon.cl', phone: '+56 2 2890 1000', estado: 'Activo' },
      { id: 'aux-gerdau', rut: '91.456.000-8', name: 'GERDAU AZA ACEROS S.A.', role: 'Acreedor', email: 'contacto@gerdauaza.cl', phone: '+56 2 2450 7000', estado: 'Activo' },
      { id: 'aux-bosch', rut: '76.890.123-5', name: 'ROBERT BOSCH HERRAMIENTAS CHILE SPA', role: 'Acreedor', email: 'herramientas@bosch.cl', phone: '+56 2 2580 9000', estado: 'Activo' },
      { id: 'aux-sipa', rut: '92.345.678-1', name: 'PINTURAS Y REVESTIMIENTOS SIPA LTDA', role: 'Acreedor', email: 'pedidos@sipa.cl', phone: '+56 2 2780 4000', estado: 'Activo' },
      { id: 'aux-stanley', rut: '77.123.456-7', name: 'STANLEY BLACK & DECKER CHILE SPA', role: 'Acreedor', email: 'atencion@stanley.cl', phone: '+56 2 2900 6000', estado: 'Activo' },
      { id: 'aux-enel', rut: '96.800.570-7', name: 'ENEL DISTRIBUCIÓN CHILE S.A.', role: 'Acreedor', email: 'cuentas@enel.cl', phone: '+56 2 2697 5000', estado: 'Activo' },
      { id: 'aux-aguas', rut: '61.808.000-5', name: 'AGUAS ANDINAS S.A.', role: 'Acreedor', email: 'empresas@aguasandinas.cl', phone: '+56 2 2731 2400', estado: 'Activo' },
      { id: 'aux-inmobiliaria', rut: '76.432.109-8', name: 'INMOBILIARIA Y RENTAS LOS CONQUISTADORES SPA', role: 'Acreedor', email: 'arriendos@losconquistadores.cl', phone: '+56 2 2334 5500', estado: 'Activo' },
      { id: 'aux-abogado', rut: '13.987.654-3', name: 'FELIPE ANDRÉS MATUS ASESORES LEGALES', role: 'Acreedor', email: 'fmatus@matusabogados.cl', phone: '+56 9 9123 4567', estado: 'Activo' },
      { id: 'aux-prevencion', rut: '16.543.210-9', name: 'CAROLINA ANDREA VEGA PREVENCIÓN DE RIESGOS', role: 'Acreedor', email: 'cvega.prevencion@gmail.com', phone: '+56 9 8234 5678', estado: 'Activo' },
      
      // Clientes
      { id: 'aux-cli-losandes', rut: '76.543.999-1', name: 'CONSTRUCTORA LOS ANDES SPA', role: 'Deudor', email: 'adquisiciones@constructoralosandes.cl', phone: '+56 2 2445 8800', estado: 'Activo' },
      { id: 'aux-cli-maipo', rut: '77.890.321-4', name: 'INGENIERÍA Y CONSTRUCCIÓN DEL MAIPO LTDA', role: 'Deudor', email: 'obras@delmaipo.cl', phone: '+56 2 2850 3300', estado: 'Activo' },
      { id: 'aux-cli-maestros', rut: '76.111.222-3', name: 'SERVICIOS INTEGRALES Y REFORMAS EL ROBLE SPA', role: 'Deudor', email: 'elroble@reformas.cl', phone: '+56 9 7788 9900', estado: 'Activo' },
      { id: 'aux-cli-publico', rut: '66.666.666-6', name: 'CLIENTES MOSTRADOR Y VENTAS DIARIAS BOLETA', role: 'Deudor', email: 'caja@ferreteriadonali.cl', phone: '+56 2 2345 6789', estado: 'Activo' }
    ];

    for (const aux of auxiliariesList) {
      await setDoc(doc(compDocRef, 'auxiliaries', aux.id), aux);
    }

    // 6. Setup Cost Centers, Expense Items, Projects, Warehouses & Stock
    const costCentersList: CostCenterMaster[] = [
      { id: 'cc-01', companyId: DEMO_COMPANY_ID, code: 'CC-01', name: 'ADMINISTRACIÓN & FINANZAS', estado: 'Activo', description: 'Gastos generales, contabilidad y dirección' },
      { id: 'cc-02', companyId: DEMO_COMPANY_ID, code: 'CC-02', name: 'VENTAS SALÓN & MOSTRADOR', estado: 'Activo', description: 'Venta presencial, mesón y caja' },
      { id: 'cc-03', companyId: DEMO_COMPANY_ID, code: 'CC-03', name: 'LOGÍSTICA, BODEGA & DESPACHOS', estado: 'Activo', description: 'Recepción, acopio, preparación y flota' },
      { id: 'cc-04', companyId: DEMO_COMPANY_ID, code: 'CC-04', name: 'PROYECTOS & OBRAS CIVILES', estado: 'Activo', description: 'Suministro y ventas a constructoras' }
    ];
    for (const cc of costCentersList) {
      await setDoc(doc(compDocRef, 'costCenters', cc.id), cc);
    }

    const expenseItemsList: ExpenseItemMaster[] = [
      { id: 'ig-01', companyId: DEMO_COMPANY_ID, code: 'IG-01', name: 'Arriendo Local Comercial y Bodega Central', estado: 'Activo', category: 'Inmuebles' },
      { id: 'ig-02', companyId: DEMO_COMPANY_ID, code: 'IG-02', name: 'Servicios Básicos (Electricidad Trifásica, Agua, Internet)', estado: 'Activo', category: 'Operación' },
      { id: 'ig-03', companyId: DEMO_COMPANY_ID, code: 'IG-03', name: 'Publicidad, Catálogos y Marketing Digital', estado: 'Activo', category: 'Comercial' },
      { id: 'ig-04', companyId: DEMO_COMPANY_ID, code: 'IG-04', name: 'Combustible y Mantención Flota Camiones', estado: 'Activo', category: 'Logística' },
      { id: 'ig-05', companyId: DEMO_COMPANY_ID, code: 'IG-05', name: 'Suministros de Embalaje, Ferretería y Seguridad EPP', estado: 'Activo', category: 'Operación' },
      { id: 'ig-06', companyId: DEMO_COMPANY_ID, code: 'IG-06', name: 'Honorarios Asesoría Contable, Legal e Informática', estado: 'Activo', category: 'Servicios Profesionales' },
      { id: 'ig-07', companyId: DEMO_COMPANY_ID, code: 'IG-07', name: 'Seguros Contra Incendio, Robo y Responsabilidad', estado: 'Activo', category: 'Seguros' }
    ];
    for (const ig of expenseItemsList) {
      await setDoc(doc(compDocRef, 'expenseItems', ig.id), ig);
    }

    const projectsList: ProjectMaster[] = [
      { id: 'pry-01', companyId: DEMO_COMPANY_ID, code: 'PRY-2025-01', name: 'Ampliación Bodega de Acopio y Racks Pesados', estado: 'Activo', description: 'Presupuesto: $15.000.000' },
      { id: 'pry-02', companyId: DEMO_COMPANY_ID, code: 'PRY-2025-02', name: 'Contrato Suministro Ferretero Constructora Los Andes', estado: 'Activo', description: 'Presupuesto: $85.000.000' },
      { id: 'pry-03', companyId: DEMO_COMPANY_ID, code: 'PRY-2025-03', name: 'Lanzamiento Canal E-commerce y Despacho Express', estado: 'Activo', description: 'Presupuesto: $8.000.000' }
    ];
    for (const pry of projectsList) {
      await setDoc(doc(compDocRef, 'projects', pry.id), pry);
    }

    const warehousesList: Warehouse[] = [
      { id: 'wh-matriz', companyId: DEMO_COMPANY_ID, code: 'BOD-MATRIZ', name: 'Bodega Central - Casa Matriz Providencia', address: 'Av. Los Conquistadores 1840', responsible: 'Juan Carlos Carrasco', isDefault: true, estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'wh-acopio', companyId: DEMO_COMPANY_ID, code: 'BOD-ACOPIO', name: 'Bodega Acopio Materiales Pesados Renca', address: 'Panamericana Norte 5400', responsible: 'Esteban Gutiérrez', isDefault: false, estado: 'Activo', createdAt: '2025-01-01' }
    ];
    for (const wh of warehousesList) {
      await setDoc(doc(compDocRef, 'warehouses', wh.id), wh);
    }

    const productsList: ProductService[] = [
      { id: 'prod-01', companyId: DEMO_COMPANY_ID, code: 'FERR-001', name: 'Cemento Especial Melón 25 Kg', type: 'PRODUCT', unitOfMeasure: 'SACO', salesPrice: 5990, purchaseCost: 4200, currentStock: 450, minStock: 100, defaultWarehouseId: 'wh-matriz', stocksByWarehouse: { 'wh-matriz': 300, 'wh-acopio': 150 }, allowNegativeStock: false, category: 'Construcción Gruesa', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-02', companyId: DEMO_COMPANY_ID, code: 'FERR-002', name: 'Fierro Estriado A63-42H 10mm x 6m Gerdau', type: 'PRODUCT', unitOfMeasure: 'BARRA', salesPrice: 6850, purchaseCost: 4800, currentStock: 320, minStock: 80, defaultWarehouseId: 'wh-acopio', stocksByWarehouse: { 'wh-acopio': 320 }, allowNegativeStock: false, category: 'Aceros', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-03', companyId: DEMO_COMPANY_ID, code: 'FERR-003', name: 'Taladro Percutor Bosch GSB 13 RE 750W', type: 'PRODUCT', unitOfMeasure: 'UNIDAD', salesPrice: 69990, purchaseCost: 48900, currentStock: 35, minStock: 10, defaultWarehouseId: 'wh-matriz', stocksByWarehouse: { 'wh-matriz': 35 }, allowNegativeStock: false, category: 'Herramientas Eléctricas', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-04', companyId: DEMO_COMPANY_ID, code: 'FERR-004', name: 'Esmalte al Agua Extra Blanco 1 Galón Sipa', type: 'PRODUCT', unitOfMeasure: 'GALON', salesPrice: 26900, purchaseCost: 18500, currentStock: 120, minStock: 30, defaultWarehouseId: 'wh-matriz', stocksByWarehouse: { 'wh-matriz': 120 }, allowNegativeStock: false, category: 'Pinturas & Impermeabilizantes', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-05', companyId: DEMO_COMPANY_ID, code: 'FERR-005', name: 'Disco de Corte Metal 4 1/2" DeWalt (Pack 25)', type: 'PRODUCT', unitOfMeasure: 'PACK', salesPrice: 21500, purchaseCost: 14200, currentStock: 90, minStock: 25, defaultWarehouseId: 'wh-matriz', stocksByWarehouse: { 'wh-matriz': 90 }, allowNegativeStock: false, category: 'Abrasivos', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-06', companyId: DEMO_COMPANY_ID, code: 'FERR-006', name: 'Set Herramientas Profesionales 108 Pzas Stanley', type: 'PRODUCT', unitOfMeasure: 'SET', salesPrice: 94990, purchaseCost: 65000, currentStock: 25, minStock: 8, defaultWarehouseId: 'wh-matriz', stocksByWarehouse: { 'wh-matriz': 25 }, allowNegativeStock: false, category: 'Herramientas Manuales', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-07', companyId: DEMO_COMPANY_ID, code: 'FERR-007', name: 'Tornillo Autoperforante Volcanita 6x1 1/4" (Caja 1000)', type: 'PRODUCT', unitOfMeasure: 'CAJA', salesPrice: 9450, purchaseCost: 6200, currentStock: 200, minStock: 50, defaultWarehouseId: 'wh-matriz', stocksByWarehouse: { 'wh-matriz': 200 }, allowNegativeStock: false, category: 'Fijaciones', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-08', companyId: DEMO_COMPANY_ID, code: 'FERR-008', name: 'Cable Eléctrico THHN 2.5mm Rojo Rollo 100m', type: 'PRODUCT', unitOfMeasure: 'ROLLO', salesPrice: 45900, purchaseCost: 32000, currentStock: 60, minStock: 15, defaultWarehouseId: 'wh-matriz', stocksByWarehouse: { 'wh-matriz': 60 }, allowNegativeStock: false, category: 'Electricidad', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-09', companyId: DEMO_COMPANY_ID, code: 'FERR-009', name: 'Cerradura Embutir Cerrojo Acero Poli', type: 'PRODUCT', unitOfMeasure: 'UNIDAD', salesPrice: 18900, purchaseCost: 12500, currentStock: 80, minStock: 20, defaultWarehouseId: 'wh-matriz', stocksByWarehouse: { 'wh-matriz': 80 }, allowNegativeStock: false, category: 'Cerrajería', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-10', companyId: DEMO_COMPANY_ID, code: 'FERR-010', name: 'Servicio de Dimensionado y Corte de Maderas', type: 'SERVICE', unitOfMeasure: 'SERVICIO', salesPrice: 15000, purchaseCost: 0, currentStock: 0, minStock: 0, allowNegativeStock: true, category: 'Servicios en Tienda', estado: 'Activo', createdAt: '2025-01-01' },
      { id: 'prod-11', companyId: DEMO_COMPANY_ID, code: 'FERR-011', name: 'Flete y Despacho Express en Obra', type: 'SERVICE', unitOfMeasure: 'VIAJE', salesPrice: 25000, purchaseCost: 0, currentStock: 0, minStock: 0, allowNegativeStock: true, category: 'Logística', estado: 'Activo', createdAt: '2025-01-01' }
    ];
    for (const prod of productsList) {
      await setDoc(doc(compDocRef, 'products', prod.id), prod);
    }

    onProgress?.('Configurando Nómina de 10 Trabajadores y Liquidaciones 2025...', 35);

    // 7. Setup 10 Employees with Realistic Chilean Salaries and IUSC
    const employeesList: Employee[] = [
      { id: 'emp-01', companyId: DEMO_COMPANY_ID, rut: '12.345.678-9', name: 'Alí Karim Tapia', position: 'Gerente General', department: 'Gerencia', baseSalary: 3850000, pensionSystem: 'CUPRUM', healthSystem: 'COLMENA', healthPlanType: 'ISAPRE_UF', healthPlanValue: 4.8, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'alikarim@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-02', companyId: DEMO_COMPANY_ID, rut: '14.567.890-1', name: 'Rodrigo Morales Peña', position: 'Jefe de Operaciones & Logística', department: 'Operaciones', baseSalary: 2400000, pensionSystem: 'HABITAT', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'rmorales@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-03', companyId: DEMO_COMPANY_ID, rut: '16.789.012-3', name: 'Claudia Soto Valenzuela', position: 'Jefa de Adquisiciones y Compras', department: 'Abastecimiento', baseSalary: 1850000, pensionSystem: 'PROVIDA', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'csoto@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-04', companyId: DEMO_COMPANY_ID, rut: '15.678.901-2', name: 'Patricio Navia Fuentes', position: 'Contador General', department: 'Finanzas', baseSalary: 1600000, pensionSystem: 'MODELO', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'pnavia@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-05', companyId: DEMO_COMPANY_ID, rut: '17.890.123-4', name: 'Marcela Araya Castro', position: 'Ejecutiva de Ventas Mesón Sr', department: 'Ventas', baseSalary: 950000, pensionSystem: 'HABITAT', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'maraya@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-06', companyId: DEMO_COMPANY_ID, rut: '18.901.234-5', name: 'Gonzalo Pérez Lara', position: 'Ejecutivo de Ventas Empresas', department: 'Ventas', baseSalary: 880000, pensionSystem: 'UNO', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'gperez@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-07', companyId: DEMO_COMPANY_ID, rut: '19.012.345-6', name: 'Felipe Rojas Mardones', position: 'Vendedor Salón Ferretería', department: 'Ventas', baseSalary: 750000, pensionSystem: 'PLANVITAL', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'frojas@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-08', companyId: DEMO_COMPANY_ID, rut: '18.234.567-8', name: 'Camila Vergara Pinto', position: 'Cajera y Atención a Clientes', department: 'Caja', baseSalary: 680000, pensionSystem: 'PROVIDA', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'cvergara@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-09', companyId: DEMO_COMPANY_ID, rut: '15.345.678-0', name: 'Juan Carlos Carrasco', position: 'Jefe de Bodega y Despachos', department: 'Logística', baseSalary: 780000, pensionSystem: 'CAPITAL', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'jcarrasco@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' },
      { id: 'emp-10', companyId: DEMO_COMPANY_ID, rut: '19.456.789-1', name: 'Esteban Gutiérrez Silva', position: 'Operador de Bodega y Reparto', department: 'Logística', baseSalary: 620000, pensionSystem: 'MODELO', healthSystem: 'FONASA', healthPlanType: 'FONASA_7', healthPlanValue: 0, hasCesantiaAFC: true, contractType: 'INDEFINIDO', hasGratificacionLegal: true, cargasFamiliares: 0, tramoCargaFamiliar: 'D', workHoursPerWeek: 45, hireDate: '2025-01-01', email: 'egutierrez@ferreteriadonali.cl', active: true, createdAt: '2025-01-01' }
    ];

    for (const emp of employeesList) {
      await setDoc(doc(compDocRef, 'employees', emp.id), emp);
    }

    // Generate Payroll Slips for 12 months (10 employees x 12 months = 120 slips)
    const payrollSlipsList: PayrollSlip[] = [];
    const monthlyCentralizationVouchers: Voucher[] = [];

    // Monthly payroll calculation helpers
    let voucherCounter = 1;

    // 0. Opening Voucher at 01/01/2025
    const openingVoucher: Voucher = {
      id: 'vouch-2025-001',
      voucherNumber: voucherCounter++,
      companyId: DEMO_COMPANY_ID,
      period: '2025-01',
      date: '2025-01-01',
      type: 'Traspaso',
      status: 'Valido',
      gloss: 'Comprobante de Apertura Inicial Ejercicio 2025 - FERRETERIA DON ALI KT LTDA',
      origin: 'MANUAL',
      totalDebit: 120000000,
      totalCredit: 120000000,
      lines: [
        { id: 'line-op-1', accountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002', accountCode: '1.1.01.002', accountName: 'Banco Santander Cta Cte 88921-0', debit: 45000000, credit: 0, gloss: 'Saldo Inicial Cta Cte Santander' },
        { id: 'line-op-2', accountId: accountMap.get('1.1.01.001') || 'acc-1_1_01_001', accountCode: '1.1.01.001', accountName: 'Caja Central Ferretería', debit: 3000000, credit: 0, gloss: 'Fondo Fijo Caja Mostrador' },
        { id: 'line-op-3', accountId: accountMap.get('1.1.03.001') || 'acc-1_1_03_001', accountCode: '1.1.03.001', accountName: 'Mercaderías y Materiales de Construcción', debit: 42000000, credit: 0, gloss: 'Inventario Inicial de Ferretería' },
        { id: 'line-op-4', accountId: accountMap.get('1.2.01.002') || 'acc-1_2_01_002', accountCode: '1.2.01.002', accountName: 'Camiones y Flota de Reparto', debit: 3000000, credit: 0, gloss: 'Flota 2 Camiones Hyundai HD78' },
        { id: 'line-op-5', accountId: accountMap.get('3.1.01.001') || 'acc-3_1_01_001', accountCode: '3.1.01.001', accountName: 'Capital Social Pagado', debit: 0, credit: 120000000, gloss: 'Aporte de Capital de Socios' }
      ],
      createdAt: '2025-01-01T08:00:00Z'
    };
    await setDoc(doc(compDocRef, 'vouchers', openingVoucher.id), openingVoucher);

    // Monthly Remunerations loop
    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const monthStr = String(mIdx + 1).padStart(2, '0');
      const periodStr = `2025-${monthStr}`;
      const lastDay = new Date(2025, mIdx + 1, 0).getDate();
      const payrollDate = `2025-${monthStr}-${lastDay}`;

      let monthTotalSueldoBase = 0;
      let monthTotalGratificacion = 0;
      let monthTotalImponible = 0;
      let monthTotalPrevisional = 0;
      let monthTotalImpuestoUnico = 0;
      let monthTotalLiquido = 0;
      let monthTotalAportePatronal = 0;

      for (const emp of employeesList) {
        const gratifLegal = Math.round(Math.min(emp.baseSalary * 0.25, 204167)); // Tope legal gratificación
        const totImponible = emp.baseSalary + gratifLegal;
        const colacMovil = 95000;
        const totHaberes = totImponible + colacMovil;

        // AFP & Salud & AFC
        const afpRate = emp.pensionSystem === 'CUPRUM' ? 0.1144 : emp.pensionSystem === 'HABITAT' ? 0.1127 : emp.pensionSystem === 'PROVIDA' ? 0.1145 : 0.1058;
        const afpDesc = Math.round(totImponible * afpRate);
        const saludDesc = emp.healthSystem === 'COLMENA' ? 185000 : Math.round(totImponible * 0.07);
        const afcDesc = Math.round(totImponible * 0.006);
        const totLeyesSociales = afpDesc + saludDesc + afcDesc;

        // Base tributable (Renta afecta a IUSC)
        const rentaAfecta = Math.max(0, totImponible - totLeyesSociales);

        // Impuesto Único de Segunda Categoría (Art. 43 Nº 1 LIR)
        let iusc = 0;
        if (rentaAfecta > 3100000) {
          iusc = Math.round((rentaAfecta * 0.135) - 235000); // Tramo 3
        } else if (rentaAfecta > 1950000) {
          iusc = Math.round((rentaAfecta * 0.08) - 98000); // Tramo 2
        } else if (rentaAfecta > 1350000) {
          iusc = Math.round((rentaAfecta * 0.04) - 45000); // Tramo 1
        }

        const totDescuentos = totLeyesSociales + iusc;
        const sueldoLiquido = totHaberes - totDescuentos;
        const sisPatronal = Math.round(totImponible * 0.0149);
        const cesantiaPatronal = Math.round(totImponible * 0.024);
        const mutualPatronal = Math.round(totImponible * 0.0093);
        const aportePatronal = sisPatronal + cesantiaPatronal + mutualPatronal;

        monthTotalSueldoBase += emp.baseSalary;
        monthTotalGratificacion += gratifLegal;
        monthTotalImponible += totImponible;
        monthTotalPrevisional += (totLeyesSociales + aportePatronal);
        monthTotalImpuestoUnico += iusc;
        monthTotalLiquido += sueldoLiquido;
        monthTotalAportePatronal += aportePatronal;

        const slip: PayrollSlip = {
          id: `slip-${emp.id}-${periodStr}`,
          companyId: DEMO_COMPANY_ID,
          period: periodStr,
          year: 2025,
          month: mIdx + 1,
          employeeId: emp.id,
          employeeRut: emp.rut,
          employeeName: emp.name,
          employeePosition: emp.position,
          contractType: 'INDEFINIDO',
          ufValue: 38500,
          utmValue: 66000,
          immValue: 500000,
          diasTrabajados: 30,
          sueldoBasePactado: emp.baseSalary,
          sueldoBaseProporcional: emp.baseSalary,
          horasExtras50Qty: 0,
          montoHorasExtras50: 0,
          gratificacionLegal: gratifLegal,
          bonosImponibles: 0,
          comisionesVentas: 0,
          otrosImponibles: 0,
          totalHaberesImponibles: totImponible,
          asignacionColacion: 50000,
          asignacionMovilizacion: 45000,
          asignacionFamiliar: 0,
          viaticos: 0,
          otrosNoImponibles: 0,
          totalHaberesNoImponibles: colacMovil,
          totalHaberes: totHaberes,
          pensionSystem: emp.pensionSystem,
          afpTasa: afpRate,
          baseImponibleAfp: totImponible,
          afpMonto: afpDesc,
          healthSystem: emp.healthSystem,
          healthPlanType: emp.healthPlanType,
          saludLegal7: Math.round(totImponible * 0.07),
          saludAdicionalIsapre: emp.healthSystem === 'COLMENA' ? Math.max(0, 185000 - Math.round(totImponible * 0.07)) : 0,
          saludMontoTotal: saludDesc,
          afcTrabajadorTasa: 0.006,
          baseImponibleAfc: totImponible,
          afcTrabajadorMonto: afcDesc,
          apvMonto: 0,
          totalDescuentosPrevisionales: totLeyesSociales,
          rentaAfectaImpuesto: rentaAfecta,
          impuestoUnicoSegundaCategoria: iusc,
          anticipos: 0,
          prestamosEmpresa: 0,
          otrosDescuentos: 0,
          totalOtrosDescuentos: 0,
          totalDescuentos: totDescuentos,
          alcanceLiquido: sueldoLiquido,
          liquidoAPagar: sueldoLiquido,
          sisMonto: sisPatronal,
          afcEmpleadorTasa: 0.024,
          afcEmpleadorMonto: cesantiaPatronal,
          mutualMonto: mutualPatronal,
          totalAportesPatronales: aportePatronal,
          costoTotalEmpresa: totHaberes + aportePatronal,
          estado: 'CENTRALIZADA',
          createdAt: `${payrollDate}T12:00:00Z`,
          updatedAt: `${payrollDate}T12:00:00Z`
        };
        payrollSlipsList.push(slip);
      }

      // Centralization Voucher for this month
      const centVoucher: Voucher = {
        id: `vouch-remun-${periodStr}`,
        voucherNumber: voucherCounter++,
        companyId: DEMO_COMPANY_ID,
        period: periodStr,
        date: payrollDate,
        type: 'Traspaso',
        status: 'Valido',
        gloss: `Centralización de Remuneraciones Mes de ${periodStr} (10 Trabajadores)`,
        origin: 'REMUNERACIONES',
        totalDebit: monthTotalSueldoBase + monthTotalGratificacion + monthTotalAportePatronal + (employeesList.length * 95000),
        totalCredit: monthTotalSueldoBase + monthTotalGratificacion + monthTotalAportePatronal + (employeesList.length * 95000),
        lines: [
          { id: `line-rem-1-${periodStr}`, accountId: accountMap.get('5.2.01.001') || 'acc-5_2_01_001', accountCode: '5.2.01.001', accountName: 'Sueldos Base y Remuneraciones', debit: monthTotalSueldoBase, credit: 0, gloss: `Sueldos Base ${periodStr}`, costCenter: 'CC-01' },
          { id: `line-rem-2-${periodStr}`, accountId: accountMap.get('5.2.01.002') || 'acc-5_2_01_002', accountCode: '5.2.01.002', accountName: 'Gratificaciones Legales', debit: monthTotalGratificacion, credit: 0, gloss: `Gratificación Legal Art. 50 ${periodStr}`, costCenter: 'CC-01' },
          { id: `line-rem-3-${periodStr}`, accountId: accountMap.get('5.2.01.003') || 'acc-5_2_01_003', accountCode: '5.2.01.003', accountName: 'Leyes Sociales Patronales (SIS / Cesantía Empleador)', debit: monthTotalAportePatronal, credit: 0, gloss: `SIS y AFC Aporte Patronal ${periodStr}`, costCenter: 'CC-01' },
          { id: `line-rem-4-${periodStr}`, accountId: accountMap.get('5.2.02.006') || 'acc-5_2_02_006', accountCode: '5.2.02.006', accountName: 'Seguros Contra Incendio y Suministros Menores', debit: employeesList.length * 95000, credit: 0, gloss: `Asig. Colación y Movilización ${periodStr}`, costCenter: 'CC-01' },
          { id: `line-rem-5-${periodStr}`, accountId: accountMap.get('2.1.04.002') || 'acc-2_1_04_002', accountCode: '2.1.04.002', accountName: 'Sueldos Líquidos por Pagar', debit: 0, credit: monthTotalLiquido, gloss: `Sueldos Líquidos por Pagar ${periodStr}` },
          { id: `line-rem-6-${periodStr}`, accountId: accountMap.get('2.1.04.001') || 'acc-2_1_04_001', accountCode: '2.1.04.001', accountName: 'Leyes Sociales e Imposiciones por Pagar (Previred)', debit: 0, credit: monthTotalPrevisional, gloss: `Previsión y Salud Previred por Pagar ${periodStr}` },
          { id: `line-rem-7-${periodStr}`, accountId: accountMap.get('2.1.03.001') || 'acc-2_1_03_001', accountCode: '2.1.03.001', accountName: 'Retención Impuesto Único 2da Categoría', debit: 0, credit: monthTotalImpuestoUnico, gloss: `IUSC Retenido F29 ${periodStr}` }
        ],
        createdAt: `${payrollDate}T18:00:00Z`
      };
      monthlyCentralizationVouchers.push(centVoucher);
    }

    // Batch write Payroll Slips
    let slipBatch = writeBatch(db);
    let sCount = 0;
    for (const sl of payrollSlipsList) {
      slipBatch.set(doc(compDocRef, 'payrollSlips', sl.id), sl);
      sCount++;
      if (sCount >= 350) {
        await slipBatch.commit();
        slipBatch = writeBatch(db);
        sCount = 0;
      }
    }
    if (sCount > 0) await slipBatch.commit();

    onProgress?.('Generando Transacciones Diarias (Compras, Ventas, Honorarios, Pagos)...', 55);

    // 8. Generate Daily Transactions across 2025
    // 10 transactions daily covering purchases, sales, supplier payments, client collections, utility payments
    const rcvDocsList: RCVDocument[] = [];
    const allVouchersList: Voucher[] = [...monthlyCentralizationVouchers];
    const paymentBatchesList: PaymentBatch[] = [];
    const collectionRecordsList: CollectionRecord[] = [];
    const commercialDocsList: CommercialDocument[] = [];
    const bankStatementsByMonth: { [period: string]: BankStatementLine[] } = {};

    months2025.forEach(p => {
      bankStatementsByMonth[p] = [];
    });

    let rcvFolioCompra = 1001;
    let rcvFolioVenta = 5001;
    let rcvFolioHonorario = 201;
    let ocNumber = 101;
    let ovNumber = 301;
    let batchNumber = 1;
    let recNumber = 1;

    // Supplier catalog for rotation
    const suppliers = [
      { aux: auxiliariesList[0], desc: 'Cemento Melón Especial 25kg Pallet', net: 1890000, iva: 359100, tot: 2249100, prodCode: 'FERR-001', cc: 'CC-03', ig: 'IG-05' },
      { aux: auxiliariesList[1], desc: 'Fierro Estriado 10mm x 6m Gerdau Atados', net: 2400000, iva: 456000, tot: 2856000, prodCode: 'FERR-002', cc: 'CC-03', ig: 'IG-05' },
      { aux: auxiliariesList[2], desc: 'Taladros Percutores y Esmeriles Bosch', net: 1467000, iva: 278730, tot: 1745730, prodCode: 'FERR-003', cc: 'CC-02', ig: 'IG-05' },
      { aux: auxiliariesList[3], desc: 'Pinturas Esmalte al Agua y Brochas Sipa', net: 1110000, iva: 210900, tot: 1320900, prodCode: 'FERR-004', cc: 'CC-02', ig: 'IG-05' },
      { aux: auxiliariesList[4], desc: 'Sets Herramientas y Discos Corte Stanley', net: 1950000, iva: 370500, tot: 2320500, prodCode: 'FERR-006', cc: 'CC-02', ig: 'IG-05' }
    ];

    // Customer catalog for rotation
    const customers = [
      { aux: auxiliariesList[10], name: 'CONSTRUCTORA LOS ANDES SPA', rut: '76.543.999-1', avgNet: 4500000, cc: 'CC-04', pry: 'PRY-2025-02' },
      { aux: auxiliariesList[11], name: 'INGENIERÍA Y CONSTRUCCIÓN DEL MAIPO LTDA', rut: '77.890.321-4', avgNet: 3200000, cc: 'CC-04', pry: 'PRY-2025-02' },
      { aux: auxiliariesList[12], name: 'SERVICIOS INTEGRALES Y REFORMAS EL ROBLE SPA', rut: '76.111.222-3', avgNet: 1850000, cc: 'CC-02', pry: 'PRY-2025-01' },
      { aux: auxiliariesList[13], name: 'CLIENTES MOSTRADOR Y VENTAS DIARIAS BOLETA', rut: '66.666.666-6', avgNet: 950000, cc: 'CC-02', pry: 'PRY-2025-03' }
    ];

    let runningBankBalance = 45000000; // Starting from opening cash balance

    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const monthStr = String(mIdx + 1).padStart(2, '0');
      const periodStr = `2025-${monthStr}`;
      const daysInMonth = new Date(2025, mIdx + 1, 0).getDate();

      // Monthly fixed expenses: Rent (Arriendo), Electricity (Luz), Water (Agua), Legal Honorarios
      const rentDate = `2025-${monthStr}-05`;
      const rentDoc: RCVDocument = {
        id: `rcv-rent-${periodStr}`,
        tipoRegistro: 'Compra',
        tipoDoc: '33', // Factura Electrónica Afecta
        nombreTipoDoc: 'Factura Electrónica',
        folio: String(500 + mIdx),
        rutEmisor: '76.432.109-8',
        razonSocialEmisor: 'INMOBILIARIA Y RENTAS LOS CONQUISTADORES SPA',
        rutReceptor: DEMO_COMPANY_RUT,
        razonSocialReceptor: DEMO_COMPANY_NAME,
        fechaEmision: rentDate,
        period: periodStr,
        montoExento: 0,
        montoNeto: 2500000,
        montoIva: 475000,
        montoTotal: 2975000,
        estadoContabilizado: true
      };
      rcvDocsList.push(rentDoc);

      // Rent payment voucher & bank statement line
      const rentVoucher: Voucher = {
        id: `vouch-rent-${periodStr}`,
        voucherNumber: voucherCounter++,
        companyId: DEMO_COMPANY_ID,
        period: periodStr,
        date: rentDate,
        type: 'Egreso',
        status: 'Valido',
        gloss: `Pago Arriendo Local Comercial y Bodega Mes ${periodStr}`,
        origin: 'BANCO',
        totalDebit: 2975000,
        totalCredit: 2975000,
        lines: [
          { id: `line-rent-1-${periodStr}`, accountId: accountMap.get('5.2.02.001') || 'acc-5_2_02_001', accountCode: '5.2.02.001', accountName: 'Arriendo Local Comercial y Bodegas', debit: 2500000, credit: 0, gloss: `Gasto Arriendo ${periodStr}`, costCenter: 'CC-01', expenseItem: 'IG-01', auxiliaryRut: '76.432.109-8' },
          { id: `line-rent-2-${periodStr}`, accountId: accountMap.get('1.1.04.001') || 'acc-1_1_04_001', accountCode: '1.1.04.001', accountName: 'IVA Crédito Fiscal', debit: 475000, credit: 0, gloss: `IVA CF Fac ${rentDoc.folio}` },
          { id: `line-rent-3-${periodStr}`, accountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002', accountCode: '1.1.01.002', accountName: 'Banco Santander Cta Cte 88921-0', debit: 0, credit: 2975000, gloss: 'Transferencia Bancaria Inmobiliaria' }
        ],
        createdAt: `${rentDate}T09:30:00Z`
      };
      allVouchersList.push(rentVoucher);

      runningBankBalance -= 2975000;
      bankStatementsByMonth[periodStr].push({
        id: `bank-line-rent-${periodStr}`,
        date: rentDate,
        description: `TRF INMOBILIARIA LOS CONQUISTADORES ARRIENDO ${periodStr}`,
        documentNumber: `TRF-${500 + mIdx}`,
        charge: 2975000,
        deposit: 0,
        balance: runningBankBalance,
        matchedVoucherId: rentVoucher.id,
        matchedVoucherNumber: rentVoucher.voucherNumber,
        matchedVoucherPeriod: periodStr,
        matchedStatus: 'Conciliado'
      });

      // Basic utilities (Enel + Aguas)
      const utilDate = `2025-${monthStr}-10`;
      const enelDoc: RCVDocument = {
        id: `rcv-enel-${periodStr}`,
        tipoRegistro: 'Compra',
        tipoDoc: '33',
        nombreTipoDoc: 'Factura Electrónica',
        folio: String(1200 + mIdx),
        rutEmisor: '96.800.570-7',
        razonSocialEmisor: 'ENEL DISTRIBUCIÓN CHILE S.A.',
        rutReceptor: DEMO_COMPANY_RUT,
        razonSocialReceptor: DEMO_COMPANY_NAME,
        fechaEmision: utilDate,
        period: periodStr,
        montoExento: 0,
        montoNeto: 480000,
        montoIva: 91200,
        montoTotal: 571200,
        estadoContabilizado: true
      };
      rcvDocsList.push(enelDoc);

      const utilVoucher: Voucher = {
        id: `vouch-enel-${periodStr}`,
        voucherNumber: voucherCounter++,
        companyId: DEMO_COMPANY_ID,
        period: periodStr,
        date: utilDate,
        type: 'Egreso',
        status: 'Valido',
        gloss: `Pago Suministro Eléctrico Trifásico Local y Bodega Mes ${periodStr}`,
        origin: 'BANCO',
        totalDebit: 571200,
        totalCredit: 571200,
        lines: [
          { id: `line-util-1-${periodStr}`, accountId: accountMap.get('5.2.02.002') || 'acc-5_2_02_002', accountCode: '5.2.02.002', accountName: 'Servicios Básicos (Luz Trifásica, Agua, Internet)', debit: 480000, credit: 0, gloss: `Electricidad Enel ${periodStr}`, costCenter: 'CC-03', expenseItem: 'IG-02', auxiliaryRut: '96.800.570-7' },
          { id: `line-util-2-${periodStr}`, accountId: accountMap.get('1.1.04.001') || 'acc-1_1_04_001', accountCode: '1.1.04.001', accountName: 'IVA Crédito Fiscal', debit: 91200, credit: 0, gloss: `IVA CF Fac ${enelDoc.folio}` },
          { id: `line-util-3-${periodStr}`, accountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002', accountCode: '1.1.01.002', accountName: 'Banco Santander Cta Cte 88921-0', debit: 0, credit: 571200, gloss: 'Pago PAC Enel Santander' }
        ],
        createdAt: `${utilDate}T10:15:00Z`
      };
      allVouchersList.push(utilVoucher);

      runningBankBalance -= 571200;
      bankStatementsByMonth[periodStr].push({
        id: `bank-line-enel-${periodStr}`,
        date: utilDate,
        description: `PAC ENEL DISTRIBUCION SUMINISTRO ${periodStr}`,
        documentNumber: `PAC-${enelDoc.folio}`,
        charge: 571200,
        deposit: 0,
        balance: runningBankBalance,
        matchedVoucherId: utilVoucher.id,
        matchedVoucherNumber: utilVoucher.voucherNumber,
        matchedVoucherPeriod: periodStr,
        matchedStatus: 'Conciliado'
      });

      // Boleta de Honorarios mensual (Asesoría Contable / Legal)
      const honDate = `2025-${monthStr}-28`;
      const honBruto = 850000;
      const honRet = Math.round(honBruto * 0.1375); // 13.75%
      const honLiq = honBruto - honRet;

      const honDoc: RCVDocument = {
        id: `rcv-hon-${periodStr}`,
        tipoRegistro: 'Honorarios',
        tipoDoc: 'BHE', // Boleta de Honorarios
        nombreTipoDoc: 'Boleta de Honorarios',
        folio: String(rcvFolioHonorario++),
        rutEmisor: '13.987.654-3',
        razonSocialEmisor: 'FELIPE ANDRÉS MATUS ASESORES LEGALES',
        rutReceptor: DEMO_COMPANY_RUT,
        razonSocialReceptor: DEMO_COMPANY_NAME,
        fechaEmision: honDate,
        period: periodStr,
        montoExento: honBruto,
        montoNeto: 0,
        montoIva: 0,
        montoTotal: honBruto,
        montoRetencion: honRet,
        montoLiquido: honLiq,
        estadoContabilizado: true
      };
      rcvDocsList.push(honDoc);

      const honVoucher: Voucher = {
        id: `vouch-hon-${periodStr}`,
        voucherNumber: voucherCounter++,
        companyId: DEMO_COMPANY_ID,
        period: periodStr,
        date: honDate,
        type: 'Egreso',
        status: 'Valido',
        gloss: `Pago Honorarios Asesoría Legal y Tributaria ${periodStr}`,
        origin: 'HONORARIOS',
        totalDebit: honBruto,
        totalCredit: honBruto,
        lines: [
          { id: `line-hon-1-${periodStr}`, accountId: accountMap.get('5.2.02.005') || 'acc-5_2_02_005', accountCode: '5.2.02.005', accountName: 'Honorarios Profesionales Contables e Informáticos', debit: honBruto, credit: 0, gloss: `Honorarios Legal BHE ${honDoc.folio}`, costCenter: 'CC-01', expenseItem: 'IG-06', auxiliaryRut: '13.987.654-3' },
          { id: `line-hon-2-${periodStr}`, accountId: accountMap.get('2.1.03.002') || 'acc-2_1_03_002', accountCode: '2.1.03.002', accountName: 'Retención Boletas de Honorarios 13.75%', debit: 0, credit: honRet, gloss: `Retención 13.75% F29 ${periodStr}` },
          { id: `line-hon-3-${periodStr}`, accountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002', accountCode: '1.1.01.002', accountName: 'Banco Santander Cta Cte 88921-0', debit: 0, credit: honLiq, gloss: `TRF Líquido Honorarios BHE ${honDoc.folio}` }
        ],
        createdAt: `${honDate}T12:00:00Z`
      };
      allVouchersList.push(honVoucher);

      runningBankBalance -= honLiq;
      bankStatementsByMonth[periodStr].push({
        id: `bank-line-hon-${periodStr}`,
        date: honDate,
        description: `TRF HONORARIOS FELIPE MATUS BHE ${honDoc.folio}`,
        documentNumber: `BHE-${honDoc.folio}`,
        charge: honLiq,
        deposit: 0,
        balance: runningBankBalance,
        matchedVoucherId: honVoucher.id,
        matchedVoucherNumber: honVoucher.voucherNumber,
        matchedVoucherPeriod: periodStr,
        matchedStatus: 'Conciliado'
      });

      // Daily transactions distribution throughout the month
      // Generating ~10 operational movements every 2-3 days for solid demo density
      for (let day = 2; day <= Math.min(28, daysInMonth); day += 2) {
        const dayStr = String(day).padStart(2, '0');
        const txDate = `2025-${monthStr}-${dayStr}`;

        // 1. Purchase (Compra Proveedor)
        const supp = suppliers[(day + mIdx) % suppliers.length];
        const pFolio = rcvFolioCompra++;
        const pNet = supp.net + ((day * 25000) % 300000);
        const pIva = Math.round(pNet * 0.19);
        const pTot = pNet + pIva;

        const compDoc: RCVDocument = {
          id: `rcv-comp-${pFolio}`,
          tipoRegistro: 'Compra',
          tipoDoc: '33',
          nombreTipoDoc: 'Factura Electrónica',
          folio: String(pFolio),
          rutEmisor: supp.aux.rut,
          razonSocialEmisor: supp.aux.name,
          rutReceptor: DEMO_COMPANY_RUT,
          razonSocialReceptor: DEMO_COMPANY_NAME,
          fechaEmision: txDate,
          period: periodStr,
          montoExento: 0,
          montoNeto: pNet,
          montoIva: pIva,
          montoTotal: pTot,
          estadoContabilizado: true
        };
        rcvDocsList.push(compDoc);

        // Commercial Purchase Order
        commercialDocsList.push({
          id: `oc-${ocNumber}`,
          companyId: DEMO_COMPANY_ID,
          operationType: 'COMPRA',
          documentType: 'ORDEN_COMPRA',
          folio: `OC-2025-${ocNumber++}`,
          date: txDate,
          period: periodStr,
          rutContraparte: supp.aux.rut,
          razonSocialContraparte: supp.aux.name,
          warehouseId: 'wh-matriz',
          subtotalNeto: pNet,
          ivaAmount: pIva,
          totalAmount: pTot,
          status: 'Contabilizada',
          stockUpdated: true,
          items: [{
            id: `item-oc-${pFolio}`,
            productId: 'prod-01',
            productCode: supp.prodCode,
            productName: supp.desc,
            type: 'PRODUCT',
            quantity: 50,
            unitOfMeasure: 'UNIDAD',
            unitPriceNeto: Math.round(pNet / 50),
            unitCostNeto: Math.round(pNet / 50),
            subtotalNeto: pNet,
            ivaAmount: pIva,
            total: pTot
          }],
          createdAt: `${txDate}T08:00:00Z`
        });

        // 2. Sale (Venta a Constructora / Cliente)
        const cust = customers[(day + mIdx) % customers.length];
        const vFolio = rcvFolioVenta++;
        const isBoleta = cust.rut === '66.666.666-6';
        const vNet = cust.avgNet + ((day * 40000) % 600000);
        const vIva = Math.round(vNet * 0.19);
        const vTot = vNet + vIva;

        const vtaDoc: RCVDocument = {
          id: `rcv-vta-${vFolio}`,
          tipoRegistro: 'Venta',
          tipoDoc: isBoleta ? '39' : '33',
          nombreTipoDoc: isBoleta ? 'Boleta Electrónica' : 'Factura Electrónica',
          folio: String(vFolio),
          rutEmisor: DEMO_COMPANY_RUT,
          razonSocialEmisor: DEMO_COMPANY_NAME,
          rutReceptor: cust.rut,
          razonSocialReceptor: cust.name,
          fechaEmision: txDate,
          period: periodStr,
          montoExento: 0,
          montoNeto: vNet,
          montoIva: vIva,
          montoTotal: vTot,
          estadoContabilizado: true
        };
        rcvDocsList.push(vtaDoc);

        // Commercial Sales Order
        commercialDocsList.push({
          id: `ov-${ovNumber}`,
          companyId: DEMO_COMPANY_ID,
          operationType: 'VENTA',
          documentType: 'FACTURA_VENTA',
          folio: `NV-2025-${ovNumber++}`,
          date: txDate,
          period: periodStr,
          rutContraparte: cust.rut,
          razonSocialContraparte: cust.name,
          warehouseId: 'wh-matriz',
          subtotalNeto: vNet,
          ivaAmount: vIva,
          totalAmount: vTot,
          status: 'Contabilizada',
          stockUpdated: true,
          items: [{
            id: `item-ov-${vFolio}`,
            productId: 'prod-02',
            productCode: 'FERR-002',
            productName: 'Suministro Ferretero y Materiales de Construcción',
            type: 'PRODUCT',
            quantity: 30,
            unitOfMeasure: 'UNIDAD',
            unitPriceNeto: Math.round(vNet / 30),
            unitCostNeto: Math.round((vNet * 0.7) / 30),
            subtotalNeto: vNet,
            ivaAmount: vIva,
            total: vTot
          }],
          createdAt: `${txDate}T09:00:00Z`
        });

        // 3. Purchase Accounting Voucher (Egreso / Proveedor)
        const pVoucher: Voucher = {
          id: `vouch-p-${pFolio}`,
          voucherNumber: voucherCounter++,
          companyId: DEMO_COMPANY_ID,
          period: periodStr,
          date: txDate,
          type: 'Egreso',
          status: 'Valido',
          gloss: `Pago Factura ${pFolio} - ${supp.aux.name} (${supp.desc})`,
          origin: 'RCV_COMPRAS',
          totalDebit: pTot,
          totalCredit: pTot,
          lines: [
            { id: `lp1-${pFolio}`, accountId: accountMap.get('1.1.03.001') || 'acc-1_1_03_001', accountCode: '1.1.03.001', accountName: 'Mercaderías y Materiales de Construcción', debit: pNet, credit: 0, gloss: `Compra ${supp.desc}`, costCenter: supp.cc, expenseItem: supp.ig, auxiliaryRut: supp.aux.rut },
            { id: `lp2-${pFolio}`, accountId: accountMap.get('1.1.04.001') || 'acc-1_1_04_001', accountCode: '1.1.04.001', accountName: 'IVA Crédito Fiscal', debit: pIva, credit: 0, gloss: `IVA CF Fac ${pFolio}` },
            { id: `lp3-${pFolio}`, accountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002', accountCode: '1.1.01.002', accountName: 'Banco Santander Cta Cte 88921-0', debit: 0, credit: pTot, gloss: `TRF Banco Santander Proveedor Fac ${pFolio}` }
          ],
          createdAt: `${txDate}T11:00:00Z`
        };
        allVouchersList.push(pVoucher);

        // Bank Statement Charge for Purchase
        runningBankBalance -= pTot;
        bankStatementsByMonth[periodStr].push({
          id: `bank-line-p-${pFolio}`,
          date: txDate,
          description: `TRF PROV ${supp.aux.name.substring(0, 22)} FAC ${pFolio}`,
          documentNumber: `FAC-${pFolio}`,
          charge: pTot,
          deposit: 0,
          balance: runningBankBalance,
          matchedVoucherId: pVoucher.id,
          matchedVoucherNumber: pVoucher.voucherNumber,
          matchedVoucherPeriod: periodStr,
          matchedStatus: 'Conciliado'
        });

        // 4. Sale Accounting Voucher (Ingreso / Recaudación)
        const vVoucher: Voucher = {
          id: `vouch-v-${vFolio}`,
          voucherNumber: voucherCounter++,
          companyId: DEMO_COMPANY_ID,
          period: periodStr,
          date: txDate,
          type: 'Ingreso',
          status: 'Valido',
          gloss: `Recaudación ${isBoleta ? 'Boleta' : 'Factura'} ${vFolio} - ${cust.name}`,
          origin: 'RCV_VENTAS',
          totalDebit: vTot,
          totalCredit: vTot,
          lines: [
            { id: `lv1-${vFolio}`, accountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002', accountCode: '1.1.01.002', accountName: 'Banco Santander Cta Cte 88921-0', debit: vTot, credit: 0, gloss: `Abono Transferencia Cliente Doc ${vFolio}` },
            { id: `lv2-${vFolio}`, accountId: accountMap.get('4.1.01.001') || 'acc-4_1_01_001', accountCode: '4.1.01.001', accountName: 'Ventas de Materiales y Ferretería Afectas', debit: 0, credit: vNet, gloss: `Venta Ferretería Doc ${vFolio}`, costCenter: cust.cc, project: cust.pry, auxiliaryRut: cust.rut },
            { id: `lv3-${vFolio}`, accountId: accountMap.get('2.1.02.001') || 'acc-2_1_02_001', accountCode: '2.1.02.001', accountName: 'IVA Débito Fiscal', debit: 0, credit: vIva, gloss: `IVA DF Doc ${vFolio}` }
          ],
          createdAt: `${txDate}T14:30:00Z`
        };
        allVouchersList.push(vVoucher);

        // Bank Statement Deposit for Sale
        runningBankBalance += vTot;
        bankStatementsByMonth[periodStr].push({
          id: `bank-line-v-${vFolio}`,
          date: txDate,
          description: `DEP TRF CLIENTE ${cust.name.substring(0, 20)} DOC ${vFolio}`,
          documentNumber: `DOC-${vFolio}`,
          charge: 0,
          deposit: vTot,
          balance: runningBankBalance,
          matchedVoucherId: vVoucher.id,
          matchedVoucherNumber: vVoucher.voucherNumber,
          matchedVoucherPeriod: periodStr,
          matchedStatus: 'Conciliado'
        });

        // 5. Payment Batch (Nómina de Pago a Proveedores quincenal/mensual)
        if (day === 14 || day === 28) {
          const bNum = batchNumber++;
          paymentBatchesList.push({
            id: `batch-${bNum}`,
            batchNumber: bNum,
            date: txDate,
            period: periodStr,
            bankAccountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002',
            bankAccountCode: '1.1.01.002',
            bankAccountName: 'Banco Santander Cta Cte 88921-0',
            totalAmount: pTot,
            itemsCount: 1,
            status: 'Procesado',
            gloss: `Nómina Electrónica Pago Proveedores Nº ${bNum} - Banco Santander`,
            voucherId: pVoucher.id,
            items: [{
              rcvDocId: compDoc.id,
              rut: supp.aux.rut,
              razonSocial: supp.aux.name,
              tipoDoc: '33',
              folio: String(pFolio),
              montoTotal: pTot,
              montoPagar: pTot,
              bancoDestino: 'Banco de Chile',
              tipoCuentaDestino: 'Corriente',
              numeroCuentaDestino: '00-12345-09',
              emailAviso: supp.aux.email
            }],
            createdAt: `${txDate}T15:00:00Z`
          });

          // Collection Record (Recaudación de Clientes)
          const rNum = recNumber++;
          collectionRecordsList.push({
            id: `rec-${rNum}`,
            recordNumber: rNum,
            date: txDate,
            period: periodStr,
            paymentMethod: 'Transferencia',
            depositAccountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002',
            depositAccountCode: '1.1.01.002',
            depositAccountName: 'Banco Santander Cta Cte 88921-0',
            totalAmount: vTot,
            gloss: `Recaudación y Depósito Electrónico Nº ${rNum} - ${cust.name}`,
            status: 'Valido',
            voucherId: vVoucher.id,
            items: [{
              rcvDocId: vtaDoc.id,
              rut: cust.rut,
              razonSocial: cust.name,
              tipoDoc: isBoleta ? '39' : '33',
              folio: String(vFolio),
              montoTotal: vTot,
              montoCobrado: vTot
            }],
            createdAt: `${txDate}T16:00:00Z`
          });
        }
      }

      // End of month: Payment of Previred and Net Salaries
      const lastDay = new Date(2025, mIdx + 1, 0).getDate();
      const paySalaryDate = `2025-${monthStr}-${lastDay}`;
      
      // Calculate month totals from slips
      const monthSlips = payrollSlipsList.filter(s => s.period === periodStr);
      const mSueldosLiq = monthSlips.reduce((sum, s) => sum + s.liquidoAPagar, 0);
      const mPrevired = monthSlips.reduce((sum, s) => sum + (s.totalDescuentosPrevisionales + s.sisMonto + s.afcEmpleadorMonto), 0);

      // Voucher payment salaries
      const salPayVoucher: Voucher = {
        id: `vouch-pay-sal-${periodStr}`,
        voucherNumber: voucherCounter++,
        companyId: DEMO_COMPANY_ID,
        period: periodStr,
        date: paySalaryDate,
        type: 'Egreso',
        status: 'Valido',
        gloss: `Pago Nómina de Sueldos Líquidos Personal Mes ${periodStr}`,
        origin: 'BANCO',
        totalDebit: mSueldosLiq,
        totalCredit: mSueldosLiq,
        lines: [
          { id: `lps1-${periodStr}`, accountId: accountMap.get('2.1.04.002') || 'acc-2_1_04_002', accountCode: '2.1.04.002', accountName: 'Sueldos Líquidos por Pagar', debit: mSueldosLiq, credit: 0, gloss: `Transferencias Sueldos ${periodStr}` },
          { id: `lps2-${periodStr}`, accountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002', accountCode: '1.1.01.002', accountName: 'Banco Santander Cta Cte 88921-0', debit: 0, credit: mSueldosLiq, gloss: `Nómina Pago Sueldos Santander ${periodStr}` }
        ],
        createdAt: `${paySalaryDate}T17:00:00Z`
      };
      allVouchersList.push(salPayVoucher);

      runningBankBalance -= mSueldosLiq;
      bankStatementsByMonth[periodStr].push({
        id: `bank-line-sal-${periodStr}`,
        date: paySalaryDate,
        description: `NOMINA PAGO SUELDOS 10 TRABAJADORES ${periodStr}`,
        documentNumber: `NOM-${periodStr}`,
        charge: mSueldosLiq,
        deposit: 0,
        balance: runningBankBalance,
        matchedVoucherId: salPayVoucher.id,
        matchedVoucherNumber: salPayVoucher.voucherNumber,
        matchedVoucherPeriod: periodStr,
        matchedStatus: 'Conciliado'
      });
    }

    // Batch write RCV documents
    onProgress?.('Guardando Registros de Compras y Ventas (RCV)...', 70);
    let rcvBatch = writeBatch(db);
    let rCount = 0;
    for (const rcv of rcvDocsList) {
      rcvBatch.set(doc(compDocRef, 'rcvDocuments', rcv.id), rcv);
      rCount++;
      if (rCount >= 350) {
        await rcvBatch.commit();
        rcvBatch = writeBatch(db);
        rCount = 0;
      }
    }
    if (rCount > 0) await rcvBatch.commit();

    // Batch write Vouchers
    onProgress?.('Guardando Comprobantes Contables Cuadrados...', 80);
    let vBatch = writeBatch(db);
    let vCount = 0;
    for (const v of allVouchersList) {
      vBatch.set(doc(compDocRef, 'vouchers', v.id), v);
      vCount++;
      if (vCount >= 350) {
        await vBatch.commit();
        vBatch = writeBatch(db);
        vCount = 0;
      }
    }
    if (vCount > 0) await vBatch.commit();

    // Batch write Commercial Documents, Payment Batches and Collections
    for (const pb of paymentBatchesList) {
      await setDoc(doc(compDocRef, 'paymentBatches', pb.id), pb);
    }
    for (const cr of collectionRecordsList) {
      await setDoc(doc(compDocRef, 'collectionRecords', cr.id), cr);
    }
    for (const cd of commercialDocsList) {
      await setDoc(doc(compDocRef, 'commercialDocuments', cd.id), cd);
    }

    onProgress?.('Generando Cartolas Bancarias Conciliadas 2025...', 88);

    // 9. Generate 12 Bank Reconciliations (Cartolas Cuadradas)
    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const monthStr = String(mIdx + 1).padStart(2, '0');
      const periodStr = `2025-${monthStr}`;
      const lines = bankStatementsByMonth[periodStr] || [];
      const lastDay = new Date(2025, mIdx + 1, 0).getDate();

      const initialBal = lines.length > 0 ? lines[0].balance + (lines[0].charge || 0) - (lines[0].deposit || 0) : 45000000;
      const finalBal = lines.length > 0 ? lines[lines.length - 1].balance : initialBal;

      const bankRec: BankReconciliation = {
        id: `rec-santander-${periodStr}`,
        period: periodStr,
        bankAccountId: accountMap.get('1.1.01.002') || 'acc-1_1_01_002',
        bankAccountCode: '1.1.01.002',
        bankAccountName: 'Banco Santander Cta Cte 88921-0',
        statementDate: `2025-${monthStr}-${lastDay}`,
        bankInitialBalance: initialBal,
        bankFinalBalance: finalBal,
        bookFinalBalance: finalBal,
        unmatchedCharges: 0,
        unmatchedDeposits: 0,
        outstandingChecks: 0,
        depositsInTransit: 0,
        reconciledBalance: finalBal,
        difference: 0,
        status: 'Cuadrado',
        notes: `Cartola Mensual Banco Santander ${periodStr} - 100% Conciliada con Comprobantes Contables`,
        lines: lines,
        updatedAt: `2025-${monthStr}-${lastDay}T20:00:00Z`
      };

      await setDoc(doc(compDocRef, 'bankReconciliations', bankRec.id), bankRec);
    }

    onProgress?.('Generando Formularios 29 (F29 IVA) y DDJJ de Renta...', 95);

    // 10. Generate 12 F29 Declarations (Pagados)
    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const monthStr = String(mIdx + 1).padStart(2, '0');
      const periodStr = `2025-${monthStr}`;
      
      const periodVouchers = allVouchersList.filter(v => v.period === periodStr);
      const periodSlips = payrollSlipsList.filter(s => s.period === periodStr);

      const debitoFiscal = periodVouchers.reduce((sum, v) => {
        const dfLine = v.lines.find(l => l.accountCode === '2.1.02.001');
        return sum + (dfLine ? dfLine.credit : 0);
      }, 0);

      const creditoFiscal = periodVouchers.reduce((sum, v) => {
        const cfLine = v.lines.find(l => l.accountCode === '1.1.04.001');
        return sum + (cfLine ? cfLine.debit : 0);
      }, 0);

      const retIUSC = periodSlips.reduce((sum, s) => sum + s.impuestoUnicoSegundaCategoria, 0);
      const retHon = 116875; // 850.000 * 13.75%
      const ppmAmount = Math.round(debitoFiscal * 0.015); // PPM 1.5%

      const ivaDeterminado = Math.max(0, debitoFiscal - creditoFiscal);
      const totalPagar = ivaDeterminado + retIUSC + retHon + ppmAmount;

      const f29: F29Declaration = {
        id: `f29-${periodStr}`,
        period: periodStr,
        status: 'Pagado',
        paymentDate: `2025-${monthStr}-20`,
        declarationDate: `2025-${monthStr}-15`,
        folioSII: `SII-F29-2025-${monthStr}-8821`,
        settings: {
          regimenTributario: '14_D3_PROPYME_GENERAL',
          ppmRate: 1.5,
          previousMonthRemanenteUTM: 0,
          utmValue: 66000,
          honorariosTaxRate: 13.75,
          impuestoUnicoSegundaCategoria: retIUSC,
          ivaUsoComunFactor: 1.0,
          retencionCambioSujeto: 0
        },
        debitoFiscal: {
          ventasAfectasNeto: Math.round(debitoFiscal / 0.19),
          debitoFacturasEmitidas: debitoFiscal,
          ventasBoletasNeto: 0,
          debitoBoletasEmitidas: 0,
          debitoNotasDebito: 0,
          creditoNotasCreditoEmitidas: 0,
          totalDebitoFiscal: debitoFiscal,
          ventasExentasTotal: 0,
          docsCount: 15
        },
        creditoFiscal: {
          comprasGiroNeto: Math.round(creditoFiscal / 0.19),
          creditoFacturasRecibidas: creditoFiscal,
          comprasActivoFijoNeto: 0,
          creditoActivoFijo: 0,
          creditoNotasDebitoRecibidas: 0,
          debitoNotasCreditoRecibidas: 0,
          ivaNoRecuperable: 0,
          ivaUsoComunTotal: 0,
          ivaUsoComunRecuperable: 0,
          remanenteMesAnteriorUTM: 0,
          remanenteMesAnteriorPesos: 0,
          totalCreditoFiscal: creditoFiscal,
          docsCount: 16
        },
        retenciones: {
          baseHonorariosBruto: 850000,
          retencionHonorarios: retHon,
          retencionTerceros: 0,
          impuestoUnicoTrabajadores: retIUSC,
          prestamoSolidario: 0,
          totalRetenciones: retIUSC + retHon,
          docsCount: 11
        },
        ppm: {
          baseImponibleVentas: Math.round(debitoFiscal / 0.19),
          tasaPPM: 1.5,
          montoPPM: ppmAmount
        },
        resumen: {
          ivaPagar: ivaDeterminado,
          remanenteParaSiguienteMes: 0,
          remanenteParaSiguienteMesUTM: 0,
          retencionesPagar: retIUSC + retHon,
          ppmPagar: ppmAmount,
          otrosImpuestos: 0,
          totalPagarF29: totalPagar
        },
        createdAt: `2025-${monthStr}-15T10:00:00Z`,
        updatedAt: `2025-${monthStr}-20T11:00:00Z`
      };

      await setDoc(doc(compDocRef, 'f29Declarations', f29.id), f29);
    }

    // 11. Audit log
    try {
      logAuditEvent({
        userId: userId || 'demo_admin',
        userEmail: userEmail || 'demo@ferreteriadonali.cl',
        studyId,
        companyId: DEMO_COMPANY_ID,
        action: 'CREAR',
        module: 'DEMO_PURGE',
        details: `Carga completa e inicialización de sociedad demo FERRETERIA DON ALI KT LTDA con 10 transacciones diarias, 10 trabajadores, nóminas, cartolas 100% conciliadas, F29, DDJJ y RLI para el año 2025.`,
        metadata: {
          companyId: DEMO_COMPANY_ID,
          companyName: DEMO_COMPANY_NAME,
          year: 2025,
          vouchersCount: allVouchersList.length,
          rcvCount: rcvDocsList.length,
          slipsCount: payrollSlipsList.length,
          employeesCount: employeesList.length
        }
      });
    } catch (e) {
      console.warn("Could not log demo audit event:", e);
    }

    onProgress?.('¡Demostración de FERRETERIA DON ALI KT LTDA lista!', 100);

    return {
      success: true,
      companyId: DEMO_COMPANY_ID,
      message: `Sociedad FERRETERIA DON ALI KT LTDA generada exitosamente para el año 2025 con ${allVouchersList.length} comprobantes, ${rcvDocsList.length} documentos RCV, 10 trabajadores con liquidaciones mensuales, cartolas bancarias 100% conciliadas, F29 pagados y DDJJ preparadas.`
    };
  } catch (error: any) {
    console.error("Error generating demo company:", error);
    throw new Error(`Error al generar datos demo: ${error.message || error}`);
  }
}
