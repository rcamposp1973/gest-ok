export enum UserRole {
  SUPER_USER = 'SUPER_USER',
  STUDY_ADMIN = 'STUDY_ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
}

export interface Plan {
  id: string;
  name: string;
  maxCompanies: number;
  maxUsers: number;
}

export interface StudyAdmin {
  id?: string;
  name?: string;
  rut?: string;
  email: string;
  password?: string;
  phone?: string;
  estado: 'Vigente' | 'Sin Vigencia';
  createdAt?: string;
  isPrimary?: boolean;
}

export interface Study {
  id: string;
  name: string;
  planId: string;
  rut: string;
  address: string;
  phone: string;
  email: string; // Used as contact/general email
  giro: string;
  estado?: 'Vigente' | 'Sin Vigencia';
  adminEmail?: string; // Legacy / primary admin email
  adminPassword?: string;
  adminName?: string;
  adminRut?: string;
  adminPhone?: string;
  adminEstado?: 'Vigente' | 'Sin Vigencia';
  administrators?: StudyAdmin[];
  adminId?: string;
  createdAt?: string;
}

export interface User {
  id: string;
  email: string;
  password?: string;
  studyId: string;
  role: UserRole;
  name: string;
  rut?: string;
  phone?: string;
  estado?: 'Activo' | 'Inactivo' | 'Vigente' | 'Sin Vigencia';
}

export interface Company {
  id: string;
  studyId: string;
  name: string; // Razón Social
  fantasyName?: string; // Nombre Fantasía
  rut: string; // RUT
  giro?: string; // Giro / Actividad Económica
  address?: string; // Dirección Tributaria
  comuna?: string; // Comuna
  email?: string; // Email de la Empresa
  phone?: string; // Teléfono
  legalRepName?: string; // Rep. Legal Nombre
  legalRepRut?: string; // Rep. Legal RUT
  legalRepEmail?: string; // Rep. Legal Email
  contactName?: string; // Contacto Operativo Nombre
  contactPhone?: string; // Contacto Operativo Teléfono
  estado?: 'Activo' | 'Inactivo';
}

export interface Assignment {
  id: string;
  studyId: string;
  userId: string;
  companyId: string;
}

export interface ChartOfAccount {
  id: string;
  code: string; // Código ej: 1.1.01.001
  name: string; // Nombre de la cuenta
  type: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto';
  parentCode?: string; // Para estructura arborescente
  requiereCentroCosto: boolean;
  requiereAuxiliarRUT: boolean;
  requiereConciliacionBancaria: boolean;
  requiereDocumento: boolean;
  bankInstitution?: string; // Banco (ej. Banco de Chile, Santander, BCI, etc.)
  bankAccountNumber?: string; // N° Cuenta Corriente / Vista
  // Atributos dinámicos / escalables adicionales (clave-valor o tags)
  customAttributes?: { [key: string]: any };
  estado: 'Activo' | 'Inactivo';
}

export interface ManualCashProjection {
  id: string;
  type: 'Ingreso' | 'Egreso';
  concept: string;
  amount: number;
  date: string; // YYYY-MM-DD
  recurrence: 'Unica' | 'Mensual' | 'Anual';
  year: number; // Multi-exercise support
  status: 'Activo' | 'Inactivo';
  createdAt: string;
  updatedAt?: string;
  auditTrail?: {
    date: string;
    action: 'Creado' | 'Modificado';
    details: string;
    user?: string;
  }[];
}

export interface Auxiliary {
  id: string;
  rut: string;
  name: string; // Razón Social / Nombre
  role: 'Deudor' | 'Acreedor' | 'Ambos';
  defaultDebtorAccountIds?: string[]; // Legacy / multi
  defaultCreditorAccountIds?: string[]; // Legacy / multi
  defaultDebtorAccountId?: string; // Cuenta Contable de Deudor / Cliente (ej. Clientes por Cobrar)
  defaultCreditorAccountId?: string; // Cuenta Contable de Acreedor / Proveedor (ej. Proveedores por Pagar)
  defaultExpenseOrIncomeAccountId?: string; // Cuenta Contable de Ingreso o Costo/Gasto por Defecto
  banco?: string;
  tipoCuenta?: 'Corriente' | 'Vista' | 'Ahorro' | 'RUT';
  numeroCuenta?: string;
  estado: 'Activo' | 'Inactivo';
  email?: string;
  phone?: string;
}

export interface ExchangeRate {
  id: string;
  date: string; // YYYY-MM-DD
  uf: number; // Unidad de Fomento (Diario - SII / Banco Central de Chile)
  dolar: number; // Dólar Observado (USD - Banco Central de Chile)
  utm: number; // Unidad Tributaria Mensual (Mensual - SII)
  euro: number; // Euro (Banco Central de Chile)
  yen: number; // Yen Japonés (Banco Central de Chile)
  ipc?: number; // Variación IPC Mensual (%) - INE / SII
  ipcAcomulado?: number; // IPC Acumulado Anual (%) - INE / SII
}

