export enum UserRole {
  SUPER_USER = 'SUPER_USER',
  STUDY_ADMIN = 'STUDY_ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  ANALYST = 'ANALYST',
  OBSERVER = 'OBSERVER',
}

export interface SuperUser {
  id?: string;
  email: string;
  name: string;
  password?: string;
  phone?: string;
  rut?: string;
  estado: 'Activo' | 'Inactivo' | 'Vigente' | 'Sin Vigencia';
  createdAt?: string;
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
  planId?: string;
  maxCompanies?: number; // Cantidad límite de empresas permitidas
  maxUsers?: number; // Cantidad límite de usuarios permitidos
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

export interface DTEConfig {
  rutEmisor: string;
  rutRepresentante: string;
  nombreRepresentante?: string;
  claveSiiMasked?: string;
  claveRepLegalSiiMasked?: string;
  claveEmpresaSiiMasked?: string;
  claveRepLegalSii?: string;
  claveEmpresaSii?: string;
  claveCertificadoDigital?: string;
  siiApiUrl?: string;
  rutEmpresaSii?: string;
  multiEmpresaSelectionEnabled?: boolean;
  lastSiiSyncDate?: string;
  siiConnectionStatus?: 'Conectado' | 'No Configurado' | 'Error Credenciales';
  siiApiProvider?: 'DIRECT_SII' | 'SIMPLE_API' | 'OPEN_FACTURA' | 'LIBRE_DTE' | 'CUSTOM_API';
  siiApiKey?: string;
  hasCertificadoDigital?: boolean;
  certificadoNombre?: string;
  certificadoB64?: string;
  certificadoFechaVencimiento?: string;
  defaultCiudadEmisor: string;
  defaultComunaEmisor: string;
  ambiente: 'Producción' | 'Certificación' | 'SANDBOX' | string;
  resolutionNumber?: string;
  resolutionDate?: string;
}

export interface DTEDocumentItem {
  id: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  esExento?: boolean;
  descuentoPct?: number;
  subtotal: number;
}

export interface DTEDocument {
  id: string;
  tipoDTE: '33' | '34' | '39' | '41' | '52' | '56' | '61' | string; // 33: Factura, 34: Exenta, 39: Boleta, 41: Boleta Exenta, 52: Guía Despacho, 56: ND, 61: NC
  tipoDTELabel: string;
  folio: number;
  fechaEmision: string; // YYYY-MM-DD
  period: string; // YYYY-MM
  emisor: {
    rut: string;
    razonSocial: string;
    giro: string;
    direccion: string;
    comuna: string;
    ciudad: string; // CRITICAL: Never blank
    acteco?: string;
  };
  receptor: {
    rut: string;
    razonSocial: string;
    giro: string;
    direccion: string;
    comuna: string;
    ciudad: string; // CRITICAL: Never blank
    contacto?: string;
    email?: string;
  };
  representanteLegal?: {
    rut: string;
    nombre?: string;
  };
  items: DTEDocumentItem[];
  formaPago: 'Contado' | 'Crédito 30 días' | 'Crédito 60 días' | 'Transferencia' | 'Sin Costo / Entrega Gratuita' | 'Consignación' | string;
  montoNeto: number;
  montoIva: number;
  montoExento: number;
  montoTotal: number;
  estadoSII: 'Enviado_SII' | 'Aceptado_SII' | 'Rechazado_SII' | 'Borrador';
  trackIdSII?: string;
  voucherId?: string;
  voucherNumber?: number;
  createdAt: string;
  refDocumentoOrigId?: string; // Para NC / ND
  refFolioOrig?: string;
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
  ciudad?: string; // Ciudad
  email?: string; // Email de la Empresa
  phone?: string; // Teléfono
  legalRepName?: string; // Rep. Legal Nombre
  legalRepRut?: string; // Rep. Legal RUT
  legalRepEmail?: string; // Rep. Legal Email
  contactName?: string; // Contacto Operativo Nombre
  contactPhone?: string; // Contacto Operativo Teléfono
  estado?: 'Activo' | 'Inactivo';
  f29CodeSettings?: { [key: string]: boolean };
  f29AccountParams?: F29AccountingParams;
  customF29Codes?: CustomF29Code[];
  dteModuleEnabled?: boolean;
  dteConfig?: DTEConfig;
  assignedAccountantIds?: string[];
  assignedAccountantEmails?: string[];
  customAccountColumns?: string[]; // Lista de nombres de columnas de análisis adicionales (ej: ['REQUIERE SUCURSAL', 'REQUIERE ZONA'])
}

export interface Assignment {
  id: string;
  studyId: string;
  userId: string;
  companyId: string;
}

export interface ChartOfAccount {
  id: string;
  code: string; // COD_CTA (ej: 1101001)
  name: string; // NOMBRE_CTA (ej: CAJA)
  type: 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto';
  parentCode?: string; // Para estructura arborescente

