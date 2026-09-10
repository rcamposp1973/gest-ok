import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Company, DTEConfig, ChartOfAccount, Auxiliary, ExchangeRate, FiscalPeriodYear, RCVDocument, Voucher, VoucherLine, RCVAccountingParams, BankReconciliation, UserRole, CostCenterMaster, ExpenseItemMaster, NonSiiDocTypeMaster, ProjectMaster, ProductMaster, CustomAnalysisTableItem, CommercialDocument, InventoryMovement, ProductService, Employee, PayrollSlip } from '../types';
import { EmployeesView } from './EmployeesView';
import { LiquidacionSueldosView } from './LiquidacionSueldosView';
import { syncOnlineChileanIndicators, generateOfficialChileanIndicators } from '../utils/chileanEconomicIndicators';
import { logAuditEvent } from '../utils/auditLogger';
import LibroDiarioView from './LibroDiarioView';
import LibroMayorView from './LibroMayorView';
import Balance8ColumnasView from './Balance8ColumnasView';
import BalanceIFRSView from './BalanceIFRSView';
import EstadoResultadosView from './EstadoResultadosView';
import IndicadoresFinancierosView from './IndicadoresFinancierosView';
import FlujoDeCajaView from './FlujoDeCajaView';
import NominasPagoView from './NominasPagoView';
import CobranzaView from './CobranzaView';
import AnalisisAuxiliaresView from './AnalisisAuxiliaresView';
import AnalisisCuentasView from './AnalisisCuentasView';
import ConciliacionBancariaView from './ConciliacionBancariaView';
import CargaMasivaComprobantesView from './CargaMasivaComprobantesView';
import Formulario29View from './Formulario29View';
import PlantillasYCargaMasivaView from './PlantillasYCargaMasivaView';
import ExcelImportCenterModal from './ExcelImportCenterModal';
import IndicadoresEconomicosView from './IndicadoresEconomicosView';
import EmisionDteView from './EmisionDteView';
import PlanDeCuentasGrid from './PlanDeCuentasGrid';
import AuxiliariesGrid from './AuxiliariesGrid';
import AuxiliaryModal from './AuxiliaryModal';
import PeriodsGrid from './PeriodsGrid';
import TablasAnalisisMasterView from './TablasAnalisisMasterView';
import VoucherLineDistributionModal from './VoucherLineDistributionModal';
import FormattedAmountInput from './FormattedAmountInput';
import InternalCompanyAccountingCopilot from './InternalCompanyAccountingCopilot';
import SiiFolioControlView from './SiiFolioControlView';
import AuditorEstadosFinancierosView from './AuditorEstadosFinancierosView';
import CompanyNotebooksView from './CompanyNotebooksView';
import { ProductsServicesView } from './ProductsServicesView';
import { OperativaComercialView } from './OperativaComercialView';
import { StockKardexView } from './StockKardexView';
import { SearchableAuxiliarySelect } from './SearchableAuxiliarySelect';
import * as XLSX from 'xlsx';
import { useProcess } from '../context/ProcessContext';
import { validateVoucherLine, isCustomAnalysisRequired, sanitizeVoucherLine, sanitizeVoucherLines } from '../utils/voucherValidation';
import { getLatestOpenPeriod, checkIsPeriodClosed as checkIsPeriodClosedUtil, getNextOpenPeriodAndDate } from '../utils/periodUtils';
import { fetchRcvFromSii } from '../utils/siiRcvClient';
import { 
  FileText, BookOpen, Layers, Users, Sliders, Scale, Printer, 
  FolderTree, CreditCard, Receipt, TrendingUp, Landmark, ShoppingCart, 
  BarChart3, Settings, Calendar, Download, ChevronLeft, ChevronRight, 
  FileSpreadsheet, ArrowLeft, Building2, CheckCircle2, Lock, Unlock,
  ShieldCheck, Boxes, Package, ArrowRightLeft, ShoppingBag, Calculator, Briefcase, Sparkles
} from 'lucide-react';


interface CompanyAccountingDashboardProps {
  studyId: string;
  company: Company;
  currentUserRole?: UserRole;
  onBack: () => void;
}