export interface FiscalPeriodYear {
  id: string; // ej: '2026'
  year: number;
  months: {
    [monthNumber: number]: 'Abierto' | 'Cerrado'; // 1 to 12
  };
}

export interface RCVDocument {
  id: string;
  tipoRegistro: 'Compra' | 'Venta' | 'Honorarios';
  period: string; // YYYY-MM
  rutEmisor: string;
  razonSocialEmisor: string;
  tipoDoc: string; // ej: '33', '34', '39', '41', '46', '56', '61', '110', 'BHE'
  folio: string;
  fechaEmision: string; // YYYY-MM-DD
  montoNeto: number; // Para Compras/Ventas: Neto afecto. Para Honorarios: Bruto
  montoIva: number; // Para Compras/Ventas: IVA (Débito/Crédito). Para Honorarios: Retención (13.75%/14.5%/15.25%)
  montoExento: number;
  montoTotal: number; // Para Compras/Ventas: Total Documento. Para Honorarios: Líquido
  montoBruto?: number;
  montoRetencion?: number;
  montoLiquido?: number;
  montoOtrosImpuestos?: number; // Impuestos adicionales (ILA, diesel, carnes, licores, etc.)
  estadoContabilizado: boolean;
  voucherId?: string;
  auxiliaryId?: string;
  cuentaGastoId?: string;
  cuentaIvaId?: string;
  cuentaContrapartidaId?: string;
}

export interface VoucherLine {
  id?: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  auxiliaryRut?: string;
  auxiliaryName?: string;
  documentRef?: string;
  gloss?: string;
}