  // Matriz de 17 Atributos Oficiales (Grilla Contable)
  isImputable?: boolean; // IMPUTABLE (SI/NO) - por defecto true
  moneda?: 'CLP' | 'USD' | 'EUR' | 'UF' | string; // MONEDA (CLP, USD, EUR, UF)
  requiereAuxiliarRUT: boolean; // REQUIERE AUXILIAR (SI/NO)
  requiereConciliacionBancaria: boolean; // REQUIERE CONCILIACION (SI/NO)
  requiereDocumento: boolean; // REQUIERE DOCUMENTO (SI/NO)
  requiereVencimiento?: boolean; // REQUIERE VENCIMIENTO (SI/NO)
  requiereCentroCosto: boolean; // REQUIERE CENTRO_COSTO (SI/NO)
  requiereItemGasto?: boolean; // REQUIERE ITEM_GASTO (SI/NO)
  requiereProyecto?: boolean; // REQUIERE PROYECTO (SI/NO)
  requiereProducto?: boolean; // REQUIERE PRODUCTO (SI/NO)
  esActivoFijo?: boolean; // ES ACTIVO FIJO (SI/NO)
  requiereCMonetaria?: boolean; // REQUIERE C. MONETARIA (SI/NO)
  requiereDifCambio?: boolean; // REQUIERE DIF. CAMBIO (SI/NO)
  blce8Columnas?: 'ACTIVO' | 'PASIVO' | 'PERDIDA' | 'GANANCIA' | 'Activo' | 'Pasivo' | 'Pérdida' | 'Ganancia' | string; // BLCE 8 COLUM
  codigoIFRS?: string; // IFRS (ej: 1101, 1103)

  bankInstitution?: string; // Banco (ej. Banco de Chile, Santander, BCI, etc.)
  bankAccountNumber?: string; // N° Cuenta Corriente / Vista
  