export default function CompanyAccountingDashboard({ studyId, company, currentUserRole, onBack }: CompanyAccountingDashboardProps) {
  const isSuperUser = currentUserRole === UserRole.SUPER_USER;
  const isAnalyst = currentUserRole === UserRole.ANALYST;
  const isReadOnly = currentUserRole === UserRole.OBSERVER;

  const { withProcess } = useProcess();
  type RibbonGroup = 'FINANZAS' | 'OPERACIONES' | 'TESORERIA' | 'PERSONAL' | 'IMPORTACIONES' | 'IMPUESTOS' | 'INDICADORES' | 'CONFIGURACIONES';
  const [activeRibbonGroup, setActiveRibbonGroup] = useState<RibbonGroup>('FINANZAS');
  const [activeTab, setActiveTab] = useState<'accounts' | 'auxiliaries' | 'periods' | 'rcv' | 'exchange' | 'rcvParams' | 'f29Codes' | 'vouchers' | 'libroDiario' | 'libroMayor' | 'balance8' | 'balanceIFRS' | 'analisisAuxiliares' | 'analisisCuentas' | 'estadoResultados' | 'indicadoresFinancieros' | 'auditorEstadosFinancieros' | 'smartNotebooks' | 'flujoDeCaja' | 'nominasPago' | 'cobranza' | 'conciliacionBancaria' | 'cargaMasiva' | 'formulario29' | 'plantillasCarga' | 'emisionDte' | 'tablasAnalisis' | 'controlFolios' | 'productsServices' | 'operativaComercial' | 'stockKardex' | 'employees' | 'liquidaciones'>('vouchers');
  const [auxSubTab, setAuxSubTab] = useState<'deudores' | 'acreedores'>('deudores');
  const [employeeSubTab, setEmployeeSubTab] = useState<'employees' | 'contracts' | 'attendance' | 'advances' | 'severance' | 'certificates'>('employees');
  const [payrollTab, setPayrollTab] = useState<'NOMINA' | 'LIQUIDACION_INDIVIDUAL' | 'LRD_DT' | 'PREVIRED' | 'PARAMETROS' | 'CONCEPTOS' | 'RELIQUIDACIONES'>('NOMINA');

  const [showExchangeBar, setShowExchangeBar] = useState<boolean>(true);
  const [rcvFilterType, setRcvFilterType] = useState<'Todos' | 'Compra' | 'Venta' | 'Honorarios'>('Compra');
  const [showHistoricalRatesModal, setShowHistoricalRatesModal] = useState<boolean>(false);
  const [historicalRatesFilterYear, setHistoricalRatesFilterYear] = useState<string>('Todos');
  const [historicalRatesSearch, setHistoricalRatesSearch] = useState<string>('');
  const [showExcelImportModal, setShowExcelImportModal] = useState<boolean>(false);
  const [isRescatandoRcvApi, setIsRescatandoRcvApi] = useState<boolean>(false);
  const [showManualUpload, setShowManualUpload] = useState<boolean>(false);
  const [showQuickApiConfig, setShowQuickApiConfig] = useState<boolean>(false);
  const [quickApiProvider, setQuickApiProvider] = useState<string>('SIMPLE_API');
  const [quickApiUrl, setQuickApiUrl] = useState<string>('');
  const [quickApiKey, setQuickApiKey] = useState<string>('');

  // Sync quick API config inputs whenever company changes
  useEffect(() => {
    if (company?.dteConfig) {
      setQuickApiProvider(company.dteConfig.siiApiProvider || (company.dteConfig.siiApiKey ? 'SIMPLE_API' : 'DIRECT_SII'));
      setQuickApiUrl(company.dteConfig.siiApiUrl || '');
      setQuickApiKey(company.dteConfig.siiApiKey || '');
    }
  }, [company]);

  const handleSaveQuickApiSettings = async () => {
    try {
      let finalUrl = quickApiUrl.trim();
      if (quickApiProvider === 'SIMPLE_API' && (!finalUrl || finalUrl.includes('GenerarApiKey') || finalUrl.includes('/Productos'))) {
        finalUrl = 'https://api.simpleapi.cl/v1';
      }
      const updatedDteConfig = {
        ...(company.dteConfig || {}),
        siiApiProvider: quickApiProvider as any,
        siiApiUrl: finalUrl,
        siiApiKey: quickApiKey.trim(),
        siiConnectionStatus: 'Conectado'
      };
      await updateDoc(companyRef, {
        dteConfig: updatedDteConfig
      });
      await fetchData();
      setShowQuickApiConfig(false);
      alert(`✅ Configuración de API Guardada con Éxito para ${company.name}:\n\n• Proveedor: ${quickApiProvider}\n• API Key: ${quickApiKey ? '••••' + quickApiKey.slice(-4) : 'Sin Key'}\n• URL Endpoint: ${finalUrl}`);
    } catch (err) {
      console.error('Error saving API settings:', err);
      alert('❌ Error al guardar la configuración de la API.');
    }
  };

  // Notification for pending modules
  const handlePendingClick = (moduleName: string) => {
    alert(`El módulo "${moduleName}" está programado para las siguientes etapas y actualmente se encuentra (Pendiente).`);
  };

  // Data states
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [auxiliaries, setAuxiliaries] = useState<Auxiliary[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalPeriodYear[]>([]);
  const [rcvDocuments, setRcvDocuments] = useState<RCVDocument[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [bankReconciliations, setBankReconciliations] = useState<BankReconciliation[]>([]);
  const [rcvParams, setRcvParams] = useState<RCVAccountingParams | null>(null);

  // Master analysis tables data states
  const [costCenters, setCostCenters] = useState<CostCenterMaster[]>([]);
  const [expenseItems, setExpenseItems] = useState<ExpenseItemMaster[]>([]);
  const [nonSiiDocTypes, setNonSiiDocTypes] = useState<NonSiiDocTypeMaster[]>([]);
  const [projects, setProjects] = useState<ProjectMaster[]>([]);
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [commercialDocuments, setCommercialDocuments] = useState<CommercialDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollSlips, setPayrollSlips] = useState<PayrollSlip[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [customAnalysisItems, setCustomAnalysisItems] = useState<CustomAnalysisTableItem[]>([]);

  const [distributingLineIdx, setDistributingLineIdx] = useState<number | null>(null);

  const [companyF29Codes, setCompanyF29Codes] = useState<{ [key: string]: boolean }>({
    debito: true,
    credito: true,
    remanente504: true,
    posterga756: true,
    honorarios151: true,
    impuestoUnico48: true,
    retencionTerceros: true,
    ppm062: true,
    otrosImpuestos: true,
    ...(company.f29CodeSettings || {})
  });

  useEffect(() => {
    if (company.f29CodeSettings) {
      setCompanyF29Codes(prev => ({
        ...prev,
        ...company.f29CodeSettings
      }));
    }
  }, [company.f29CodeSettings]);

  const handleSaveF29CodeSettings = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede modificar configuraciones contables ni tributarias.');
      return;
    }
    try {
      await updateDoc(companyRef, {
        f29CodeSettings: companyF29Codes
      });
      alert('✅ Configuración de Códigos F.29 guardada exitosamente para ' + company.name);
      await fetchData();
    } catch (err) {
      console.error('Error al guardar configuración de códigos F29:', err);
      alert('❌ Error al guardar la configuración en la base de datos.');
    }
  };

    const handleSaveEmployee = async (emp: Employee) => {
    try {
      const empId = emp.id || `emp_${Date.now()}`;
      await setDoc(doc(companyRef, 'employees', empId), {
        ...emp,
        id: empId,
        companyId: company.id,
        createdAt: emp.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      await fetchData();
    } catch (e: any) {
      console.error("Error saving employee:", e);
      alert("Error al guardar empleado: " + e.message);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    try {
      await deleteDoc(doc(companyRef, 'employees', employeeId));
      await fetchData();
    } catch (e: any) {
      console.error("Error deleting employee:", e);
      alert("Error al eliminar empleado: " + e.message);
    }
  };

  const cleanUndefinedFields = <T,>(obj: T): T => {
    if (obj === null || obj === undefined) return obj as any;
    if (Array.isArray(obj)) {
      return obj.map(cleanUndefinedFields) as any;
    }
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const key of Object.keys(obj)) {
        const val = (obj as any)[key];
        if (val !== undefined) {
          cleaned[key] = cleanUndefinedFields(val);
        }
      }
      return cleaned;
    }
    return obj;
  };

  const handleSavePayrollSlips = async (slips: PayrollSlip[]) => {
    try {
      for (const slip of slips) {
        const slipId = slip.id || `slip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const cleanedData = cleanUndefinedFields({
          ...slip,
          id: slipId,
          companyId: company.id,
          createdAt: slip.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        await setDoc(doc(companyRef, 'payrollSlips', slipId), cleanedData, { merge: true });
      }
      await fetchData();
    } catch (e: any) {
      console.error("Error saving payroll slips:", e);
      alert("Error al guardar liquidaciones: " + e.message);
    }
  };

  const handleResetPayrollSlips = async (periodToReset?: string) => {
    try {
      const slipsSnap = await getDocs(collection(companyRef, 'payrollSlips'));
      for (const slipDoc of slipsSnap.docs) {
        const data = slipDoc.data();
        if (!periodToReset || data.period === periodToReset) {
          await deleteDoc(doc(companyRef, 'payrollSlips', slipDoc.id));
        }
      }
      await fetchData();
    } catch (e: any) {
      console.error("Error resetting payroll slips:", e);
      alert("Error al eliminar datos de remuneraciones: " + e.message);
    }
  };

  const handleCentralizePayrollVoucher = async (voucherPayload: Omit<Voucher, 'id' | 'createdAt'>) => {
    try {
      const newVoucherRef = await addDoc(collection(companyRef, 'vouchers'), {
        ...voucherPayload,
        createdAt: new Date().toISOString()
      });
      await fetchData();
      return newVoucherRef.id;
    } catch (e: any) {
      console.error("Error centralizing payroll voucher:", e);
      alert("Error al generar comprobante de remuneraciones: " + e.message);
      throw e;
    }
  };

  const handleSaveCommercialDocument = async (
    docData: CommercialDocument,
    movements: InventoryMovement[],
    vouchersToCreate: Voucher[]
  ) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede registrar operaciones comerciales ni generar comprobantes.');
      return;
    }

    try {
      // 1. Guardar documento comercial
      const docPayload = {
        ...docData,
        createdAt: docData.createdAt || new Date().toISOString()
      };
      const savedDocRef = await addDoc(collection(companyRef, 'commercialDocuments'), docPayload);

      // 2. Guardar movimientos de inventario y actualizar stock/PMP en productos
      for (const mov of movements) {
        const movPayload = {
          ...mov,
          documentId: savedDocRef.id,
          createdAt: mov.createdAt || new Date().toISOString()
        };
        await addDoc(collection(companyRef, 'inventoryMovements'), movPayload);

        // Actualizar maestro de productos con nuevo stock y costo PMP
        if (mov.productId) {
          const productRef = doc(companyRef, 'products', mov.productId);
          const productSnap = await getDoc(productRef);
          if (productSnap.exists()) {
            const currentData = productSnap.data() as ProductService;
            await setDoc(productRef, {
              ...currentData,
              currentStock: mov.resultingStock,
              purchaseCost: mov.unitCost > 0 ? mov.unitCost : (currentData.purchaseCost || 0),
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        }
      }

      // 3. Guardar comprobantes contables generados automáticamente
      for (const v of vouchersToCreate) {
        const vYear = v.date ? new Date(v.date).getFullYear() : new Date().getFullYear();
        const yearVouchers = vouchers.filter(item => {
          const itemYear = item.date ? new Date(item.date).getFullYear() : 0;
          return itemYear === vYear;
        });
        const nextNum = yearVouchers.length > 0 ? Math.max(...yearVouchers.map(x => x.voucherNumber || 0)) + 1 : 1;
        
        const sanitizedLines = sanitizeVoucherLines(v.lines || [], accounts);
        const voucherPayload = {
          ...v,
          voucherNumber: v.voucherNumber || nextNum,
          lines: sanitizedLines,
          creationMode: 'AUTOMATICO' as const,
          createdAt: new Date().toISOString()
        };

        await addDoc(collection(companyRef, 'vouchers'), voucherPayload);
        
        logAuditEvent({
          userId: auth.currentUser?.uid || 'anon',
          userEmail: auth.currentUser?.email || '',
          studyId,
          companyId: company.id,
          action: 'CREAR',
          module: 'COMPROBANTES',
          details: `Comprobante comercial #${voucherPayload.voucherNumber} generado automáticamente (${v.gloss})`
        });
      }

      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'CONTABILIZAR',
        module: 'COMPROBANTES',
        details: `Documento Operativo ${docData.documentType} #${docData.folio} registrado. Total: $${docData.totalAmount}`
      });

      await fetchData();
    } catch (err: any) {
      console.error('Error al guardar documento comercial:', err);
      throw err;
    }
  };



  // UI states for vouchers
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [voucherFilterType, setVoucherFilterType] = useState<string>('Todos');
  const [voucherSearchQuery, setVoucherSearchQuery] = useState<string>('');
  const [voucherFilterYear, setVoucherFilterYear] = useState<string>('Todos');
  const [voucherFilterMonth, setVoucherFilterMonth] = useState<string>('Todos');

  // Column search filters for vouchers table
  const [colNumSearch, setColNumSearch] = useState<string>('');
  const [colDateSearch, setColDateSearch] = useState<string>('');
  const [colTypeSearch, setColTypeSearch] = useState<string>('Todos');
  const [colStatusSearch, setColStatusSearch] = useState<string>('Todos');
  const [colGlossSearch, setColGlossSearch] = useState<string>('');
  const [colDebitSearch, setColDebitSearch] = useState<string>('');
  const [colCreditSearch, setColCreditSearch] = useState<string>('');

  // Horizontal scroll container ref for ribbon sub-tabs
  const subRibbonScrollRef = useRef<HTMLDivElement>(null);
  const scrollSubRibbon = (direction: 'left' | 'right') => {
    if (subRibbonScrollRef.current) {
      const scrollAmount = direction === 'left' ? -260 : 260;
      subRibbonScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };
  const [voucherForm, setVoucherForm] = useState<{
    id?: string;
    voucherNumber: number;
    date: string;
    period: string;
    type: 'Ingreso' | 'Egreso' | 'Traspaso';
    gloss: string;
    status: 'Valido' | 'Anulado' | 'Descuadrado' | 'Pendiente';
    lines: VoucherLine[];
    createdFromRcvId?: string;
  } | null>(null);
  const [editingAnalysisLineIdx, setEditingAnalysisLineIdx] = useState<number | null>(null);
  const [voucherActionModal, setVoucherActionModal] = useState<{
    type: 'anular' | 'eliminar' | 'reactivar';
    voucher: Voucher;
    reason: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(`gest_ok_last_period_${company.id}`) || localStorage.getItem('gest_ok_last_open_period');
      if (saved && /^\d{4}-\d{2}$/.test(saved)) {
        const y = parseInt(saved.split('-')[0], 10);
        if (y <= 2026) return y;
      }
    } catch {}
    return 2026;
  });

  const [selectedRcvPeriod, setSelectedRcvPeriod] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`gest_ok_last_period_${company.id}`) || localStorage.getItem('gest_ok_last_open_period');
      if (saved && /^\d{4}-\d{2}$/.test(saved)) {
        const y = parseInt(saved.split('-')[0], 10);
        if (y <= 2026) return saved;
      }
    } catch {}
    return '2026-01';
  });

  // Persistir período seleccionado en almacenamiento local
  useEffect(() => {
    if (selectedRcvPeriod && /^\d{4}-\d{2}$/.test(selectedRcvPeriod)) {
      try {
        localStorage.setItem(`gest_ok_last_period_${company.id}`, selectedRcvPeriod);
        localStorage.setItem('gest_ok_last_open_period', selectedRcvPeriod);
      } catch {}
    }
  }, [selectedRcvPeriod, company.id]);

  // Helper para determinar automáticamente el mes abierto más adecuado para un año fiscal (nunca el mes que estamos viviendo por defecto)
  const getBestActiveMonthForYear = (year: number, currentFyList: FiscalPeriodYear[]): string => {
    const fy = currentFyList.find(f => f.id === String(year));

    if (fy && fy.months) {
      // 1. Buscar el mes abierto más reciente del año
      const openMonths = Object.entries(fy.months)
        .filter(([m, status]) => status === 'Abierto' && parseInt(m, 10) >= 1 && parseInt(m, 10) <= 12)
        .map(([m]) => parseInt(m, 10))
        .sort((a, b) => b - a);

      if (openMonths.length > 0) {
        return `${year}-${String(openMonths[0]).padStart(2, '0')}`;
      }
      // 2. Si no hay meses abiertos, retornar el último mes del año
      return `${year}-12`;
    }

    return `${year}-01`;
  };

  const [selectedRcvIds, setSelectedRcvIds] = useState<string[]>([]);
  const [rcvImportSummary, setRcvImportSummary] = useState<{ loaded: number; duplicates: number; newAuxiliaries: number } | null>(null);

  // Editing states
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [editingAuxiliary, setEditingAuxiliary] = useState<Auxiliary | null>(null);
  const [isAuxiliaryModalOpen, setIsAuxiliaryModalOpen] = useState<boolean>(false);
  const [editingRcvDoc, setEditingRcvDoc] = useState<RCVDocument | null>(null);
  const [accountSearchQuery, setAccountSearchQuery] = useState<string>('');

  // Custom attribute builder for dynamic accounts
  const [customAttrKey, setCustomAttrKey] = useState('');
  const [customAttrVal, setCustomAttrVal] = useState('');
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tempCustomAttrs, setTempCustomAttrs] = useState<{ [key: string]: any }>({});

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  const fetchData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const accSnap = await getDocs(collection(companyRef, 'chartOfAccounts'));
      const fetchedAccounts = accSnap.docs.map(d => ({ ...d.data(), id: d.id } as ChartOfAccount));
      fetchedAccounts.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      setAccounts(fetchedAccounts);

      const auxSnap = await getDocs(collection(companyRef, 'auxiliaries'));
      const rawAuxs = auxSnap.docs.map(d => ({ ...d.data(), id: d.id } as Auxiliary));

      // Auto-curación, normalización de esquema y Unificación de Auxiliares por RUT Único
      const rutMap = new Map<string, Auxiliary[]>();
      const nonRutAuxs: Auxiliary[] = [];

      rawAuxs.forEach(aux => {
        const cleanKey = (aux.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
        if (!cleanKey) {
          nonRutAuxs.push(aux);
          return;
        }
        if (!rutMap.has(cleanKey)) rutMap.set(cleanKey, []);
        rutMap.get(cleanKey)!.push(aux);
      });

      const cleanAuxiliaries: Auxiliary[] = [...nonRutAuxs];
      const clonesToDeleteIds: string[] = [];
      const primaryUpdates: { id: string; data: any }[] = [];

      rutMap.forEach((list) => {
        if (list.length === 1) {
          const item = list[0];
          // Verificar si le faltan campos estándar para normalizar el documento en Firestore
          const isMissingStandardFields = 
            item.email === undefined ||
            item.phone === undefined ||
            item.banco === undefined ||
            item.tipoCuenta === undefined ||
            item.numeroCuenta === undefined ||
            item.defaultDebtorAccountId === undefined ||
            item.defaultCreditorAccountId === undefined ||
            item.defaultExpenseOrIncomeAccountId === undefined ||
            item.defaultGloss === undefined ||
            item.defaultCostCenter === undefined ||
            item.defaultExpenseItem === undefined ||
            item.defaultProject === undefined ||
            item.defaultProduct === undefined ||
            item.defaultCustomAnalyses === undefined;

          if (isMissingStandardFields) {
            const normalizedPayload: any = {
              rut: item.rut || '',
              name: item.name || '',
              role: item.role || 'Deudor',
              estado: item.estado || 'Activo',
              email: item.email || '',
              phone: item.phone || '',
              banco: item.banco || '',
              tipoCuenta: item.tipoCuenta || '',
              numeroCuenta: item.numeroCuenta || '',
              defaultDebtorAccountId: item.defaultDebtorAccountId || '',
              defaultCreditorAccountId: item.defaultCreditorAccountId || '',
              defaultExpenseOrIncomeAccountId: item.defaultExpenseOrIncomeAccountId || '',
              defaultGloss: item.defaultGloss || '',
              defaultCostCenter: item.defaultCostCenter || '',
              defaultExpenseItem: item.defaultExpenseItem || '',
              defaultProject: item.defaultProject || '',
              defaultProduct: item.defaultProduct || '',
              defaultCustomAnalyses: item.defaultCustomAnalyses || {}
            };
            primaryUpdates.push({ id: item.id, data: normalizedPayload });
            cleanAuxiliaries.push({ ...item, ...normalizedPayload });
          } else {
            cleanAuxiliaries.push(item);
          }
          return;
        }

        // Ordenar registros para conservar el más completo / configurado
        const sorted = [...list].sort((a, b) => {
          const scoreA = (a.defaultCreditorAccountId ? 10 : 0) + 
                         (a.defaultDebtorAccountId ? 10 : 0) + 
                         (a.defaultExpenseOrIncomeAccountId ? 8 : 0) + 
                         (a.defaultGloss ? 6 : 0) + 
                         (a.defaultCostCenter ? 4 : 0) + 
                         (a.defaultExpenseItem ? 4 : 0) + 
                         (a.defaultProject ? 4 : 0) + 
                         (a.defaultProduct ? 4 : 0) + 
                         (a.defaultCustomAnalyses && Object.keys(a.defaultCustomAnalyses).length > 0 ? 6 : 0) + 
                         (a.email ? 3 : 0) + 
                         (a.phone ? 2 : 0) + 
                         (a.banco ? 3 : 0) + 
                         (a.numeroCuenta ? 3 : 0) +
                         (a.name && a.name.length > 5 ? 2 : 0);
          const scoreB = (b.defaultCreditorAccountId ? 10 : 0) + 
                         (b.defaultDebtorAccountId ? 10 : 0) + 
                         (b.defaultExpenseOrIncomeAccountId ? 8 : 0) + 
                         (b.defaultGloss ? 6 : 0) + 
                         (b.defaultCostCenter ? 4 : 0) + 
                         (b.defaultExpenseItem ? 4 : 0) + 
                         (b.defaultProject ? 4 : 0) + 
                         (b.defaultProduct ? 4 : 0) + 
                         (b.defaultCustomAnalyses && Object.keys(b.defaultCustomAnalyses).length > 0 ? 6 : 0) + 
                         (b.email ? 3 : 0) + 
                         (b.phone ? 2 : 0) + 
                         (b.banco ? 3 : 0) + 
                         (b.numeroCuenta ? 3 : 0) +
                         (b.name && b.name.length > 5 ? 2 : 0);
          return scoreB - scoreA;
        });

        const primary = { ...sorted[0] };
        const duplicates = sorted.slice(1);

        let changed = false;
        duplicates.forEach(d => {
          clonesToDeleteIds.push(d.id);
          if (!primary.name && d.name) { primary.name = d.name; changed = true; }
          if (!primary.email && d.email) { primary.email = d.email; changed = true; }
          if (!primary.phone && d.phone) { primary.phone = d.phone; changed = true; }
          if (!primary.banco && d.banco) { primary.banco = d.banco; changed = true; }
          if (!primary.numeroCuenta && d.numeroCuenta) {
            primary.numeroCuenta = d.numeroCuenta;
            primary.tipoCuenta = d.tipoCuenta || primary.tipoCuenta;
            changed = true;
          }
          if (!primary.defaultDebtorAccountId && d.defaultDebtorAccountId) {
            primary.defaultDebtorAccountId = d.defaultDebtorAccountId;
            changed = true;
          }
          if (!primary.defaultCreditorAccountId && d.defaultCreditorAccountId) {
            primary.defaultCreditorAccountId = d.defaultCreditorAccountId;
            changed = true;
          }
          if (!primary.defaultExpenseOrIncomeAccountId && d.defaultExpenseOrIncomeAccountId) {
            primary.defaultExpenseOrIncomeAccountId = d.defaultExpenseOrIncomeAccountId;
            changed = true;
          }
          if (!primary.defaultGloss && d.defaultGloss) {
            primary.defaultGloss = d.defaultGloss;
            changed = true;
          }
          if (!primary.defaultCostCenter && d.defaultCostCenter) {
            primary.defaultCostCenter = d.defaultCostCenter;
            changed = true;
          }
          if (!primary.defaultExpenseItem && d.defaultExpenseItem) {
            primary.defaultExpenseItem = d.defaultExpenseItem;
            changed = true;
          }
          if (!primary.defaultProject && d.defaultProject) {
            primary.defaultProject = d.defaultProject;
            changed = true;
          }
          if (!primary.defaultProduct && d.defaultProduct) {
            primary.defaultProduct = d.defaultProduct;
            changed = true;
          }
          if (d.defaultCustomAnalyses && Object.keys(d.defaultCustomAnalyses).length > 0) {
            primary.defaultCustomAnalyses = {
              ...(d.defaultCustomAnalyses || {}),
              ...(primary.defaultCustomAnalyses || {})
            };
            changed = true;
          }
          if ((primary.role === 'Deudor' && d.role === 'Acreedor') || (primary.role === 'Acreedor' && d.role === 'Deudor')) {
            primary.role = 'Ambos';
            changed = true;
          }
        });

        // Asegurar que primary tenga todos los campos requeridos
        const fullPrimaryPayload: any = {
          rut: primary.rut || '',
          name: primary.name || '',
          role: primary.role || 'Deudor',
          estado: primary.estado || 'Activo',
          email: primary.email || '',
          phone: primary.phone || '',
          banco: primary.banco || '',
          tipoCuenta: primary.tipoCuenta || '',
          numeroCuenta: primary.numeroCuenta || '',
          defaultDebtorAccountId: primary.defaultDebtorAccountId || '',
          defaultCreditorAccountId: primary.defaultCreditorAccountId || '',
          defaultExpenseOrIncomeAccountId: primary.defaultExpenseOrIncomeAccountId || '',
          defaultGloss: primary.defaultGloss || '',
          defaultCostCenter: primary.defaultCostCenter || '',
          defaultExpenseItem: primary.defaultExpenseItem || '',
          defaultProject: primary.defaultProject || '',
          defaultProduct: primary.defaultProduct || '',
          defaultCustomAnalyses: primary.defaultCustomAnalyses || {}
        };

        cleanAuxiliaries.push({ ...primary, ...fullPrimaryPayload });
        primaryUpdates.push({ id: primary.id, data: fullPrimaryPayload });
      });

      // Ordenar alfabéticamente por nombre / razón social
      cleanAuxiliaries.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setAuxiliaries(cleanAuxiliaries);

      // Limpieza permanente de clones y normalización de esquema en segundo plano en Firestore
      if (clonesToDeleteIds.length > 0 || primaryUpdates.length > 0) {
        (async () => {
          try {
            for (const upd of primaryUpdates) {
              await setDoc(doc(companyRef, 'auxiliaries', upd.id), upd.data, { merge: true });
            }
            for (const delId of clonesToDeleteIds) {
              await deleteDoc(doc(companyRef, 'auxiliaries', delId));
            }
          } catch (cleanErr) {
            console.warn("Deduplicación y normalización automática de auxiliares:", cleanErr);
          }
        })();
      }

      const exSnap = await getDocs(collection(companyRef, 'exchangeRates'));
      let fetchedRates = exSnap.docs.map(d => ({ ...d.data(), id: d.id } as ExchangeRate));
      fetchedRates.sort((a, b) => a.date.localeCompare(b.date));

      // Verificación de exactitud oficial: Si no hay registros o si los registros son de prueba/aleatorios (ej. UF 2026 fuera de rango)
      const hasBogusRates = fetchedRates.some(r => {
        if (r.date.startsWith('2026') && (r.uf < 39000 || r.uf > 45000 || r.utm < 69000)) return true;
        if (r.date.startsWith('2025') && (r.uf < 38000 || r.uf > 41000 || r.utm < 67000)) return true;
        if (r.date.startsWith('2024') && (r.uf < 36000 || r.uf > 39000 || r.utm < 64000)) return true;
        return false;
      });

      if (fetchedRates.length === 0 || hasBogusRates) {
        const officialSeries = generateOfficialChileanIndicators('2020-01-01');
        const mappedOfficial: ExchangeRate[] = officialSeries.map(item => ({
          id: item.date,
          date: item.date,
          uf: item.uf,
          dolar: item.dolar,
          utm: item.utm,
          euro: item.euro,
          yen: item.yen,
          ipc: item.ipc,
          ipcAcomulado: item.ipcAcomulado
        }));
        setExchangeRates(mappedOfficial);
      } else {
        setExchangeRates(fetchedRates);
      }

      // Sincronización en segundo plano con mindicador.cl para enriquecer datos en tiempo real
      setTimeout(async () => {
        try {
          const syncedList = await syncOnlineChileanIndicators();
          if (syncedList && syncedList.length > 0) {
            const mappedRates: ExchangeRate[] = syncedList.map(item => ({
              id: item.date,
              date: item.date,
              uf: item.uf,
              dolar: item.dolar,
              utm: item.utm,
              euro: item.euro,
              yen: item.yen,
              ipc: item.ipc,
              ipcAcomulado: item.ipcAcomulado
            }));
            setExchangeRates(mappedRates);
          }
        } catch (e) {
          console.info("Serie de indicadores oficiales cargada exitosamente.");
        }
      }, 100);

      const fySnap = await getDocs(collection(companyRef, 'fiscalPeriods'));
      const loadedFys = fySnap.docs.map(d => ({ ...d.data(), id: d.id } as FiscalPeriodYear));
      setFiscalYears(loadedFys);
      const latestOpenPeriod = getLatestOpenPeriod(loadedFys, 2024);
      if (latestOpenPeriod) {
        setSelectedRcvPeriod(latestOpenPeriod);
        const y = parseInt(latestOpenPeriod.split('-')[0], 10);
        if (y && y <= 2026) setSelectedYear(y);
      }

      const rcvSnap = await getDocs(collection(companyRef, 'rcvDocuments'));
      
      // Eliminación estricta y automática de cualquier documento de prueba / ficticio remanente
      const demoDocs = rcvSnap.docs.filter(d => {
        const data = d.data();
        return (
          d.id.startsWith('RCV_DEMO_') ||
          data.id?.startsWith('RCV_DEMO_') ||
          data.source === 'DEMO' ||
          (data.period === '2026-01' && ['96.800.570-7', '96.806.980-2', '96.792.430-K', '16.789.012-3'].includes(data.rutEmisor) && ['45892', '128904', '34091', '15'].includes(String(data.folio))) ||
          (data.period === '2026-01' && data.tipoRegistro === 'Venta' && String(data.folio) === '101' && data.montoTotal === 2915500)
        );
      });

      if (demoDocs.length > 0) {
        for (const demoDoc of demoDocs) {
          try {
            await deleteDoc(doc(companyRef, 'rcvDocuments', demoDoc.id));
          } catch (e) {
            console.warn("Error borrando documento demo:", e);
          }
        }
      }

      const cleanRcvDocs = rcvSnap.docs
        .filter(d => !demoDocs.some(dd => dd.id === d.id))
        .map(d => ({ ...d.data(), id: d.id } as RCVDocument));

      setRcvDocuments(cleanRcvDocs);

      const vouchSnap = await getDocs(collection(companyRef, 'vouchers'));
      const fetchedVouchers = vouchSnap.docs.map(d => ({ ...d.data(), id: d.id } as Voucher));
      fetchedVouchers.sort((a, b) => (b.voucherNumber || 0) - (a.voucherNumber || 0));
      setVouchers(fetchedVouchers);

      const bankRecSnap = await getDocs(collection(companyRef, 'bankReconciliations'));
      setBankReconciliations(bankRecSnap.docs.map(d => ({ ...d.data(), id: d.id } as BankReconciliation)));

      const ccSnap = await getDocs(collection(companyRef, 'costCenters'));
      setCostCenters(ccSnap.docs.map(d => ({ ...d.data(), id: d.id } as CostCenterMaster)));

      const expSnap = await getDocs(collection(companyRef, 'expenseItems'));
      setExpenseItems(expSnap.docs.map(d => ({ ...d.data(), id: d.id } as ExpenseItemMaster)));

      const nonSiiSnap = await getDocs(collection(companyRef, 'nonSiiDocTypes'));
      setNonSiiDocTypes(nonSiiSnap.docs.map(d => ({ ...d.data(), id: d.id } as NonSiiDocTypeMaster)));

      const projSnap = await getDocs(collection(companyRef, 'projects'));
      setProjects(projSnap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectMaster)));

      const prodSnap = await getDocs(collection(companyRef, 'products'));
      setProducts(prodSnap.docs.map(d => ({ ...d.data(), id: d.id } as ProductMaster)));

      const customItemsSnap = await getDocs(collection(companyRef, 'customAnalysisItems'));
      setCustomAnalysisItems(customItemsSnap.docs.map(d => ({ ...d.data(), id: d.id } as CustomAnalysisTableItem)));

      const rcvParamsSnap = await getDoc(doc(companyRef, 'config', 'rcvParams'));
      if (rcvParamsSnap.exists()) {
        setRcvParams(rcvParamsSnap.data() as RCVAccountingParams);
      }

      const commDocsSnap = await getDocs(collection(companyRef, 'commercialDocuments'));
      const fetchedCommDocs = commDocsSnap.docs.map(d => ({ ...d.data(), id: d.id } as CommercialDocument));
      fetchedCommDocs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setCommercialDocuments(fetchedCommDocs);

      const empSnap = await getDocs(collection(companyRef, 'employees'));
      setEmployees(empSnap.docs.map(d => ({ ...d.data(), id: d.id } as Employee)));

      const slipsSnap = await getDocs(collection(companyRef, 'payrollSlips'));
      let fetchedSlips = slipsSnap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollSlip));
      const cleanRut = (company.rut || '').replace(/[^0-9kK]/g, '');
      if (cleanRut === '777109294') {
        fetchedSlips = [];
      }
      setPayrollSlips(fetchedSlips);

      const invMovSnap = await getDocs(collection(companyRef, 'inventoryMovements'));
      const fetchedInvMov = invMovSnap.docs.map(d => ({ ...d.data(), id: d.id } as InventoryMovement));
      fetchedInvMov.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setInventoryMovements(fetchedInvMov);

    } catch (err: any) {
      console.error("Error fetching accounting data:", err);
      setFetchError(err.message || 'Error al conectar con la base de datos');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchData();

    // Suscripciones en tiempo real para reflejar inmediatamente cambios de cuentas, auxiliares, parámetros y comprobantes
    const unsubAccounts = onSnapshot(collection(companyRef, 'chartOfAccounts'), (accSnap) => {
      const fetchedAccounts = accSnap.docs.map(d => ({ ...d.data(), id: d.id } as ChartOfAccount));
      fetchedAccounts.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      setAccounts(fetchedAccounts);
    }, (err) => console.warn("Realtime listener error accounts:", err));

    const unsubAux = onSnapshot(collection(companyRef, 'auxiliaries'), (auxSnap) => {
      setAuxiliaries(auxSnap.docs.map(d => ({ ...d.data(), id: d.id } as Auxiliary)));
    }, (err) => console.warn("Realtime listener error auxiliaries:", err));

    const unsubVouchers = onSnapshot(collection(companyRef, 'vouchers'), (vouchSnap) => {
      const fetchedVouchers = vouchSnap.docs.map(d => ({ ...d.data(), id: d.id } as Voucher));
      fetchedVouchers.sort((a, b) => (b.voucherNumber || 0) - (a.voucherNumber || 0));
      setVouchers(fetchedVouchers);
    }, (err) => console.warn("Realtime listener error vouchers:", err));

    const unsubRcv = onSnapshot(collection(companyRef, 'rcvDocuments'), (rcvSnap) => {
      const cleanRcvDocs = rcvSnap.docs
        .filter(d => {
          const data = d.data();
          const isDemo = (
            d.id.startsWith('RCV_DEMO_') ||
            data.id?.startsWith('RCV_DEMO_') ||
            data.source === 'DEMO' ||
            (data.period === '2026-01' && ['96.800.570-7', '96.806.980-2', '96.792.430-K', '16.789.012-3'].includes(data.rutEmisor) && ['45892', '128904', '34091', '15'].includes(String(data.folio))) ||
            (data.period === '2026-01' && data.tipoRegistro === 'Venta' && String(data.folio) === '101' && data.montoTotal === 2915500)
          );
          return !isDemo;
        })
        .map(d => ({ ...d.data(), id: d.id } as RCVDocument));
      setRcvDocuments(cleanRcvDocs);
    }, (err) => console.warn("Realtime listener error rcv:", err));

    const unsubCC = onSnapshot(collection(companyRef, 'costCenters'), (snap) => {
      setCostCenters(snap.docs.map(d => ({ ...d.data(), id: d.id } as CostCenterMaster)));
    }, (err) => console.warn("Realtime listener error costCenters:", err));

    const unsubExp = onSnapshot(collection(companyRef, 'expenseItems'), (snap) => {
      setExpenseItems(snap.docs.map(d => ({ ...d.data(), id: d.id } as ExpenseItemMaster)));
    }, (err) => console.warn("Realtime listener error expenseItems:", err));

    const unsubNonSii = onSnapshot(collection(companyRef, 'nonSiiDocTypes'), (snap) => {
      setNonSiiDocTypes(snap.docs.map(d => ({ ...d.data(), id: d.id } as NonSiiDocTypeMaster)));
    }, (err) => console.warn("Realtime listener error nonSiiDocTypes:", err));

    const unsubProj = onSnapshot(collection(companyRef, 'projects'), (snap) => {
      setProjects(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProjectMaster)));
    }, (err) => console.warn("Realtime listener error projects:", err));

    const unsubProd = onSnapshot(collection(companyRef, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ ...d.data(), id: d.id } as ProductMaster)));
    }, (err) => console.warn("Realtime listener error products:", err));

    const unsubCustomItems = onSnapshot(collection(companyRef, 'customAnalysisItems'), (snap) => {
      setCustomAnalysisItems(snap.docs.map(d => ({ ...d.data(), id: d.id } as CustomAnalysisTableItem)));
    }, (err) => console.warn("Realtime listener error customAnalysisItems:", err));

    const unsubParams = onSnapshot(doc(companyRef, 'config', 'rcvParams'), (rcvParamsSnap) => {
      if (rcvParamsSnap.exists()) {
        setRcvParams(rcvParamsSnap.data() as RCVAccountingParams);
      }
    }, (err) => console.warn("Realtime listener error params:", err));

    const unsubEmp = onSnapshot(collection(companyRef, 'employees'), (snap) => {
      setEmployees(snap.docs.map(d => ({ ...d.data(), id: d.id } as Employee)));
    }, (err) => console.warn("Realtime listener error employees:", err));

    const unsubSlips = onSnapshot(collection(companyRef, 'payrollSlips'), (snap) => {
      let fetchedSlips = snap.docs.map(d => ({ ...d.data(), id: d.id } as PayrollSlip));
      const cleanRut = (company.rut || '').replace(/[^0-9kK]/g, '');
      if (cleanRut === '777109294') {
        fetchedSlips = [];
      }
      setPayrollSlips(fetchedSlips);
    }, (err) => console.warn("Realtime listener error payrollSlips:", err));

    const unsubFiscal = onSnapshot(collection(companyRef, 'fiscalPeriods'), (fySnap) => {
      setFiscalYears(fySnap.docs.map(d => ({ ...d.data(), id: d.id } as FiscalPeriodYear)));
    }, (err) => console.warn("Realtime listener error fiscal:", err));

    return () => {
      unsubAccounts();
      unsubAux();
      unsubVouchers();
      unsubRcv();
      unsubCC();
      unsubExp();
      unsubNonSii();
      unsubProj();
      unsubProd();
      unsubCustomItems();
      unsubParams();
      unsubFiscal();
      unsubEmp();
      unsubSlips();
    };
  }, [studyId, company.id]);

  // Sincronización automática del Mes Activo para que siempre apunte a un período abierto válido
  useEffect(() => {
    if (fiscalYears.length > 0) {
      const fy = fiscalYears.find(f => f.id === String(selectedYear));
      const currParts = selectedRcvPeriod.split('-');
      const currYear = parseInt(currParts[0], 10);
      const currMonth = parseInt(currParts[1], 10);

      // Si el mes seleccionado pertenece a otro año, o si está cerrado, auto-seleccionar el mejor mes abierto
      if (currYear !== selectedYear || (fy && fy.months && fy.months[currMonth] === 'Cerrado')) {
        const bestMonth = getBestActiveMonthForYear(selectedYear, fiscalYears);
        if (bestMonth !== selectedRcvPeriod) {
          setSelectedRcvPeriod(bestMonth);
        }
      }
    }
  }, [fiscalYears, selectedYear, selectedRcvPeriod]);

  const processImportBatch = async (batchDocs: Omit<RCVDocument, 'id'>[]) => {
    try {
      let loaded = 0;
      let duplicates = 0;
      let newAuxCount = 0;

      const currentAuxSnap = await getDocs(collection(companyRef, 'auxiliaries'));
      const currentAuxs = currentAuxSnap.docs.map(d => ({ id: d.id, ...d.data() } as Auxiliary));

      const currentRcvSnap = await getDocs(collection(companyRef, 'rcvDocuments'));
      const currentRcvs = currentRcvSnap.docs.map(d => ({ id: d.id, ...d.data() } as RCVDocument));

      for (const item of batchDocs) {
        const existingDoc = currentRcvs.find(
          ex => ex.rutEmisor === item.rutEmisor && ex.tipoDoc === item.tipoDoc && String(ex.folio) === String(item.folio)
        );

        if (existingDoc) {
          if (existingDoc.period !== item.period) {
            // Document existed under an old date-derived period; update it strictly to this RCV upload period!
            const docRef = doc(companyRef, 'rcvDocuments', existingDoc.id);
            await updateDoc(docRef, { period: item.period });
            loaded++;
          } else {
            duplicates++;
          }
          continue;
        }

        const cleanItemRut = (item.rutEmisor || '').replace(/[^0-9kK]/g, '').toUpperCase();
        let aux = currentAuxs.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanItemRut);
        if (!aux && cleanItemRut) {
          const newAuxData = {
            rut: item.rutEmisor,
            name: item.razonSocialEmisor,
            role: (item.tipoRegistro === 'Venta' ? 'Deudor' : 'Acreedor') as 'Deudor' | 'Acreedor',
            estado: 'Activo' as const,
            defaultDebtorAccountIds: [],
            defaultCreditorAccountIds: []
          };
          const auxRef = await addDoc(collection(companyRef, 'auxiliaries'), newAuxData);
          aux = { id: auxRef.id, ...newAuxData };
          currentAuxs.push(aux);
          newAuxCount++;
        }

        await addDoc(collection(companyRef, 'rcvDocuments'), {
          ...item,
          estadoContabilizado: false
        });
        loaded++;
      }

      setRcvImportSummary({ loaded, duplicates, newAuxiliaries: newAuxCount });
      fetchData();
    } catch (err: any) {
      console.error("Error importing RCV batch:", err);
      alert("Error al importar documentos RCV: " + err.message);
    }
  };

  // Helper to parse Chilean formatted numbers (with periods as thousands, commas as decimals, or negative signs)
  const parseChileanNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val).trim();
    if (!str) return 0;

    let isNegative = false;
    if (str.startsWith('-') || (str.startsWith('(') && str.endsWith(')'))) {
      isNegative = true;
    }

    const clean = str.replace(/[$ \t\(\)\-]/g, '').trim();
    if (!clean) return 0;

    let num = 0;
    if (clean.includes('.') && clean.includes(',')) {
      num = parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
    } else if (clean.includes('.') && !clean.includes(',')) {
      const parts = clean.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        num = parseFloat(clean.replace(/\./g, '')) || 0;
      } else {
        num = parseFloat(clean) || 0;
      }
    } else if (clean.includes(',')) {
      num = parseFloat(clean.replace(',', '.')) || 0;
    } else {
      num = parseFloat(clean) || 0;
    }

    return isNegative ? -Math.abs(num) : num;
  };

  // Helper to check if a specific period (YYYY-MM or from YYYY-MM-DD) is CERRADO with strict sequential cascade
  const checkIsPeriodClosed = (dateOrPeriod: string): { isClosed: boolean; periodStr: string; errorMsg: string } => {
    return checkIsPeriodClosedUtil(dateOrPeriod, fiscalYears);
  };

  // Format Chilean DTE Document Type with official SII Code & Description
  const formatChileanDteType = (codeOrName: string): string => {
    const clean = String(codeOrName || '').trim();
    switch (clean) {
      case '33': return '33 (Factura Electrónica)';
      case '34': return '34 (Factura Exenta Electrónica)';
      case '39': return '39 (Boleta Electrónica)';
      case '41': return '41 (Boleta Exenta Electrónica)';
      case '46': return '46 (Factura de Compra Electrónica)';
      case '43': return '43 (Liquidación Factura)';
      case '56': return '56 (Nota de Débito Electrónica)';
      case '61': return '61 (Nota de Crédito Electrónica)';
      case '30': return '30 (Factura Papel)';
      case '32': return '32 (Factura Exenta Papel)';
      case '35': return '35 (Boleta Papel)';
      case '48': return '48 (Comprobante Pago Electrónico)';
      case '110': return '110 (Factura de Exportación)';
      case '111': return '111 (Nota Débito Exportación)';
      case '112': return '112 (Nota Crédito Exportación)';
      case '914': return '914 (Declaración de Ingreso DIN)';
      case '9999': return '9999 (Documento OTRO / Interno)';
      case 'OTRO': return 'OTRO (Documento Interno - Código 9999)';
      default:
        if (clean.toUpperCase() === 'OTRO' || clean === '9999') return '9999 (Documento OTRO / Interno)';
        if (clean.toLowerCase().includes('factura elect')) return '33 (Factura Electrónica)';
        if (clean.toLowerCase().includes('factura exenta') || clean.toLowerCase().includes('no afecta')) return '34 (Factura Exenta)';
        if (clean.toLowerCase().includes('boleta elect')) return '39 (Boleta Electrónica)';
        if (clean.toLowerCase().includes('credito') || clean.toLowerCase().includes('crédito')) return '61 (Nota de Crédito)';
        if (clean.toLowerCase().includes('debito') || clean.toLowerCase().includes('débito')) return '56 (Nota de Débito)';
        return clean ? `${clean} (DTE)` : '33 (Factura)';
    }
  };

  // Helper to normalize Chilean date formats (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
  const normalizeChileanDate = (rawDate: string, defaultPeriod: string): { dateStr: string; periodStr: string } => {
    if (!rawDate || !rawDate.trim()) {
      return { dateStr: `${defaultPeriod}-15`, periodStr: defaultPeriod };
    }
    const clean = rawDate.trim().replace(/^["']|["']$/g, '');
    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return { dateStr: `${year}-${month}-${day}`, periodStr: `${year}-${month}` };
    }
    const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return { dateStr: `${year}-${month}-${day}`, periodStr: `${year}-${month}` };
    }
    return { dateStr: clean.length >= 10 ? clean.substring(0, 10) : `${defaultPeriod}-15`, periodStr: defaultPeriod };
  };

  // Parser for official SII CSV / TXT / Excel files with precise column mapping for Ventas, Compras and Honorarios
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, tipoRegistro: 'Compra' | 'Venta' | 'Honorarios') => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede importar ni modificar archivos RCV.');
      e.target.value = '';
      return;
    }

    // Validación estricta de período contable seleccionado
    const periodCheck = checkIsPeriodClosed(selectedRcvPeriod);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nPara importar documentos en este mes, debes abrir el período en el menú 'Configuraciones > Períodos Contables'.`);
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const isExcelFile = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.xlsm');
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        let tableRows: string[][] = [];

        if (isExcelFile) {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false, raw: false });
          tableRows = rawRows.map(r => (Array.isArray(r) ? r.map(c => String(c ?? '').trim()) : []));
        } else {
          const content = event.target?.result as string;
          if (!content) {
            alert('El archivo está vacío.');
            return;
          }
          // If binary XML/ZIP header is detected in text mode
          if (content.includes('[Content_Types].xml') || content.startsWith('PK\x03\x04')) {
            alert('El archivo seleccionado parece ser un Excel binario (.xlsx). Por favor súbelo como formato CSV/TXT exportado del SII o selecciona el archivo Excel (.xlsx) correctamente.');
            return;
          }
          const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length === 0) {
            alert('El archivo no contiene líneas de datos.');
            return;
          }

          // Detect best delimiter (; or \t or , or |)
          const candidates = [';', '\t', ',', '|'];
          let bestDelimiter = ';';
          let maxCount = -1;

          for (const cand of candidates) {
            let count = 0;
            for (let i = 0; i < Math.min(lines.length, 10); i++) {
              count += (lines[i].split(cand).length - 1);
            }
            if (count > maxCount) {
              maxCount = count;
              bestDelimiter = cand;
            }
          }

          tableRows = lines.map(l => l.split(bestDelimiter).map(c => c.trim().replace(/^["']|["']$/g, '')));
        }

        if (tableRows.length === 0) {
          alert('El archivo no contiene filas con datos legibles.');
          return;
        }

        // Detect period from introductory metadata rows (e.g. "Informe correspondiente al mes 03 del año 2026")
        let targetUploadPeriod = selectedRcvPeriod;
        for (let r = 0; r < Math.min(tableRows.length, 10); r++) {
          const rowText = tableRows[r].join(' ').toLowerCase();
          const mesAnoMatch = rowText.match(/(?:mes|periodo|per[ií]odo)\s*0?(\d{1,2})\s*(?:del\s*a[ñn]o|de|\/|-)\s*(\d{4})/i) ||
                              rowText.match(/(?:a[ñn]o|ejercicio)\s*(\d{4})\s*(?:mes|periodo|per[ií]odo)\s*0?(\d{1,2})/i);
          if (mesAnoMatch) {
            const m = mesAnoMatch[1].length === 4 ? mesAnoMatch[2] : mesAnoMatch[1];
            const y = mesAnoMatch[1].length === 4 ? mesAnoMatch[1] : mesAnoMatch[2];
            targetUploadPeriod = `${y}-${m.padStart(2, '0')}`;
            break;
          }
        }

        // Fallback: detect period from filename (e.g. file_informeMensualREC_202603.xlsx)
        if (targetUploadPeriod === selectedRcvPeriod) {
          const fnMatch = file.name.match(/_?(\d{4})(0[1-9]|1[0-2])/);
          if (fnMatch) {
            targetUploadPeriod = `${fnMatch[1]}-${fnMatch[2]}`;
          }
        }

        // Find header line with strict, prioritized recognition
        let headerRowIndex = -1;
        let headerMap: { [key: string]: number } = {};

        for (let i = 0; i < Math.min(tableRows.length, 25); i++) {
          const cols = tableRows[i].map(c => c.toLowerCase().trim().replace(/^["']|["']$/g, ''));
          
          let score = 0;
          const tempMap: { [key: string]: number } = {};

          cols.forEach((col, idx) => {
            // 1. Folio / N°
            if (
              col === 'n°' || col === 'no' || col === 'n' || col === 'folio' || col === 'folio docto' || col === 'nro' || col === 'nro docto' || col === 'nro documento' || col === 'numero' || col === 'número' ||
              (tempMap['folio'] === undefined && (col.includes('folio') || col.includes('número') || col.includes('numero') || col === 'n°' || col === 'num'))
            ) {
              tempMap['folio'] = idx;
              score += 3;
            }
            // 2. Fecha Emision / Fecha
            else if (
              (col === 'fecha' || col === 'fecha docto' || col === 'fecha doc' || col === 'fecha emision' || col === 'fecha emisión' || col === 'fecha documento') ||
              (tempMap['fecha'] === undefined && col.includes('fecha') && !col.includes('anul') && !col.includes('recep') && !col.includes('acuse') && !col.includes('reclamo') && !col.includes('venc'))
            ) {
              tempMap['fecha'] = idx;
              score += 2;
            }
            // 3. Estado (VIGENTE / NULA)
            else if (
              col === 'estado' || col === 'estado doc' || col === 'estado docto' || col === 'estado documento' ||
              (tempMap['estado'] === undefined && col.includes('estado'))
            ) {
              tempMap['estado'] = idx;
              score += 3;
            }
            // 4. Fecha Anulación
            else if (
              col === 'fecha anulación' || col === 'fecha anulacion' || col === 'fch anulación' || col === 'fch anulacion' ||
              (tempMap['fechaAnulacion'] === undefined && col.includes('anul'))
            ) {
              tempMap['fechaAnulacion'] = idx;
              score += 2;
            }
            // 5. RUT
            else if (
              (col === 'rut' || col === 'r.u.t' || col === 'r.u.t.' || col.includes('rut') || col.includes('identificador')) &&
              !col.includes('transportista') && !col.includes('chofer') && !col.includes('mandante')
            ) {
              if (tipoRegistro === 'Venta' && (col.includes('cliente') || col.includes('receptor') || col.includes('contraparte'))) {
                tempMap['rut'] = idx;
              } else if (tempMap['rut'] === undefined) {
                tempMap['rut'] = idx;
              }
              score += 3;
            }
            // 6. Razon Social / Nombre
            else if (
              col === 'nombre o razón social' || col === 'nombre o razon social' || col === 'razón social' || col === 'razon social' || col === 'nombre' || col.includes('razon') || col.includes('razón') || col.includes('nombre')
            ) {
              if (tipoRegistro === 'Venta' && (col.includes('cliente') || col.includes('receptor') || col.includes('contraparte'))) {
                tempMap['razon'] = idx;
              } else if (tempMap['razon'] === undefined && !col.includes('transportista') && !col.includes('chofer')) {
                tempMap['razon'] = idx;
              }
              score += 2;
            }
            // 7. Soc. Prof.
            else if (
              col === 'soc. prof.' || col === 'soc prof' || col.includes('soc')
            ) {
              tempMap['socProf'] = idx;
            }
            // 8. Brutos / Honorarios Brutos / Neto
            else if (
              col === 'brutos' || col === 'bruto' || col === 'monto bruto' || col === 'honorarios brutos' || col === 'monto neto' || col === 'neto' || col === 'monto_neto' || col === 'monto afecto' || col === 'afecto' ||
              (tempMap['neto'] === undefined && (col.includes('bruto') || col.includes('neto') || col.includes('afecto')) && !col.includes('activo fijo') && !col.includes('fijo') && !col.includes('costo'))
            ) {
              tempMap['neto'] = idx;
              tempMap['brutos'] = idx;
              score += 3;
            }
            // 9. Retenido / Retención / IVA
            else if (
              col === 'retenido' || col === 'retención' || col === 'retencion' || col === 'monto retenido' || col === 'monto iva' || col === 'monto iva recuperable' || col === 'iva' || col === 'iva debito' || col === 'iva débito' || col === 'monto_iva' || col === 'iva recuperable' ||
              (tempMap['iva'] === undefined && (col.includes('reten') || col.includes('iva') || col.includes('recuperable')) && !col.includes('no rec') && !col.includes('no recuperable') && !col.includes('no retenido') && !col.includes('tercero') && !col.includes('fijo') && !col.includes('comun') && !col.includes('común'))
            ) {
              tempMap['iva'] = idx;
              tempMap['retenido'] = idx;
              score += 3;
            }
            // 10. Pagado / Líquido / Total
            else if (
              col === 'pagado' || col === 'monto pagado' || col === 'líquido' || col === 'liquido' || col === 'monto líquido' || col === 'monto liquido' || col === 'monto total' || col === 'total' || col === 'monto_total' || col === 'total docto' || col === 'total documento' ||
              (tempMap['total'] === undefined && (col.includes('pagad') || col.includes('liquid') || col.includes('líquid') || col.includes('total')) && !col.includes('no facturable') && !col.includes('fijo'))
            ) {
              tempMap['total'] = idx;
              tempMap['pagado'] = idx;
              score += 3;
            }
            // 11. Monto Exento
            else if (
              col === 'monto exento' || col === 'exento' || col === 'monto_exento' || col === 'monto no gravado' || col === 'no gravado' ||
              (tempMap['exento'] === undefined && (col.includes('exento') || col.includes('no gravado') || col.includes('no afecto')) && !col.includes('fijo'))
            ) {
              tempMap['exento'] = idx;
              score += 2;
            }
            // 12. Tipo Doc
            else if (
              (col === 'tipo doc' || col === 'tipo docto' || col === 'tipo dte' || col === 'tipo documento' || col === 'tipo_doc' || col === 'tipodoc') ||
              (tempMap['tipoDoc'] === undefined && (col.includes('tipo') && (col.includes('doc') || col.includes('dte') || col.includes('dcto'))) && !col.includes('venta') && !col.includes('compra') && !col.includes('transaccion') && !col.includes('pago'))
            ) {
              tempMap['tipoDoc'] = idx;
              score += 3;
            }
          });

          if (score >= 5 || (tempMap['rut'] !== undefined && (tempMap['neto'] !== undefined || tempMap['brutos'] !== undefined || tempMap['total'] !== undefined || tempMap['pagado'] !== undefined))) {
            headerRowIndex = i;
            headerMap = tempMap;
            break;
          }
        }

        const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
        if (headerRowIndex === -1) {
          headerMap = { folio: 0, fecha: 1, estado: 2, fechaAnulacion: 3, rut: 4, razon: 5, brutos: 7, neto: 7, retenido: 8, iva: 8, pagado: 9, total: 9 };
        }

        const parsedDocs: Omit<RCVDocument, 'id'>[] = [];
        let readCount = 0;
        let nulasCount = 0;
        let detectedPeriod = targetUploadPeriod;

        for (let i = startIndex; i < tableRows.length; i++) {
          const cols = tableRows[i];
          if (!cols || cols.length === 0) continue;

          // 🛑 FIN DE TABLA: Detenerse justo en la línea de Totales
          const firstCell = (cols[0] || '').toLowerCase().trim();
          const fullRowText = cols.join(' ').toLowerCase().trim();
          if (
            firstCell.startsWith('totales') || 
            firstCell.startsWith('total') || 
            firstCell.startsWith('(*)') ||
            fullRowText.startsWith('totales') || 
            fullRowText.startsWith('total') || 
            fullRowText.includes('totales*') ||
            fullRowText.startsWith('(*) los valores')
          ) {
            // Se alcanzó la fila de totales: finalizar lectura inmediatamente
            break;
          }

          // Validar folio
          const rawFolio = (headerMap['folio'] !== undefined ? cols[headerMap['folio']] : cols[0]) || '';
          if (!rawFolio.trim()) {
            continue;
          }

          // 🛑 EXCLUSIÓN DE BOLETAS NULAS / ANULADAS:
          const estadoVal = (headerMap['estado'] !== undefined ? cols[headerMap['estado']] : '').toUpperCase().trim();
          const fechaAnulacionVal = (headerMap['fechaAnulacion'] !== undefined ? cols[headerMap['fechaAnulacion']] : '').trim();

          if (
            estadoVal.includes('NULA') || 
            estadoVal.includes('ANULAD') || 
            (headerMap['fechaAnulacion'] !== undefined && fechaAnulacionVal.length > 0 && fechaAnulacionVal !== '-')
          ) {
            nulasCount++;
            continue; // NO importar documentos nulos
          }

          readCount++;
          const rutEmisor = cols[headerMap['rut'] ?? 4] || (tipoRegistro === 'Venta' ? '77.777.777-7' : '66.666.666-6');
          const razonSocialEmisor = cols[headerMap['razon'] ?? 5] || (tipoRegistro === 'Venta' ? 'Cliente RCV' : tipoRegistro === 'Honorarios' ? 'Prestador Honorarios' : 'Proveedor SII');
          const rawTipoDoc = (headerMap['tipoDoc'] !== undefined ? cols[headerMap['tipoDoc']] : '') || (tipoRegistro === 'Honorarios' ? 'BHE' : '33');
          const folio = rawFolio.replace(/[^0-9]/g, '') || String(readCount);
          const rawFecha = (headerMap['fecha'] !== undefined ? cols[headerMap['fecha']] : cols[1]) || '';
          
          const { dateStr } = normalizeChileanDate(rawFecha, targetUploadPeriod);
          const periodStr = targetUploadPeriod;
          detectedPeriod = periodStr;

          // Normalize TipoDoc to standard Chilean DTE codes
          let tipoDoc = tipoRegistro === 'Honorarios' ? 'BHE' : '33';
          let nombreTipoDoc = tipoRegistro === 'Honorarios' ? 'Boleta de Honorarios Electrónica' : 'Factura Electrónica';
          const rawTipoLower = rawTipoDoc.toLowerCase().replace(/[^0-9a-z]/g, ' ');

          if (tipoRegistro === 'Honorarios' || rawTipoLower.includes('bhe') || rawTipoLower.includes('honorario')) {
            tipoDoc = 'BHE';
            nombreTipoDoc = 'Boleta de Honorarios Electrónica';
          } else if (rawTipoLower.includes('33') || rawTipoLower.includes('factura elect') || (rawTipoLower.includes('factura') && !rawTipoLower.includes('exent') && !rawTipoLower.includes('compra'))) {
            tipoDoc = '33';
            nombreTipoDoc = 'Factura Electrónica';
          } else if (rawTipoLower.includes('34') || rawTipoLower.includes('exent') || rawTipoLower.includes('no afect')) {
            tipoDoc = '34';
            nombreTipoDoc = 'Factura Exenta Electrónica';
          } else if (rawTipoLower.includes('39') || rawTipoLower.includes('boleta elect') || (rawTipoLower.includes('boleta') && !rawTipoLower.includes('exent'))) {
            tipoDoc = '39';
            nombreTipoDoc = 'Boleta Electrónica';
          } else if (rawTipoLower.includes('41') || rawTipoLower.includes('boleta exent')) {
            tipoDoc = '41';
            nombreTipoDoc = 'Boleta Exenta Electrónica';
          } else if (rawTipoLower.includes('61') || rawTipoLower.includes('credito') || rawTipoLower.includes('crédito')) {
            tipoDoc = '61';
            nombreTipoDoc = 'Nota de Crédito Electrónica';
          } else if (rawTipoLower.includes('56') || rawTipoLower.includes('debito') || rawTipoLower.includes('débito')) {
            tipoDoc = '56';
            nombreTipoDoc = 'Nota de Débito Electrónica';
          } else if (rawTipoLower.includes('46') || rawTipoLower.includes('factura de compra')) {
            tipoDoc = '46';
            nombreTipoDoc = 'Factura de Compra Electrónica';
          } else if (rawTipoLower.includes('43') || rawTipoLower.includes('liquidacion') || rawTipoLower.includes('liquidación')) {
            tipoDoc = '43';
            nombreTipoDoc = 'Liquidación Factura';
          } else if (rawTipoLower.includes('110') || rawTipoLower.includes('export')) {
            tipoDoc = '110';
            nombreTipoDoc = 'Factura de Exportación';
          } else {
            const digits = rawTipoDoc.replace(/[^0-9]/g, '');
            tipoDoc = digits || '33';
          }

          let montoNeto = parseChileanNumber(headerMap['brutos'] !== undefined ? cols[headerMap['brutos']] : (headerMap['neto'] !== undefined ? cols[headerMap['neto']] : cols[7]));
          let montoIva = parseChileanNumber(headerMap['retenido'] !== undefined ? cols[headerMap['retenido']] : (headerMap['iva'] !== undefined ? cols[headerMap['iva']] : cols[8]));
          let montoExento = parseChileanNumber(headerMap['exento'] !== undefined ? cols[headerMap['exento']] : 0);
          let montoTotal = parseChileanNumber(headerMap['pagado'] !== undefined ? cols[headerMap['pagado']] : (headerMap['total'] !== undefined ? cols[headerMap['total']] : cols[9]));

          let montoBruto = montoNeto;
          let montoRetencion = montoIva;
          let montoLiquido = montoTotal;

          // Mathematical DTE/BHE Consistency
          if (tipoRegistro === 'Honorarios' || tipoDoc === 'BHE') {
            tipoDoc = 'BHE';
            nombreTipoDoc = 'Boleta de Honorarios Electrónica';
            const yearNum = parseInt(periodStr.split('-')[0]) || 2026;
            const retentionRate = yearNum <= 2024 ? 0.1375 : yearNum === 2025 ? 0.145 : 0.1525;

            if (montoBruto > 0 && montoRetencion === 0 && montoLiquido === 0) {
              montoRetencion = Math.round(montoBruto * retentionRate);
              montoLiquido = montoBruto - montoRetencion;
            } else if (montoBruto > 0 && montoLiquido === 0) {
              montoLiquido = montoBruto - montoRetencion;
            } else if (montoLiquido > 0 && montoBruto === 0) {
              montoBruto = Math.round(montoLiquido / (1 - retentionRate));
              montoRetencion = montoBruto - montoLiquido;
            }

            montoNeto = montoBruto;
            montoIva = montoRetencion;
            montoTotal = montoLiquido;
            montoExento = 0;
          } else {
            const isAfecto = tipoDoc === '33' || tipoDoc === '30' || tipoDoc === '39' || tipoDoc === '35' || tipoDoc === '56' || tipoDoc === '61' || tipoDoc === '46';

            if (isAfecto) {
              if (montoNeto === 0 && montoIva === 0 && montoTotal > 0) {
                montoNeto = Math.round((montoTotal - montoExento) / 1.19);
                montoIva = (montoTotal - montoExento) - montoNeto;
              } else if (montoIva > 0 && montoNeto === 0) {
                montoNeto = Math.round(montoIva / 0.19);
                if (montoTotal === 0 || montoTotal === montoIva) {
                  montoTotal = montoNeto + montoIva + montoExento;
                }
              } else if (montoNeto > 0 && montoIva === 0) {
                montoIva = Math.round(montoNeto * 0.19);
                if (montoTotal === 0 || montoTotal === montoNeto) {
                  montoTotal = montoNeto + montoIva + montoExento;
                }
              } else if (montoTotal === 0 && (montoNeto > 0 || montoIva > 0 || montoExento > 0)) {
                montoTotal = montoNeto + montoIva + montoExento;
              }
            } else {
              montoIva = 0;
              if (montoExento === 0 && (montoTotal > 0 || montoNeto > 0)) {
                montoExento = montoTotal || montoNeto;
              }
              if (montoTotal === 0) {
                montoTotal = montoExento;
              }
            }
          }

          parsedDocs.push({
            tipoRegistro,
            period: periodStr,
            rutEmisor,
            razonSocialEmisor,
            tipoDoc,
            nombreTipoDoc,
            folio,
            fechaEmision: dateStr,
            montoNeto,
            montoIva,
            montoExento,
            montoTotal,
            montoBruto,
            montoRetencion,
            montoLiquido,
            estadoContabilizado: false
          });
        }

        if (parsedDocs.length === 0) {
          if (nulasCount > 0) {
            alert(`No se importaron documentos porque todas las boletas del archivo (${nulasCount}) se encuentran en estado NULA o ANULADA.`);
          } else {
            alert('No se encontraron registros válidos en el archivo. Por favor verifica que el archivo contenga las columnas estándar del SII.');
          }
          return;
        }

        // Process batch and save to Firestore
        let loaded = 0;
        let duplicates = 0;
        let newAuxCount = 0;

        const currentAuxSnap = await getDocs(collection(companyRef, 'auxiliaries'));
        const currentAuxs = currentAuxSnap.docs.map(d => ({ id: d.id, ...d.data() } as Auxiliary));

        const currentRcvSnap = await getDocs(collection(companyRef, 'rcvDocuments'));
        const currentRcvs = currentRcvSnap.docs.map(d => ({ id: d.id, ...d.data() } as RCVDocument));

        const userUid = auth.currentUser?.uid || 'import-rcv';
        const userEmail = auth.currentUser?.email || '';
        const nowIso = new Date().toISOString();

        for (const item of parsedDocs) {
          const cleanItemRut = (item.rutEmisor || '').replace(/[^0-9kK]/g, '').toUpperCase();
          const isDuplicate = currentRcvs.some(
            ex => (ex.rutEmisor || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanItemRut && 
                  String(ex.tipoDoc).trim().toUpperCase() === String(item.tipoDoc).trim().toUpperCase() && 
                  String(ex.folio).trim() === String(item.folio).trim() &&
                  ex.period === item.period
          );

          if (isDuplicate) {
            duplicates++;
            continue;
          }

          let aux = currentAuxs.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanItemRut);
          const isCandidateValidRut = cleanItemRut.length >= 7 && cleanItemRut.length <= 10 && 
            !/^(TOTAL|TOTALES|FECHA|ESTADO|RUT|BRUTO|NETO|IVA|PAGADO|RETENCION|SOC)/i.test((item.rutEmisor || '').trim()) &&
            !/\d{4}-\d{2}-\d{2}/.test((item.rutEmisor || '').trim()) &&
            !/\d{2}\/\d{2}\/\d{4}/.test((item.rutEmisor || '').trim());

          if (!aux && cleanItemRut && isCandidateValidRut) {
            const newAuxData = {
              rut: item.rutEmisor,
              name: item.razonSocialEmisor,
              role: (tipoRegistro === 'Venta' ? 'Deudor' : 'Acreedor') as 'Deudor' | 'Acreedor',
              estado: 'Activo' as const,
              defaultDebtorAccountIds: [],
              defaultCreditorAccountIds: [],
              createdBy: userUid,
              createdByUserEmail: userEmail,
              creationMode: 'IMPORTACION_RCV' as const,
              createdAt: nowIso,
              lastModifiedBy: userUid,
              lastModifiedAt: nowIso
            };
            const auxRef = await addDoc(collection(companyRef, 'auxiliaries'), newAuxData);
            aux = { id: auxRef.id, ...newAuxData };
            currentAuxs.push(aux);
            newAuxCount++;
          }

          const rcvDocWithAudit = {
            ...item,
            createdBy: userUid,
            createdByUserEmail: userEmail,
            creationMode: 'IMPORTACION_RCV' as const,
            createdAt: nowIso,
            lastModifiedBy: userUid,
            lastModifiedAt: nowIso
          };

          await addDoc(collection(companyRef, 'rcvDocuments'), rcvDocWithAudit);
          loaded++;
        }

        // Audit Logging
        logAuditEvent({
          userId: userUid,
          userEmail: userEmail,
          studyId,
          companyId: company.id,
          action: 'IMPORTACION_MASIVA',
          module: tipoRegistro === 'Venta' ? 'RCV_VENTAS' : tipoRegistro === 'Honorarios' ? 'RCV_HONORARIOS' : 'RCV_COMPRAS',
          details: `Importación RCV ${tipoRegistro} (${loaded} vigentes guardados, ${nulasCount} nulos excluidos, período ${detectedPeriod}) en ${company.name}`,
          metadata: {
            tipoRegistro,
            periodo: detectedPeriod,
            documentosLeidos: readCount,
            documentosCargados: loaded,
            boletasNulasExcluidas: nulasCount,
            duplicados: duplicates,
            nuevosAuxiliares: newAuxCount
          }
        });

        setRcvImportSummary({
          read: readCount,
          loaded,
          duplicates,
          newAuxiliaries: newAuxCount
        } as any);

        const summaryMsg = `¡Importación de ${tipoRegistro === 'Honorarios' ? 'Honorarios (BHE)' : tipoRegistro === 'Venta' ? 'Ventas' : 'Compras'} completada con éxito!\n\n` +
          `• Documentos vigentes importados: ${loaded}\n` +
          (nulasCount > 0 ? `• Boletas NULAS / ANULADAS excluidas: ${nulasCount}\n` : '') +
          (duplicates > 0 ? `• Documentos duplicados omitidos: ${duplicates}\n` : '') +
          `• Nuevos auxiliares creados: ${newAuxCount}\n` +
          `• Período fiscal asignado: ${detectedPeriod}`;

        alert(summaryMsg);

        if (detectedPeriod !== selectedRcvPeriod) {
          setSelectedRcvPeriod(detectedPeriod);
        }

        await fetchData();
        e.target.value = '';
      } catch (err: any) {
        console.error("Error parsing file:", err);
        alert('Error al procesar archivo: ' + err.message);
      }
    };

    if (isExcelFile) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'ISO-8859-1');
    }
  };

  // Eliminar cualquier documento de prueba / ficticio remanente de la base de datos
  const handlePurgeAllDemoDocs = async () => {
    try {
      setIsRescatandoRcvApi(true);
      const rcvSnap = await getDocs(collection(companyRef, 'rcvDocuments'));
      const demoDocs = rcvSnap.docs.filter(d => {
        const data = d.data();
        return (
          d.id.startsWith('RCV_DEMO_') ||
          data.id?.startsWith('RCV_DEMO_') ||
          data.source === 'DEMO' ||
          (data.period === '2026-01' && ['96.800.570-7', '96.806.980-2', '96.792.430-K', '16.789.012-3'].includes(data.rutEmisor) && ['45892', '128904', '34091', '15'].includes(String(data.folio))) ||
          (data.period === '2026-01' && data.tipoRegistro === 'Venta' && String(data.folio) === '101' && data.montoTotal === 2915500)
        );
      });

      for (const d of demoDocs) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', d.id));
      }

      await fetchData();
      alert(`🧹 Base de datos depurada:\n\nSe eliminaron exitosamente ${demoDocs.length} registros ficticios/de prueba. Ahora la empresa cuenta únicamente con registros 100% reales.`);
    } catch (err: any) {
      console.error("Error purgando datos demo:", err);
      alert('Error al depurar documentos: ' + err.message);
    } finally {
      setIsRescatandoRcvApi(false);
    }
  };

  // Direct API sync for RCV Compras, Ventas and Honorarios from Facturador SII
  const handleRescatarRcvApi = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede ejecutar acciones de rescate.');
      return;
    }

    if (!selectedRcvPeriod) {
      alert('Por favor selecciona un período (Año-Mes) para rescatar el RCV y las Boletas de Honorarios.');
      return;
    }

    const periodCheck = checkIsPeriodClosed(selectedRcvPeriod);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nPara rescatar e importar documentos en este mes, debes abrir el período en 'Configuraciones > Períodos Contables'.`);
      return;
    }

    const [yearStr, monthStr] = selectedRcvPeriod.split('-');

    setIsRescatandoRcvApi(true);
    try {
      const dteConfig: Partial<DTEConfig> = company.dteConfig || {};
      const repRut = company.legalRepRut || dteConfig.rutRepresentante || '';
      const repClave = dteConfig.claveRepLegalSii || '';
      const certClave = dteConfig.claveCertificadoDigital || '';
      const certB64 = dteConfig.certificadoB64 || '';
      const apiKey = dteConfig.siiApiKey || '';

      // Verificar que cuente con certificado digital o clave del SII
      if (!certB64 && !repClave) {
        alert(
          `⚠️ Credenciales Requeridas para Consulta SII:\n\n` +
          `Para consultar automáticamente el Registro de Compras, Ventas y Honorarios del SII, la empresa debe tener ingresado su Certificado Digital (.pfx) o la Clave del SII del Representante Legal.\n\n` +
          `También puede importar directamente los archivos oficiales CSV/TXT mediante el botón "Cargar CSV/TXT Manual".`
        );
        setIsRescatandoRcvApi(false);
        return;
      }

      const data = await fetchRcvFromSii({
        companyRut: company.rut,
        companyName: company.name,
        year: parseInt(yearStr, 10),
        month: monthStr,
        tipo: 'ALL',
        rutRepresentante: repRut,
        claveRepresentante: repClave,
        claveCertificadoDigital: certClave,
        certificadoB64: certB64,
        apiKey: apiKey,
        provider: 'SIMPLE_API',
        ambiente: dteConfig.ambiente || 'Producción'
      });

      if (!data.success) {
        if (data.needsCertificate) {
          alert(`⚠️ Certificado Digital Requerido para Sincronización Automática:\n\n${data.error}\n\nPara consultar automáticamente vía API del SII, la empresa debe tener configurado su Certificado Digital (.pfx).\n\nAlternativamente, puede cargar directamente los archivos oficiales descargados del portal del SII usando el botón "📥 Cargar CSV/TXT Manual".`);
          return;
        }
        alert(`❌ Error al conectar con la API del Facturador SII:\n\n${data.error || 'No se pudo completar el rescate desde la API.'}`);
        return;
      }

      const fetchedDocs = data.documents || [];
      if (fetchedDocs.length === 0) {
        alert(data.message || `ℹ️ Solicitud enviada a la API del SII con éxito para el período ${selectedRcvPeriod}.\n\nNo se encontraron nuevos documentos de Compras, Ventas u Honorarios en dicho período.`);
        return;
      }

      // Read current RCV docs from Firestore to prevent duplicates
      const currentRcvSnap = await getDocs(collection(companyRef, 'rcvDocuments'));
      const existingKeys = new Set(
        currentRcvSnap.docs.map(d => {
          const docData = d.data();
          return `${(docData.rutEmisor || '').trim().toLowerCase()}_${String(docData.tipoDocumento || docData.tipoDoc).trim()}_${String(docData.folio).trim()}`;
        })
      );

      // Read current Auxiliaries to auto-register new suppliers and customers
      const currentAuxSnap = await getDocs(collection(companyRef, 'auxiliaries'));
      const currentAuxs = currentAuxSnap.docs.map(d => ({ id: d.id, ...d.data() } as Auxiliary));

      let loadedCount = 0;
      let duplicateCount = 0;
      let newAuxCount = 0;

      const userUid = auth.currentUser?.uid || 'import-api-sii';
      const userEmail = auth.currentUser?.email || '';
      const nowIso = new Date().toISOString();
      const cleanCompRut = (company.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();

      for (const item of fetchedDocs) {
        const itemRut = (item.rutEmisor || item.rut || '11.111.111-1').trim();
        const itemTipoDoc = String(item.tipoDocumento || item.tipoDoc || '33').trim();
        const itemFolio = String(item.folio || '0').trim();

        const key = `${itemRut.toLowerCase()}_${itemTipoDoc}_${itemFolio}`;
        if (existingKeys.has(key)) {
          duplicateCount++;
          continue;
        }

        const docPeriod = item.period || selectedRcvPeriod;
        const tipoReg = item.tipoRegistro || (['33', '34', '52', '56'].includes(itemTipoDoc) ? 'Compra' : ['BH', 'BHR'].includes(itemTipoDoc) ? 'Honorarios' : 'Venta');
        
        // --- AUTO-REGISTRO DE NUEVOS AUXILIARES (PROVEEDORES / CLIENTES / PRESTADORES) ---
        let targetRut = '';
        let targetName = '';
        let targetRole: 'Deudor' | 'Acreedor' = 'Acreedor';

        if (tipoReg === 'Compra' || tipoReg === 'Honorarios' || tipoReg === 'Honorario') {
          targetRut = (item.rutEmisor || item.rut || '').trim();
          targetName = (item.razonSocialEmisor || item.razonSocial || item.nombrePrestador || '').trim();
          targetRole = 'Acreedor';
        } else if (tipoReg === 'Venta') {
          targetRut = (item.rutReceptor || item.rutCliente || '').trim();
          targetName = (item.razonSocialReceptor || item.razonSocial || item.razonSocialCliente || '').trim();
          targetRole = 'Deudor';
        }

        const cleanTargetRut = targetRut.replace(/[^0-9kK]/g, '').toUpperCase();
        const isGenericRut = ['666666666', '111111111', '555555555', '777777777', '888888888', '999999999'].includes(cleanTargetRut);

        if (cleanTargetRut && cleanTargetRut.length >= 7 && cleanTargetRut !== cleanCompRut && !isGenericRut) {
          const existingAux = currentAuxs.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanTargetRut);
          if (!existingAux) {
            const newAuxData: Omit<Auxiliary, 'id'> = {
              rut: targetRut,
              name: targetName || (targetRole === 'Deudor' ? 'CLIENTE DTE' : 'PROVEEDOR DTE'),
              role: targetRole,
              estado: 'Activo',
              defaultDebtorAccountIds: [],
              defaultCreditorAccountIds: [],
              createdBy: userUid,
              createdByUserEmail: userEmail,
              creationMode: 'IMPORTACION_RCV',
              createdAt: nowIso,
              lastModifiedBy: userUid,
              lastModifiedAt: nowIso
            };
            const auxRef = await addDoc(collection(companyRef, 'auxiliaries'), newAuxData);
            currentAuxs.push({ id: auxRef.id, ...newAuxData });
            newAuxCount++;
          } else if (existingAux.role !== targetRole && existingAux.role !== 'Ambos') {
            await setDoc(doc(companyRef, 'auxiliaries', existingAux.id), {
              role: 'Ambos',
              lastModifiedBy: userUid,
              lastModifiedAt: nowIso
            }, { merge: true });
            existingAux.role = 'Ambos';
          }
        }

        const cleanRcv: RCVDocument = {
          id: `RCV_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          period: docPeriod,
          tipoRegistro: tipoReg,
          tipoDocumento: itemTipoDoc,
          tipoDoc: itemTipoDoc,
          nombreTipoDoc: item.nombreTipoDoc || (itemTipoDoc === '33' ? 'Factura Electrónica' : itemTipoDoc === '34' ? 'Factura Exenta' : itemTipoDoc === '39' ? 'Boleta Electrónica' : itemTipoDoc === '61' ? 'Nota de Crédito' : 'Documento DTE'),
          folio: itemFolio,
          rutEmisor: itemRut,
          razonSocialEmisor: item.razonSocialEmisor || item.razonSocial || 'EMISOR DTE',
          rutReceptor: item.rutReceptor || company.rut,
          razonSocialReceptor: item.razonSocialReceptor || company.name,
          fechaEmision: item.fechaEmision || `${docPeriod}-01`,
          montoNeto: Number(item.montoNeto) || 0,
          montoIva: Number(item.montoIva) || 0,
          montoExento: Number(item.montoExento) || 0,
          montoTotal: Number(item.montoTotal) || 0,
          estado: 'Vigente',
          estadoContabilizado: false,
          createdBy: userUid,
          createdByUserEmail: userEmail,
          creationMode: 'IMPORTACION_RCV' as const,
          createdAt: nowIso,
          lastModifiedBy: userUid,
          lastModifiedAt: nowIso,
          source: 'SII_API'
        };

        await addDoc(collection(companyRef, 'rcvDocuments'), cleanRcv);
        existingKeys.add(key);
        loadedCount++;
      }

      await fetchData();

      alert(
        `✅ ¡Rescate RCV vía API SII Exitoso!\n\n` +
        `• Período rescatado: ${selectedRcvPeriod}\n` +
        `• Nuevos documentos guardados en Firestore: ${loadedCount}\n` +
        `• Nuevos auxiliares (Proveedores/Clientes) creados en el Maestro: ${newAuxCount}\n` +
        `• Duplicados ya existentes omitidos: ${duplicateCount}\n` +
        (data.message ? `\nDetalle: ${data.message}\n` : '') +
        `\n• Conexión: ${data.source || 'SimpleAPI.cl'}`
      );

    } catch (err: any) {
      console.error('Error al rescatar RCV vía API:', err);
      alert(`❌ Ocurrió un error al intentar rescatar datos desde la API SII: ${err.message || String(err)}`);
    } finally {
      setIsRescatandoRcvApi(false);
    }
  };

  // Helper to resolve an account object by ID, code, fallback keywords, or fallback type
  const resolveAccountDetails = (
    accountId?: string,
    fallbackKeywords: string[] = [],
    fallbackType?: string,
    defaultCode = '9.9.99',
    defaultName = 'Cuenta por Asignar'
  ): { id: string; code: string; name: string } => {
    if (accountId && accountId.trim()) {
      const cleanAcc = accountId.trim();
      const normAcc = cleanAcc.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const found = accounts.find(
        a => a.id === cleanAcc || 
             a.code === cleanAcc || 
             a.code.toLowerCase() === cleanAcc.toLowerCase() || 
             a.code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normAcc
      );
      if (found) return { id: found.id, code: found.code, name: found.name };
    }

    // Try keyword match in code or name
    for (const kw of fallbackKeywords) {
      const lowerKw = kw.toLowerCase();
      const match = accounts.find(
        a => a.code.toLowerCase().includes(lowerKw) || a.name.toLowerCase().includes(lowerKw)
      );
      if (match) return { id: match.id, code: match.code, name: match.name };
    }

    // Try type match
    if (fallbackType) {
      const matchType = accounts.find(a => a.type === fallbackType);
      if (matchType) return { id: matchType.id, code: matchType.code, name: matchType.name };
    }

    // If accounts list is not empty, pick first as ultimate fallback
    if (accounts.length > 0) {
      return { id: accounts[0].id, code: accounts[0].code, name: accounts[0].name };
    }

    return { id: 'default', code: defaultCode, name: defaultName };
  };

  // Helper to build a complete double-entry voucher from an RCVDocument
  const buildVoucherForRcvDocument = (
    docItem: RCVDocument,
    voucherNumber: number
  ): Omit<Voucher, 'id'> => {
    const partyRutToSearch = (docItem.tipoRegistro === 'Venta' 
      ? (docItem.rutReceptor || docItem.rutEmisor || '') 
      : (docItem.rutEmisor || docItem.rutReceptor || '')
    ).toLowerCase().replace(/[^0-9k]/g, '');

    const aux = auxiliaries.find(
      a => (a.rut || '').toLowerCase().replace(/[^0-9k]/g, '') === partyRutToSearch
    );

    const lines: VoucherLine[] = [];
    const docRefStr = `${docItem.tipoDoc} #${docItem.folio}`;

    const makeLine = (
      accObj: { id: string; code: string; name: string },
      debit: number,
      credit: number,
      gloss: string,
      rut?: string,
      razonSocial?: string,
      docRef?: string
    ): VoucherLine => {
      const realAcc = accounts.find(a => a.id === accObj.id || a.code === accObj.code);
      const isClientOrSupplierCode = accObj.code.startsWith('1.1.02') || accObj.code.startsWith('2.1.01') || accObj.code.startsWith('2.1.04');
      const requiresRut = realAcc ? Boolean(realAcc.requiereAuxiliarRUT || isClientOrSupplierCode) : isClientOrSupplierCode;
      const requiresDoc = realAcc ? Boolean(realAcc.requiereDocumento || isClientOrSupplierCode) : isClientOrSupplierCode;
      const requiresCC = realAcc ? Boolean(realAcc.requiereCentroCosto) : false;
      const requiresItem = realAcc ? Boolean(realAcc.requiereItemGasto) : false;
      const requiresProj = realAcc ? Boolean(realAcc.requiereProyecto) : false;
      const requiresProd = realAcc ? Boolean(realAcc.requiereProducto) : false;
      const requiresDue = realAcc ? Boolean(realAcc.requiereVencimiento) : false;

      // Fecha de Vencimiento: Si la cuenta exige vencimiento, se utiliza fechaVencimiento o por defecto 30 días desde la emisión
      let dueDate: string | undefined = undefined;
      if (requiresDue) {
        if (docItem.fechaVencimiento) {
          dueDate = docItem.fechaVencimiento;
        } else if (docItem.fechaEmision) {
          try {
            const parts = docItem.fechaEmision.split('-');
            if (parts.length === 3) {
              const y = parseInt(parts[0], 10);
              const m = parseInt(parts[1], 10) - 1;
              const d = parseInt(parts[2], 10);
              const dt = new Date(y, m, d);
              dt.setDate(dt.getDate() + 30);
              const resY = dt.getFullYear();
              const resM = String(dt.getMonth() + 1).padStart(2, '0');
              const resD = String(dt.getDate()).padStart(2, '0');
              dueDate = `${resY}-${resM}-${resD}`;
            }
          } catch {
            // fallback
          }
        }
      }

      // Obtener campos de análisis por defecto con jerarquía: 1. Doc Override -> 2. Ficha Auxiliar -> 3. Parámetros Generales RCV
      const costCenter = requiresCC ? ((docItem as any).costCenter || aux?.defaultCostCenter || rcvParams?.defaultCostCenter || undefined) : undefined;
      const expenseItem = requiresItem ? ((docItem as any).expenseItem || aux?.defaultExpenseItem || rcvParams?.defaultExpenseItem || undefined) : undefined;
      const project = requiresProj ? ((docItem as any).project || aux?.defaultProject || rcvParams?.defaultProject || undefined) : undefined;
      const product = requiresProd ? ((docItem as any).product || aux?.defaultProduct || rcvParams?.defaultProduct || undefined) : undefined;

      let customAnalyses: Record<string, string> | undefined = undefined;
      const rawCustom = (docItem as any).customAnalyses || aux?.defaultCustomAnalyses || rcvParams?.defaultCustomAnalyses || undefined;
      if (rawCustom && typeof rawCustom === 'object') {
        const filteredCustom: Record<string, string> = {};
        let hasKeys = false;
        Object.entries(rawCustom).forEach(([key, val]) => {
          if (val && realAcc && isCustomAnalysisRequired(realAcc, key)) {
            filteredCustom[key] = String(val);
            hasKeys = true;
          }
        });
        if (hasKeys) customAnalyses = filteredCustom;
      }

      return {
        accountId: accObj.id,
        accountCode: accObj.code,
        accountName: accObj.name,
        debit,
        credit,
        ...(requiresRut && rut ? { auxiliaryRut: rut, auxiliaryName: razonSocial } : {}),
        ...(requiresDoc && docRef ? { documentRef: docRef } : {}),
        ...(dueDate ? { dueDate } : {}),
        ...(costCenter ? { costCenter } : {}),
        ...(expenseItem ? { expenseItem } : {}),
        ...(project ? { project } : {}),
        ...(product ? { product } : {}),
        ...(customAnalyses ? { customAnalyses } : {}),
        gloss
      };
    };

    if (docItem.tipoRegistro === 'Compra') {
      // 1. Gasto / Costo -> PRIORIDAD: 1. Doc Override -> 2. Ficha Auxiliar (Proveedor) -> 3. Config General RCV
      const expenseAcc = resolveAccountDetails(
        docItem.cuentaGastoId || aux?.defaultExpenseOrIncomeAccountId || rcvParams?.defaultCostOrExpenseAccountId,
        ['4202002', '4202', '4.2.02', '4102', '4201', '4101', 'gasto', 'costo', 'compra'],
        'Gasto',
        '4202002',
        'Gastos Generales y de Administración'
      );

      // 2. IVA Crédito Fiscal
      const ivaAcc = resolveAccountDetails(
        rcvParams?.ivaCreditoAccountId,
        ['1106001', '1.1.03', 'crédito', 'credito', 'iva'],
        'Activo',
        '1106001',
        'IVA Crédito Fiscal'
      );

      // 3. Proveedor por Pagar -> PRIORIDAD: 1. Doc Override -> 2. Ficha Auxiliar (Acreedor) -> 3. Config General RCV
      const supplierAcc = resolveAccountDetails(
        docItem.cuentaContrapartidaId || aux?.defaultCreditorAccountId || rcvParams?.defaultSupplierAccountId,
        ['2102001', '2.1.01.001', '2.1.01', 'proveedor'],
        'Pasivo',
        '2102001',
        'Proveedores Nacionales'
      );

      // 4. Exento
      const exentoAcc = resolveAccountDetails(
        rcvParams?.exentoAccountId,
        ['4202002', '4202', 'exento', 'no gravado', 'no afecto'],
        'Gasto',
        '4202002',
        'Gastos Exentos / No Gravados'
      );

      // 5. Impuestos Adicionales / ILA
      const otrosImpuestosAcc = resolveAccountDetails(
        rcvParams?.otrosImpuestosAccountId,
        ['impuesto adicional', 'adicional', 'ila', 'otros impuestos', '4202002'],
        'Gasto',
        '4202002',
        'Impuestos Adicionales / ILA'
      );

      const totalAmount = Number(docItem.montoTotal) || 0;
      const netoAmount = Number(docItem.montoNeto) || (docItem.montoIva === 0 && docItem.montoExento === 0 ? totalAmount : 0);
      const ivaAmount = Number(docItem.montoIva) || 0;
      const exentoAmount = Number(docItem.montoExento) || 0;

      const explicitOtros = Number(docItem.montoOtrosImpuestos) || 0;
      const calculatedOtros = totalAmount - (netoAmount + ivaAmount + exentoAmount);
      const otrosImpuestosAmount = explicitOtros > 0 ? explicitOtros : (calculatedOtros > 0 ? calculatedOtros : 0);

      const hasConfiguredOtrosAcc = Boolean(rcvParams?.otrosImpuestosAccountId && accounts.some(a => a.id === rcvParams.otrosImpuestosAccountId));
      const finalNetoDebit = hasConfiguredOtrosAcc ? netoAmount : (netoAmount + otrosImpuestosAmount);

      const isNotaCredito = docItem.tipoDoc === '61' || String(docItem.tipoDoc).includes('61');

      if (isNotaCredito) {
        // En Nota de Crédito de Compras: Proveedor al Debe, Gasto e IVA al Haber
        lines.push(makeLine(supplierAcc, totalAmount, 0, `NC Proveedor ${docRefStr} - ${docItem.razonSocialEmisor}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));

        if (finalNetoDebit > 0) {
          lines.push(makeLine(expenseAcc, 0, finalNetoDebit, `Reverso Gasto ${docRefStr} - ${docItem.razonSocialEmisor}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
        }

        if (hasConfiguredOtrosAcc && otrosImpuestosAmount > 0) {
          lines.push(makeLine(otrosImpuestosAcc, 0, otrosImpuestosAmount, `Reverso Impuestos Adicionales ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
        }

        if (ivaAmount > 0) {
          lines.push(makeLine(ivaAcc, 0, ivaAmount, `Reverso IVA Crédito ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
        }

        if (exentoAmount > 0) {
          lines.push(makeLine(exentoAcc, 0, exentoAmount, `Reverso Exento ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
        }
      } else {
        // Facturas y documentos regulares de Compra
        if (finalNetoDebit > 0) {
          const baseGastoGloss = otrosImpuestosAmount > 0 && !hasConfiguredOtrosAcc 
            ? `Gasto e Impuestos Adicionales ${docRefStr} - ${docItem.razonSocialEmisor}`
            : `Gasto ${docRefStr} - ${docItem.razonSocialEmisor}`;
          const glossStr = aux?.defaultGloss 
            ? `${baseGastoGloss} - ${aux.defaultGloss.trim()}`
            : baseGastoGloss;
          lines.push(makeLine(expenseAcc, finalNetoDebit, 0, glossStr, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
        }

        if (hasConfiguredOtrosAcc && otrosImpuestosAmount > 0) {
          lines.push(makeLine(otrosImpuestosAcc, otrosImpuestosAmount, 0, `Impuestos Adicionales / ILA ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
        }

        if (ivaAmount > 0) {
          lines.push(makeLine(ivaAcc, ivaAmount, 0, `IVA Crédito Fiscal ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
        }

        if (exentoAmount > 0) {
          lines.push(makeLine(exentoAcc, exentoAmount, 0, `Monto Exento ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
        }

        // Proveedor (Haber)
        const basePayableGloss = `Por Pagar ${docRefStr} - ${docItem.razonSocialEmisor}`;
        const payableGloss = aux?.defaultGloss ? `${basePayableGloss} - ${aux.defaultGloss.trim()}` : basePayableGloss;
        lines.push(makeLine(supplierAcc, 0, totalAmount, payableGloss, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
      }

    } else if (docItem.tipoRegistro === 'Venta') {
      // 1. Cliente por Cobrar -> PRIORIDAD: 1. Doc Override -> 2. Ficha Auxiliar (Deudor) -> 3. Config General RCV
      const customerAcc = resolveAccountDetails(
        docItem.cuentaContrapartidaId || aux?.defaultDebtorAccountId || rcvParams?.defaultCustomerAccountId,
        ['1104001', '1.1.02.001', '1.1.02', 'cliente'],
        'Activo',
        '1104001',
        'Clientes Nacionales'
      );

      // 2. Ingreso por Ventas -> PRIORIDAD: 1. Doc Override -> 2. Ficha Auxiliar (Cliente) -> 3. Config General RCV
      const salesAcc = resolveAccountDetails(
        docItem.cuentaGastoId || aux?.defaultExpenseOrIncomeAccountId || rcvParams?.defaultSalesIncomeAccountId,
        ['5101001', '5101', '5.1.01.001', '5.1.01', '51', 'venta', 'ingreso'],
        'Ingreso',
        '5101001',
        'Ingresos por Ventas y Facturación'
      );

      // 3. IVA Débito Fiscal
      const ivaDebitoAcc = resolveAccountDetails(
        rcvParams?.ivaDebitoAccountId,
        ['2104001', '2.1.02', 'débito', 'debito', 'iva'],
        'Pasivo',
        '2104001',
        'IVA Débito Fiscal'
      );

      // 4. Exento
      const exentoAcc = resolveAccountDetails(
        rcvParams?.exentoAccountId,
        ['5101001', '5101', '5.1.01', 'exenta', 'no afecta'],
        'Ingreso',
        '5101001',
        'Ventas Exentas o No Afectas'
      );

      // 5. Otros Impuestos Ventas
      const otrosImpuestosAcc = resolveAccountDetails(
        rcvParams?.otrosImpuestosAccountId,
        ['impuesto adicional', 'adicional', 'ila', 'otros impuestos', '2104002', '2.1.03.002'],
        'Pasivo',
        '2104002',
        'Impuestos Adicionales por Pagar'
      );

      const totalAmount = Number(docItem.montoTotal) || 0;
      const netoAmount = Number(docItem.montoNeto) || (docItem.montoIva === 0 && docItem.montoExento === 0 ? totalAmount : 0);
      const ivaAmount = Number(docItem.montoIva) || 0;
      const exentoAmount = Number(docItem.montoExento) || 0;

      const explicitOtros = Number(docItem.montoOtrosImpuestos) || 0;
      const calculatedOtros = totalAmount - (netoAmount + ivaAmount + exentoAmount);
      const otrosImpuestosAmount = explicitOtros > 0 ? explicitOtros : (calculatedOtros > 0 ? calculatedOtros : 0);

      const hasConfiguredOtrosAcc = Boolean(rcvParams?.otrosImpuestosAccountId && accounts.some(a => a.id === rcvParams.otrosImpuestosAccountId));
      const finalNetoCredit = hasConfiguredOtrosAcc ? netoAmount : (netoAmount + otrosImpuestosAmount);

      const isNotaCredito = docItem.tipoDoc === '61' || String(docItem.tipoDoc).includes('61');
      const partyRut = docItem.rutEmisor || docItem.rutReceptor || '';
      const partyName = docItem.razonSocialEmisor || docItem.razonSocialReceptor || '';

      if (isNotaCredito) {
        // En Nota de Crédito de Ventas: Ingresos e IVA al Debe, Cliente al Haber
        if (finalNetoCredit > 0) {
          const baseNcGloss = `Reverso Venta ${docRefStr}`;
          const glossStr = aux?.defaultGloss ? `${baseNcGloss} - ${aux.defaultGloss.trim()}` : baseNcGloss;
          lines.push(makeLine(salesAcc, finalNetoCredit, 0, glossStr, partyRut, partyName, docRefStr));
        }

        if (hasConfiguredOtrosAcc && otrosImpuestosAmount > 0) {
          lines.push(makeLine(otrosImpuestosAcc, otrosImpuestosAmount, 0, `Reverso Impuestos Adicionales ${docRefStr}`, partyRut, partyName, docRefStr));
        }

        if (ivaAmount > 0) {
          lines.push(makeLine(ivaDebitoAcc, ivaAmount, 0, `Reverso IVA Débito ${docRefStr}`, partyRut, partyName, docRefStr));
        }

        if (exentoAmount > 0) {
          lines.push(makeLine(exentoAcc, exentoAmount, 0, `Reverso Venta Exenta ${docRefStr}`, partyRut, partyName, docRefStr));
        }

        const baseNcCustomer = `NC Cliente ${docRefStr} - ${partyName}`;
        const ncCustomerGloss = aux?.defaultGloss ? `${baseNcCustomer} - ${aux.defaultGloss.trim()}` : baseNcCustomer;
        lines.push(makeLine(customerAcc, 0, totalAmount, ncCustomerGloss, partyRut, partyName, docRefStr));
      } else {
        // Cliente (Debe)
        const baseCustomerGloss = `Por Cobrar ${docRefStr} - ${partyName}`;
        const customerGloss = aux?.defaultGloss ? `${baseCustomerGloss} - ${aux.defaultGloss.trim()}` : baseCustomerGloss;
        lines.push(makeLine(customerAcc, totalAmount, 0, customerGloss, partyRut, partyName, docRefStr));

        // Ingreso Ventas (Haber)
        if (finalNetoCredit > 0) {
          const baseVentaGloss = otrosImpuestosAmount > 0 && !hasConfiguredOtrosAcc 
            ? `Ingreso Ventas e Impuestos Adicionales ${docRefStr} - ${partyName}`
            : `Ingreso Ventas ${docRefStr} - ${partyName}`;
          const glossStr = aux?.defaultGloss 
            ? `${baseVentaGloss} - ${aux.defaultGloss.trim()}`
            : baseVentaGloss;
          lines.push(makeLine(salesAcc, 0, finalNetoCredit, glossStr, partyRut, partyName, docRefStr));
        }

        if (hasConfiguredOtrosAcc && otrosImpuestosAmount > 0) {
          lines.push(makeLine(otrosImpuestosAcc, 0, otrosImpuestosAmount, `Impuestos Adicionales ${docRefStr}`, partyRut, partyName, docRefStr));
        }

        if (ivaAmount > 0) {
          lines.push(makeLine(ivaDebitoAcc, 0, ivaAmount, `IVA Débito Fiscal ${docRefStr}`, partyRut, partyName, docRefStr));
        }

        if (exentoAmount > 0) {
          lines.push(makeLine(exentoAcc, 0, exentoAmount, `Venta Exenta ${docRefStr}`, partyRut, partyName, docRefStr));
        }
      }

    } else { // Honorarios (BHE)
      const honorarioExpenseAcc = resolveAccountDetails(
        docItem.cuentaGastoId || aux?.defaultExpenseOrIncomeAccountId || rcvParams?.defaultHonorariosExpenseAccountId,
        ['4201002', '4201', '4102001', '4.2.01', 'honorario', 'gasto'],
        'Gasto',
        '4201002',
        'Honorarios Profesionales'
      );

      const retencionAcc = resolveAccountDetails(
        rcvParams?.retencionBheAccountId,
        ['retencion', 'retención', 'bhe', 'impuesto retenido'],
        'Pasivo',
        '2.1.03.001',
        'Retención Segunda Categoría BHE'
      );

      const honorariosPayableAcc = resolveAccountDetails(
        docItem.cuentaContrapartidaId || aux?.defaultCreditorAccountId || rcvParams?.defaultHonorariosAccountId,
        ['honorarios por pagar', 'honorarios', '2.1.01'],
        'Pasivo',
        '2.1.01.003',
        'Honorarios por Pagar'
      );

      const bruto = docItem.montoBruto || (docItem.montoNeto > 0 ? docItem.montoNeto : docItem.montoTotal);
      const retencion = docItem.montoRetencion !== undefined ? docItem.montoRetencion : (docItem.montoIva || 0);
      const liquido = docItem.montoLiquido !== undefined && docItem.montoLiquido > 0 ? docItem.montoLiquido : (bruto - retencion);

      // Gasto Honorarios (Debe)
      const baseHonorarioGloss = `Gasto Honorarios BHE ${docRefStr} - ${docItem.razonSocialEmisor}`;
      const honorarioGloss = aux?.defaultGloss 
        ? `${baseHonorarioGloss} - ${aux.defaultGloss.trim()}`
        : baseHonorarioGloss;
      lines.push(makeLine(honorarioExpenseAcc, bruto, 0, honorarioGloss, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));

      // Retención BHE (Haber)
      if (retencion > 0) {
        lines.push(makeLine(retencionAcc, 0, retencion, `Retención BHE ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
      }

      // Líquido por Pagar (Haber)
      const basePayableBhe = `Líquido por Pagar BHE ${docRefStr} - ${docItem.razonSocialEmisor}`;
      const payableBheGloss = aux?.defaultGloss ? `${basePayableBhe} - ${aux.defaultGloss.trim()}` : basePayableBhe;
      lines.push(makeLine(honorariosPayableAcc, 0, liquido, payableBheGloss, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
    }

    const sanitizedLines = sanitizeVoucherLines(lines, accounts);

    const totalDebit = sanitizedLines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
    const totalCredit = sanitizedLines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
    const isCuadrado = Math.abs(totalDebit - totalCredit) < 0.01;

    let accountingDate = docItem.fechaEmision || new Date().toISOString().split('T')[0];
    if (docItem.period && docItem.fechaEmision && docItem.fechaEmision.length >= 7 && docItem.period.length >= 7) {
      const emisionYM = docItem.fechaEmision.slice(0, 7);
      const importYM = docItem.period.slice(0, 7);
      if (emisionYM < importYM) {
        accountingDate = `${importYM}-01`;
      } else {
        accountingDate = docItem.fechaEmision;
      }
    }

    const userUid = auth.currentUser?.uid || 'contabilizacion-rcv';
    const userEmail = auth.currentUser?.email || '';
    const nowIso = new Date().toISOString();

    // Evaluar si alguna línea requiere análisis y fue dejada en blanco
    let isPendingAnalysis = false;
    for (const l of sanitizedLines) {
      const realAcc = accounts.find(a => a.id === l.accountId || a.code === l.accountCode);
      if (realAcc) {
        if (realAcc.requiereCentroCosto && !l.costCenter) isPendingAnalysis = true;
        if (realAcc.requiereItemGasto && !l.expenseItem) isPendingAnalysis = true;
        if (realAcc.requiereProyecto && !l.project) isPendingAnalysis = true;
        if (realAcc.requiereProducto && !l.product) isPendingAnalysis = true;
        if (realAcc.requiereAuxiliarRUT && !l.auxiliaryRut) isPendingAnalysis = true;
        if (realAcc.requiereDocumento && !l.documentRef) isPendingAnalysis = true;
        if (realAcc.requiereConciliacionBancaria && !l.bankDocRef) isPendingAnalysis = true;
        if (realAcc.requiereVencimiento && !l.dueDate) isPendingAnalysis = true;
      }
    }

    let finalStatus: 'Valido' | 'Descuadrado' | 'Pendiente' = 'Valido';
    if (!isCuadrado) {
      finalStatus = 'Descuadrado';
    } else if (isPendingAnalysis) {
      finalStatus = 'Pendiente';
    }

    const mainPartyName = docItem.tipoRegistro === 'Venta' 
      ? (docItem.razonSocialReceptor || docItem.razonSocialEmisor || '') 
      : (docItem.razonSocialEmisor || docItem.razonSocialReceptor || '');

    return {
      voucherNumber,
      date: accountingDate,
      period: docItem.period,
      type: 'Traspaso',
      gloss: `Centralización RCV ${docItem.tipoRegistro} Doc ${docItem.tipoDoc} N° ${docItem.folio} - ${mainPartyName}${aux?.defaultGloss ? ` - ${aux.defaultGloss.trim()}` : ''}`,
      lines: sanitizedLines,
      totalDebit,
      totalCredit,
      status: finalStatus,
      isDescuadrado: !isCuadrado,
      descuadreDifference: isCuadrado ? 0 : totalDebit - totalCredit,
      createdFromRcvId: docItem.id,
      createdBy: userUid,
      createdByUserEmail: userEmail,
      creationMode: 'IMPORTACION_RCV' as const,
      createdAt: nowIso,
      lastModifiedBy: userUid,
      lastModifiedAt: nowIso
    };
  };

  const handleContabilizarSingle = async (docId: string) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede contabilizar documentos contables ni generar comprobantes.');
      return;
    }
    try {
      const docItem = rcvDocuments.find(d => d.id === docId);
      if (!docItem) return;

      const targetPeriod = docItem.period || (docItem.fechaEmision ? docItem.fechaEmision.substring(0, 7) : selectedRcvPeriod);
      const periodCheck = checkIsPeriodClosed(targetPeriod);
      if (periodCheck.isClosed) {
        alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nPara contabilizar documentos en este período (${targetPeriod}), debes abrirlo primero en 'Configuraciones > Períodos Contables'.`);
        return;
      }

      const nextVoucherNum = (vouchers.reduce((max, v) => Math.max(max, v.voucherNumber || 0), 0)) + 1;

      await withProcess(
        `Contabilizando documento Doc ${docItem.tipoDoc || 'DTE'} Folio #${docItem.folio}...`,
        async (updateProgress) => {
          updateProgress({
            current: 1,
            total: 1,
            message: `Generando Comprobante N° ${nextVoucherNum}`,
            stage: `${docItem.razonSocialEmisor || docItem.rutEmisor}`
          });
          const voucherData = buildVoucherForRcvDocument(docItem, nextVoucherNum);

          // Create voucher in Firestore
          const newVoucherRef = await addDoc(collection(companyRef, 'vouchers'), voucherData);

          // Update RCV document
          const docRef = doc(companyRef, 'rcvDocuments', docId);
          await updateDoc(docRef, { estadoContabilizado: true, voucherId: newVoucherRef.id });

          // Audit Log
          logAuditEvent({
            userId: auth.currentUser?.uid || 'anon',
            userEmail: auth.currentUser?.email || '',
            studyId,
            companyId: company.id,
            action: 'CONTABILIZAR',
            module: 'COMPROBANTES',
            details: `Contabilización de Doc RCV ${docItem.tipoDoc} Folio #${docItem.folio} (${docItem.razonSocialEmisor}) -> Comprobante N° ${nextVoucherNum} en ${company.name}`,
            metadata: {
              voucherNumber: nextVoucherNum,
              rcvDocId: docId,
              folio: docItem.folio,
              tipoDoc: docItem.tipoDoc,
              montoTotal: docItem.montoTotal
            }
          });
        }
      );

      alert(`¡Documento contabilizado con éxito! Comprobante N° ${nextVoucherNum} generado.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error contabilizando documento:", err);
      alert('Error al contabilizar: ' + err.message);
    }
  };

  const handleContabilizarSelected = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede contabilizar documentos contables.');
      return;
    }
    if (selectedRcvIds.length === 0) return;

    // Verificar si alguno de los documentos seleccionados pertenece a un período cerrado
    const targetDocs = rcvDocuments.filter(d => selectedRcvIds.includes(d.id) && !d.estadoContabilizado);
    for (const docItem of targetDocs) {
      const targetPeriod = docItem.period || (docItem.fechaEmision ? docItem.fechaEmision.substring(0, 7) : selectedRcvPeriod);
      const periodCheck = checkIsPeriodClosed(targetPeriod);
      if (periodCheck.isClosed) {
        alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nEl documento Folio #${docItem.folio} (${docItem.razonSocialEmisor}) pertenece al período ${targetPeriod} que está CERRADO. Abre el período antes de contabilizar.`);
        return;
      }
    }

    try {
      let currentMaxNum = vouchers.reduce((max, v) => Math.max(max, v.voucherNumber || 0), 0);
      let count = 0;
      const targetIds = [...selectedRcvIds];

      await withProcess(
        `Contabilizando ${targetIds.length} documentos seleccionados...`,
        async (updateProgress) => {
          for (let i = 0; i < targetIds.length; i++) {
            const id = targetIds[i];
            const docItem = rcvDocuments.find(d => d.id === id);
            if (!docItem || docItem.estadoContabilizado) continue;

            currentMaxNum++;
            count++;
            updateProgress({
              current: i + 1,
              total: targetIds.length,
              message: `Contabilizando (${i + 1}/${targetIds.length}): Doc ${docItem.tipoDoc} #${docItem.folio}`,
              stage: docItem.razonSocialEmisor || docItem.rutEmisor
            });

            const voucherData = buildVoucherForRcvDocument(docItem, currentMaxNum);
            const newVoucherRef = await addDoc(collection(companyRef, 'vouchers'), voucherData);

            const docRef = doc(companyRef, 'rcvDocuments', id);
            await updateDoc(docRef, { estadoContabilizado: true, voucherId: newVoucherRef.id });
          }
        }
      );

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'CONTABILIZAR',
        module: 'COMPROBANTES',
        details: `Contabilización masiva seleccionada de ${count} documentos RCV en ${company.name}`,
        metadata: {
          documentosContabilizados: count,
          ids: targetIds
        }
      });

      setSelectedRcvIds([]);
      alert(`Se contabilizaron ${count} documentos exitosamente y se generaron sus respectivos comprobantes.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error contabilizando seleccionados:", err);
      alert('Error al contabilizar seleccionados: ' + err.message);
    }
  };

  const handleContabilizarAllPending = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede contabilizar documentos contables.');
      return;
    }

    const periodCheck = checkIsPeriodClosed(selectedRcvPeriod);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nEl período ${selectedRcvPeriod} está CERRADO. Abre el período en 'Configuraciones > Períodos Contables' para centralizar.`);
      return;
    }

    try {
      const pendingDocs = rcvDocuments.filter(d => d.period === selectedRcvPeriod && !d.estadoContabilizado);
      if (pendingDocs.length === 0) {
        alert(`No hay documentos pendientes por contabilizar en el período ${selectedRcvPeriod}.`);
        return;
      }

      let currentMaxNum = vouchers.reduce((max, v) => Math.max(max, v.voucherNumber || 0), 0);
      let count = 0;

      await withProcess(
        `Centralizando ${pendingDocs.length} documentos pendientes del período ${selectedRcvPeriod}...`,
        async (updateProgress) => {
          for (let i = 0; i < pendingDocs.length; i++) {
            const docItem = pendingDocs[i];
            currentMaxNum++;
            count++;
            updateProgress({
              current: i + 1,
              total: pendingDocs.length,
              message: `Centralizando (${i + 1}/${pendingDocs.length}): Doc ${docItem.tipoDoc} #${docItem.folio}`,
              stage: `${docItem.tipoRegistro} - ${docItem.razonSocialEmisor || docItem.rutEmisor}`
            });

            const voucherData = buildVoucherForRcvDocument(docItem, currentMaxNum);
            const newVoucherRef = await addDoc(collection(companyRef, 'vouchers'), voucherData);

            const docRef = doc(companyRef, 'rcvDocuments', docItem.id);
            await updateDoc(docRef, { estadoContabilizado: true, voucherId: newVoucherRef.id });
          }
        }
      );

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'CONTABILIZAR',
        module: 'COMPROBANTES',
        details: `Centralización completa de ${count} documentos pendientes del período ${selectedRcvPeriod} en ${company.name}`,
        metadata: {
          periodo: selectedRcvPeriod,
          documentosCentralizados: count
        }
      });

      alert(`Se contabilizaron ${count} documentos pendientes del período ${selectedRcvPeriod} en Comprobantes Contables.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error contabilizando pendientes:", err);
      alert('Error al contabilizar pendientes: ' + err.message);
    }
  };

  // Voucher Management: Create, Edit, Anular, Delete
  const handleOpenCreateVoucher = () => {
    const nextVoucherNum = (vouchers.reduce((max, v) => Math.max(max, v.voucherNumber || 0), 0)) + 1;
    const today = new Date().toISOString().split('T')[0];
    const period = today.substring(0, 7);
    setVoucherForm({
      voucherNumber: nextVoucherNum,
      date: today,
      period,
      type: 'Traspaso',
      gloss: '',
      status: 'Valido',
      lines: [
        { accountId: '', accountCode: '', accountName: '', debit: 0, credit: 0, auxiliaryRut: '', documentRef: '', gloss: '' },
        { accountId: '', accountCode: '', accountName: '', debit: 0, credit: 0, auxiliaryRut: '', documentRef: '', gloss: '' }
      ]
    });
  };

  const handleOpenEditVoucher = (v: Voucher) => {
    setVoucherForm({
      id: v.id,
      voucherNumber: v.voucherNumber,
      date: v.date,
      period: v.period || v.date.substring(0, 7),
      type: v.type,
      gloss: v.gloss,
      status: v.status || 'Valido',
      lines: (v.lines || []).map(l => ({ ...l })),
      createdFromRcvId: v.createdFromRcvId
    });
  };

  const handleDeleteVoucher = (v: Voucher) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no tiene permisos para eliminar comprobantes contables.');
      return;
    }
    setVoucherActionModal({
      type: 'eliminar',
      voucher: v,
      reason: ''
    });
  };

  const handleToggleAnularVoucher = (v: Voucher) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no tiene permisos para anular ni reactivar comprobantes.');
      return;
    }

    const isCurrentlyAnulado = v.status === 'Anulado';
    if (isCurrentlyAnulado) {
      setVoucherActionModal({
        type: 'reactivar',
        voucher: v,
        reason: ''
      });
    } else {
      setVoucherActionModal({
        type: 'anular',
        voucher: v,
        reason: 'Anulación por corrección de cuentas o datos contables'
      });
    }
  };

  const handleConfirmVoucherAction = async () => {
    if (!voucherActionModal) return;
    const { type, voucher: v, reason } = voucherActionModal;

    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no tiene permisos para modificar o eliminar comprobantes.');
      return;
    }

    setActionLoading(true);
    try {
      if (type === 'anular') {
        const trimmedReason = (reason || '').trim() || 'Anulado por usuario para corrección de datos contables';
        await updateDoc(doc(companyRef, 'vouchers', v.id), {
          status: 'Anulado',
          anuladoAt: new Date().toISOString(),
          anuladoReason: trimmedReason,
          lastModifiedBy: auth.currentUser?.email || auth.currentUser?.uid || 'anon',
          lastModifiedAt: new Date().toISOString()
        });

        // Free up the linked RCV document so user can edit / re-contabilize
        const linkedRcvDocs = rcvDocuments.filter(d => d.voucherId === v.id || (v.createdFromRcvId && d.id === v.createdFromRcvId));
        for (const rcvDoc of linkedRcvDocs) {
          await updateDoc(doc(companyRef, 'rcvDocuments', rcvDoc.id), {
            estadoContabilizado: false,
            voucherId: null
          });
        }

        // Audit Log
        logAuditEvent({
          userId: auth.currentUser?.uid || 'anon',
          userEmail: auth.currentUser?.email || '',
          studyId,
          companyId: company.id,
          action: 'ANULAR',
          module: 'COMPROBANTES',
          details: `Anulación de Comprobante N° ${v.voucherNumber} (Motivo: ${trimmedReason}) en ${company.name}`,
          metadata: { voucherNumber: v.voucherNumber, voucherId: v.id, motivo: trimmedReason }
        });

        if (selectedVoucher?.id === v.id) {
          setSelectedVoucher({ ...v, status: 'Anulado', anuladoReason: trimmedReason });
        }
      } else if (type === 'eliminar') {
        // 1. Revert associated RCV document if any
        const linkedRcvDocs = rcvDocuments.filter(d => d.voucherId === v.id || (v.createdFromRcvId && d.id === v.createdFromRcvId));
        for (const rcvDoc of linkedRcvDocs) {
          await updateDoc(doc(companyRef, 'rcvDocuments', rcvDoc.id), {
            estadoContabilizado: false,
            voucherId: null
          });
        }

        // 2. Eliminar comprobante definitivamente de Firestore
        await deleteDoc(doc(companyRef, 'vouchers', v.id));

        // 3. Audit Log
        logAuditEvent({
          userId: auth.currentUser?.uid || 'anon',
          userEmail: auth.currentUser?.email || '',
          studyId,
          companyId: company.id,
          action: 'ELIMINAR',
          module: 'COMPROBANTES',
          details: `Eliminación definitiva de Comprobante N° ${v.voucherNumber} (${v.type}, ${v.period}) en ${company.name}`,
          metadata: {
            voucherId: v.id,
            voucherNumber: v.voucherNumber,
            type: v.type
          }
        });

        if (selectedVoucher?.id === v.id) {
          setSelectedVoucher(null);
        }
      } else if (type === 'reactivar') {
        await updateDoc(doc(companyRef, 'vouchers', v.id), {
          status: 'Valido',
          anuladoAt: null,
          anuladoReason: null,
          lastModifiedBy: auth.currentUser?.email || auth.currentUser?.uid || 'anon',
          lastModifiedAt: new Date().toISOString()
        });

        // Restore RCV state if linked
        const linkedRcvDocs = rcvDocuments.filter(d => d.voucherId === v.id || (v.createdFromRcvId && d.id === v.createdFromRcvId));
        for (const rcvDoc of linkedRcvDocs) {
          await updateDoc(doc(companyRef, 'rcvDocuments', rcvDoc.id), {
            estadoContabilizado: true
          });
        }

        // Audit Log
        logAuditEvent({
          userId: auth.currentUser?.uid || 'anon',
          userEmail: auth.currentUser?.email || '',
          studyId,
          companyId: company.id,
          action: 'MODIFICAR',
          module: 'COMPROBANTES',
          details: `Reactivación de Comprobante N° ${v.voucherNumber} (pasó a Válido) en ${company.name}`,
          metadata: { voucherNumber: v.voucherNumber, voucherId: v.id }
        });

        if (selectedVoucher?.id === v.id) {
          setSelectedVoucher({ ...v, status: 'Valido', anuladoReason: null });
        }
      }

      setVoucherActionModal(null);
      await fetchData();
    } catch (err: any) {
      console.error(`Error al procesar acción ${type}:`, err);
      alert(`Error al procesar la acción: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveVoucherForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede crear ni modificar comprobantes contables.');
      return;
    }
    if (!voucherForm) return;

    const voucherPeriod = voucherForm.date ? voucherForm.date.substring(0, 7) : selectedRcvPeriod;
    const periodCheck = checkIsPeriodClosed(voucherPeriod);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes registrar ni modificar comprobantes en la fecha ${voucherForm.date} porque su período contable está CERRADO.`);
      return;
    }

    if (!voucherForm.gloss.trim()) {
      alert('Por favor ingresa la glosa general del comprobante.');
      return;
    }

    const validLines = voucherForm.lines.filter(l => (l.accountId || l.accountCode) && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) {
      alert('El comprobante debe tener al menos 2 líneas con cuenta asignada y montos.');
      return;
    }

    const totalDebit = validLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const totalCredit = validLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);

    // Validación estricta de análisis contables según Plan de Cuentas
    const customCols = company.customAccountColumns || [];
    const missingAnalysisErrors: string[] = [];

    validLines.forEach((l, idx) => {
      const lineAcc = accounts.find(a => a.id === l.accountId || (l.accountCode && a.code === l.accountCode));
      const valResult = validateVoucherLine(l, lineAcc, customCols);
      if (!valResult.isValid) {
        valResult.errors.forEach(err => {
          missingAnalysisErrors.push(`• Línea ${idx + 1} [${l.accountCode || 'Sin Código'} - ${l.accountName || lineAcc?.name || 'Cuenta'}]: ${err}`);
        });
      }
    });

    if (missingAnalysisErrors.length > 0) {
      alert(
        `⚠️ ANÁLISIS CONTABLES OBLIGATORIOS FALTANTES:\n\n` +
        `El comprobante no puede ser guardado porque las siguientes cuentas exigen análisis según el Plan de Cuentas:\n\n` +
        missingAnalysisErrors.join('\n') +
        `\n\nPor favor haz clic en "Análisis" en las líneas correspondientes para ingresar la información requerida.`
      );
      return;
    }

    if (totalDebit !== totalCredit) {
      const diff = Math.abs(totalDebit - totalCredit);
      const allowUnbalanced = window.confirm(
        `¡Atención! El comprobante está descuadrado por $${diff.toLocaleString('es-CL')} ` +
        `(Total Debe: $${totalDebit.toLocaleString('es-CL')} vs Total Haber: $${totalCredit.toLocaleString('es-CL')}).\n\n` +
        `¿Deseas guardarlo de todas formas?`
      );
      if (!allowUnbalanced) return;
    }

    try {
      await withProcess(
        voucherForm.id ? `Actualizando Comprobante N° ${voucherForm.voucherNumber}...` : `Registrando Comprobante N° ${voucherForm.voucherNumber}...`,
        async () => {
          const period = voucherForm.date.substring(0, 7);
          const userUid = auth.currentUser?.uid || 'anon';
          const userEmail = auth.currentUser?.email || '';
          const nowIso = new Date().toISOString();

          const sanitizedValidLines = sanitizeVoucherLines(validLines, accounts);

          const payload: any = {
            voucherNumber: Number(voucherForm.voucherNumber),
            date: voucherForm.date,
            period,
            type: voucherForm.type,
            gloss: voucherForm.gloss,
            status: voucherForm.status || 'Valido',
            lines: sanitizedValidLines.map(l => ({
              accountId: l.accountId || '',
              accountCode: l.accountCode || '',
              accountName: l.accountName || '',
              debit: Number(l.debit) || 0,
              credit: Number(l.credit) || 0,
              auxiliaryRut: l.auxiliaryRut || '',
              auxiliaryName: l.auxiliaryName || '',
              documentRef: l.documentRef || '',
              costCenter: l.costCenter || '',
              bankDocRef: l.bankDocRef || '',
              dueDate: l.dueDate || '',
              expenseItem: l.expenseItem || '',
              project: l.project || '',
              product: l.product || '',
              customAnalyses: l.customAnalyses || {},
              gloss: l.gloss || ''
            })),
            totalDebit,
            totalCredit,
            createdFromRcvId: voucherForm.createdFromRcvId || null
          };

          if (voucherForm.id) {
            await updateDoc(doc(companyRef, 'vouchers', voucherForm.id), {
              ...payload,
              lastModifiedBy: userUid,
              lastModifiedAt: nowIso
            });

            // Audit Log
            logAuditEvent({
              userId: userUid,
              userEmail: userEmail,
              studyId,
              companyId: company.id,
              action: 'MODIFICAR',
              module: 'COMPROBANTES',
              details: `Edición de Comprobante N° ${voucherForm.voucherNumber} (${voucherForm.type}) en ${company.name}`,
              metadata: { voucherNumber: voucherForm.voucherNumber, totalDebit, totalCredit }
            });

            alert(`Comprobante N° ${voucherForm.voucherNumber} modificado exitosamente.`);
            if (selectedVoucher?.id === voucherForm.id) {
              setSelectedVoucher({ id: voucherForm.id, ...payload });
            }
          } else {
            await addDoc(collection(companyRef, 'vouchers'), {
              ...payload,
              createdBy: userUid,
              createdByUserEmail: userEmail,
              creationMode: 'MANUAL' as const,
              createdAt: nowIso,
              lastModifiedBy: userUid,
              lastModifiedAt: nowIso
            });

            // Audit Log
            logAuditEvent({
              userId: userUid,
              userEmail: userEmail,
              studyId,
              companyId: company.id,
              action: 'CREAR',
              module: 'COMPROBANTES',
              details: `Creación manual de Comprobante N° ${voucherForm.voucherNumber} (${voucherForm.type}) en ${company.name}`,
              metadata: { voucherNumber: voucherForm.voucherNumber, totalDebit, totalCredit }
            });

            alert(`Comprobante N° ${voucherForm.voucherNumber} creado exitosamente.`);
          }

          setVoucherForm(null);
          await fetchData();
        }
      );
    } catch (err: any) {
      console.error("Error guardando comprobante:", err);
      alert('Error al guardar comprobante: ' + err.message);
    }
  };

  // Delete Single RCV Document (Purchases, Sales, Honorarios, etc.)
  const handleDeleteSingleRcvDoc = async (docId: string, tipo: string, folio: string) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede eliminar documentos.');
      return;
    }

    const targetDoc = rcvDocuments.find(d => d.id === docId);
    if (targetDoc && targetDoc.period) {
      const periodCheck = checkIsPeriodClosed(targetDoc.period);
      if (periodCheck.isClosed) {
        alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes eliminar documentos de un período contable cerrado.`);
        return;
      }
    }

    try {
      setRcvDocuments(prev => prev.filter(d => d.id !== docId));
      setSelectedRcvIds(prev => prev.filter(id => id !== docId));

      await deleteDoc(doc(companyRef, 'rcvDocuments', docId));

      const rcvModule = tipo.toLowerCase().includes('compra') ? 'RCV_COMPRAS' : tipo.toLowerCase().includes('venta') ? 'RCV_VENTAS' : 'RCV_HONORARIOS';
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'ELIMINAR',
        module: rcvModule,
        details: `Eliminación de documento RCV ${tipo} #${folio} en ${company.name}`,
        metadata: { action: 'DELETE', documentType: 'RCV_DOCUMENT', documentId: docId, tipo, folio, motivo: `Eliminación manual documento ${tipo} #${folio}` }
      });
    } catch (err: any) {
      console.error("Error deleting RCV document:", err);
      await fetchData();
      alert('Error al eliminar documento: ' + err.message);
    }
  };

  // Delete Selected RCV Documents
  const handleDeleteSelectedRcvDocs = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede eliminar documentos.');
      return;
    }
    if (selectedRcvIds.length === 0) return;

    const idsToDelete = [...selectedRcvIds];

    // Check if any selected valid document is in a closed period
    const docsToDelete = rcvDocuments.filter(d => idsToDelete.includes(d.id));
    for (const d of docsToDelete) {
      if (d.period && d.period.length === 7) {
        const pCheck = checkIsPeriodClosed(d.period);
        if (pCheck.isClosed) {
          alert(`⚠️ Acción Bloqueada:\n\nEl documento ${d.tipoDoc || d.tipoRegistro} Folio #${d.folio} pertenece al período cerrado (${pCheck.periodStr}).\n\nNo puedes eliminar documentos en períodos fiscales cerrados.`);
          return;
        }
      }
    }

    try {
      // Optimistic instant update in UI
      setRcvDocuments(prev => prev.filter(d => !idsToDelete.includes(d.id)));
      setSelectedRcvIds([]);

      // Parallel batch delete in Firestore
      await Promise.all(idsToDelete.map(id => deleteDoc(doc(companyRef, 'rcvDocuments', id))));

      const count = idsToDelete.length;
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'ELIMINAR',
        module: 'RCV_COMPRAS',
        details: `Eliminación masiva de ${count} documentos seleccionados en ${company.name}`,
        metadata: { action: 'DELETE', documentType: 'RCV_DOCUMENT', motivo: `Eliminación masiva seleccionada (${count} docs)`, totalEliminados: count }
      });
    } catch (err: any) {
      console.error("Error deleting selected RCV docs:", err);
      await fetchData();
      alert('Error al eliminar documentos seleccionados: ' + err.message);
    }
  };

  // Seed default Chilean Chart of Accounts if empty
  const handleSeedDefaultAccounts = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede cargar planes de cuenta.');
      return;
    }
    if (accounts.length > 0) {
      if (!window.confirm('Ya existen cuentas. ¿Desea cargar el Plan Estándar Chileno complementario?')) return;
    }

    const defaultAccounts: Omit<ChartOfAccount, 'id'>[] = [
      { code: '1', name: 'ACTIVO', type: 'Activo', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1', name: 'ACTIVO CIRCULANTE', type: 'Activo', parentCode: '1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.01', name: 'Efectivo y Equivalentes', type: 'Activo', parentCode: '1.1', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: true, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.01.001', name: 'Caja Moneda Nacional', type: 'Activo', parentCode: '1.1.01', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.01.002', name: 'Banco Estado Cta Cte', type: 'Activo', parentCode: '1.1.01', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: true, requiereDocumento: false, estado: 'Activo' },
      { code: '1.1.02', name: 'Deudores Comerciales', type: 'Activo', parentCode: '1.1', requiereCentroCosto: false, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '1.1.02.001', name: 'Clientes Nacionales', type: 'Activo', parentCode: '1.1.02', requiereCentroCosto: false, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '2', name: 'PASIVO', type: 'Pasivo', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1', name: 'PASIVO CIRCULANTE', type: 'Pasivo', parentCode: '2', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '2.1.01', name: 'Cuentas por Pagar Comerciales', type: 'Pasivo', parentCode: '2.1', requiereCentroCosto: false, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '2.1.01.001', name: 'Proveedores Nacionales', type: 'Pasivo', parentCode: '2.1.01', requiereCentroCosto: false, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '3', name: 'PATRIMONIO', type: 'Patrimonio', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '3.1.01', name: 'Capital Social', type: 'Patrimonio', parentCode: '3', requiereCentroCosto: false, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, estado: 'Activo' },
      { code: '4', name: 'INGRESOS', type: 'Ingreso', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '4.1.01', name: 'Ventas Exentas o No Afectas', type: 'Ingreso', parentCode: '4', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '4.1.02', name: 'Ventas Afectas IVA', type: 'Ingreso', parentCode: '4', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5', name: 'GASTOS', type: 'Gasto', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.1.01', name: 'Remuneraciones y Leyes Sociales', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.1.02', name: 'Gastos Generales y Administrativos', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' }
    ];

    try {
      for (const acc of defaultAccounts) {
        if (!accounts.some(a => a.code === acc.code)) {
          await addDoc(collection(companyRef, 'chartOfAccounts'), acc);
        }
      }
      alert('Plan de cuentas estándar cargado exitosamente.');
      await fetchData();
    } catch (err: any) {
      console.error("Error seeding accounts:", err);
      alert('Error al cargar plan de cuentas: ' + err.message);
    }
  };

  // Seed Historical Exchange Rates from Jan 2020 to Date
  const handleSeedExchangeRates = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede generar ni modificar indicadores históricos.');
      return;
    }
    if (exchangeRates.length > 500) {
      alert('El histórico de factores ya se encuentra cargado.');
      return;
    }

    if (!window.confirm('¿Desea generar y cargar el histórico diario de indicadores económicos (UF, Dólar, UTM, Euro, Yen) desde Enero 2020 a la fecha?')) return;

    try {
      const startDate = new Date('2020-01-01');
      const endDate = new Date();
      let currentDate = new Date(startDate);

      // Base values for Jan 2020
      let baseUf = 28300;
      let baseDolar = 750;
      let baseUtm = 49000;
      let baseEuro = 830;
      let baseYen = 6.9;

      const batchList: ExchangeRate[] = [];

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Slight realistic random fluctuation
        baseUf += (Math.random() * 4 - 1.8);
        baseDolar += (Math.random() * 3 - 1.4);
        if (currentDate.getDate() === 1) {
          baseUtm += 450; // UTM rises monthly
        }
        baseEuro += (Math.random() * 3 - 1.4);
        baseYen += (Math.random() * 0.05 - 0.02);

        batchList.push({
          id: dateStr,
          date: dateStr,
          uf: parseFloat(baseUf.toFixed(2)),
          dolar: parseFloat(baseDolar.toFixed(2)),
          utm: parseFloat(baseUtm.toFixed(2)),
          euro: parseFloat(baseEuro.toFixed(2)),
          yen: parseFloat(baseYen.toFixed(2))
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Save to Firestore in batches or individual docs
      for (const item of batchList) {
        await setDoc(doc(companyRef, 'exchangeRates', item.id), item);
      }

      alert(`Histórico cargado exitosamente (${batchList.length} registros desde 2020).`);
      await fetchData();
    } catch (err: any) {
      console.error("Error seeding exchange rates:", err);
      alert('Error al cargar histórico: ' + err.message);
    }
  };

  // Save Account
  const handleSaveAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede crear ni modificar cuentas contables.');
      return;
    }
    const formData = new FormData(e.currentTarget);
    const code = (formData.get('code') as string || '').trim();
    const name = (formData.get('name') as string || '').trim();
    const type = formData.get('type') as any;
    const parentCode = (formData.get('parentCode') as string || '').trim();
    const requiereCentroCosto = formData.get('requiereCentroCosto') === 'on';
    const requiereAuxiliarRUT = formData.get('requiereAuxiliarRUT') === 'on';
    const requiereConciliacionBancaria = formData.get('requiereConciliacionBancaria') === 'on';
    const requiereDocumento = formData.get('requiereDocumento') === 'on';
    const bankInstitution = (formData.get('bankInstitution') as string || '').trim();
    const bankAccountNumber = (formData.get('bankAccountNumber') as string || '').trim();

    if (!code || !name || !type) {
      alert('Complete los campos obligatorios (Código, Nombre, Tipo).');
      return;
    }

    // Validation: Check code uniqueness in company's chart of accounts
    const isDuplicate = accounts.some(
      (a) => a.code.trim().toLowerCase() === code.toLowerCase() && a.id !== editingAccount?.id
    );

    if (isDuplicate) {
      alert(`El código de cuenta ${code} ya existe en el Plan de Cuentas. Por favor ingresa un código único.`);
      return;
    }

    try {
      const userUid = auth.currentUser?.uid || 'anon';
      const userEmail = auth.currentUser?.email || '';
      const nowIso = new Date().toISOString();

      const payload: any = {
        code,
        name,
        type,
        parentCode: parentCode || '',
        requiereCentroCosto,
        requiereAuxiliarRUT,
        requiereConciliacionBancaria,
        requiereDocumento,
        bankInstitution,
        bankAccountNumber,
        customAttributes: tempCustomAttrs,
        estado: editingAccount ? editingAccount.estado : 'Activo',
        lastModifiedBy: userUid,
        lastModifiedAt: nowIso
      };

      if (editingAccount) {
        await updateDoc(doc(companyRef, 'chartOfAccounts', editingAccount.id), payload);

        // Audit Log
        logAuditEvent({
          userId: userUid,
          userEmail: userEmail,
          studyId,
          companyId: company.id,
          action: 'MODIFICAR',
          module: 'PLAN_CUENTAS',
          details: `Modificación de cuenta contable [${code}] ${name} en ${company.name}`,
          metadata: { accountCode: code, accountName: name, type }
        });

        alert('Cuenta actualizada exitosamente.');
        setEditingAccount(null);
      } else {
        payload.createdBy = userUid;
        payload.createdByUserEmail = userEmail;
        payload.createdAt = nowIso;
        await addDoc(collection(companyRef, 'chartOfAccounts'), payload);

        // Audit Log
        logAuditEvent({
          userId: userUid,
          userEmail: userEmail,
          studyId,
          companyId: company.id,
          action: 'CREAR',
          module: 'PLAN_CUENTAS',
          details: `Creación de cuenta contable [${code}] ${name} (${type}) en ${company.name}`,
          metadata: { accountCode: code, accountName: name, type }
        });

        alert('Cuenta creada exitosamente.');
      }
      setTempCustomAttrs({});
      e.currentTarget.reset();
      await fetchData();
    } catch (err: any) {
      console.error("Error saving account:", err);
      alert('Error al guardar cuenta: ' + err.message);
    }
  };

  // Save Auxiliary from Modal
  const handleSaveAuxiliary = async (auxData: Partial<Auxiliary>) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede crear ni modificar auxiliares.');
      return;
    }

    const rut = (auxData.rut || '').toLowerCase().trim();
    const name = (auxData.name || '').trim();
    const role = auxData.role || 'Deudor';

    if (!rut || !name || !role) {
      throw new Error('Complete los campos obligatorios (RUT, Nombre, Rol).');
    }

    const userUid = auth.currentUser?.uid || 'anon';
    const userEmail = auth.currentUser?.email || '';
    const nowIso = new Date().toISOString();
    const cleanRutKey = (auxData.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();

    // Consultar directamente los documentos actuales en Firestore con este RUT
    const allAuxSnap = await getDocs(collection(companyRef, 'auxiliaries'));
    const allMatchingDocs = allAuxSnap.docs
      .map(d => ({ ...d.data(), id: d.id } as Auxiliary))
      .filter(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanRutKey);

    const payload: any = {
      rut: (auxData.rut || '').trim(),
      name: (auxData.name || '').trim(),
      role: auxData.role || 'Deudor',
      email: (auxData.email || '').trim(),
      phone: (auxData.phone || '').trim(),
      banco: (auxData.banco || '').trim(),
      tipoCuenta: auxData.tipoCuenta || '',
      numeroCuenta: (auxData.numeroCuenta || '').trim(),
      defaultDebtorAccountId: auxData.defaultDebtorAccountId || '',
      defaultCreditorAccountId: auxData.defaultCreditorAccountId || '',
      defaultExpenseOrIncomeAccountId: auxData.defaultExpenseOrIncomeAccountId || '',
      defaultCostCenter: auxData.defaultCostCenter || '',
      defaultExpenseItem: auxData.defaultExpenseItem || '',
      defaultProject: auxData.defaultProject || '',
      defaultProduct: auxData.defaultProduct || '',
      defaultCustomAnalyses: auxData.defaultCustomAnalyses || {},
      estado: editingAuxiliary ? editingAuxiliary.estado : 'Activo',
      lastModifiedBy: userUid,
      lastModifiedAt: nowIso
    };

    if (editingAuxiliary) {
      const targetDocId = editingAuxiliary.id;
      const oldRut = editingAuxiliary.rut;

      // 1. Guardar la ficha principal editada
      await setDoc(doc(companyRef, 'auxiliaries', targetDocId), payload, { merge: true });

      // 2. Depurar y eliminar automáticamente cualquier otra ficha clon o duplicada de este RUT en Firestore
      const duplicateClones = allMatchingDocs.filter(a => a.id !== targetDocId);
      for (const clone of duplicateClones) {
        try {
          await deleteDoc(doc(companyRef, 'auxiliaries', clone.id));
        } catch (e) {
          console.warn("No se pudo eliminar clon redundante de auxiliar:", clone.id, e);
        }
      }

      // Audit Log
      logAuditEvent({
        userId: userUid,
        userEmail: userEmail,
        studyId,
        companyId: company.id,
        action: 'MODIFICAR',
        module: 'AUXILIARES',
        details: `Actualización y unificación de auxiliar [${rut}] ${name} (${role}) en ${company.name}${oldRut && oldRut !== auxData.rut ? ` (RUT anterior: ${oldRut})` : ''}`,
        metadata: { rut, oldRut, name, role, deletedDuplicatesCount: duplicateClones.length }
      });

      alert('Auxiliar actualizado y unificado exitosamente con todas sus cuentas y análisis.');
      setEditingAuxiliary(null);
    } else {
      if (allMatchingDocs.length > 0) {
        // Si ya existían una o más fichas con este RUT, actualizar la primera y borrar los clones
        const primaryDoc = allMatchingDocs[0];
        await setDoc(doc(companyRef, 'auxiliaries', primaryDoc.id), payload, { merge: true });

        const duplicateClones = allMatchingDocs.slice(1);
        for (const clone of duplicateClones) {
          try {
            await deleteDoc(doc(companyRef, 'auxiliaries', clone.id));
          } catch (e) {
            console.warn("No se pudo eliminar clon redundante de auxiliar:", clone.id, e);
          }
        }

        logAuditEvent({
          userId: userUid,
          userEmail: userEmail,
          studyId,
          companyId: company.id,
          action: 'MODIFICAR',
          module: 'AUXILIARES',
          details: `Actualización y unificación de auxiliar [${rut}] ${name} (${role}) en ${company.name}`,
          metadata: { rut, name, role, mergedWithId: primaryDoc.id, deletedDuplicatesCount: duplicateClones.length }
        });

        alert(`El auxiliar con RUT ${auxData.rut} ya existía. Se han actualizado y unificado sus datos en una sola ficha limpia.`);
      } else {
        payload.createdBy = userUid;
        payload.createdByUserEmail = userEmail;
        payload.createdAt = nowIso;
        await addDoc(collection(companyRef, 'auxiliaries'), payload);

        // Audit Log
        logAuditEvent({
          userId: userUid,
          userEmail: userEmail,
          studyId,
          companyId: company.id,
          action: 'CREAR',
          module: 'AUXILIARES',
          details: `Creación de auxiliar [${rut}] ${name} (${role}) en ${company.name}`,
          metadata: { rut, name, role }
        });

        alert('Auxiliar registrado exitosamente con sus análisis asociados.');
      }
    }
    await fetchData();
  };

  const handleSaveRcvParams = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no puede modificar parámetros.');
      return;
    }
    const formData = new FormData(e.currentTarget);
    const params: RCVAccountingParams = {
      ivaDebitoAccountId: formData.get('ivaDebitoAccountId') as string,
      ivaCreditoAccountId: formData.get('ivaCreditoAccountId') as string,
      retencionBheAccountId: formData.get('retencionBheAccountId') as string,
      exentoAccountId: formData.get('exentoAccountId') as string,
      otrosImpuestosAccountId: formData.get('otrosImpuestosAccountId') as string,
      defaultCustomerAccountId: formData.get('defaultCustomerAccountId') as string,
      defaultSupplierAccountId: formData.get('defaultSupplierAccountId') as string,
      defaultHonorariosAccountId: formData.get('defaultHonorariosAccountId') as string,
      defaultSalesIncomeAccountId: formData.get('defaultSalesIncomeAccountId') as string,
      defaultCostOrExpenseAccountId: formData.get('defaultCostOrExpenseAccountId') as string,
      defaultHonorariosExpenseAccountId: formData.get('defaultHonorariosExpenseAccountId') as string,
      defaultCostCenter: formData.get('defaultCostCenter') as string,
      defaultExpenseItem: formData.get('defaultExpenseItem') as string,
      defaultProject: formData.get('defaultProject') as string,
      defaultProduct: formData.get('defaultProduct') as string,
    };

    try {
      await setDoc(doc(companyRef, 'config', 'rcvParams'), params);
      setRcvParams(params);

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'MODIFICAR',
        module: 'PARAMETROS_RCV',
        details: `Actualización de parámetros contables automáticos RCV en ${company.name}`,
        metadata: params
      });

      alert('Parámetros contables guardados exitosamente.');
    } catch (err: any) {
      console.error("Error saving rcv params:", err);
      alert('Error al guardar parámetros: ' + err.message);
    }
  };

  // Fiscal Period Initialization or Toggle Month
  const handleEnsureFiscalYear = async (year: number) => {
    if (currentUserRole === UserRole.OBSERVER) return;
    const fyId = String(year);
    const existing = fiscalYears.find(f => f.id === fyId || Number(f.year) === year);
    if (!existing) {
      const defaultMonths: { [m: number]: 'Abierto' | 'Cerrado' } = {};
      for (let i = 1; i <= 12; i++) {
        defaultMonths[i] = i === 1 ? 'Abierto' : 'Cerrado';
      }
      const newFy: FiscalPeriodYear = {
        id: fyId,
        year,
        months: defaultMonths
      };
      setFiscalYears(prev => [...prev.filter(f => f.id !== fyId), newFy]);
      await setDoc(doc(companyRef, 'fiscalPeriods', fyId), newFy);
    }
  };

  const handleToggleMonthStatus = async (year: number, monthNum: number, currentStatus: 'Abierto' | 'Cerrado') => {
    // Los administradores de estudio y superusuarios siempre pueden gestionar periodos
    if (currentUserRole === UserRole.OBSERVER) {
      alert('🔒 Modo Solo Lectura: El perfil Observador no tiene permisos para abrir o cerrar períodos.');
      return;
    }
    const fyId = String(year);
    let fy = fiscalYears.find(f => f.id === fyId || Number(f.year) === year);
    if (!fy) {
      const defaultMonths: { [m: number]: 'Abierto' | 'Cerrado' } = {};
      for (let i = 1; i <= 12; i++) {
        defaultMonths[i] = i === 1 ? 'Abierto' : 'Cerrado';
      }
      fy = {
        id: fyId,
        year,
        months: defaultMonths
      };
    }

    const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = monthNames[monthNum] || `Mes ${monthNum}`;
    const newStatus: 'Abierto' | 'Cerrado' = currentStatus === 'Abierto' ? 'Cerrado' : 'Abierto';

    try {
      const updatedMonths = { ...(fy.months || {}) };
      updatedMonths[monthNum] = newStatus;

      // Actualización optimista inmediata en la interfaz
      setFiscalYears(prev => {
        const found = prev.some(f => f.id === fyId || Number(f.year) === year);
        if (found) {
          return prev.map(f => (f.id === fyId || Number(f.year) === year) ? { ...f, months: updatedMonths } : f);
        }
        return [...prev, { id: fyId, year, months: updatedMonths }];
      });

      // Persistencia en Firestore
      await setDoc(doc(companyRef, 'fiscalPeriods', fyId), {
        id: fyId,
        year,
        months: updatedMonths
      }, { merge: true });

      // Registro de Auditoría
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'MODIFICAR',
        module: 'PERIODOS_FISCALES',
        details: `${newStatus === 'Cerrado' ? 'Cierre' : 'Apertura'} del período ${monthName} ${year} en ${company.name}`,
        metadata: { year, month: monthNum, status: newStatus }
      });
    } catch (err: any) {
      console.error("Error al cambiar estado del período:", err);
      await fetchData();
    }
  };

  // Today exchange rate or latest
  const todayStr = new Date().toISOString().split('T')[0];
  const currentRate = exchangeRates.find(r => r.date === todayStr) || exchangeRates[exchangeRates.length - 1] || { id: 'fallback', date: todayStr, uf: 38250, dolar: 955, utm: 66500, euro: 1040, yen: 6.3 };

  const getSubRibbonBtnClass = (isActive: boolean, variant: 'normal' | 'indigo' | 'gradient' = 'normal') => {
    if (isActive) {
      return 'px-3.5 py-1.5 text-xs rounded-xl font-bold flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 bg-[#533AFD] text-white shadow-md shadow-indigo-500/20 cursor-pointer';
    }
    if (variant === 'indigo') {
      return 'px-3.5 py-1.5 text-xs rounded-xl font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 shadow-2xs cursor-pointer';
    }
    if (variant === 'gradient') {
      return 'px-3.5 py-1.5 text-xs rounded-xl font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 bg-gradient-to-r from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 text-indigo-900 border border-indigo-200 shadow-2xs cursor-pointer';
    }
    return 'px-3.5 py-1.5 text-xs rounded-xl font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0 bg-white hover:bg-slate-50 text-slate-700 hover:text-[#0D253D] border border-slate-200/80 shadow-2xs cursor-pointer';
  };

  return (
    <div className="space-y-4">
      {/* Super Admin Read-Only Notice Banner */}
      {isReadOnly && (
        <div className="bg-amber-50 border border-amber-300 px-4 py-2.5 rounded-lg flex items-center justify-between text-amber-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🔒</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">Modo Solo Lectura (Perfil Observador)</p>
              <p className="text-[11px] text-amber-700">Tienes acceso de lectura y navegación a todos los módulos. La creación, modificación o eliminación de registros contables o tributarios está restringida exclusivamente a los administradores y contadores del estudio.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold bg-amber-200 text-amber-800 px-2.5 py-1 rounded border border-amber-300 whitespace-nowrap">SOLO LECTURA</span>
        </div>
      )}

      {/* Barra Contextual Persistente Inmóvil Superior (Breadcrumb + Período + Importar Excel) */}
      <div className="-mx-3 md:-mx-5 -mt-3 md:-mt-5 sticky top-[52px] z-40 bg-white/95 backdrop-blur-md text-[#0D253D] border-b border-slate-200/80 shadow-2xs px-3 md:px-5 py-2 flex flex-wrap items-center justify-between gap-3">
        {/* Lado Izquierdo: Volver + Breadcrumb Contextual */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={onBack}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-[#0D253D] font-bold text-xs rounded-xl border border-slate-200 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
            title="Volver a la lista de empresas clientes"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Empresas</span>
          </button>

          <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

          {/* Breadcrumb Contextual Permanente */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="text-[#0D253D] font-extrabold tracking-tight truncate max-w-[240px]" title={`${company.name} (RUT: ${company.rut})`}>
              {company.name}
            </span>
            <span className="text-slate-400 select-none">/</span>
            <span className="font-bold text-[#533AFD] uppercase tracking-wider text-[11px]">
              {activeRibbonGroup}
            </span>
            <span className="text-slate-400 select-none">/</span>
            <span className="bg-indigo-50 text-[#533AFD] px-2.5 py-1 rounded-full text-xs font-bold border border-indigo-100 shadow-2xs">
              {(() => {
                const labels: Record<string, string> = {
                  vouchers: 'Comprobantes Contables',
                  libroDiario: 'Libro Diario',
                  libroMayor: 'Libro Mayor',
                  analisisAuxiliares: 'Auxiliar Cuentas Corrientes',
                  analisisCuentas: 'Análisis de Cuentas',
                  balance8: 'Balance 8 Columnas (Tributario)',
                  controlFolios: 'Timbraje y Folios SII',
                  tablasAnalisis: 'Catálogos de Análisis',
                  nominasPago: 'Nóminas de Pago',
                  cobranza: 'Cobranza y Cuentas por Cobrar',
                  flujoDeCaja: 'Flujo de Caja Real & Proyectado',
                  conciliacionBancaria: 'Conciliación Bancaria',
                  rcv: `RCV (${rcvFilterType})`,
                  formulario29: 'Formulario 29 Mensual (F29)',
                  indicadoresFinancieros: 'Tablero KPIs & Ratios',
                  auditorEstadosFinancieros: 'Auditor de Estados Financieros & Dictamen',
                  balanceIFRS: 'Balance IFRS',
                  estadoResultados: 'Estado de Resultados',
                  accounts: 'Plan de Cuentas',
                  auxiliaries: 'Maestro de Auxiliares',
                  rcvParams: 'Parámetros Contables RCV',
                  f29Codes: 'Códigos Formulario 29',
                  periods: 'Apertura Ejercicios y Períodos',
                  plantillasCarga: 'Plantillas Excel Masivas',
                  exchange: 'Indicadores Oficiales',
                  emisionDte: 'Emisión DTE',
                  employees: 'personal',
                  liquidaciones: 'Liquidaciones de Sueldos & Previred'
                };
                return labels[activeTab] || activeTab;
              })()}
            </span>
          </div>
        </div>

        {/* Lado Derecho: Selector de Año, Mes Operativo & Acción Rápida */}
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
            <label className="text-slate-500 font-bold text-[11px]">Año:</label>
            <select
              value={selectedYear}
              onChange={(e) => {
                const yr = parseInt(e.target.value);
                setSelectedYear(yr);
                handleEnsureFiscalYear(yr);
              }}
              className="font-bold text-[#0D253D] font-mono bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-2xs"
            >
              {[2028, 2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
            <label className="text-slate-500 font-bold text-[11px] flex items-center gap-1.5">
              <span>Mes:</span>
              {(() => {
                const check = checkIsPeriodClosed(selectedRcvPeriod);
                return (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 ${
                    check.isClosed 
                      ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {check.isClosed ? (
                      <>
                        <Lock className="w-2.5 h-2.5 stroke-[2]" />
                        <span>Cerrado</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-2.5 h-2.5 stroke-[2]" />
                        <span>Abierto</span>
                      </>
                    )}
                  </span>
                );
              })()}
            </label>
            <select
              value={selectedRcvPeriod}
              onChange={(e) => {
                const newPeriod = e.target.value;
                const check = checkIsPeriodClosed(newPeriod);
                if (check.isClosed) {
                  alert(`⚠️ Período Cerrado:\n\nEl período ${newPeriod} se encuentra CERRADO en Períodos Fiscales.\n\nPara importar compras/ventas, centralizar o emitir comprobantes en este mes, debes abrirlo primero en 'Configuraciones > Períodos Contables'.`);
                }
                setSelectedRcvPeriod(newPeriod);
              }}
              className="font-bold text-[#0D253D] font-mono bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-xs focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-2xs"
              title="Período de trabajo activo para Carga RCV, Centralización F29 y Comprobantes"
            >
              {(() => {
                const currFy = fiscalYears.find(f => f.id === String(selectedYear));
                const monthNames = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                const monthOptions: { periodStr: string; label: string; isOpen: boolean }[] = [];
                for (let m = 1; m <= 12; m++) {
                  const mStr = String(m).padStart(2, '0');
                  const periodStr = `${selectedYear}-${mStr}`;
                  const isOpen = currFy ? currFy.months[m] === 'Abierto' : (m === 1);
                  monthOptions.push({
                    periodStr,
                    label: `${monthNames[m]} ${selectedYear} — ${isOpen ? 'Abierto' : 'Cerrado'}`,
                    isOpen
                  });
                }
                return monthOptions.map((opt) => (
                  <option key={opt.periodStr} value={opt.periodStr}>
                    {opt.label}
                  </option>
                ));
              })()}
            </select>
          </div>

          <button
            onClick={() => setShowExcelImportModal(true)}
            className="bg-[#533AFD] hover:bg-[#4326EB] text-white font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
            title="Cargar Plan de Cuentas, Clientes, Proveedores o Comprobantes desde archivo Excel/CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Importar Excel</span>
          </button>
        </div>
      </div>

      {/* Menú Ribbon Tipo Excel Refinado y Cohesivo */}
      <div className="sticky top-[106px] z-30 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/80 shadow-xs space-y-1.5">
          {/* Pestañas Principales Ribbon */}
          <div className="flex items-center gap-1.5 px-1 py-1 overflow-x-auto no-scrollbar">
            {(['FINANZAS', 'OPERACIONES', 'TESORERIA', 'PERSONAL', 'IMPORTACIONES', 'IMPUESTOS', 'INDICADORES', 'CONFIGURACIONES'] as const)
              .filter((ribbonTab) => !(isAnalyst && ribbonTab === 'INDICADORES'))
              .map((ribbonTab, idx) => {
              const isActive = activeRibbonGroup === ribbonTab;
              const displayLabels: Record<string, string> = {
                FINANZAS: 'FINANZAS',
                OPERACIONES: 'COMERCIAL',
                TESORERIA: 'TESORERÍA',
                PERSONAL: 'personal',
                IMPORTACIONES: 'CARGA RCV/BH',
                IMPUESTOS: 'IMPUESTOS F.29',
                INDICADORES: 'INDICADORES (KPIS)',
                CONFIGURACIONES: 'CONFIGURACIONES'
              };

              return (
                <button
                  key={ribbonTab}
                  onClick={() => {
                    setActiveRibbonGroup(ribbonTab);
                    if (ribbonTab === 'FINANZAS') setActiveTab('vouchers');
                    if (ribbonTab === 'OPERACIONES') setActiveTab('operativaComercial');
                    if (ribbonTab === 'TESORERIA') setActiveTab('nominasPago');
                    if (ribbonTab === 'PERSONAL') { setActiveTab('employees'); setEmployeeSubTab('employees'); }
                    if (ribbonTab === 'IMPORTACIONES') setActiveTab('rcv');
                    if (ribbonTab === 'IMPUESTOS') setActiveTab('formulario29');
                    if (ribbonTab === 'INDICADORES') setActiveTab('indicadoresFinancieros');
                    if (ribbonTab === 'CONFIGURACIONES' && !['accounts', 'auxiliaries', 'exchange', 'rcvParams', 'periods', 'plantillasCarga', 'productsServices'].includes(activeTab)) {
                      setActiveTab('accounts');
                    }
                  }}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-[#533AFD] text-white shadow-md shadow-indigo-500/20'
                      : 'text-slate-600 hover:text-[#0D253D] hover:bg-slate-100'
                  }`}
                >
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'}`}>
                    {idx + 1}
                  </span>
                  <span>{displayLabels[ribbonTab]}</span>
                </button>
              );
            })}
          </div>

          {/* Sub-Ribbon Horizontal de Fichas de Trabajo con Botones de Desplazamiento */}
          <div className="relative bg-slate-50/80 rounded-xl p-1.5 border border-slate-200/60 flex items-center">
            {/* Flecha izquierda */}
            <button
              type="button"
              onClick={() => scrollSubRibbon('left')}
              className="flex-shrink-0 p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg border border-slate-200 transition-colors mr-1 z-10 shadow-2xs cursor-pointer"
              title="Desplazar opciones hacia la izquierda"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Contenedor desplazable de herramientas / sub-pestañas */}
            <div
              ref={subRibbonScrollRef}
              className="flex-1 flex items-center gap-1.5 overflow-x-auto scroll-smooth no-scrollbar py-0.5 px-1"
            >
              {/* 1. GRUPO: FINANZAS */}
              {activeRibbonGroup === 'FINANZAS' && (
                <>
                  <button
                    onClick={() => setActiveTab('vouchers')}
                    className={getSubRibbonBtnClass(activeTab === 'vouchers')}
                  >
                    <FileText className={`w-3.5 h-3.5 ${activeTab === 'vouchers' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Vouchers</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('libroDiario')}
                    className={getSubRibbonBtnClass(activeTab === 'libroDiario')}
                  >
                    <BookOpen className={`w-3.5 h-3.5 ${activeTab === 'libroDiario' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Libro Diario</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('libroMayor')}
                    className={getSubRibbonBtnClass(activeTab === 'libroMayor')}
                  >
                    <Layers className={`w-3.5 h-3.5 ${activeTab === 'libroMayor' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Libro Mayor</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('analisisAuxiliares')}
                    className={getSubRibbonBtnClass(activeTab === 'analisisAuxiliares')}
                  >
                    <Users className={`w-3.5 h-3.5 ${activeTab === 'analisisAuxiliares' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Auxiliar Cuentas Corrientes</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('analisisCuentas')}
                    className={getSubRibbonBtnClass(activeTab === 'analisisCuentas')}
                  >
                    <Sliders className={`w-3.5 h-3.5 ${activeTab === 'analisisCuentas' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Análisis de Cuentas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('balance8')}
                    className={getSubRibbonBtnClass(activeTab === 'balance8')}
                  >
                    <Scale className={`w-3.5 h-3.5 ${activeTab === 'balance8' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Balance 8 Columnas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('auditorEstadosFinancieros')}
                    className={getSubRibbonBtnClass(activeTab === 'auditorEstadosFinancieros', 'indigo')}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Auditor de Estados Financieros</span>
                  </button>
                   <button
                     onClick={() => setActiveTab('smartNotebooks')}
                     className={getSubRibbonBtnClass(activeTab === 'smartNotebooks', 'gradient')}
                   >
                     <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                     <span>Cuadernos Inteligentes IA</span>
                     <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">Trial 15d</span>
                   </button>
                  <button
                    onClick={() => setActiveTab('controlFolios')}
                    className={getSubRibbonBtnClass(activeTab === 'controlFolios')}
                  >
                    <Printer className={`w-3.5 h-3.5 ${activeTab === 'controlFolios' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Timbraje y Folios SII</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('productsServices')}
                    className={getSubRibbonBtnClass(activeTab === 'productsServices')}
                  >
                    <Boxes className={`w-3.5 h-3.5 ${activeTab === 'productsServices' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Catálogo de Productos & Servicios</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('tablasAnalisis')}
                    className={getSubRibbonBtnClass(activeTab === 'tablasAnalisis')}
                  >
                    <FolderTree className={`w-3.5 h-3.5 ${activeTab === 'tablasAnalisis' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Catálogos de Análisis</span>
                  </button>
                </>
              )}

              {/* 2. GRUPO: COMERCIAL */}
              {activeRibbonGroup === 'OPERACIONES' && (
                <>
                  <button
                    onClick={() => setActiveTab('operativaComercial')}
                    className={getSubRibbonBtnClass(activeTab === 'operativaComercial')}
                  >
                    <ShoppingCart className={`w-3.5 h-3.5 ${activeTab === 'operativaComercial' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Módulo Comercial (Compras y Ventas)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('stockKardex')}
                    className={getSubRibbonBtnClass(activeTab === 'stockKardex')}
                  >
                    <Package className={`w-3.5 h-3.5 ${activeTab === 'stockKardex' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Control de Inventario & Kardex PMP</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('productsServices')}
                    className={getSubRibbonBtnClass(activeTab === 'productsServices')}
                  >
                    <Boxes className={`w-3.5 h-3.5 ${activeTab === 'productsServices' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Catálogo de Productos & Servicios</span>
                  </button>
                </>
              )}

              {/* 3. GRUPO: TESORERÍA */}
              {activeRibbonGroup === 'TESORERIA' && (
                <>
                  <button
                    onClick={() => setActiveTab('nominasPago')}
                    className={getSubRibbonBtnClass(activeTab === 'nominasPago')}
                  >
                    <CreditCard className={`w-3.5 h-3.5 ${activeTab === 'nominasPago' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Nóminas de Pago a Proveedores</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('cobranza')}
                    className={getSubRibbonBtnClass(activeTab === 'cobranza')}
                  >
                    <Receipt className={`w-3.5 h-3.5 ${activeTab === 'cobranza' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Cobranza y Cuentas por Cobrar</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('flujoDeCaja')}
                    className={getSubRibbonBtnClass(activeTab === 'flujoDeCaja')}
                  >
                    <TrendingUp className={`w-3.5 h-3.5 ${activeTab === 'flujoDeCaja' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Flujo de Caja Real & Proyectado</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('conciliacionBancaria')}
                    className={getSubRibbonBtnClass(activeTab === 'conciliacionBancaria')}
                  >
                    <Landmark className={`w-3.5 h-3.5 ${activeTab === 'conciliacionBancaria' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Conciliación Bancaria</span>
                  </button>
                </>
              )}

              {/* GRUPO: PERSONAL & REMUNERACIONES */}
              {activeRibbonGroup === 'PERSONAL' && (
                <>
                  <button
                    onClick={() => { setActiveTab('employees'); setEmployeeSubTab('employees'); }}
                    className={getSubRibbonBtnClass(activeTab === 'employees' && employeeSubTab === 'employees')}
                  >
                    <Users className={`w-3.5 h-3.5 ${activeTab === 'employees' && employeeSubTab === 'employees' ? 'text-indigo-300' : 'text-indigo-600'}`} />
                    <span>Fichas del Personal</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('employees'); setEmployeeSubTab('contracts'); }}
                    className={getSubRibbonBtnClass(activeTab === 'employees' && employeeSubTab === 'contracts')}
                  >
                    <FileText className={`w-3.5 h-3.5 ${activeTab === 'employees' && employeeSubTab === 'contracts' ? 'text-indigo-300' : 'text-indigo-600'}`} />
                    <span>Contratos & Anexos</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('liquidaciones'); setPayrollTab('NOMINA'); }}
                    className={getSubRibbonBtnClass(activeTab === 'liquidaciones' && payrollTab === 'NOMINA')}
                  >
                    <Calculator className={`w-3.5 h-3.5 ${activeTab === 'liquidaciones' && payrollTab === 'NOMINA' ? 'text-indigo-300' : 'text-emerald-600'}`} />
                    <span>Cálculo de Remuneraciones</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('liquidaciones'); setPayrollTab('LIQUIDACION_INDIVIDUAL'); }}
                    className={getSubRibbonBtnClass(activeTab === 'liquidaciones' && payrollTab === 'LIQUIDACION_INDIVIDUAL')}
                  >
                    <FileSpreadsheet className={`w-3.5 h-3.5 ${activeTab === 'liquidaciones' && payrollTab === 'LIQUIDACION_INDIVIDUAL' ? 'text-indigo-300' : 'text-indigo-600'}`} />
                    <span>Liquidaciones Oficiales</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('liquidaciones'); setPayrollTab('PREVIRED'); }}
                    className={getSubRibbonBtnClass(activeTab === 'liquidaciones' && payrollTab === 'PREVIRED')}
                  >
                    <Download className={`w-3.5 h-3.5 ${activeTab === 'liquidaciones' && payrollTab === 'PREVIRED' ? 'text-indigo-300' : 'text-amber-600'}`} />
                    <span>Previred (105 campos)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('liquidaciones'); setPayrollTab('LRD_DT'); }}
                    className={getSubRibbonBtnClass(activeTab === 'liquidaciones' && payrollTab === 'LRD_DT')}
                  >
                    <Building2 className={`w-3.5 h-3.5 ${activeTab === 'liquidaciones' && payrollTab === 'LRD_DT' ? 'text-indigo-300' : 'text-blue-600'}`} />
                    <span>Libro Remuneraciones Digital DT</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('employees'); setEmployeeSubTab('attendance'); }}
                    className={getSubRibbonBtnClass(activeTab === 'employees' && employeeSubTab === 'attendance')}
                  >
                    <Calendar className={`w-3.5 h-3.5 ${activeTab === 'employees' && employeeSubTab === 'attendance' ? 'text-indigo-300' : 'text-purple-600'}`} />
                    <span>Asistencia & Licencias</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('employees'); setEmployeeSubTab('advances'); }}
                    className={getSubRibbonBtnClass(activeTab === 'employees' && employeeSubTab === 'advances')}
                  >
                    <CreditCard className={`w-3.5 h-3.5 ${activeTab === 'employees' && employeeSubTab === 'advances' ? 'text-indigo-300' : 'text-emerald-600'}`} />
                    <span>Anticipos & Préstamos</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('employees'); setEmployeeSubTab('severance'); }}
                    className={getSubRibbonBtnClass(activeTab === 'employees' && employeeSubTab === 'severance')}
                  >
                    <Briefcase className={`w-3.5 h-3.5 ${activeTab === 'employees' && employeeSubTab === 'severance' ? 'text-indigo-300' : 'text-rose-600'}`} />
                    <span>Finiquitos Legales</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('employees'); setEmployeeSubTab('certificates'); }}
                    className={getSubRibbonBtnClass(activeTab === 'employees' && employeeSubTab === 'certificates')}
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'employees' && employeeSubTab === 'certificates' ? 'text-indigo-300' : 'text-amber-500'}`} />
                    <span>Certificados Laborales</span>
                  </button>
                </>
              )}

              {/* 3. GRUPO: IMPORTACIONES */}
              {activeRibbonGroup === 'IMPORTACIONES' && (
                <>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Compra'); }}
                    className={getSubRibbonBtnClass(activeTab === 'rcv' && rcvFilterType === 'Compra')}
                  >
                    <ShoppingCart className={`w-3.5 h-3.5 ${activeTab === 'rcv' && rcvFilterType === 'Compra' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Compras (RCV)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Venta'); }}
                    className={getSubRibbonBtnClass(activeTab === 'rcv' && rcvFilterType === 'Venta')}
                  >
                    <TrendingUp className={`w-3.5 h-3.5 ${activeTab === 'rcv' && rcvFilterType === 'Venta' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Ventas (RCV)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Honorarios'); }}
                    className={getSubRibbonBtnClass(activeTab === 'rcv' && rcvFilterType === 'Honorarios')}
                  >
                    <Receipt className={`w-3.5 h-3.5 ${activeTab === 'rcv' && rcvFilterType === 'Honorarios' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Honorarios (BHR)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Todos'); }}
                    className={getSubRibbonBtnClass(activeTab === 'rcv' && rcvFilterType === 'Todos')}
                  >
                    <FileText className={`w-3.5 h-3.5 ${activeTab === 'rcv' && rcvFilterType === 'Todos' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Todos los Documentos RCV</span>
                  </button>
                </>
              )}

              {/* 4. GRUPO: IMPUESTOS F.29 */}
              {activeRibbonGroup === 'IMPUESTOS' && (
                <>
                  <button
                    onClick={() => setActiveTab('formulario29')}
                    className={getSubRibbonBtnClass(activeTab === 'formulario29')}
                  >
                    <FileSpreadsheet className={`w-3.5 h-3.5 ${activeTab === 'formulario29' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Formulario 29 Mensual (F29 - SII)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Compra'); }}
                    className={getSubRibbonBtnClass(activeTab === 'rcv')}
                  >
                    <BarChart3 className={`w-3.5 h-3.5 ${activeTab === 'rcv' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Registro Compras y Ventas (RCV)</span>
                  </button>
                </>
              )}

              {/* 5. GRUPO: INDICADORES (KPIs) */}
              {activeRibbonGroup === 'INDICADORES' && (
                <>
                  <button
                    onClick={() => setActiveTab('indicadoresFinancieros')}
                    className={getSubRibbonBtnClass(activeTab === 'indicadoresFinancieros')}
                  >
                    <BarChart3 className={`w-3.5 h-3.5 ${activeTab === 'indicadoresFinancieros' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Tablero de Indicadores Financieros & KPIs</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('auditorEstadosFinancieros')}
                    className={getSubRibbonBtnClass(activeTab === 'auditorEstadosFinancieros', 'indigo')}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Auditor de Estados Financieros</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('balanceIFRS')}
                    className={getSubRibbonBtnClass(activeTab === 'balanceIFRS')}
                  >
                    <Scale className={`w-3.5 h-3.5 ${activeTab === 'balanceIFRS' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Balance Clasificado (IFRS)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('estadoResultados')}
                    className={getSubRibbonBtnClass(activeTab === 'estadoResultados')}
                  >
                    <TrendingUp className={`w-3.5 h-3.5 ${activeTab === 'estadoResultados' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Estado de Resultados</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('flujoDeCaja')}
                    className={getSubRibbonBtnClass(activeTab === 'flujoDeCaja')}
                  >
                    <Landmark className={`w-3.5 h-3.5 ${activeTab === 'flujoDeCaja' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Flujo y Proyección de Caja</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('exchange')}
                    className={getSubRibbonBtnClass(activeTab === 'exchange')}
                  >
                    <Sliders className={`w-3.5 h-3.5 ${activeTab === 'exchange' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Indicadores Económicos Oficiales</span>
                  </button>
                </>
              )}

              {/* 6. GRUPO: CONFIGURACIONES */}
              {activeRibbonGroup === 'CONFIGURACIONES' && (
                <>
                  <button
                    onClick={() => setActiveTab('accounts')}
                    className={getSubRibbonBtnClass(activeTab === 'accounts')}
                  >
                    <Layers className={`w-3.5 h-3.5 ${activeTab === 'accounts' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Plan de Cuentas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('auxiliaries')}
                    className={getSubRibbonBtnClass(activeTab === 'auxiliaries')}
                  >
                    <Users className={`w-3.5 h-3.5 ${activeTab === 'auxiliaries' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Maestro de Auxiliares</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('productsServices')}
                    className={getSubRibbonBtnClass(activeTab === 'productsServices')}
                  >
                    <Boxes className={`w-3.5 h-3.5 ${activeTab === 'productsServices' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Catálogo de Productos & Servicios</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('tablasAnalisis')}
                    className={getSubRibbonBtnClass(activeTab === 'tablasAnalisis')}
                  >
                    <FolderTree className={`w-3.5 h-3.5 ${activeTab === 'tablasAnalisis' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Catálogos de Análisis</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('rcvParams')}
                    className={getSubRibbonBtnClass(activeTab === 'rcvParams')}
                  >
                    <Settings className={`w-3.5 h-3.5 ${activeTab === 'rcvParams' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Parámetros Contables RCV</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('f29Codes')}
                    className={getSubRibbonBtnClass(activeTab === 'f29Codes')}
                  >
                    <FileSpreadsheet className={`w-3.5 h-3.5 ${activeTab === 'f29Codes' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Configuración Códigos F.29</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('periods')}
                    className={getSubRibbonBtnClass(activeTab === 'periods')}
                  >
                    <Calendar className={`w-3.5 h-3.5 ${activeTab === 'periods' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Apertura Ejercicios y Períodos</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('plantillasCarga')}
                    className={getSubRibbonBtnClass(activeTab === 'plantillasCarga')}
                  >
                    <Download className={`w-3.5 h-3.5 ${activeTab === 'plantillasCarga' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Plantillas Excel y Cargas Masivas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('exchange')}
                    className={getSubRibbonBtnClass(activeTab === 'exchange')}
                  >
                    <Sliders className={`w-3.5 h-3.5 ${activeTab === 'exchange' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Indicadores Económicos (UF, USD, UTM)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('controlFolios')}
                    className={getSubRibbonBtnClass(activeTab === 'controlFolios')}
                  >
                    <Printer className={`w-3.5 h-3.5 ${activeTab === 'controlFolios' ? 'text-indigo-300' : 'text-slate-500'}`} />
                    <span>Autorizaciones de Folios SII</span>
                  </button>
                </>
              )}
            </div>

            {/* Flecha derecha */}
            <button
              type="button"
              onClick={() => scrollSubRibbon('right')}
              className="flex-shrink-0 p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg border border-slate-200 transition-colors ml-1 z-10 shadow-2xs cursor-pointer"
              title="Desplazar opciones hacia la derecha"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      {/* Modal Histórico Completo de Factores Económicos */}
      {showHistoricalRatesModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-base">📊</span>
                <h3 className="font-bold text-sm">Histórico Completo de Indicadores Económicos (UF, Dólar, UTM, Euro, Yen)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoricalRatesModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Filtrar Año:</span>
                <select
                  value={historicalRatesFilterYear}
                  onChange={(e) => setHistoricalRatesFilterYear(e.target.value)}
                  className="text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="Todos">Todos los Años (2020-2026)</option>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                  <option value="2023">2023</option>
                  <option value="2022">2022</option>
                  <option value="2021">2021</option>
                  <option value="2020">2020</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar fecha (ej. 2026-08)..."
                  value={historicalRatesSearch}
                  onChange={(e) => setHistoricalRatesSearch(e.target.value)}
                  className="text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 w-52 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Fecha</th>
                    <th className="p-2.5">UF ($)</th>
                    <th className="p-2.5">Dólar ($)</th>
                    <th className="p-2.5">UTM ($)</th>
                    <th className="p-2.5">Euro ($)</th>
                    <th className="p-2.5">Yen ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {exchangeRates
                    .filter(ex => {
                      if (historicalRatesFilterYear !== 'Todos' && !ex.date.startsWith(historicalRatesFilterYear)) return false;
                      if (historicalRatesSearch && !ex.date.includes(historicalRatesSearch)) return false;
                      return true;
                    })
                    .map((ex) => (
                      <tr key={ex.id || ex.date} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{ex.date}</td>
                        <td className="p-2.5 text-indigo-900 font-semibold">${ex.uf?.toLocaleString('es-CL')}</td>
                        <td className="p-2.5 text-emerald-900">${ex.dolar?.toLocaleString('es-CL')}</td>
                        <td className="p-2.5 text-amber-900">${ex.utm?.toLocaleString('es-CL')}</td>
                        <td className="p-2.5 text-blue-900">${ex.euro?.toLocaleString('es-CL')}</td>
                        <td className="p-2.5 text-slate-700">${ex.yen?.toLocaleString('es-CL')}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500">
                Total de registros: {exchangeRates.length}
              </span>
              <button
                type="button"
                onClick={() => setShowHistoricalRatesModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {fetchError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-4 text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-rose-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Error de sincronización con Firestore: {fetchError}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm"
          >
            Reintentar Carga
          </button>
        </div>
      )}


      {/* TAB 1: PLAN DE CUENTAS (GRILLA DINÁMICA EXCEL) */}
      {activeTab === 'accounts' && (
        <PlanDeCuentasGrid
          studyId={studyId}
          company={company}
          onRefreshCompany={fetchData}
        />
      )}

      {/* TAB 2: AUXILIARIES */}
      {activeTab === 'auxiliaries' && (
        <div className="space-y-4">
          <AuxiliariesGrid
            studyId={studyId}
            companyId={company.id}
            companyName={company.name}
            companyRut={company.rut}
            auxiliaries={auxiliaries}
            accounts={accounts}
            vouchers={vouchers}
            costCenters={costCenters}
            expenseItems={expenseItems}
            projects={projects}
            products={products}
            onRefresh={fetchData}
            onCreate={() => {
              setEditingAuxiliary(null);
              setIsAuxiliaryModalOpen(true);
            }}
            onEdit={(aux) => {
              setEditingAuxiliary(aux);
              setIsAuxiliaryModalOpen(true);
            }}
            onNavigateToBulkImport={() => setActiveTab('plantillasCarga')}
          />

          <AuxiliaryModal
            isOpen={isAuxiliaryModalOpen}
            onClose={() => {
              setIsAuxiliaryModalOpen(false);
              setEditingAuxiliary(null);
            }}
            onSave={handleSaveAuxiliary}
            editingAuxiliary={editingAuxiliary}
            accounts={accounts}
            costCenters={costCenters}
            expenseItems={expenseItems}
            projects={projects}
            products={products}
            customAccountColumns={company.customAccountColumns || []}
            customAnalysisItems={customAnalysisItems}
            isReadOnly={isReadOnly}
          />
        </div>
      )}

      {/* EXCHANGE RATES TAB: INDICADORES ECONÓMICOS OFICIALES DE CHILE */}
      {activeTab === 'exchange' && (
        <IndicadoresEconomicosView
          studyId={studyId}
          selectedYear={selectedYear}
        />
      )}

      {/* TAB: RCV PARAMS */}
      {activeTab === 'rcvParams' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-5xl mx-auto space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <span>⚙️</span>
              <span>Parámetros Contables del RCV (Cuentas y Análisis por Defecto)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure las cuentas e imputaciones por defecto para la centralización automática de documentos del Registro de Compras y Ventas (RCV) y Boletas de Honorarios.
              <br />
              <strong className="text-indigo-600">Jerarquía de Prioridad:</strong> 1° Edición directa en documento &rarr; 2° Ficha del Auxiliar (RUT) &rarr; 3° Parámetros Generales RCV definidos aquí.
            </p>
          </div>
          
          <form onSubmit={handleSaveRcvParams} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bloque 1: Impuestos Centralizados */}
              <div className="space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏛️</span>
                  <span>Impuestos Centralizados</span>
                </h4>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cuenta IVA Débito Fiscal (Ventas)</label>
                  <select name="ivaDebitoAccountId" defaultValue={rcvParams?.ivaDebitoAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cuenta IVA Crédito Fiscal (Compras)</label>
                  <select name="ivaCreditoAccountId" defaultValue={rcvParams?.ivaCreditoAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cuenta Retención 2da Categoría (Honorarios BHE)</label>
                  <select name="retencionBheAccountId" defaultValue={rcvParams?.retencionBheAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cuenta de Impuesto Exento / No Gravado</label>
                  <select name="exentoAccountId" defaultValue={rcvParams?.exentoAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cuenta Impuestos Adicionales / ILA</label>
                  <select name="otrosImpuestosAccountId" defaultValue={rcvParams?.otrosImpuestosAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Bloque 2: Cuentas y Contrapartidas por Defecto (Fallback) */}
              <div className="space-y-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔄</span>
                  <span>Cuentas y Contrapartidas por Defecto (Fallback)</span>
                </h4>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clientes Nacionales (Ventas - Deudor)</label>
                  <select name="defaultCustomerAccountId" defaultValue={rcvParams?.defaultCustomerAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Proveedores Nacionales (Compras - Acreedor)</label>
                  <select name="defaultSupplierAccountId" defaultValue={rcvParams?.defaultSupplierAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Honorarios por Pagar (BHE - Acreedor)</label>
                  <select name="defaultHonorariosAccountId" defaultValue={rcvParams?.defaultHonorariosAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ingreso por Ventas (Resultado Ganancia)</label>
                  <select name="defaultSalesIncomeAccountId" defaultValue={rcvParams?.defaultSalesIncomeAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gasto por Compras (Resultado Pérdida)</label>
                  <select name="defaultCostOrExpenseAccountId" defaultValue={rcvParams?.defaultCostOrExpenseAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gasto por Honorarios (Resultado Pérdida)</label>
                  <select name="defaultHonorariosExpenseAccountId" defaultValue={rcvParams?.defaultHonorariosExpenseAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta...</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Bloque 3: Parámetros de Análisis por Defecto (Fallback si el auxiliar no tiene configurado) */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-base">📊</span>
                <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                  Parámetros de Análisis por Defecto (Fallback Empresa)
                </h4>
              </div>
              <p className="text-xs text-slate-500">
                Si la cuenta contable exige análisis y el Auxiliar asociado no tiene asignado un centro de costos, ítem de gasto, proyecto o producto, el sistema utilizará automáticamente los siguientes valores por defecto de la empresa.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Centro de Costos</label>
                  <select name="defaultCostCenter" defaultValue={rcvParams?.defaultCostCenter || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Sin Centro de Costos por Defecto</option>
                    {costCenters.map(cc => <option key={cc.id} value={cc.code}>[{cc.code}] {cc.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Ítem de Gasto</label>
                  <select name="defaultExpenseItem" defaultValue={rcvParams?.defaultExpenseItem || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Sin Ítem de Gasto por Defecto</option>
                    {expenseItems.map(exp => <option key={exp.id} value={exp.code}>[{exp.code}] {exp.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Proyecto</label>
                  <select name="defaultProject" defaultValue={rcvParams?.defaultProject || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Sin Proyecto por Defecto</option>
                    {projects.map(prj => <option key={prj.id} value={prj.code}>[{prj.code}] {prj.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Producto / Servicio</label>
                  <select name="defaultProduct" defaultValue={rcvParams?.defaultProduct || ''} className="border border-slate-300 p-2 w-full rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500">
                    <option value="">Sin Producto por Defecto</option>
                    {products.map(prd => <option key={prd.id} value={prd.code}>[{prd.code}] {prd.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                <span>💾</span>
                <span>Guardar Parámetros Contables RCV</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB: F29 CODES CONFIGURATION */}
      {activeTab === 'f29Codes' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-4xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-4 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📋</span>
                <h3 className="text-lg font-bold text-slate-900">Maestro y Configuración de Códigos F.29 ({company.name})</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Selecciona qué códigos del Formulario 29 utiliza habitualmente esta sociedad. En el Centro de Pre-declaración F.29 solo se desplegarán y calcularán los códigos que estén activados aquí.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCompanyF29Codes({
                  debito: true,
                  credito: true,
                  remanente504: true,
                  posterga756: true,
                  honorarios151: true,
                  impuestoUnico48: true,
                  retencionTerceros: true,
                  ppm062: true,
                  otrosImpuestos: true
                })}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Activar Todos
              </button>
              <button
                type="button"
                onClick={() => setCompanyF29Codes({
                  debito: true,
                  credito: true,
                  remanente504: false,
                  posterga756: false,
                  honorarios151: false,
                  impuestoUnico48: false,
                  retencionTerceros: false,
                  ppm062: true,
                  otrosImpuestos: false
                })}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Solo Básicos (IVA y PPM)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sección IVA Débito y Crédito */}
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>📑</span>
                <span>Secciones I y II: Débito y Crédito Fiscal IVA</span>
              </h4>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.debito !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, debito: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Cód. 503 / 110 / 512 / 509 - Débito Fiscal IVA (Ventas)</span>
                  <span className="text-[11px] text-slate-500">Facturas de venta, boletas, notas de débito y notas de crédito emitidas.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.credito !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, credito: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Cód. 520 / 525 / 532 / 535 - Crédito Fiscal IVA (Compras)</span>
                  <span className="text-[11px] text-slate-500">Facturas de compra del giro, activo fijo, notas de débito y crédito recibidas.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.remanente504 !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, remanente504: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Cód. 504 / 563 - Remanente Mes Anterior</span>
                  <span className="text-[11px] text-slate-500">Remanente de crédito fiscal proveniente del período tributario anterior (reajustado en UTM).</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.posterga756 !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, posterga756: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Cód. 756 - Posterga Pago de IVA (Pymes Ley 20.780)</span>
                  <span className="text-[11px] text-slate-500">Permite diferir el pago del IVA hasta en 2 meses para empresas acogidas al régimen ProPyme.</span>
                </div>
              </label>
            </div>

            {/* Sección Retenciones, PPM y Otros */}
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>💼</span>
                <span>Secciones IV, V y VI: Retenciones, PPM y Otros</span>
              </h4>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.honorarios151 !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, honorarios151: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Cód. 151 / 152 - Retención Boletas de Honorarios BHE</span>
                  <span className="text-[11px] text-slate-500">Retención de 2da Categoría aplicable a Boletas de Honorarios Electrónicas recibidas.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.impuestoUnico48 !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, impuestoUnico48: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Cód. 48 / 49 - Impuesto Único 2da Categoría (Trabajadores)</span>
                  <span className="text-[11px] text-slate-500">Impuesto retribuido por sueldos y salarios de trabajadores dependientes.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.retencionTerceros !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, retencionTerceros: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Cód. 538 / 542 - IVA Retenido a Terceros (Cambio de Sujeto)</span>
                  <span className="text-[11px] text-slate-500">Facturas de compra recibidas con retención total o parcial de IVA.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.ppm062 !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, ppm062: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Cód. 062 / 120 - PPM Pagos Provisionales Mensuales</span>
                  <span className="text-[11px] text-slate-500">Cálculo de PPM sobre ingresos brutos según tasa de régimen tributario.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={companyF29Codes.otrosImpuestos !== false}
                  onChange={(e) => setCompanyF29Codes({ ...companyF29Codes, otrosImpuestos: e.target.checked })}
                  className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Otros Impuestos y Recargos F29</span>
                  <span className="text-[11px] text-slate-500">Impuestos adicionales, ILA, créditos especiales o reajustes.</span>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleSaveF29CodeSettings}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors text-xs flex items-center gap-2 shadow-sm"
            >
              <span>💾</span>
              <span>Guardar Configuración Códigos F.29</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: FISCAL PERIODS */}
      {activeTab === 'periods' && (
        <PeriodsGrid
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          fiscalYears={fiscalYears}
          vouchers={vouchers}
          rcvDocuments={rcvDocuments}
          onToggleMonthStatus={handleToggleMonthStatus}
          onEnsureFiscalYear={handleEnsureFiscalYear}
        />
      )}

      {/* TAB 4: RCV & SII IMPORT */}
      {activeTab === 'rcv' && (
        <div className="space-y-6">
          {/* Executive Control Header */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Sincronización Oficial SII
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Registro de Compras, Ventas y Honorarios (RCV)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Consulta directa y contabilización de Compras, Ventas y Boletas de Honorarios para <strong>{company.name}</strong> ({company.rut}).
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Período Fiscal</label>
                <input
                  type="month"
                  value={selectedRcvPeriod}
                  onChange={(e) => setSelectedRcvPeriod(e.target.value)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-xs"
                />
              </div>

              <div className="pt-3.5">
                <button
                  type="button"
                  disabled={isRescatandoRcvApi}
                  onClick={handleRescatarRcvApi}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  title={`Sincronizar Compras, Ventas y Honorarios desde el SII para el período ${selectedRcvPeriod}`}
                >
                  {isRescatandoRcvApi ? (
                    <>
                      <span className="animate-spin text-sm">🔄</span>
                      <span>Sincronizando con SII...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm">⚡</span>
                      <span>Sincronizar con SII ({selectedRcvPeriod})</span>
                    </>
                  )}
                </button>
              </div>

              <div className="pt-3.5">
                <button
                  type="button"
                  onClick={() => setShowManualUpload(!showManualUpload)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-3 py-2 rounded-lg border border-slate-300 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  title="Cargar archivos CSV o TXT descargados manualmente desde el portal del SII"
                >
                  <span>{showManualUpload ? '✕ Ocultar Carga CSV' : '📥 Cargar CSV/TXT Manual'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Manual Upload Section */}
          {showManualUpload && (
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📂 Carga de Archivos Oficiales del SII (Período: {selectedRcvPeriod})</span>
                </h4>
                <span className="text-[11px] text-slate-500">Formatos admitidos: .xlsx, .xls, .csv o .txt descargados del portal del SII</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <label className="block text-xs font-bold text-blue-900">1. Compras SII (.xlsx/.csv/.txt)</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    onChange={(e) => handleFileUpload(e, 'Compra')}
                    className="w-full text-xs text-slate-500 file:mr-2.5 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                </div>
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <label className="block text-xs font-bold text-emerald-900">2. Ventas SII (.xlsx/.csv/.txt)</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    onChange={(e) => handleFileUpload(e, 'Venta')}
                    className="w-full text-xs text-slate-500 file:mr-2.5 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                </div>
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                  <label className="block text-xs font-bold text-amber-900">3. Honorarios BHE (.xlsx/.csv/.txt)</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    onChange={(e) => handleFileUpload(e, 'Honorarios')}
                    className="w-full text-xs text-slate-500 file:mr-2.5 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                  />
                </div>
              </div>

              {rcvImportSummary && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded-lg text-xs flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold">Resultado de Carga:</span>
                  <span>Importados: <strong>{rcvImportSummary.loaded}</strong></span>
                  <span>Duplicados omitidos: <strong>{rcvImportSummary.duplicates}</strong></span>
                  <span>Auxiliares creados: <strong>{rcvImportSummary.newAuxiliaries}</strong></span>
                </div>
              )}
            </div>
          )}

          {/* Table Actions */}
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                  {(['Todos', 'Compra', 'Venta', 'Honorarios'] as const).map((t) => {
                    const isSelected = rcvFilterType === t;
                    const count = t === 'Todos'
                      ? rcvDocuments.filter(d => d.period === selectedRcvPeriod).length
                      : rcvDocuments.filter(d => d.period === selectedRcvPeriod && d.tipoRegistro === t).length;
                    return (
                      <button
                        key={t}
                        onClick={() => setRcvFilterType(t)}
                        className={`px-2.5 py-1 text-xs rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>{t === 'Todos' ? 'Todos' : t === 'Compra' ? 'Compras' : t === 'Venta' ? 'Ventas' : 'Honorarios'}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedRcvIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleContabilizarSelected}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors shadow-sm"
                    >
                      Contabilizar Seleccionados ({selectedRcvIds.length})
                    </button>
                    <button
                      onClick={handleDeleteSelectedRcvDocs}
                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg transition-colors shadow-sm flex items-center gap-1"
                      title="Eliminar los documentos seleccionados"
                    >
                      <span>🗑️</span>
                      <span>Eliminar Seleccionados ({selectedRcvIds.length})</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  onClick={handleContabilizarAllPending}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                  Contabilizar Todos los Pendientes
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-auto max-h-[550px] relative shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          const displayedDocs = rcvDocuments
                            .filter(d => d.period === selectedRcvPeriod)
                            .filter(d => rcvFilterType === 'Todos' || d.tipoRegistro === rcvFilterType);
                          if (e.target.checked) {
                            setSelectedRcvIds(displayedDocs.map(d => d.id));
                          } else {
                            setSelectedRcvIds([]);
                          }
                        }}
                        checked={
                          (() => {
                            const displayedDocs = rcvDocuments
                              .filter(d => d.period === selectedRcvPeriod)
                              .filter(d => rcvFilterType === 'Todos' || d.tipoRegistro === rcvFilterType);
                            return displayedDocs.length > 0 && selectedRcvIds.length === displayedDocs.length;
                          })()
                        }
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Fch. Emisión</th>
                    <th className="p-3">{rcvFilterType === 'Venta' ? 'RUT Cliente' : rcvFilterType === 'Compra' ? 'RUT Proveedor' : 'RUT Contraparte'}</th>
                    <th className="p-3">{rcvFilterType === 'Venta' ? 'Razón Social Cliente' : rcvFilterType === 'Compra' ? 'Razón Social Proveedor' : 'Razón Social'}</th>
                    <th className="p-3">Tipo Doc / Folio</th>
                    <th className="p-3 text-right">{rcvFilterType === 'Honorarios' ? 'Bruto' : 'Neto'}</th>
                    <th className="p-3 text-right">{rcvFilterType === 'Honorarios' ? 'Retención' : 'IVA'}</th>
                    <th className="p-3 text-right">{rcvFilterType === 'Honorarios' ? 'Líquido / Pagado' : 'Total'}</th>
                    <th className="p-3 text-center">Estado Contable</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rcvDocuments
                    .filter(d => d.period === selectedRcvPeriod)
                    .filter(d => rcvFilterType === 'Todos' || d.tipoRegistro === rcvFilterType)
                    .map((docItem) => {
                    const isSelected = selectedRcvIds.includes(docItem.id);
                    const isNotaCredito = docItem.tipoDoc === '61' || String(docItem.tipoDoc).includes('61');
                    const isBHE = docItem.tipoRegistro === 'Honorarios' || docItem.tipoDoc === 'BHE';
                    const displayNeto = isBHE ? (docItem.montoBruto || docItem.montoNeto || 0) : (docItem.montoNeto || 0);
                    const displayIva = isBHE ? (docItem.montoRetencion !== undefined ? docItem.montoRetencion : (docItem.montoIva || 0)) : (docItem.montoIva || 0);
                    const displayTotal = isBHE ? (docItem.montoLiquido !== undefined ? docItem.montoLiquido : (docItem.montoTotal || 0)) : (docItem.montoTotal || 0);

                    return (
                      <tr key={docItem.id} className={`hover:bg-slate-50 ${isNotaCredito ? 'bg-rose-50/30' : ''}`}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRcvIds([...selectedRcvIds, docItem.id]);
                              } else {
                                setSelectedRcvIds(selectedRcvIds.filter(id => id !== docItem.id));
                              }
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="p-3 font-medium">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            docItem.tipoRegistro === 'Compra' ? 'bg-blue-100 text-blue-800' :
                            docItem.tipoRegistro === 'Venta' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {docItem.tipoRegistro}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{docItem.fechaEmision}</td>
                        <td className="p-3 font-mono font-medium text-slate-800">{docItem.rutEmisor}</td>
                        <td className="p-3 font-medium text-slate-900">{docItem.razonSocialEmisor}</td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-800 text-[11px]">{formatChileanDteType(docItem.tipoDoc)}</div>
                          <div className="text-slate-500 font-mono text-[10px]">Folio #{docItem.folio}</div>
                        </td>
                        <td className={`p-3 text-right font-mono ${isNotaCredito ? 'text-rose-700' : 'text-slate-900'}`}>
                          ${displayNeto.toLocaleString('es-CL')}
                        </td>
                        <td className={`p-3 text-right font-mono ${isNotaCredito ? 'text-rose-700' : 'text-slate-900'}`}>
                          ${displayIva.toLocaleString('es-CL')}
                        </td>
                        <td className={`p-3 text-right font-mono font-bold ${isNotaCredito ? 'text-rose-700' : 'text-slate-900'}`}>
                          ${displayTotal.toLocaleString('es-CL')}
                        </td>
                        <td className="p-3 text-center">
                          {docItem.estadoContabilizado ? (
                            <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-[10px] font-bold">
                              Contabilizado
                            </span>
                          ) : (
                            <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-[10px] font-medium">
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setEditingRcvDoc(docItem)}
                              className="text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors text-[11px]"
                              title="Editar montos o datos del documento"
                            >
                              Editar
                            </button>
                            {!docItem.estadoContabilizado ? (
                              <button
                                onClick={() => handleContabilizarSingle(docItem.id)}
                                className="text-indigo-600 hover:text-indigo-900 font-bold bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded transition-colors text-[11px]"
                              >
                                Contabilizar
                              </button>
                            ) : (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded text-[10px] font-semibold">Registrado</span>
                            )}
                            <button
                              onClick={() => handleDeleteSingleRcvDoc(docItem.id, docItem.tipoRegistro, docItem.folio)}
                              className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-1 rounded transition-colors text-xs"
                              title="Eliminar documento de la base de datos"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rcvDocuments.filter(d => d.period === selectedRcvPeriod).length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-8 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <p className="text-slate-500 italic text-sm">
                            No hay documentos registrados para el período <strong>{selectedRcvPeriod}</strong>.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <span className="text-slate-500 text-xs">
                              Utilice el botón <strong>Sincronizar con SII</strong> o cargue los archivos mediante <strong>Cargar CSV/TXT Manual</strong>.
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal para Editar Documento RCV */}
          {editingRcvDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Editar Documento {editingRcvDoc.tipoRegistro}</h3>
                    <p className="text-xs text-slate-500 font-mono">Folio #{editingRcvDoc.folio} - {editingRcvDoc.razonSocialEmisor}</p>
                  </div>
                  <button onClick={() => setEditingRcvDoc(null)} className="text-slate-400 hover:text-slate-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const form = e.target as HTMLFormElement;
                      const neto = parseFloat((form.elements.namedItem('neto') as HTMLInputElement).value) || 0;
                      const iva = parseFloat((form.elements.namedItem('iva') as HTMLInputElement).value) || 0;
                      const exento = parseFloat((form.elements.namedItem('exento') as HTMLInputElement).value) || 0;
                      const total = parseFloat((form.elements.namedItem('total') as HTMLInputElement).value) || (neto + iva + exento);
                      const fecha = (form.elements.namedItem('fecha') as HTMLInputElement).value;
                      const razon = (form.elements.namedItem('razon') as HTMLInputElement).value;
                      const tipoDoc = (form.elements.namedItem('tipoDoc') as HTMLInputElement).value;

                      await updateDoc(doc(companyRef, 'rcvDocuments', editingRcvDoc.id), {
                        montoNeto: neto,
                        montoIva: iva,
                        montoExento: exento,
                        montoTotal: total,
                        fechaEmision: fecha,
                        razonSocialEmisor: razon,
                        tipoDoc: tipoDoc
                      });

                      setEditingRcvDoc(null);
                      await fetchData();
                      alert('Documento actualizado correctamente.');
                    } catch (err: any) {
                      alert('Error actualizando documento: ' + err.message);
                    }
                  }}
                  className="p-5 space-y-4 text-xs"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tipo DTE (ej: 33, 34, 61)</label>
                      <input name="tipoDoc" defaultValue={editingRcvDoc.tipoDoc} className="border border-slate-300 p-2 w-full rounded-lg" required />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Fecha Emisión</label>
                      <input name="fecha" type="date" defaultValue={editingRcvDoc.fechaEmision} className="border border-slate-300 p-2 w-full rounded-lg" required />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Razón Social / Nombre</label>
                    <input name="razon" defaultValue={editingRcvDoc.razonSocialEmisor} className="border border-slate-300 p-2 w-full rounded-lg" required />
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Monto Neto ($)</label>
                      <input
                        id="modal_neto"
                        name="neto"
                        type="number"
                        defaultValue={editingRcvDoc.montoNeto}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value) || 0;
                          const ivaInput = document.getElementById('modal_iva') as HTMLInputElement;
                          const totalInput = document.getElementById('modal_total') as HTMLInputElement;
                          if (ivaInput && totalInput) {
                            const calculatedIva = Math.round(n * 0.19);
                            ivaInput.value = String(calculatedIva);
                            totalInput.value = String(n + calculatedIva);
                          }
                        }}
                        className="border border-slate-300 p-2 w-full rounded-lg bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">IVA Crédito/Débito ($)</label>
                      <input id="modal_iva" name="iva" type="number" defaultValue={editingRcvDoc.montoIva} className="border border-slate-300 p-2 w-full rounded-lg bg-white" required />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Monto Exento ($)</label>
                      <input name="exento" type="number" defaultValue={editingRcvDoc.montoExento || 0} className="border border-slate-300 p-2 w-full rounded-lg bg-white" />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Monto Total ($)</label>
                      <input id="modal_total" name="total" type="number" defaultValue={editingRcvDoc.montoTotal} className="border border-slate-300 p-2 w-full rounded-lg bg-white font-bold" required />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setEditingRcvDoc(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold">Guardar Cambios</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: COMPROBANTES CONTABLES */}
      {activeTab === 'vouchers' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-medium text-slate-900">Comprobantes Contables</h3>
              <p className="text-slate-500 text-sm mt-1">Gestión integral de asientos contables: consulta, edición, anulación y eliminación.</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={voucherFilterType}
                onChange={e => setVoucherFilterType(e.target.value)}
                className="border border-slate-300 p-2 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Todos">Todos los Tipos</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Egreso">Egreso</option>
                <option value="Traspaso">Traspaso</option>
              </select>

              <select
                value={voucherFilterYear}
                onChange={e => setVoucherFilterYear(e.target.value)}
                className="border border-slate-300 p-2 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Todos">Todos los Años</option>
                <option value="2028">2028</option>
                <option value="2027">2027</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
              </select>

              <select
                value={voucherFilterMonth}
                onChange={e => setVoucherFilterMonth(e.target.value)}
                className="border border-slate-300 p-2 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="Todos">Todos los Meses</option>
                <option value="01">Enero</option>
                <option value="02">Febrero</option>
                <option value="03">Marzo</option>
                <option value="04">Abril</option>
                <option value="05">Mayo</option>
                <option value="06">Junio</option>
                <option value="07">Julio</option>
                <option value="08">Agosto</option>
                <option value="09">Septiembre</option>
                <option value="10">Octubre</option>
                <option value="11">Noviembre</option>
                <option value="12">Diciembre</option>
              </select>

              <input 
                type="text" 
                placeholder="Buscar por glosa, número o RUT..." 
                value={voucherSearchQuery}
                onChange={e => setVoucherSearchQuery(e.target.value)}
                className="border border-slate-300 p-2 rounded-lg text-xs w-56 focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleOpenCreateVoucher}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nuevo Comprobante
              </button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-auto max-h-[550px] relative shadow-2xs">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
                <tr>
                  <th className="p-3 bg-slate-50">Número</th>
                  <th className="p-3 bg-slate-50">Fecha</th>
                  <th className="p-3 bg-slate-50">Tipo</th>
                  <th className="p-3 bg-slate-50">Estado</th>
                  <th className="p-3 bg-slate-50">Glosa</th>
                  <th className="p-3 text-right bg-slate-50">Total Debe</th>
                  <th className="p-3 text-right bg-slate-50">Total Haber</th>
                  <th className="p-3 text-center min-w-[200px] bg-slate-50">Acciones</th>
                </tr>
                {/* Column Search Filters Row */}
                <tr className="bg-slate-100 border-b border-slate-200 text-xs normal-case sticky top-[41px] z-10 shadow-2xs">
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Filtrar N°..."
                      value={colNumSearch}
                      onChange={e => setColNumSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white font-mono text-[11px]"
                    />
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="AAAA-MM-DD"
                      value={colDateSearch}
                      onChange={e => setColDateSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px]"
                    />
                  </th>
                  <th className="p-2">
                    <select
                      value={colTypeSearch}
                      onChange={e => setColTypeSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px]"
                    >
                      <option value="Todos">Todos</option>
                      <option value="Ingreso">Ingreso</option>
                      <option value="Egreso">Egreso</option>
                      <option value="Traspaso">Traspaso</option>
                    </select>
                  </th>
                  <th className="p-2">
                    <select
                      value={colStatusSearch}
                      onChange={e => setColStatusSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px]"
                    >
                      <option value="Todos">Todos</option>
                      <option value="Valido">Válido</option>
                      <option value="Anulado">Anulado</option>
                    </select>
                  </th>
                  <th className="p-2">
                    <input
                      type="text"
                      placeholder="Filtrar glosa..."
                      value={colGlossSearch}
                      onChange={e => setColGlossSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px]"
                    />
                  </th>
                  <th className="p-2 text-right">
                    <input
                      type="text"
                      placeholder="Debe..."
                      value={colDebitSearch}
                      onChange={e => setColDebitSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px] text-right font-mono"
                    />
                  </th>
                  <th className="p-2 text-right">
                    <input
                      type="text"
                      placeholder="Haber..."
                      value={colCreditSearch}
                      onChange={e => setColCreditSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1 bg-white text-[11px] text-right font-mono"
                    />
                  </th>
                  <th className="p-2 text-center">
                    {(colNumSearch || colDateSearch || colTypeSearch !== 'Todos' || colStatusSearch !== 'Todos' || colGlossSearch || colDebitSearch || colCreditSearch) && (
                      <button
                        onClick={() => {
                          setColNumSearch('');
                          setColDateSearch('');
                          setColTypeSearch('Todos');
                          setColStatusSearch('Todos');
                          setColGlossSearch('');
                          setColDebitSearch('');
                          setColCreditSearch('');
                        }}
                        className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded"
                        title="Limpiar filtros"
                      >
                        Limpiar
                      </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {vouchers
                  .filter(v => voucherFilterType === 'Todos' || v.type === voucherFilterType)
                  .filter(v => {
                    if (voucherFilterYear === 'Todos') return true;
                    if (!v.date) return false;
                    return v.date.startsWith(voucherFilterYear);
                  })
                  .filter(v => {
                    if (voucherFilterMonth === 'Todos') return true;
                    if (!v.date) return false;
                    const m = v.date.slice(5, 7);
                    return m === voucherFilterMonth;
                  })
                  .filter(v => 
                    !voucherSearchQuery ||
                    (v.gloss || '').toLowerCase().includes(voucherSearchQuery.toLowerCase()) ||
                    String(v.voucherNumber || '').includes(voucherSearchQuery) ||
                    (v.lines && v.lines.some(l => (l.auxiliaryRut || '').toLowerCase().includes(voucherSearchQuery.toLowerCase()) || (l.accountCode || '').includes(voucherSearchQuery)))
                  )
                  .filter(v => !colNumSearch || String(v.voucherNumber).toLowerCase().includes(colNumSearch.toLowerCase()))
                  .filter(v => !colDateSearch || (v.date && v.date.toLowerCase().includes(colDateSearch.toLowerCase())))
                  .filter(v => colTypeSearch === 'Todos' || v.type === colTypeSearch)
                  .filter(v => colStatusSearch === 'Todos' || v.status === colStatusSearch)
                  .filter(v => !colGlossSearch || (v.gloss && v.gloss.toLowerCase().includes(colGlossSearch.toLowerCase())))
                  .filter(v => !colDebitSearch || String(v.totalDebit).includes(colDebitSearch))
                  .filter(v => !colCreditSearch || String(v.totalCredit).includes(colCreditSearch))
                  .map((v) => {
                    const isAnulado = v.status === 'Anulado';
                    return (
                      <tr key={v.id} className={`hover:bg-slate-50 transition-colors ${isAnulado ? 'bg-rose-50/40 text-slate-500' : ''}`}>
                        <td className="p-3 font-mono font-bold text-indigo-700">N° {v.voucherNumber}</td>
                        <td className="p-3">{v.date}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${v.type === 'Ingreso' ? 'bg-emerald-100 text-emerald-800' : v.type === 'Egreso' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-800'}`}>
                            {v.type}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isAnulado ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                            {isAnulado ? 'Anulado' : 'Válido'}
                          </span>
                        </td>
                        <td className="p-3 truncate max-w-xs" title={v.gloss}>
                          <span className={isAnulado ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}>
                            {v.gloss}
                          </span>
                        </td>
                        <td className="p-3 text-right font-medium text-slate-900">${v.totalDebit.toLocaleString('es-CL')}</td>
                        <td className="p-3 text-right font-medium text-slate-900">${v.totalCredit.toLocaleString('es-CL')}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              onClick={() => setSelectedVoucher(v)}
                              className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors text-[11px] font-medium"
                              title="Ver detalle de líneas"
                            >
                              Ver
                            </button>
                            <button
                              onClick={() => handleOpenEditVoucher(v)}
                              className="text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded transition-colors text-[11px] font-medium"
                              title="Modificar cuentas, glosa o montos"
                            >
                              Modificar
                            </button>
                            <button
                              onClick={() => handleToggleAnularVoucher(v)}
                              className={`${isAnulado ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-purple-700 bg-purple-50 hover:bg-purple-100'} px-2 py-1 rounded transition-colors text-[11px] font-medium`}
                              title={isAnulado ? 'Reactivar comprobante' : 'Anular comprobante'}
                            >
                              {isAnulado ? 'Reactivar' : 'Anular'}
                            </button>
                            <button
                              onClick={() => handleDeleteVoucher(v)}
                              className="text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded transition-colors text-[11px] font-medium"
                              title="Eliminar comprobante definitivamente"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {vouchers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                      No hay comprobantes contables registrados en la empresa. Puedes crear uno manual o generarlos desde el módulo RCV.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Modal Detalle de Comprobante */}
          {selectedVoucher && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-slate-900">Comprobante Contable de {selectedVoucher.type} N° {selectedVoucher.voucherNumber}</h2>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${selectedVoucher.status === 'Anulado' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                          {selectedVoucher.status === 'Anulado' ? 'Anulado' : 'Válido'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 font-mono">Fecha: {selectedVoucher.date} | Período: {selectedVoucher.period}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedVoucher(null)} className="text-slate-400 hover:text-slate-600">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="p-6 flex-1 overflow-y-auto space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-700 uppercase mb-1">Glosa General</h4>
                    <p className="text-sm text-slate-800 font-medium">{selectedVoucher.gloss}</p>
                    {selectedVoucher.status === 'Anulado' && selectedVoucher.anuladoReason && (
                      <p className="text-xs text-rose-700 mt-2 font-medium bg-rose-50 p-2 rounded border border-rose-200">
                        Motivo de anulación: {selectedVoucher.anuladoReason}
                      </p>
                    )}
                    {selectedVoucher.createdFromRcvId && (
                      <p className="text-xs text-indigo-600 mt-2 font-mono flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Generado automáticamente desde documento RCV
                      </p>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[700px]">
                      <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-3 w-28">Cuenta</th>
                          <th className="p-3">Nombre Cuenta</th>
                          <th className="p-3">Análisis & Atributos</th>
                          <th className="p-3">Doc Ref</th>
                          <th className="p-3">Detalle / Glosa Línea</th>
                          <th className="p-3 text-right w-28">Debe ($)</th>
                          <th className="p-3 text-right w-28">Haber ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedVoucher.lines.map((line, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-bold text-slate-700">{line.accountCode}</td>
                            <td className="p-3 font-medium text-slate-900">{line.accountName}</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1 max-w-[280px]">
                                {line.auxiliaryRut && (
                                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px] font-mono" title={line.auxiliaryName}>
                                    👤 {line.auxiliaryRut}
                                  </span>
                                )}
                                {line.costCenter && (
                                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                                    🏢 {line.costCenter}
                                  </span>
                                )}
                                {line.bankDocRef && (
                                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                    🏦 {line.bankDocRef}
                                  </span>
                                )}
                                {line.dueDate && (
                                  <span className="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded text-[10px]">
                                    📅 {line.dueDate}
                                  </span>
                                )}
                                {line.expenseItem && (
                                  <span className="bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded text-[10px]">
                                    🏷️ {line.expenseItem}
                                  </span>
                                )}
                                {line.project && (
                                  <span className="bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded text-[10px]">
                                    🏗️ {line.project}
                                  </span>
                                )}
                                {line.product && (
                                  <span className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-[10px]">
                                    📦 {line.product}
                                  </span>
                                )}
                                {line.customAnalyses && Object.entries(line.customAnalyses).map(([k, v]) => v ? (
                                  <span key={k} className="bg-slate-100 text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded text-[10px]">
                                    ⚙️ {k}: {v}
                                  </span>
                                ) : null)}
                                {!line.auxiliaryRut && !line.costCenter && !line.bankDocRef && !line.dueDate && !line.expenseItem && !line.project && !line.product && (!line.customAnalyses || Object.keys(line.customAnalyses).length === 0) && (
                                  <span className="text-slate-400">-</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-slate-600 font-mono">{line.documentRef || '-'}</td>
                            <td className="p-3 text-slate-600 truncate max-w-[180px]" title={line.gloss}>{line.gloss || '-'}</td>
                            <td className="p-3 text-right font-medium text-slate-900">{line.debit > 0 ? `$${line.debit.toLocaleString('es-CL')}` : ''}</td>
                            <td className="p-3 text-right font-medium text-slate-900">{line.credit > 0 ? `$${line.credit.toLocaleString('es-CL')}` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                        <tr>
                          <td colSpan={5} className="p-3 text-right font-bold text-slate-900 uppercase">Totales</td>
                          <td className="p-3 text-right font-bold text-indigo-700">${selectedVoucher.totalDebit.toLocaleString('es-CL')}</td>
                          <td className="p-3 text-right font-bold text-indigo-700">${selectedVoucher.totalCredit.toLocaleString('es-CL')}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  
                  {selectedVoucher.totalDebit !== selectedVoucher.totalCredit && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Alerta: El comprobante está descuadrado (Diferencia: ${(Math.abs(selectedVoucher.totalDebit - selectedVoucher.totalCredit)).toLocaleString('es-CL')})
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const vToEdit = selectedVoucher;
                        setSelectedVoucher(null);
                        handleOpenEditVoucher(vToEdit);
                      }}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Modificar Comprobante
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleAnularVoucher(selectedVoucher)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${selectedVoucher.status === 'Anulado' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                    >
                      {selectedVoucher.status === 'Anulado' ? 'Reactivar Comprobante' : 'Anular Comprobante'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVoucher(selectedVoucher)}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Eliminar Comprobante
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedVoucher(null)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Acción sobre Comprobante (Anular / Reactivar / Eliminar) */}
          {voucherActionModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
                <div className={`p-5 border-b flex items-center justify-between ${
                  voucherActionModal.type === 'eliminar' ? 'bg-rose-50 border-rose-100' :
                  voucherActionModal.type === 'anular' ? 'bg-purple-50 border-purple-100' :
                  'bg-emerald-50 border-emerald-100'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                      voucherActionModal.type === 'eliminar' ? 'bg-rose-600 text-white' :
                      voucherActionModal.type === 'anular' ? 'bg-purple-600 text-white' :
                      'bg-emerald-600 text-white'
                    }`}>
                      {voucherActionModal.type === 'eliminar' ? '🗑️' :
                       voucherActionModal.type === 'anular' ? '🚫' : '🔄'}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base">
                        {voucherActionModal.type === 'eliminar' && `Eliminar Comprobante N° ${voucherActionModal.voucher.voucherNumber}`}
                        {voucherActionModal.type === 'anular' && `Anular Comprobante N° ${voucherActionModal.voucher.voucherNumber}`}
                        {voucherActionModal.type === 'reactivar' && `Reactivar Comprobante N° ${voucherActionModal.voucher.voucherNumber}`}
                      </h3>
                      <p className="text-xs text-slate-500 font-mono">
                        Tipo: {voucherActionModal.voucher.type} | Período: {voucherActionModal.voucher.period || voucherActionModal.voucher.date?.substring(0, 7)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setVoucherActionModal(null)}
                    disabled={actionLoading}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="p-5 space-y-4 text-xs text-slate-600">
                  {voucherActionModal.type === 'eliminar' && (
                    <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg text-rose-900 space-y-2">
                      <p className="font-semibold text-rose-800">
                        ⚠️ ¿Deseas eliminar este comprobante contable de forma definitiva?
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        El comprobante será eliminado de la base de datos. Si proviene de un documento cargado desde el RCV (Compras, Ventas o Boleta de Honorarios), dicho documento quedará inmediatamente <strong className="underline font-bold">liberado y en estado Pendiente de Contabilizar</strong> para que puedas volver a contabilizarlo con las cuentas y análisis correctos.
                      </p>
                    </div>
                  )}

                  {voucherActionModal.type === 'anular' && (
                    <div className="space-y-3">
                      <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg text-purple-900 space-y-2">
                        <p className="font-semibold text-purple-800">
                          ℹ️ Efecto de la anulación contable:
                        </p>
                        <p className="text-[11px] leading-relaxed">
                          El comprobante quedará marcado como <strong className="font-bold">Anulado</strong> preservando su número correlativo para fines de auditoría e historial. Los documentos de origen del RCV vinculados volverán a quedar <strong className="underline font-bold">Pendientes de Contabilizar</strong> para su corrección o re-emisión.
                        </p>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Motivo de Anulación *</label>
                        <textarea
                          value={voucherActionModal.reason}
                          onChange={e => setVoucherActionModal({ ...voucherActionModal, reason: e.target.value })}
                          placeholder="Ingresa el motivo de anulación..."
                          className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                          rows={3}
                          required
                        />
                      </div>
                    </div>
                  )}

                  {voucherActionModal.type === 'reactivar' && (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-emerald-900 space-y-2">
                      <p className="font-semibold text-emerald-800">
                        🔄 ¿Confirmas reactivar este comprobante?
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        El comprobante volverá al estado <strong className="font-bold">Válido</strong> e impactará nuevamente los balances, libros y mayores contables.
                      </p>
                    </div>
                  )}

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <span className="font-semibold text-slate-700 block mb-1">Glosa actual del Comprobante:</span>
                    <p className="italic text-slate-600 bg-white p-2 rounded border border-slate-200 text-[11px]">
                      {voucherActionModal.voucher.gloss || 'Sin glosa'}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setVoucherActionModal(null)}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmVoucherAction}
                    disabled={actionLoading || (voucherActionModal.type === 'anular' && !voucherActionModal.reason.trim())}
                    className={`px-4 py-2 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 ${
                      voucherActionModal.type === 'eliminar' ? 'bg-rose-600 hover:bg-rose-700' :
                      voucherActionModal.type === 'anular' ? 'bg-purple-600 hover:bg-purple-700' :
                      'bg-emerald-600 hover:bg-emerald-700'
                    } ${actionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {actionLoading ? 'Procesando...' : (
                      voucherActionModal.type === 'eliminar' ? 'Confirmar Eliminación Definitiva' :
                      voucherActionModal.type === 'anular' ? 'Confirmar Anulación' :
                      'Confirmar Reactivación'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal para Crear o Modificar Comprobante Contable */}
          {voucherForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]">
                <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <span>{voucherForm.id ? `Modificar Comprobante N° ${voucherForm.voucherNumber}` : 'Nuevo Comprobante Contable'}</span>
                      <span className="text-xs font-mono font-normal bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                        {voucherForm.type}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Ingresa las cuentas contables, auxiliares y montos cuadrados a partida doble.</p>
                  </div>
                  <button onClick={() => setVoucherForm(null)} className="text-slate-400 hover:text-slate-600">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleSaveVoucherForm} className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-5 space-y-4 overflow-y-auto flex-1">
                    {/* Header Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">N° Comprobante *</label>
                        <input
                          type="number"
                          value={voucherForm.voucherNumber}
                          onChange={e => setVoucherForm({ ...voucherForm, voucherNumber: parseInt(e.target.value) || 1 })}
                          className="border border-slate-300 p-2 w-full rounded-lg font-mono font-bold bg-white focus:ring-2 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Fecha Emisión *</label>
                        <input
                          type="date"
                          value={voucherForm.date}
                          onChange={e => {
                            const newDate = e.target.value;
                            setVoucherForm({ ...voucherForm, date: newDate, period: newDate ? newDate.substring(0, 7) : voucherForm.period });
                          }}
                          className="border border-slate-300 p-2 w-full rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Tipo de Comprobante *</label>
                        <select
                          value={voucherForm.type}
                          onChange={e => setVoucherForm({ ...voucherForm, type: e.target.value as any })}
                          className="border border-slate-300 p-2 w-full rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                          required
                        >
                          <option value="Traspaso">Traspaso</option>
                          <option value="Ingreso">Ingreso</option>
                          <option value="Egreso">Egreso</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Estado</label>
                        <select
                          value={voucherForm.status || 'Valido'}
                          onChange={e => setVoucherForm({ ...voucherForm, status: e.target.value as any })}
                          className="border border-slate-300 p-2 w-full rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 font-semibold"
                        >
                          <option value="Valido">Válido</option>
                          <option value="Anulado">Anulado</option>
                        </select>
                      </div>

                      <div className="sm:col-span-2 md:col-span-4">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block font-semibold text-slate-700">Glosa General del Comprobante *</label>
                          <span className="text-[11px] text-slate-500 italic">
                            💡 La glosa general se copiará automáticamente en las líneas que se vayan ingresando
                          </span>
                        </div>
                        <input
                          type="text"
                          value={voucherForm.gloss}
                          onChange={e => {
                            const newGeneralGloss = e.target.value;
                            const oldGeneralGloss = voucherForm.gloss;
                            // Copy to line gloss if line gloss is empty or was matching old general gloss
                            const updatedLines = voucherForm.lines.map(line => {
                              if (!line.gloss || line.gloss === oldGeneralGloss) {
                                return { ...line, gloss: newGeneralGloss };
                              }
                              return line;
                            });
                            setVoucherForm({ ...voucherForm, gloss: newGeneralGloss, lines: updatedLines });
                          }}
                          placeholder="Ej. Pago a proveedores factura 1234 / Centralización compras enero..."
                          className="border border-slate-300 p-2 w-full rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
                          required
                        />
                      </div>
                    </div>

                    {/* Table of Lines */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Líneas Contables ({voucherForm.lines.length})</h4>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const totalDeb = voucherForm.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                              const totalCred = voucherForm.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                              const diff = totalDeb - totalCred;
                              if (diff === 0) {
                                alert('El comprobante ya se encuentra perfectamente cuadrado.');
                                return;
                              }
                              // Add a balancing line
                              const newLine: VoucherLine = {
                                accountId: '',
                                accountCode: '',
                                accountName: '',
                                debit: diff < 0 ? Math.abs(diff) : 0,
                                credit: diff > 0 ? diff : 0,
                                auxiliaryRut: '',
                                documentRef: '',
                                gloss: voucherForm.gloss || 'Ajuste de cuadre'
                              };
                              setVoucherForm({ ...voucherForm, lines: [...voucherForm.lines, newLine] });
                            }}
                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                          >
                            ⚖️ Auto-cuadrar Saldo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newLine: VoucherLine = {
                                accountId: '',
                                accountCode: '',
                                accountName: '',
                                debit: 0,
                                credit: 0,
                                auxiliaryRut: '',
                                documentRef: '',
                                gloss: voucherForm.gloss || ''
                              };
                              setVoucherForm({ ...voucherForm, lines: [...voucherForm.lines, newLine] });
                            }}
                            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
                          >
                            ➕ Agregar Línea
                          </button>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[950px]">
                          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                            <tr>
                              <th className="p-2.5 w-72">Cuenta Contable *</th>
                              <th className="p-2.5 w-56">Análisis & Atributos</th>
                              <th className="p-2.5 w-32">Doc Ref</th>
                              <th className="p-2.5">Detalle / Glosa Línea</th>
                              <th className="p-2.5 text-right w-28">Debe ($)</th>
                              <th className="p-2.5 text-right w-28">Haber ($)</th>
                              <th className="p-2.5 text-center w-10"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {voucherForm.lines.map((line, idx) => {
                              const lineAcc = accounts.find(a => a.id === line.accountId || (line.accountCode && a.code === line.accountCode));
                              const customCols = company.customAccountColumns || [];
                              const valResult = validateVoucherLine(line, lineAcc, customCols);
                              const hasMissing = valResult.missingFields.length > 0;

                              return (
                                <tr key={idx} className={`hover:bg-slate-50 ${hasMissing && line.accountId ? 'bg-amber-50/40' : ''}`}>
                                  <td className="p-2">
                                    <select
                                      value={line.accountId || ''}
                                      onChange={(e) => {
                                        const selectedAccId = e.target.value;
                                        const accObj = accounts.find(a => a.id === selectedAccId);
                                        const newLines = [...voucherForm.lines];
                                        let defaultDue = newLines[idx].dueDate;
                                        if (accObj?.requiereVencimiento && !defaultDue && voucherForm.date) {
                                          try {
                                            const parts = voucherForm.date.split('-');
                                            if (parts.length === 3) {
                                              const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                                              dt.setDate(dt.getDate() + 30);
                                              defaultDue = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                                            }
                                          } catch {}
                                        }
                                        newLines[idx] = {
                                          ...newLines[idx],
                                          accountId: selectedAccId,
                                          accountCode: accObj?.code || '',
                                          accountName: accObj?.name || '',
                                          ...(defaultDue ? { dueDate: defaultDue } : {})
                                        };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className="border border-slate-300 p-1.5 w-full rounded text-xs bg-white focus:ring-1 focus:ring-indigo-500 font-mono"
                                    >
                                      <option value="">Seleccione Cuenta...</option>
                                      {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                          [{acc.code}] {acc.name}
                                        </option>
                                      ))}
                                    </select>

                                    {/* Badges de Análisis Exigidos por el Plan de Cuentas */}
                                    {lineAcc && (
                                      <div className="flex flex-wrap gap-1 mt-1 font-mono text-[9px]">
                                        {lineAcc.requiereAuxiliarRUT && (
                                          <span className={`px-1 py-0.2 rounded border ${line.auxiliaryRut ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                            RUT*
                                          </span>
                                        )}
                                        {lineAcc.requiereDocumento && (
                                          <span className={`px-1 py-0.2 rounded border ${line.documentRef ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                            DOC*
                                          </span>
                                        )}
                                        {lineAcc.requiereCentroCosto && (
                                          <span className={`px-1 py-0.2 rounded border ${line.costCenter ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                            CC*
                                          </span>
                                        )}
                                        {lineAcc.requiereConciliacionBancaria && (
                                          <span className={`px-1 py-0.2 rounded border ${line.bankDocRef ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                            BANCO*
                                          </span>
                                        )}
                                        {lineAcc.requiereVencimiento && (
                                          <span className={`px-1 py-0.2 rounded border ${line.dueDate ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                            VCTO*
                                          </span>
                                        )}
                                        {lineAcc.requiereItemGasto && (
                                          <span className={`px-1 py-0.2 rounded border ${line.expenseItem ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                            GASTO*
                                          </span>
                                        )}
                                        {lineAcc.requiereProyecto && (
                                          <span className={`px-1 py-0.2 rounded border ${line.project ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                            PROY*
                                          </span>
                                        )}
                                        {lineAcc.requiereProducto && (
                                          <span className={`px-1 py-0.2 rounded border ${line.product ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                            PROD*
                                          </span>
                                        )}
                                        {customCols.map(col => {
                                          if (!isCustomAnalysisRequired(lineAcc, col)) return null;
                                          const val = line.customAnalyses?.[col];
                                          return (
                                            <span key={col} className={`px-1 py-0.2 rounded border ${val ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-rose-50 text-rose-700 border-rose-300 font-bold'}`}>
                                              {col.toUpperCase()}*
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setEditingAnalysisLineIdx(idx)}
                                        className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors border ${
                                          hasMissing && line.accountId
                                            ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                                            : line.auxiliaryRut || line.costCenter || line.bankDocRef || line.dueDate || line.expenseItem || line.project || line.product
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                            : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                        }`}
                                      >
                                        <span>📊</span>
                                        <span>
                                          {hasMissing && line.accountId
                                            ? `Faltan ${valResult.missingFields.length}`
                                            : line.auxiliaryRut || line.costCenter || line.bankDocRef
                                            ? 'Ver / Editar'
                                            : 'Completar'}
                                        </span>
                                      </button>

                                      {/* Quick preview tag of auxiliary or CC */}
                                      {line.auxiliaryRut ? (
                                        <span className="text-[10px] font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[110px]" title={`${line.auxiliaryRut} ${line.auxiliaryName || ''}`}>
                                          {line.auxiliaryRut}
                                        </span>
                                      ) : line.costCenter ? (
                                        <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded truncate max-w-[100px]" title={line.costCenter}>
                                          CC: {line.costCenter}
                                        </span>
                                      ) : null}

                                      <button
                                        type="button"
                                        onClick={() => setDistributingLineIdx(idx)}
                                        className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap"
                                        title="Distribuir esta línea en múltiples centros de costos, ítems de gasto o cuentas"
                                      >
                                        <span>✂️</span>
                                        <span>Distribuir</span>
                                      </button>
                                    </div>
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      placeholder="Ej. FAC 102"
                                      value={line.documentRef || ''}
                                      onChange={(e) => {
                                        const newLines = [...voucherForm.lines];
                                        newLines[idx] = { ...newLines[idx], documentRef: e.target.value };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className="border border-slate-300 p-1.5 w-full rounded text-xs focus:ring-1 focus:ring-indigo-500 font-mono"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <div className="relative flex items-center">
                                      <input
                                        type="text"
                                        placeholder={voucherForm.gloss || "Detalle de línea..."}
                                        value={line.gloss || ''}
                                        onFocus={() => {
                                          if (!line.gloss && voucherForm.gloss) {
                                            const newLines = [...voucherForm.lines];
                                            newLines[idx] = { ...newLines[idx], gloss: voucherForm.gloss };
                                            setVoucherForm({ ...voucherForm, lines: newLines });
                                          }
                                        }}
                                        onChange={(e) => {
                                          const newLines = [...voucherForm.lines];
                                          newLines[idx] = { ...newLines[idx], gloss: e.target.value };
                                          setVoucherForm({ ...voucherForm, lines: newLines });
                                        }}
                                        className="border border-slate-300 p-1.5 w-full rounded text-xs focus:ring-1 focus:ring-indigo-500 pr-7"
                                      />
                                      {voucherForm.gloss && line.gloss !== voucherForm.gloss && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newLines = [...voucherForm.lines];
                                            newLines[idx] = { ...newLines[idx], gloss: voucherForm.gloss };
                                            setVoucherForm({ ...voucherForm, lines: newLines });
                                          }}
                                          title="Copiar glosa general a esta línea"
                                          className="absolute right-1 text-slate-400 hover:text-indigo-600 p-1 text-[11px]"
                                        >
                                          📋
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-2 text-right">
                                    <FormattedAmountInput
                                      value={line.debit || 0}
                                      placeholder="0"
                                      onChange={(val) => {
                                        const newLines = [...voucherForm.lines];
                                        newLines[idx] = {
                                          ...newLines[idx],
                                          debit: val,
                                          credit: val > 0 ? 0 : newLines[idx].credit
                                        };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className="border border-slate-300 p-1.5 w-full rounded text-xs text-right font-medium font-mono focus:ring-1 focus:ring-indigo-500 bg-white"
                                    />
                                  </td>
                                  <td className="p-2 text-right">
                                    <FormattedAmountInput
                                      value={line.credit || 0}
                                      placeholder="0"
                                      onChange={(val) => {
                                        const newLines = [...voucherForm.lines];
                                        newLines[idx] = {
                                          ...newLines[idx],
                                          credit: val,
                                          debit: val > 0 ? 0 : newLines[idx].debit
                                        };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className="border border-slate-300 p-1.5 w-full rounded text-xs text-right font-medium font-mono focus:ring-1 focus:ring-indigo-500 bg-white"
                                    />
                                  </td>
                                  <td className="p-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (voucherForm.lines.length <= 2) {
                                          alert('Un comprobante debe tener al menos dos líneas.');
                                          return;
                                        }
                                        const newLines = voucherForm.lines.filter((_, i) => i !== idx);
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition-colors"
                                      title="Eliminar fila"
                                    >
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                            {(() => {
                              const sumDebit = voucherForm.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                              const sumCredit = voucherForm.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                              const diff = Math.abs(sumDebit - sumCredit);
                              const isCuadrado = sumDebit === sumCredit && sumDebit > 0;
                              return (
                                <>
                                  <tr>
                                    <td colSpan={4} className="p-2.5 text-right uppercase text-slate-700">Totales Cuadratura:</td>
                                    <td className="p-2.5 text-right font-mono text-indigo-700 font-bold">${sumDebit.toLocaleString('es-CL')}</td>
                                    <td className="p-2.5 text-right font-mono text-indigo-700 font-bold">${sumCredit.toLocaleString('es-CL')}</td>
                                    <td></td>
                                  </tr>
                                  {!isCuadrado && sumDebit + sumCredit > 0 && (
                                    <tr className="bg-rose-50 text-rose-700">
                                      <td colSpan={7} className="p-2 text-center font-medium">
                                        ⚠️ Descuadre Contable: Diferencia de ${diff.toLocaleString('es-CL')} (Debe: ${sumDebit.toLocaleString('es-CL')} | Haber: ${sumCredit.toLocaleString('es-CL')})
                                      </td>
                                    </tr>
                                  )}
                                  {isCuadrado && (
                                    <tr className="bg-emerald-50 text-emerald-700">
                                      <td colSpan={7} className="p-2 text-center font-medium">
                                        ✓ Asiento Contable Cuadrado a Partida Doble (${sumDebit.toLocaleString('es-CL')})
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })()}
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={() => setVoucherForm(null)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {voucherForm.id ? 'Guardar Cambios' : 'Registrar Comprobante'}
                    </button>
                  </div>
                </form>

                {/* Sub-modal / Drawer para Editar TODOS los Análisis de la Línea */}
                {editingAnalysisLineIdx !== null && voucherForm.lines[editingAnalysisLineIdx] && (() => {
                  const targetIdx = editingAnalysisLineIdx;
                  const currentLine = voucherForm.lines[targetIdx];
                  const lineAcc = accounts.find(a => a.id === currentLine.accountId || (currentLine.accountCode && a.code === currentLine.accountCode));
                  const customCols = company.customAccountColumns || [];

                  return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-sm flex items-center gap-2">
                              <span>📊 Análisis Contables - Línea #{targetIdx + 1}</span>
                              {lineAcc && (
                                <span className="bg-indigo-500/30 text-indigo-200 text-xs px-2 py-0.5 rounded font-mono border border-indigo-400/40">
                                  {lineAcc.code}
                                </span>
                              )}
                            </h4>
                            <p className="text-xs text-slate-300 mt-0.5 font-medium">
                              {lineAcc ? lineAcc.name : 'Cuenta no seleccionada'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingAnalysisLineIdx(null)}
                            className="text-slate-400 hover:text-white text-lg font-bold"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
                          {/* Account requirements summary bar */}
                          {lineAcc ? (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                              <span className="font-bold text-slate-700 block">Exigencias según Plan de Cuentas:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {lineAcc.requiereAuxiliarRUT ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-semibold">⚠️ Exige Auxiliar / RUT</span> : null}
                                {lineAcc.requiereDocumento ? <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold">⚠️ Exige N° Documento</span> : null}
                                {lineAcc.requiereCentroCosto ? <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">⚠️ Exige Centro de Costos</span> : null}
                                {lineAcc.requiereConciliacionBancaria ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">⚠️ Exige Banco / Cheque</span> : null}
                                {lineAcc.requiereVencimiento ? <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded font-semibold">⚠️ Exige Fecha Vencimiento</span> : null}
                                {lineAcc.requiereItemGasto ? <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded font-semibold">⚠️ Exige Ítem Gasto</span> : null}
                                {lineAcc.requiereProyecto ? <span className="px-2 py-0.5 bg-teal-100 text-teal-800 rounded font-semibold">⚠️ Exige Proyecto</span> : null}
                                {lineAcc.requiereProducto ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded font-semibold">⚠️ Exige Producto</span> : null}
                                {customCols.map(col => {
                                  if (isCustomAnalysisRequired(lineAcc, col)) {
                                    return <span key={col} className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-semibold">⚠️ Exige {col}</span>;
                                  }
                                  return null;
                                })}
                                {!lineAcc.requiereAuxiliarRUT && !lineAcc.requiereDocumento && !lineAcc.requiereCentroCosto && !lineAcc.requiereConciliacionBancaria && !lineAcc.requiereVencimiento && !lineAcc.requiereItemGasto && !lineAcc.requiereProyecto && !lineAcc.requiereProducto && (
                                  <span className="text-slate-500 italic">Esta cuenta no tiene análisis configurados como obligatorios. Puedes ingresarlos de forma opcional.</span>
                                )}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* 1. Auxiliar RUT & Selector */}
                            <div className="sm:col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                                <span>👤 Auxiliar / RUT</span>
                                {lineAcc?.requiereAuxiliarRUT && <span className="text-rose-600 font-bold">* (Obligatorio)</span>}
                              </label>
                              <SearchableAuxiliarySelect
                                auxiliaries={auxiliaries}
                                valueRut={currentLine.auxiliaryRut || ''}
                                valueName={currentLine.auxiliaryName || ''}
                                onSelect={(selAux) => {
                                  const newLines = [...voucherForm.lines];
                                  const curLine = newLines[targetIdx];
                                  newLines[targetIdx] = {
                                    ...curLine,
                                    auxiliaryRut: selAux.rut,
                                    auxiliaryName: selAux.name,
                                    costCenter: curLine.costCenter || selAux.defaultCostCenter || undefined,
                                    expenseItem: curLine.expenseItem || selAux.defaultExpenseItem || undefined,
                                    project: curLine.project || selAux.defaultProject || undefined,
                                    product: curLine.product || selAux.defaultProduct || undefined,
                                    gloss: (!curLine.gloss || curLine.gloss === voucherForm.gloss) && selAux.defaultGloss 
                                      ? selAux.defaultGloss 
                                      : curLine.gloss
                                  };
                                  setVoucherForm({ ...voucherForm, lines: newLines });
                                }}
                                onManualRutChange={(rut) => {
                                  const newLines = [...voucherForm.lines];
                                  newLines[targetIdx] = { ...newLines[targetIdx], auxiliaryRut: rut };
                                  setVoucherForm({ ...voucherForm, lines: newLines });
                                }}
                                onManualNameChange={(name) => {
                                  const newLines = [...voucherForm.lines];
                                  newLines[targetIdx] = { ...newLines[targetIdx], auxiliaryName: name };
                                  setVoucherForm({ ...voucherForm, lines: newLines });
                                }}
                                required={Boolean(lineAcc?.requiereAuxiliarRUT)}
                                placeholder="Digitar RUT o Nombre para buscar..."
                              />
                            </div>

                            {/* 2. Documento Referencia / No SII */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="font-bold text-slate-800 block">
                                  📄 N° Documento / Ref DTE
                                  {lineAcc?.requiereDocumento && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                                </label>
                                {nonSiiDocTypes.length > 0 && (
                                  <select
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        const docObj = nonSiiDocTypes.find(d => d.code === e.target.value);
                                        const prefix = docObj ? `${docObj.code} ` : '';
                                        const curVal = currentLine.documentRef || '';
                                        const newVal = curVal.includes(' ') ? `${prefix}${curVal.split(' ').slice(1).join(' ')}` : `${prefix}${curVal}`;
                                        const newLines = [...voucherForm.lines];
                                        newLines[targetIdx] = { ...newLines[targetIdx], documentRef: newVal.trim() };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }
                                    }}
                                    className="border border-slate-300 p-0.5 rounded text-[11px] bg-slate-50 text-slate-700 max-w-[150px]"
                                  >
                                    <option value="">Tipo Doc no SII...</option>
                                    {nonSiiDocTypes.map(d => (
                                      <option key={d.id} value={d.code}>{d.code} - {d.name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              <input
                                type="text"
                                placeholder="Ej. FAC 1023, BOL 554, ND 12"
                                value={currentLine.documentRef || ''}
                                onChange={(e) => {
                                  const newLines = [...voucherForm.lines];
                                  newLines[targetIdx] = { ...newLines[targetIdx], documentRef: e.target.value };
                                  setVoucherForm({ ...voucherForm, lines: newLines });
                                }}
                                className={`border p-2 w-full rounded font-mono ${lineAcc?.requiereDocumento && !currentLine.documentRef ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                              />
                            </div>

                            {/* 3. Centro de Costos */}
                            <div>
                              <label className="font-bold text-slate-800 block mb-1">
                                🏢 Centro de Costos
                                {lineAcc?.requiereCentroCosto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                              </label>
                              {costCenters.length > 0 ? (
                                <select
                                  value={currentLine.costCenter || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], costCenter: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded ${lineAcc?.requiereCentroCosto && !currentLine.costCenter ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                >
                                  <option value="">-- Seleccionar Centro de Costos --</option>
                                  {costCenters.map(cc => (
                                    <option key={cc.id} value={cc.code}>
                                      {cc.code} - {cc.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Ej. ADMINISTRACION, VENTAS"
                                  value={currentLine.costCenter || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], costCenter: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded ${lineAcc?.requiereCentroCosto && !currentLine.costCenter ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                />
                              )}
                            </div>

                            {/* 4. Ref. Bancaria / N° Cheque */}
                            <div>
                              <label className="font-bold text-slate-800 block mb-1">
                                🏦 Ref Bancaria / N° Cheque / Cartola
                                {lineAcc?.requiereConciliacionBancaria && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                              </label>
                              <input
                                type="text"
                                placeholder="Ej. TRF 98123, CHQ 00192"
                                value={currentLine.bankDocRef || ''}
                                onChange={(e) => {
                                  const newLines = [...voucherForm.lines];
                                  newLines[targetIdx] = { ...newLines[targetIdx], bankDocRef: e.target.value };
                                  setVoucherForm({ ...voucherForm, lines: newLines });
                                }}
                                className={`border p-2 w-full rounded font-mono ${lineAcc?.requiereConciliacionBancaria && !currentLine.bankDocRef ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                              />
                            </div>

                            {/* 5. Fecha de Vencimiento */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="font-bold text-slate-800">
                                  📅 Fecha de Vencimiento
                                  {lineAcc?.requiereVencimiento && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                                </label>
                                {voucherForm.date && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      try {
                                        const parts = voucherForm.date.split('-');
                                        if (parts.length === 3) {
                                          const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                                          dt.setDate(dt.getDate() + 30);
                                          const calculated = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
                                          const newLines = [...voucherForm.lines];
                                          newLines[targetIdx] = { ...newLines[targetIdx], dueDate: calculated };
                                          setVoucherForm({ ...voucherForm, lines: newLines });
                                        }
                                      } catch {}
                                    }}
                                    className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                                  >
                                    +30 días emisión ({voucherForm.date})
                                  </button>
                                )}
                              </div>
                              <input
                                type="date"
                                value={currentLine.dueDate || ''}
                                onChange={(e) => {
                                  const newLines = [...voucherForm.lines];
                                  newLines[targetIdx] = { ...newLines[targetIdx], dueDate: e.target.value };
                                  setVoucherForm({ ...voucherForm, lines: newLines });
                                }}
                                className={`border p-2 w-full rounded ${lineAcc?.requiereVencimiento && !currentLine.dueDate ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                              />
                            </div>

                            {/* 6. Ítem de Gasto */}
                            <div>
                              <label className="font-bold text-slate-800 block mb-1">
                                🏷️ Ítem de Gasto
                                {lineAcc?.requiereItemGasto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                              </label>
                              {expenseItems.length > 0 ? (
                                <select
                                  value={currentLine.expenseItem || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], expenseItem: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded ${lineAcc?.requiereItemGasto && !currentLine.expenseItem ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                >
                                  <option value="">-- Seleccionar Ítem de Gasto --</option>
                                  {expenseItems.map(item => (
                                    <option key={item.id} value={item.code}>
                                      {item.code} - {item.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Ej. ARRIENDOS, COMBUSTIBLES"
                                  value={currentLine.expenseItem || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], expenseItem: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded ${lineAcc?.requiereItemGasto && !currentLine.expenseItem ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                />
                              )}
                            </div>

                            {/* 7. Proyecto */}
                            <div>
                              <label className="font-bold text-slate-800 block mb-1">
                                🏗️ Proyecto / Obra
                                {lineAcc?.requiereProyecto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                              </label>
                              {projects.length > 0 ? (
                                <select
                                  value={currentLine.project || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], project: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded ${lineAcc?.requiereProyecto && !currentLine.project ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                >
                                  <option value="">-- Seleccionar Proyecto --</option>
                                  {projects.map(p => (
                                    <option key={p.id} value={p.code}>
                                      {p.code} - {p.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Ej. OBRA COSTANERA, PROYECTO A"
                                  value={currentLine.project || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], project: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded ${lineAcc?.requiereProyecto && !currentLine.project ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                />
                              )}
                            </div>

                            {/* 8. Producto */}
                            <div>
                              <label className="font-bold text-slate-800 block mb-1">
                                📦 Producto / Servicio
                                {lineAcc?.requiereProducto && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                              </label>
                              {products.length > 0 ? (
                                <select
                                  value={currentLine.product || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], product: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded ${lineAcc?.requiereProducto && !currentLine.product ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                >
                                  <option value="">-- Seleccionar Producto --</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.code}>
                                      {p.code} - {p.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Ej. MERCADERIA TIPO A"
                                  value={currentLine.product || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], product: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded ${lineAcc?.requiereProducto && !currentLine.product ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                />
                              )}
                            </div>

                            {/* 9. Dynamic Custom Analyses */}
                            {customCols.map(col => {
                              const isReq = isCustomAnalysisRequired(lineAcc, col);
                              const val = currentLine.customAnalyses?.[col] || '';
                              const colItems = customAnalysisItems.filter(item => (item.analysisColumnName === col || (item as any).analysisName === col) && item.estado !== 'Inactivo');

                              return (
                                <div key={col}>
                                  <label className="font-bold text-slate-800 block mb-1">
                                    ⚙️ {col}
                                    {isReq && <span className="text-rose-600 font-bold ml-1">* (Obligatorio)</span>}
                                  </label>
                                  {colItems.length > 0 ? (
                                    <select
                                      value={val}
                                      onChange={(e) => {
                                        const newLines = [...voucherForm.lines];
                                        const updatedCustom = { ...(newLines[targetIdx].customAnalyses || {}), [col]: e.target.value };
                                        newLines[targetIdx] = { ...newLines[targetIdx], customAnalyses: updatedCustom };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className={`border p-2 w-full rounded ${isReq && !val ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                    >
                                      <option value="">-- Seleccionar {col} --</option>
                                      {colItems.map(item => (
                                        <option key={item.id} value={item.code}>
                                          {item.code} - {item.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      placeholder={`Valor para ${col}...`}
                                      value={val}
                                      onChange={(e) => {
                                        const newLines = [...voucherForm.lines];
                                        const updatedCustom = { ...(newLines[targetIdx].customAnalyses || {}), [col]: e.target.value };
                                        newLines[targetIdx] = { ...newLines[targetIdx], customAnalyses: updatedCustom };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className={`border p-2 w-full rounded ${isReq && !val ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                          <button
                            type="button"
                            onClick={() => {
                              const lineToDistribute = targetIdx;
                              setEditingAnalysisLineIdx(null);
                              setDistributingLineIdx(lineToDistribute);
                            }}
                            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                          >
                            <span>✂️</span>
                            <span>Distribuir esta Línea (CC / Gastos / Cuentas)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAnalysisLineIdx(null)}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                          >
                            ✓ Listo / Aplicar Análisis
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: LIBRO DIARIO */}
      {activeTab === 'libroDiario' && (
        <LibroDiarioView
          studyId={studyId}
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
        />
      )}

      {/* TAB: LIBRO MAYOR */}
      {activeTab === 'libroMayor' && (
        <LibroMayorView
          studyId={studyId}
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
        />
      )}

      {/* TAB: BALANCE DE 8 COLUMNAS */}
      {activeTab === 'balance8' && (
        <Balance8ColumnasView
          studyId={studyId}
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
          onOpenAuditor={() => {
            setActiveTab('auditorEstadosFinancieros');
            setActiveRibbonGroup('INDICADORES');
          }}
        />
      )}

      {/* TAB: BALANCE CLASIFICADO IFRS */}
      {activeTab === 'balanceIFRS' && (
        <BalanceIFRSView
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
          onOpenAuditor={() => {
            setActiveTab('auditorEstadosFinancieros');
            setActiveRibbonGroup('INDICADORES');
          }}
        />
      )}

      {/* TAB: ANALISIS DE AUXILIARES */}
      {activeTab === 'analisisAuxiliares' && (
        <AnalisisAuxiliaresView
          studyId={studyId}
          company={company}
          accounts={accounts}
          auxiliaries={auxiliaries}
          rcvDocuments={rcvDocuments}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
        />
      )}

      {/* TAB: ANALISIS DE CUENTAS */}
      {activeTab === 'analisisCuentas' && (
        <AnalisisCuentasView
          studyId={studyId}
          company={company}
          accounts={accounts}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
          auxiliaries={auxiliaries}
          rcvDocuments={rcvDocuments}
          onVouchersUpdated={fetchData}
        />
      )}

      {/* TAB: ESTADO DE RESULTADOS */}
      {activeTab === 'estadoResultados' && (
        <EstadoResultadosView
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
          onOpenAuditor={() => {
            setActiveTab('auditorEstadosFinancieros');
            setActiveRibbonGroup('INDICADORES');
          }}
        />
      )}

      {/* TAB: AUDITOR DE ESTADOS FINANCIEROS */}
      {activeTab === 'auditorEstadosFinancieros' && (
        <AuditorEstadosFinancierosView
          studyId={studyId}
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
          auxiliaries={auxiliaries}
          bankReconciliations={bankReconciliations}
          onNavigateTab={(tab) => {
            setActiveTab(tab as any);
            if (tab === 'vouchers' || tab === 'libroDiario' || tab === 'libroMayor' || tab === 'balance8' || tab === 'analisisCuentas' || tab === 'analisisAuxiliares') {
              setActiveRibbonGroup('FINANZAS');
            } else if (tab === 'indicadoresFinancieros' || tab === 'balanceIFRS' || tab === 'estadoResultados' || tab === 'flujoDeCaja') {
              setActiveRibbonGroup('INDICADORES');
            } else if (tab === 'conciliacionBancaria' || tab === 'nominasPago' || tab === 'cobranza') {
              setActiveRibbonGroup('TESORERIA');
            } else if (tab === 'employees' || tab === 'liquidaciones') {
              setActiveRibbonGroup('PERSONAL');
            }
          }}
        />
      )}

      {/* TAB: INDICADORES FINANCIEROS Y KPIS */}
      {activeTab === 'indicadoresFinancieros' && (
        isAnalyst ? (
          <div className="bg-amber-50 border border-amber-300 p-8 rounded-xl text-center text-amber-900 max-w-xl mx-auto my-8 shadow-xs">
            <div className="text-3xl mb-2">🔒</div>
            <h3 className="text-sm font-bold uppercase tracking-wider mb-1">Módulo Restringido</h3>
            <p className="text-xs text-amber-700">El perfil de Analista tiene restringido el acceso a la visualización de Indicadores Financieros y KPIs de la empresa.</p>
          </div>
        ) : (
          <IndicadoresFinancierosView
            company={company}
            vouchers={vouchers}
            accounts={accounts}
            fiscalYears={fiscalYears}
            bankReconciliations={bankReconciliations}
            rcvDocuments={rcvDocuments}
          />
        )
      )}

      {/* TAB: EMPLEADOS Y CONTRATOS */}
      {activeTab === 'employees' && (
        <EmployeesView
          employees={employees}
          costCenters={costCenters}
          onSaveEmployee={handleSaveEmployee}
          onDeleteEmployee={handleDeleteEmployee}
          companyName={company.name}
          companyRut={company.rut}
          companyAddress={company.address}
          initialSubTab={employeeSubTab}
          onSubTabChange={(st) => setEmployeeSubTab(st)}
          onNavigateToPayroll={(pTab) => {
            if (pTab) setPayrollTab(pTab as any);
            setActiveTab('liquidaciones');
          }}
        />
      )}

      {/* TAB: LIQUIDACIONES Y PREVIRED */}
      {activeTab === 'liquidaciones' && (
        <LiquidacionSueldosView
          companyId={company.id}
          companyName={company.name}
          companyRut={company.rut}
          companyAddress={company.address}
          employees={employees}
          accounts={accounts}
          costCenters={costCenters}
          vouchers={vouchers}
          onSavePayrollSlips={handleSavePayrollSlips}
          onResetPayrollSlips={handleResetPayrollSlips}
          onCentralizePayrollVoucher={handleCentralizePayrollVoucher}
          onNavigateToLibroDiario={(vId) => setActiveTab('libroDiario')}
          savedSlips={payrollSlips}
          initialTab={payrollTab}
          onTabChange={(t) => setPayrollTab(t)}
          defaultYear={selectedYear}
          defaultMonth={parseInt((selectedRcvPeriod || '2025-01').split('-')[1], 10) || 1}
          onNavigateToEmployees={(eTab) => {
            if (eTab) setEmployeeSubTab(eTab as any);
            setActiveTab('employees');
          }}
        />
      )}

      {/* TAB: NÓMINAS DE PAGO */}
      {activeTab === 'nominasPago' && (
        <NominasPagoView
          studyId={studyId}
          company={company}
          accounts={accounts}
          auxiliaries={auxiliaries}
          rcvDocuments={rcvDocuments}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
          onVouchersUpdated={fetchData}
        />
      )}

      {/* TAB: COBRANZA */}
      {activeTab === 'cobranza' && (
        <CobranzaView
          studyId={studyId}
          company={company}
          accounts={accounts}
          auxiliaries={auxiliaries}
          rcvDocuments={rcvDocuments}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
          onVouchersUpdated={fetchData}
        />
      )}

      {/* TAB: FLUJO DE CAJA REAL */}
      {activeTab === 'flujoDeCaja' && (
        <FlujoDeCajaView
          studyId={studyId}
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
          rcvDocuments={rcvDocuments}
        />
      )}

      {/* TAB: CONCILIACIÓN BANCARIA (Se mantiene montado para preservar el trabajo en progreso al navegar por las pestañas) */}
      <div className={activeTab === 'conciliacionBancaria' ? 'block' : 'hidden'}>
        <ConciliacionBancariaView
          studyId={studyId}
          company={company}
          accounts={accounts}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
          auxiliaries={auxiliaries}
          rcvDocuments={rcvDocuments}
          costCenters={costCenters}
          expenseItems={expenseItems}
          projects={projects}
          products={products}
          customAnalysisItems={customAnalysisItems}
          onVouchersUpdated={fetchData}
        />
      </div>

      {/* TAB: CARGA MASIVA COMPROBANTES */}
      {activeTab === 'cargaMasiva' && (
        <CargaMasivaComprobantesView
          studyId={studyId}
          company={company}
          accounts={accounts}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
          onVouchersUpdated={fetchData}
          onNavigateTab={(tab) => setActiveTab(tab as any)}
        />
      )}

      {/* TAB: FORMULARIO 29 MENSUAL */}
      {activeTab === 'formulario29' && (
        <Formulario29View
          studyId={studyId}
          company={company}
          accounts={accounts}
          rcvDocuments={rcvDocuments}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
          onVouchersUpdated={fetchData}
        />
      )}

      {/* TAB: PLANTILLAS Y CARGAS MASIVAS (PLAN DE CUENTAS, AUXILIARES, ETC) */}
      {activeTab === 'plantillasCarga' && (
        <PlantillasYCargaMasivaView
          studyId={studyId}
          company={company}
          accounts={accounts}
          auxiliaries={auxiliaries}
          onRefreshData={fetchData}
        />
      )}

      {/* TAB: EMISIÓN DIRECTA DTE (FACTURADOR SII) */}
      {activeTab === 'emisionDte' && (
        <EmisionDteView
          studyId={studyId}
          company={company}
          auxiliaries={auxiliaries}
          accounts={accounts}
          vouchers={vouchers}
          onRefreshData={fetchData}
        />
      )}

      {/* TAB: TABLAS Y CATÁLOGOS MAESTROS DE ANÁLISIS */}
      {activeTab === 'tablasAnalisis' && (
        <TablasAnalisisMasterView
          studyId={studyId}
          company={company}
          isReadOnly={isAnalyst}
          costCenters={costCenters}
          expenseItems={expenseItems}
          nonSiiDocTypes={nonSiiDocTypes}
          projects={projects}
          products={products}
          customAnalysisItems={customAnalysisItems}
          onRefreshData={fetchData}
        />
      )}

      {/* TAB: CONTROL DE FOLIOS Y TIMBRAJE SII */}
      {activeTab === 'controlFolios' && (
        <SiiFolioControlView
          studyId={studyId}
          company={company}
          isReadOnly={isAnalyst}
        />
      )}

      {/* TAB: CATÁLOGO DE PRODUCTOS & SERVICIOS */}
      {activeTab === 'productsServices' && (
        <ProductsServicesView
          companyId={company.id}
          companyName={company.name}
          accounts={accounts}
          costCenters={costCenters}
          expenseItems={expenseItems}
          products={products as unknown as ProductService[]}
          onProductsChange={() => fetchData()}
          isReadOnly={isAnalyst || isReadOnly}
        />
      )}

      {/* TAB: OPERATIVA COMERCIAL ERP (COMPRAS & VENTAS) */}
      {activeTab === 'operativaComercial' && (
        <OperativaComercialView
          companyId={company.id}
          companyName={company.name}
          companyRut={company.rut}
          products={products as unknown as ProductService[]}
          accounts={accounts}
          auxiliaries={auxiliaries}
          costCenters={costCenters}
          expenseItems={expenseItems}
          commercialDocs={commercialDocuments}
          onSaveDocument={(docData, movements, newVouchers) => {
            handleSaveCommercialDocument(docData, movements, newVouchers);
          }}
          isReadOnly={isAnalyst || isReadOnly}
        />
      )}

      {/* TAB: CONTROL DE INVENTARIO & KARDEX PMP */}
      {activeTab === 'stockKardex' && (
        <StockKardexView
          companyId={company.id}
          companyName={company.name}
          products={products as unknown as ProductService[]}
          movements={inventoryMovements}
          accounts={accounts}
          isReadOnly={isAnalyst || isReadOnly}
        />
      )}



      {/* MODAL DE DISTRIBUCIÓN DE LÍNEA DE COMPROBANTE */}
      {distributingLineIdx !== null && voucherForm && voucherForm.lines[distributingLineIdx] && (
        <VoucherLineDistributionModal
          isOpen={distributingLineIdx !== null}
          sourceLine={voucherForm.lines[distributingLineIdx]}
          lineIndex={distributingLineIdx}
          accounts={accounts}
          costCenters={costCenters}
          expenseItems={expenseItems}
          nonSiiDocTypes={nonSiiDocTypes}
          projects={projects}
          products={products}
          customAnalysisItems={customAnalysisItems}
          customColumns={company.customAccountColumns || []}
          onApplyDistribution={(lineIdx, newLines) => {
            const updatedLines = [...voucherForm.lines];
            updatedLines.splice(lineIdx, 1, ...newLines);
            setVoucherForm({ ...voucherForm, lines: updatedLines });
            setDistributingLineIdx(null);
          }}
          onClose={() => setDistributingLineIdx(null)}
        />
      )}

      {/* MODAL GLOBAL DE IMPORTACIÓN EXCEL / CSV */}
      <ExcelImportCenterModal
        isOpen={showExcelImportModal}
        onClose={() => setShowExcelImportModal(false)}
        studyId={studyId}
        company={company}
        accounts={accounts}
        auxiliaries={auxiliaries}
        fiscalYears={fiscalYears}
        onDataImported={async () => {
          await fetchData();
        }}
      />

      {/* COPILOTO CONTABLE INTELIGENTE (MULTI-TENANT EMPRESA ACTUAL) */}
      <InternalCompanyAccountingCopilot
        studyId={studyId}
        company={company}
        accounts={accounts}
        vouchers={vouchers}
        rcvDocuments={rcvDocuments}
        auxiliaries={auxiliaries}
        fiscalYears={fiscalYears}
        onNavigateTab={(tab) => {
          setActiveTab(tab as any);
        }}
      />
    </div>
  );
}