export interface Voucher {
  id: string;
  voucherNumber: number;
  date: string; // YYYY-MM-DD
  period: string; // YYYY-MM
  type: 'Ingreso' | 'Egreso' | 'Traspaso';
  gloss: string;
  lines: VoucherLine[];
  totalDebit: number;
  totalCredit: number;
  status?: 'Valido' | 'Anulado' | 'Descuadrado';
  isDescuadrado?: boolean;
  descuadreDifference?: number;
  anuladoAt?: string;
  anuladoReason?: string;
  createdFromRcvId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RCVAccountingParams {
  ivaDebitoAccountId?: string; // IVA Débito Fiscal (Ventas)
  ivaCreditoAccountId?: string; // IVA Crédito Fiscal (Compras)
  retencionBheAccountId?: string; // IVA Retenido / Retención BHE (Honorarios)
  exentoAccountId?: string; // Impuesto Exento / No Gravado
  otrosImpuestosAccountId?: string; // Impuestos Adicionales (ILA, Harinas, Licores, etc.)
  defaultCustomerAccountId?: string; // Clientes por Cobrar por Defecto
  defaultSupplierAccountId?: string; // Proveedores por Pagar por Defecto
  defaultHonorariosAccountId?: string; // Honorarios por Pagar por Defecto
  defaultSalesIncomeAccountId?: string; // Ingreso por Ventas por Defecto
  defaultCostOrExpenseAccountId?: string; // Costo / Gasto Compras por Defecto
  defaultHonorariosExpenseAccountId?: string; // Gasto Honorarios por Defecto
}

export interface PaymentItem {
  rcvDocId?: string;
  rut: string;
  razonSocial: string;
  tipoDoc: string;
  folio: string;
  montoTotal: number;
  montoPagar: number;
  bancoDestino?: string;
  tipoCuentaDestino?: string;
  numeroCuentaDestino?: string;
  emailAviso?: string;
}

export interface PaymentBatch {
  id: string;
  batchNumber: number;
  date: string; // YYYY-MM-DD
  period: string; // YYYY-MM
  bankAccountId: string;
  bankAccountCode: string;
  bankAccountName: string;
  totalAmount: number;
  itemsCount: number;
  status: 'Borrador' | 'Procesado' | 'Anulado';
  gloss: string;
  voucherId?: string;
  items: PaymentItem[];
  createdAt: string;
}

export interface CollectionItem {
  rcvDocId?: string;
  rut: string;
  razonSocial: string;
  tipoDoc: string;
  folio: string;
  montoTotal: number;
  montoCobrado: number;
}

export interface CollectionRecord {
  id: string;
  recordNumber: number;
  date: string; // YYYY-MM-DD
  period: string; // YYYY-MM
  paymentMethod: 'Transferencia' | 'Efectivo' | 'Cheque' | 'Transbank' | 'Otro';
  depositAccountId: string;
  depositAccountCode: string;
  depositAccountName: string;
  totalAmount: number;
  gloss: string;
  status: 'Valido' | 'Anulado';
  voucherId?: string;
  items: CollectionItem[];
  createdAt: string;
}

export interface BankStatementLine {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  documentNumber?: string;
  charge: number; // Cargo en cuenta (Egreso)
  deposit: number; // Abono en cuenta (Ingreso)
  balance: number;
  matchedVoucherId?: string;
  matchedVoucherNumber?: number;
  matchedStatus: 'Pendiente' | 'Conciliado' | 'No_Corresponde';
}

export interface BankReconciliation {
  id: string;
  period: string; // YYYY-MM
  bankAccountId: string;
  bankAccountCode: string;
  bankAccountName: string;
  statementDate: string;
  bankFinalBalance: number; // Saldo según Cartola
  bookFinalBalance: number; // Saldo según Libro Mayor
  unmatchedCharges: number;
  unmatchedDeposits: number;
  outstandingChecks: number;
  depositsInTransit: number;
  reconciledBalance: number;
  difference: number;
  status: 'Cuadrado' | 'Descuadrado';
  notes?: string;
  lines: BankStatementLine[];
  updatedAt: string;
}

export interface F29TaxSettings {
  regimenTributario: '14_D3_PROPYME_GENERAL' | '14_D8_PROPYME_TRANSPARENTE' | '14_A_SEMI_INTEGRADO' | 'RENTA_PRESUNTA';
  ppmRate: number; // Porcentaje, ej: 0.25, 0.5, 1.0, 1.25
  previousMonthRemanenteUTM: number;
  utmValue: number; // Valor UTM del mes tributario
  honorariosTaxRate: number; // Porcentaje de retención, ej: 13.75, 14.5
  impuestoUnicoSegundaCategoria: number; // Retención sueldos/salarios
  ivaUsoComunFactor: number; // 0.0 a 1.0 (1.0 = 100% recuperable)
  retencionCambioSujeto: number;
  prestamoSolidarioRetencion?: number;
}

export interface F29DebitoFiscal {
  ventasAfectasNeto: number;
  debitoFacturasEmitidas: number; // Cód 503 / 502
  ventasBoletasNeto: number;
  debitoBoletasEmitidas: number; // Cód 110 / 111
  debitoNotasDebito: number; // Cód 512 / 513
  creditoNotasCreditoEmitidas: number; // Cód 509 / 510
  totalDebitoFiscal: number; // Cód 538
  ventasExentasTotal: number; // Cód 585 / 142
  docsCount: number;
}

export interface F29CreditoFiscal {
  comprasGiroNeto: number;
  creditoFacturasRecibidas: number; // Cód 520 / 524
  comprasActivoFijoNeto: number;
  creditoActivoFijo: number; // Cód 525 / 528
  creditoNotasDebitoRecibidas: number; // Cód 532
  debitoNotasCreditoRecibidas: number; // Cód 535
  ivaNoRecuperable: number; // Cód 537
  ivaUsoComunTotal: number;
  ivaUsoComunRecuperable: number;
  remanenteMesAnteriorUTM: number; // Cód 504
  remanenteMesAnteriorPesos: number; // Cód 563
  totalCreditoFiscal: number; // Cód 537 / 528
  docsCount: number;
}

export interface F29Retenciones {
  baseHonorariosBruto: number;
  retencionHonorarios: number; // Cód 151 / 152
  retencionTerceros: number;
  impuestoUnicoTrabajadores: number; // Cód 48 / 49
  prestamoSolidario: number;
  totalRetenciones: number;
  docsCount: number;
}

export interface F29PPM {
  baseImponibleVentas: number; // Cód 120 / 563
  tasaPPM: number; // Cód 115
  montoPPM: number; // Cód 062 / 063
}

export interface F29ResumenTotal {
  ivaPagar: number;
  remanenteParaSiguienteMes: number;
  remanenteParaSiguienteMesUTM: number;
  retencionesPagar: number;
  ppmPagar: number;
  otrosImpuestos: number;
  totalPagarF29: number; // Cód 91
}

export interface F29Declaration {
  id: string;
  period: string; // YYYY-MM
  status: 'Borrador' | 'Validado' | 'Declarado' | 'Pagado';
  folioSII?: string;
  declarationDate?: string;
  paymentDate?: string;
  settings: F29TaxSettings;
  debitoFiscal: F29DebitoFiscal;
  creditoFiscal: F29CreditoFiscal;
  retenciones: F29Retenciones;
  ppm: F29PPM;
  resumen: F29ResumenTotal;
  voucherId?: string;
  voucherNumber?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}