  // Atributos dinámicos / Análisis adicionales configurables por el usuario (la grilla crece en columnas)
  customAttributes?: { [key: string]: any };
  estado: 'Activo' | 'Inactivo';
  createdBy?: string;
  createdByUserEmail?: string;
  creationMode?: 'MANUAL' | 'IMPORTACION_RCV' | 'IMPORTACION_MASIVA' | 'SISTEMA' | 'AUTOMATICO';
  createdAt?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
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
  defaultCostCenter?: string;
  defaultExpenseItem?: string;
  defaultProject?: string;
  defaultProduct?: string;
  defaultCustomAnalyses?: { [key: string]: string };
  banco?: string;
  tipoCuenta?: 'Corriente' | 'Vista' | 'Ahorro' | 'RUT';
  numeroCuenta?: string;
  estado: 'Activo' | 'Inactivo';
  email?: string;
  phone?: string;
  createdBy?: string;
  createdByUserEmail?: string;
  creationMode?: 'MANUAL' | 'IMPORTACION_RCV' | 'IMPORTACION_MASIVA' | 'SISTEMA' | 'AUTOMATICO';
  createdAt?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
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
  rutReceptor?: string;
  razonSocialReceptor?: string;
  tipoDoc: string; // ej: '33', '34', '39', '41', '46', '56', '61', '110', 'BHE'
  tipoDocumento?: string;
  nombreTipoDoc?: string;
  folio: string;
  fechaEmision: string; // YYYY-MM-DD
  fechaVencimiento?: string; // YYYY-MM-DD
  montoNeto: number; // Para Compras/Ventas: Neto afecto. Para Honorarios: Bruto
  montoIva: number; // Para Compras/Ventas: IVA (Débito/Crédito). Para Honorarios: Retención (13.75%/14.5%/15.25%)
  montoExento: number;
  montoTotal: number; // Para Compras/Ventas: Total Documento. Para Honorarios: Líquido
  montoBruto?: number;
  montoRetencion?: number;
  montoLiquido?: number;
  montoOtrosImpuestos?: number; // Impuestos adicionales (ILA, diesel, carnes, licores, etc.)
  refFolioOrig?: string; // Folio de referencia para NC / ND
  estadoContabilizado: boolean;
  voucherId?: string;
  auxiliaryId?: string;
  cuentaGastoId?: string;
  cuentaIvaId?: string;
  cuentaContrapartidaId?: string;
  estado?: string;
  tipoOperacion?: string;
  estadoCobranza?: 'Pagada' | 'Pendiente' | 'Vencida' | 'En Cobranza' | string;
  estadoPago?: 'Pagada' | 'Pendiente' | 'Vencida' | 'Por Pagar' | string;
  saldoPendiente?: number;
  source?: string;
  createdBy?: string;
  createdByUserEmail?: string;
  createdAt?: string;
  creationMode?: 'MANUAL' | 'IMPORTACION_RCV' | 'IMPORTACION_MASIVA' | 'SISTEMA' | 'AUTOMATICO';
  lastModifiedBy?: string;
  lastModifiedAt?: string;
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
  documentType?: string;
  documentRef?: string;
  costCenter?: string;
  bankDocRef?: string;
  dueDate?: string;
  expenseItem?: string;
  project?: string;
  product?: string;
  customAnalyses?: { [key: string]: string };
  gloss?: string;
}

export interface MatchedLineRef {
  voucherId: string;
  voucherNumber: number;
  voucherDate: string;
  voucherPeriod: string;
  lineIndex: number;
  accountId: string;
  accountCode: string;
  debit: number;
  credit: number;
  gloss?: string;
  documentRef?: string;
  auxiliaryRut?: string;
  auxiliaryName?: string;
}

export interface AccountMatch {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  matchedLines: MatchedLineRef[];
  totalAmount: number; // Monto total debitos/creditos pareados
  matchDate: string; // Fecha o Timestamp ISO
  matchedBy?: string;
  notes?: string;
  creationMode?: 'MANUAL' | 'AUTOMATICO' | 'SUGERENCIA';
  status: 'CALZADO' | 'DESCALZADO';
  unmatchedAt?: string;
  unmatchedBy?: string;
}

export interface FiscalYear {
  id: string; // e.g. "2026"
  year: number;
  months: {
    [month: number]: 'Abierto' | 'Cerrado';
  };
}

export type AccountingVoucher = Voucher;

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
  status?: 'Valido' | 'Anulado' | 'Descuadrado' | 'Pendiente';
  isDescuadrado?: boolean;
  descuadreDifference?: number;
  anuladoAt?: string;
  anuladoReason?: string;
  createdFromRcvId?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  createdByUserEmail?: string;
  creationMode?: 'MANUAL' | 'IMPORTACION_RCV' | 'IMPORTACION_MASIVA' | 'SISTEMA' | 'AUTOMATICO';
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export interface AuditLog {
  id?: string;
  timestamp: string; // ISO string e.g. 2026-08-25T11:03:39-07:00
  userId: string;
  userEmail: string;
  userRole?: string;
  studyId?: string;
  studyName?: string;
  companyId?: string;
  companyName?: string;
  action: 'LOGIN' | 'LOGOUT' | 'CREAR' | 'MODIFICAR' | 'ELIMINAR' | 'CONTABILIZAR' | 'ANULAR' | 'IMPORTACION_MASIVA' | 'PURGA' | 'EXPORTAR';
  module: 'AUTENTICACION' | 'ESTUDIOS' | 'EMPRESAS' | 'COMPROBANTES' | 'RCV_COMPRAS' | 'RCV_VENTAS' | 'RCV_HONORARIOS' | 'PLAN_CUENTAS' | 'AUXILIARES' | 'PERIODOS_FISCALES' | 'PLANES' | 'SUPER_ADMINS' | 'USUARIOS' | 'DTE' | 'CONCILIACION' | 'F29' | 'PAGOS_COBRANZAS' | 'PARAMETROS_RCV' | 'DEMO_PURGE' | 'MARKETING_PROMO';
  details: string;
  metadata?: { [key: string]: any };
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
  matchedVoucherPeriod?: string; // Período del comprobante contable vinculado (ej: 2026-02)
  matchedStatus: 'Pendiente' | 'Conciliado' | 'No_Corresponde';
}

export interface BankReconciliation {
  id: string;
  period: string; // YYYY-MM
  bankAccountId: string;
  bankAccountCode: string;
  bankAccountName: string;
  statementDate: string;
  bankInitialBalance?: number; // Saldo Inicial según Cartola (Mes Anterior)
  bankFinalBalance: number; // Saldo Final según Cartola
  bookFinalBalance: number; // Saldo según Libro Mayor
  unmatchedCharges: number;
  unmatchedDeposits: number;
  outstandingChecks: number;
  depositsInTransit: number;
  reconciledBalance: number;
  calculatedBookBalance?: number;
  calculatedBankBalance?: number;
  difference: number;
  status: 'Cuadrado' | 'Descuadrado';
  notes?: string;
  lines: BankStatementLine[];
  updatedAt: string;
}

export interface CustomF29Code {
  id: string;
  code: string; // ej: '542', '586'
  name: string; // ej: 'Retención Harinas 12%', 'ILA Licores 31.5%'
  section: 'Debito' | 'Credito' | 'Retencion' | 'ImpuestoAdicional';
  amount: number;
  active: boolean;
}

export interface F29AccountingParams {
  ivaDebitoAccountId?: string;
  ivaCreditoAccountId?: string;
  ivaPagarAccountId?: string;
  remanenteAccountId?: string;
  correccionMonetariaAccountId?: string; // Cuenta Ganancia/Pérdida por Corrección Monetaria / Reajuste Remanente
  ivaPostergadoAccountId?: string; // Cuenta IVA Postergado por Pagar (ej: 2-1-03-05)
  ppmAccountId?: string;
  retencionHonorariosAccountId?: string;
  impuestoUnicoAccountId?: string;
  impuestosPorPagarAccountId?: string;
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
  ivaPostergadoActivo?: boolean;
  ivaPostergadoMonto?: number; // Cód. 756
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
  remanenteHistoricoPesos?: number;
  reajusteCorreccionMonetariaRemanente?: number; // Reajuste Art. 27 DL 825
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
  ivaPostergado?: number; // Cód. 756
  ivaPagarNetoPostergacion?: number; // Saldo a pagar tras postergación
  remanenteParaSiguienteMes: number;
  remanenteParaSiguienteMesUTM: number;
  reajusteCorreccionMonetaria?: number;
  retencionesPagar: number;
  ppmPagar: number;
  otrosImpuestos: number;
  customCodesTotal?: number;
  totalPagarF29: number; // Cód 91
}

export interface F29Declaration {
  id: string;
  period: string; // YYYY-MM
  status: 'Borrador' | 'Validado' | 'Declarado' | 'Pagado';
  folioSII?: string;
  pdfResumenUrl?: string;
  f29CodeSettings?: { [key: string]: boolean };
  customCodes?: CustomF29Code[];
  f29AccountParams?: F29AccountingParams;
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

// ----------------------------------------------------
// TABLAS MAESTRAS DE ANÁLISIS CONTABLES (CATÁLOGOS)
// ----------------------------------------------------

export interface CostCenterMaster {
  id: string;
  companyId: string;
  code: string; // e.g. CC-001, ADM, PROD
  name: string; // e.g. Administración Central, Operaciones, Ventas
  area?: string; // e.g. Gerencia General, Comercial, Mina
  description?: string;
  estado: 'Activo' | 'Inactivo';
  createdAt?: string;
  updatedAt?: string;
}

export interface ExpenseItemMaster {
  id: string;
  companyId: string;
  code: string; // e.g. GTO-ARR, GTO-LUM, GTO-REM
  name: string; // e.g. Arriendos de Inmuebles, Servicios Básicos, Remuneraciones
  category?: string; // Fijo, Variable, Operacional, No Operacional, Administrativo
  description?: string;
  estado: 'Activo' | 'Inactivo';
  createdAt?: string;
  updatedAt?: string;
}

export interface NonSiiDocTypeMaster {
  id: string;
  companyId: string;
  code: string; // e.g. VALE_CAJA, REND_GASTO, REC_INT, COMP_TRF, LIQ_SUELDO, CONTRATO
  name: string; // e.g. Vale Provisorio de Caja Chica, Rendición de Gastos, Recibo Interno
  description?: string;
  estado: 'Activo' | 'Inactivo';
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectMaster {
  id: string;
  companyId: string;
  code: string; // e.g. PROY-01, OBRA-NORTE
  name: string; // e.g. Edificio Costanera, Proyecto TI 2026
  clientOrLocation?: string; // e.g. Minera Escondida / Antofagasta
  description?: string;
  estado: 'Activo' | 'Inactivo';
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductMaster {
  id: string;
  companyId: string;
  code: string; // e.g. PROD-100, SERV-01
  name: string; // e.g. Servicio de Asesoría Mensual, Producto Terminado A
  unit?: string; // UN, HRS, MES, KG, GL
  description?: string;
  estado: 'Activo' | 'Inactivo';
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomAnalysisTableItem {
  id: string;
  companyId: string;
  analysisColumnName: string; // e.g. "SUCURSAL", "ZONA", "VEHICULO"
  code: string; // e.g. SUC-01, ZONA-SUR, PAT-ABCD12
  name: string; // e.g. Sucursal Las Condes, Zona Austral, Camioneta Toyota
  description?: string;
  estado: 'Activo' | 'Inactivo';
  createdAt?: string;
  updatedAt?: string;
}

export interface MarketingPromoConfig {
  id?: string;
  enabled: boolean;
  badgeText: string; // e.g. "WhatsApp Oficial" o "Promoción Especial"
  headline: string; // e.g. "Pide tu prueba gratis de 15 días"
  whatsappNumber: string; // e.g. "56946318783"
  whatsappCustomMessage: string; // e.g. "Hola!! Quiero usar GEST_OK"
  targetUrl?: string; // Optional direct URL
  actionType: 'whatsapp' | 'url';
  buttonColor?: string; // e.g. "#25D366" or "emerald"
  updatedAt?: string;
  updatedBy?: string;
}



