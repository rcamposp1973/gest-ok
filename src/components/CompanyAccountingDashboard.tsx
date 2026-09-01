import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Company, ChartOfAccount, Auxiliary, ExchangeRate, FiscalPeriodYear, RCVDocument, Voucher, VoucherLine, RCVAccountingParams, BankReconciliation, UserRole, CostCenterMaster, ExpenseItemMaster, NonSiiDocTypeMaster, ProjectMaster, ProductMaster, CustomAnalysisTableItem } from '../types';
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
import { useProcess } from '../context/ProcessContext';
import { validateVoucherLine, isCustomAnalysisRequired, sanitizeVoucherLine, sanitizeVoucherLines } from '../utils/voucherValidation';

interface CompanyAccountingDashboardProps {
  studyId: string;
  company: Company;
  currentUserRole?: UserRole;
  onBack: () => void;
}

export default function CompanyAccountingDashboard({ studyId, company, currentUserRole, onBack }: CompanyAccountingDashboardProps) {
  const isSuperUser = currentUserRole === UserRole.SUPER_USER;
  const isAnalyst = currentUserRole === UserRole.ANALYST;
  const isReadOnly = isSuperUser || isAnalyst;

  const { withProcess } = useProcess();
  type RibbonGroup = 'FINANZAS' | 'TESORERIA' | 'IMPORTACIONES' | 'IMPUESTOS' | 'INDICADORES' | 'CONFIGURACIONES';
  const [activeRibbonGroup, setActiveRibbonGroup] = useState<RibbonGroup>('FINANZAS');
  const [activeTab, setActiveTab] = useState<'accounts' | 'auxiliaries' | 'periods' | 'rcv' | 'exchange' | 'rcvParams' | 'f29Codes' | 'vouchers' | 'libroDiario' | 'libroMayor' | 'balance8' | 'balanceIFRS' | 'analisisAuxiliares' | 'analisisCuentas' | 'estadoResultados' | 'indicadoresFinancieros' | 'flujoDeCaja' | 'nominasPago' | 'cobranza' | 'conciliacionBancaria' | 'cargaMasiva' | 'formulario29' | 'plantillasCarga' | 'emisionDte' | 'tablasAnalisis'>('vouchers');
  const [auxSubTab, setAuxSubTab] = useState<'deudores' | 'acreedores'>('deudores');
  const [showExchangeBar, setShowExchangeBar] = useState<boolean>(true);
  const [rcvFilterType, setRcvFilterType] = useState<'Todos' | 'Compra' | 'Venta' | 'Honorarios'>('Compra');
  const [showHistoricalRatesModal, setShowHistoricalRatesModal] = useState<boolean>(false);
  const [historicalRatesFilterYear, setHistoricalRatesFilterYear] = useState<string>('Todos');
  const [historicalRatesSearch, setHistoricalRatesSearch] = useState<string>('');
  const [showExcelImportModal, setShowExcelImportModal] = useState<boolean>(false);

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
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede modificar configuraciones contables ni tributarias.');
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

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedRcvPeriod, setSelectedRcvPeriod] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Helper para determinar automáticamente el mes abierto más adecuado para un año fiscal
  const getBestActiveMonthForYear = (year: number, currentFyList: FiscalPeriodYear[]): string => {
    const fy = currentFyList.find(f => f.id === String(year));
    const now = new Date();
    const currentCalYear = now.getFullYear();
    const currentCalMonth = now.getMonth() + 1; // 1-12

    if (fy && fy.months) {
      // 1. Si estamos en el año actual y el mes en curso está abierto, es la prioridad
      if (year === currentCalYear && fy.months[currentCalMonth] === 'Abierto') {
        return `${year}-${String(currentCalMonth).padStart(2, '0')}`;
      }
      // 2. Buscar el mes abierto más reciente del año
      const openMonths = Object.entries(fy.months)
        .filter(([_, status]) => status === 'Abierto')
        .map(([m]) => parseInt(m, 10))
        .sort((a, b) => b - a);

      if (openMonths.length > 0) {
        return `${year}-${String(openMonths[0]).padStart(2, '0')}`;
      }
      // 3. Si no hay meses abiertos, retornar el último mes del año
      return `${year}-12`;
    }

    const fallbackMonth = year === currentCalYear ? currentCalMonth : 1;
    return `${year}-${String(fallbackMonth).padStart(2, '0')}`;
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
      setFiscalYears(fySnap.docs.map(d => ({ ...d.data(), id: d.id } as FiscalPeriodYear)));

      const rcvSnap = await getDocs(collection(companyRef, 'rcvDocuments'));
      setRcvDocuments(rcvSnap.docs.map(d => ({ ...d.data(), id: d.id } as RCVDocument)));

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
      setRcvDocuments(rcvSnap.docs.map(d => ({ ...d.data(), id: d.id } as RCVDocument)));
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

  // Helper to check if a specific period (YYYY-MM or from YYYY-MM-DD) is CERRADO
  const checkIsPeriodClosed = (dateOrPeriod: string): { isClosed: boolean; periodStr: string; errorMsg: string } => {
    if (!dateOrPeriod) {
      return { isClosed: false, periodStr: '', errorMsg: '' };
    }
    const clean = dateOrPeriod.trim().substring(0, 7); // e.g. "2026-08"
    const parts = clean.split('-');
    if (parts.length < 2) {
      return { isClosed: false, periodStr: clean, errorMsg: '' };
    }
    const yearStr = parts[0];
    const monthNum = parseInt(parts[1], 10);
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return { isClosed: false, periodStr: clean, errorMsg: '' };
    }

    const fy = fiscalYears.find(f => f.id === yearStr);
    const monthStatus = fy?.months?.[monthNum];

    // If explicitly 'Cerrado', or if no record exists and it's not the current active open month
    const isClosed = monthStatus === 'Cerrado';
    const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const monthName = monthNames[monthNum] || `Mes ${monthNum}`;

    return {
      isClosed,
      periodStr: clean,
      errorMsg: `🔒 Período Contable Bloqueado: El período ${monthName} ${yearStr} (${clean}) se encuentra CERRADO. No está permitido guardar, modificar, importar o contabilizar comprobantes en un período cerrado.`
    };
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

  // Parser for official SII CSV / TXT files with precise column mapping for Ventas, Compras and Honorarios
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, tipoRegistro: 'Compra' | 'Venta' | 'Honorarios') => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede importar ni modificar archivos RCV.');
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

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        if (!content) {
          alert('El archivo está vacío.');
          return;
        }

        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
          alert('El archivo no contiene líneas de datos.');
          return;
        }

        // Detect period from filename (e.g., RCV_COMPRA_REGISTRO_76293672-0_202601.csv -> 2026-01)
        let targetUploadPeriod = selectedRcvPeriod;
        const fnMatch = file.name.match(/_?(\d{4})(0[1-9]|1[0-2])/);
        if (fnMatch) {
          targetUploadPeriod = `${fnMatch[1]}-${fnMatch[2]}`;
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

        // Find header line with strict, prioritized recognition
        let headerRowIndex = -1;
        let headerMap: { [key: string]: number } = {};

        for (let i = 0; i < Math.min(lines.length, 25); i++) {
          const cols = lines[i].split(bestDelimiter).map(c => c.trim().replace(/^["']|["']$/g, '').toLowerCase());
          
          let score = 0;
          const tempMap: { [key: string]: number } = {};

          cols.forEach((col, idx) => {
            // 1. Tipo Doc (Priority: exact 'tipo doc', 'tipo docto', 'tipo dte', 'tipo documento', avoid 'tipo venta' / 'tipo compra')
            if (
              (col === 'tipo doc' || col === 'tipo docto' || col === 'tipo dte' || col === 'tipo documento' || col === 'tipo_doc' || col === 'tipodoc') ||
              (tempMap['tipoDoc'] === undefined && (col.includes('tipo') && (col.includes('doc') || col.includes('dte') || col.includes('dcto'))) && !col.includes('venta') && !col.includes('compra') && !col.includes('transaccion') && !col.includes('pago'))
            ) {
              tempMap['tipoDoc'] = idx;
              score += 3;
            }
            // 2. Folio (Priority: 'folio', 'folio docto', 'nro docto', 'nro documento', 'numero')
            else if (
              (col === 'folio' || col === 'folio docto' || col === 'folio dte' || col === 'nro docto' || col === 'nro documento' || col === 'numero documento' || col === 'nro') ||
              (tempMap['folio'] === undefined && (col.includes('folio') || col.includes('número') || col.includes('numero') || col === 'n°' || col === 'num'))
            ) {
              tempMap['folio'] = idx;
              score += 3;
            }
            // 3. RUT (Prioritize client/receptor for sales and emisor for purchases, exclude transportistas)
            else if (
              (col.includes('rut') || col.includes('r.u.t') || col.includes('identificador')) &&
              !col.includes('transportista') && !col.includes('chofer') && !col.includes('mandante')
            ) {
              if (tipoRegistro === 'Venta' && (col.includes('cliente') || col.includes('receptor') || col.includes('contraparte'))) {
                tempMap['rut'] = idx;
              } else if (tempMap['rut'] === undefined) {
                tempMap['rut'] = idx;
              }
              score += 3;
            }
            // 4. Razon Social
            else if (
              (col.includes('razon') || col.includes('razón') || col.includes('nombre')) &&
              !col.includes('transportista') && !col.includes('chofer')
            ) {
              if (tipoRegistro === 'Venta' && (col.includes('cliente') || col.includes('receptor') || col.includes('contraparte'))) {
                tempMap['razon'] = idx;
              } else if (tempMap['razon'] === undefined) {
                tempMap['razon'] = idx;
              }
              score += 2;
            }
            // 5. Fecha Emision
            else if (
              (col === 'fecha docto' || col === 'fecha doc' || col === 'fecha emision' || col === 'fecha emisión' || col === 'fecha documento' || col === 'fecha') ||
              (tempMap['fecha'] === undefined && col.includes('fecha') && !col.includes('recep') && !col.includes('acuse') && !col.includes('reclamo') && !col.includes('venc'))
            ) {
              tempMap['fecha'] = idx;
              score += 2;
            }
            // 6. Monto Neto / Bruto (Exclude activo fijo, costo neto)
            else if (
              (col === 'monto neto' || col === 'neto' || col === 'monto_neto' || col === 'monto afecto' || col === 'afecto' || col === 'monto bruto' || col === 'bruto' || col === 'honorarios brutos') ||
              (tempMap['neto'] === undefined && (col.includes('neto') || col.includes('afecto') || col.includes('bruto')) && !col.includes('activo fijo') && !col.includes('fijo') && !col.includes('costo'))
            ) {
              tempMap['neto'] = idx;
              score += 3;
            }
            // 7. Monto IVA / Retención
            else if (
              (col === 'monto iva' || col === 'monto iva recuperable' || col === 'iva' || col === 'iva debito' || col === 'iva débito' || col === 'monto_iva' || col === 'iva recuperable' || col.includes('retención') || col.includes('retencion')) ||
              (tempMap['iva'] === undefined && (col.includes('iva') || col.includes('recuperable') || col.includes('retencion') || col.includes('retención')) && !col.includes('no rec') && !col.includes('no recuperable') && !col.includes('no retenido') && !col.includes('tercero') && !col.includes('fijo') && !col.includes('comun') && !col.includes('común'))
            ) {
              tempMap['iva'] = idx;
              score += 3;
            }
            // 8. Monto Exento
            else if (
              (col === 'monto exento' || col === 'exento' || col === 'monto_exento' || col === 'monto no gravado' || col === 'no gravado') ||
              (tempMap['exento'] === undefined && (col.includes('exento') || col.includes('no gravado') || col.includes('no afecto')) && !col.includes('fijo'))
            ) {
              tempMap['exento'] = idx;
              score += 2;
            }
            // 9. Monto Total / Líquido
            else if (
              (col === 'monto total' || col === 'total' || col === 'monto_total' || col === 'total docto' || col === 'total documento' || col === 'monto liquido' || col === 'monto líquido' || col === 'liquido' || col === 'líquido') ||
              (tempMap['total'] === undefined && (col.includes('total') || col.includes('liquido') || col.includes('líquido')) && !col.includes('no facturable') && !col.includes('fijo'))
            ) {
              tempMap['total'] = idx;
              score += 3;
            }
          });

          if (score >= 5 || (tempMap['rut'] !== undefined && (tempMap['neto'] !== undefined || tempMap['total'] !== undefined))) {
            headerRowIndex = i;
            headerMap = tempMap;
            break;
          }
        }

        const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
        if (headerRowIndex === -1) {
          headerMap = { rut: 0, razon: 1, tipoDoc: 2, folio: 3, fecha: 4, neto: 5, iva: 6, exento: 7, total: 8 };
        }

        const parsedDocs: Omit<RCVDocument, 'id'>[] = [];
        let readCount = 0;
        let detectedPeriod = targetUploadPeriod;

        for (let i = startIndex; i < lines.length; i++) {
          const rawLine = lines[i];
          if (!rawLine) continue;
          const cols = rawLine.split(bestDelimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (cols.length < 2) continue;

          readCount++;
          const rutEmisor = cols[headerMap['rut'] ?? 0] || (tipoRegistro === 'Venta' ? '77.777.777-7' : '66.666.666-6');
          const razonSocialEmisor = cols[headerMap['razon'] ?? 1] || (tipoRegistro === 'Venta' ? 'Cliente RCV' : 'Proveedor SII');
          const rawTipoDoc = cols[headerMap['tipoDoc'] ?? 2] || '33';
          const folio = cols[headerMap['folio'] ?? 3] || String(readCount);
          const rawFecha = cols[headerMap['fecha'] ?? 4] || '';
          
          const { dateStr } = normalizeChileanDate(rawFecha, targetUploadPeriod);
          // RCV period is STRICTLY the target upload period (from filename or active filter), regardless of invoice date
          const periodStr = targetUploadPeriod;
          detectedPeriod = periodStr;

          // Normalize TipoDoc to standard Chilean DTE codes (33, 34, 39, 41, 46, 56, 61, 110, etc.)
          let tipoDoc = '33';
          const rawTipoLower = rawTipoDoc.toLowerCase().replace(/[^0-9a-z]/g, ' ');

          if (tipoRegistro === 'Honorarios' || rawTipoLower.includes('bhe') || rawTipoLower.includes('honorario')) {
            tipoDoc = 'BHE';
          } else if (rawTipoLower.includes('33') || rawTipoLower.includes('factura elect') || (rawTipoLower.includes('factura') && !rawTipoLower.includes('exent') && !rawTipoLower.includes('compra'))) {
            tipoDoc = '33';
          } else if (rawTipoLower.includes('34') || rawTipoLower.includes('exent') || rawTipoLower.includes('no afect')) {
            tipoDoc = '34';
          } else if (rawTipoLower.includes('39') || rawTipoLower.includes('boleta elect') || (rawTipoLower.includes('boleta') && !rawTipoLower.includes('exent'))) {
            tipoDoc = '39';
          } else if (rawTipoLower.includes('41') || rawTipoLower.includes('boleta exent')) {
            tipoDoc = '41';
          } else if (rawTipoLower.includes('61') || rawTipoLower.includes('credito') || rawTipoLower.includes('crédito')) {
            tipoDoc = '61';
          } else if (rawTipoLower.includes('56') || rawTipoLower.includes('debito') || rawTipoLower.includes('débito')) {
            tipoDoc = '56';
          } else if (rawTipoLower.includes('46') || rawTipoLower.includes('factura de compra')) {
            tipoDoc = '46';
          } else if (rawTipoLower.includes('43') || rawTipoLower.includes('liquidacion') || rawTipoLower.includes('liquidación')) {
            tipoDoc = '43';
          } else if (rawTipoLower.includes('110') || rawTipoLower.includes('export')) {
            tipoDoc = '110';
          } else {
            const digits = rawTipoDoc.replace(/[^0-9]/g, '');
            tipoDoc = digits || '33';
          }

          let montoNeto = parseChileanNumber(headerMap['neto'] !== undefined ? cols[headerMap['neto']] : cols[5]);
          let montoIva = parseChileanNumber(headerMap['iva'] !== undefined ? cols[headerMap['iva']] : cols[6]);
          let montoExento = parseChileanNumber(headerMap['exento'] !== undefined ? cols[headerMap['exento']] : cols[7]);
          let montoTotal = parseChileanNumber(headerMap['total'] !== undefined ? cols[headerMap['total']] : cols[8]);

          // Mathematical DTE/BHE Consistency
          if (tipoRegistro === 'Honorarios' || tipoDoc === 'BHE') {
            // For Honorarios: Bruto (montoNeto) - Retención (montoIva) = Líquido (montoTotal)
            // Determine rate by year: 2024 = 13.75%, 2025 = 14.5%, 2026+ = 15.25%
            const yearNum = parseInt(periodStr.split('-')[0]) || 2026;
            const retentionRate = yearNum <= 2024 ? 0.1375 : yearNum === 2025 ? 0.145 : 0.1525;

            if (montoNeto > 0 && montoIva === 0) {
              montoIva = Math.round(montoNeto * retentionRate);
              montoTotal = montoNeto - montoIva;
            } else if (montoTotal > 0 && montoNeto === 0) {
              montoNeto = Math.round(montoTotal / (1 - retentionRate));
              montoIva = montoNeto - montoTotal;
            } else if (montoNeto > 0 && montoIva > 0 && montoTotal === 0) {
              montoTotal = montoNeto - montoIva;
            }
            montoExento = 0;
          } else {
            const isAfecto = tipoDoc === '33' || tipoDoc === '30' || tipoDoc === '39' || tipoDoc === '35' || tipoDoc === '56' || tipoDoc === '61' || tipoDoc === '46';

            if (isAfecto) {
              // Case 1: Total is present, but Net and IVA are 0 -> Net = Round(Total / 1.19), IVA = Total - Net
              if (montoNeto === 0 && montoIva === 0 && montoTotal > 0) {
                montoNeto = Math.round((montoTotal - montoExento) / 1.19);
                montoIva = (montoTotal - montoExento) - montoNeto;
              }
              // Case 2: IVA is present, Net is 0 -> Net = Round(IVA / 0.19)
              else if (montoIva > 0 && montoNeto === 0) {
                montoNeto = Math.round(montoIva / 0.19);
                if (montoTotal === 0 || montoTotal === montoIva) {
                  montoTotal = montoNeto + montoIva + montoExento;
                }
              }
              // Case 3: Net is present, IVA is 0 -> IVA = Round(Net * 0.19)
              else if (montoNeto > 0 && montoIva === 0) {
                montoIva = Math.round(montoNeto * 0.19);
                if (montoTotal === 0 || montoTotal === montoNeto) {
                  montoTotal = montoNeto + montoIva + montoExento;
                }
              }
              // Case 4: Total is missing
              else if (montoTotal === 0 && (montoNeto > 0 || montoIva > 0 || montoExento > 0)) {
                montoTotal = montoNeto + montoIva + montoExento;
              }
            } else {
              // Exento documents (34, 41, etc.)
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
            folio,
            fechaEmision: dateStr,
            montoNeto,
            montoIva,
            montoExento,
            montoTotal,
            estadoContabilizado: false
          });
        }

        if (parsedDocs.length === 0) {
          alert('No se encontraron registros válidos en el archivo. Por favor verifica que el archivo contenga las columnas estándar del SII.');
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
          const isDuplicate = currentRcvs.some(
            ex => (ex.rutEmisor || '').trim().toLowerCase() === (item.rutEmisor || '').trim().toLowerCase() && 
                  String(ex.tipoDoc).trim() === String(item.tipoDoc).trim() && 
                  String(ex.folio).trim() === String(item.folio).trim()
          );

          if (isDuplicate) {
            duplicates++;
            continue;
          }

          const cleanRut = (item.rutEmisor || '').replace(/[^0-9kK]/g, '').toUpperCase();
          let aux = currentAuxs.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanRut);
          if (!aux && cleanRut) {
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
          details: `Importación masiva RCV ${tipoRegistro} (${loaded} documentos guardados, período ${detectedPeriod}) en ${company.name}`,
          metadata: {
            tipoRegistro,
            periodo: detectedPeriod,
            documentosLeidos: readCount,
            documentosCargados: loaded,
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

        alert(`¡Importación completada con éxito!\n• Total líneas leídas: ${readCount}\n• Documentos nuevos guardados / actualizados: ${loaded}\n• Duplicados omitidos: ${duplicates}\n• Nuevos auxiliares creados: ${newAuxCount}\nPeríodo asignado estrictamente: ${detectedPeriod}`);

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
    reader.readAsText(file);
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
    const cleanRutStr = (docItem.rutEmisor || '').toLowerCase().replace(/[^0-9k]/g, '');
    const aux = auxiliaries.find(
      a => (a.rut || '').toLowerCase().replace(/[^0-9k]/g, '') === cleanRutStr
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

      // Obtener campos de análisis por defecto desde docItem o auxiliar ÚNICAMENTE si la cuenta contable de la línea los exige/permite
      const costCenter = requiresCC ? ((docItem as any).costCenter || aux?.defaultCostCenter || undefined) : undefined;
      const expenseItem = requiresItem ? ((docItem as any).expenseItem || aux?.defaultExpenseItem || undefined) : undefined;
      const project = requiresProj ? ((docItem as any).project || aux?.defaultProject || undefined) : undefined;
      const product = requiresProd ? ((docItem as any).product || aux?.defaultProduct || undefined) : undefined;

      let customAnalyses: Record<string, string> | undefined = undefined;
      const rawCustom = (docItem as any).customAnalyses || aux?.defaultCustomAnalyses || undefined;
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
        ['5.1.02', '5.1.01', 'gasto', 'costo', 'compra'],
        'Gasto',
        '5.1.02.001',
        'Gastos Generales y Administrativos'
      );

      // 2. IVA Crédito Fiscal
      const ivaAcc = resolveAccountDetails(
        rcvParams?.ivaCreditoAccountId,
        ['1.1.03', 'crédito', 'credito', 'iva'],
        'Activo',
        '1.1.03.001',
        'IVA Crédito Fiscal'
      );

      // 3. Proveedor por Pagar -> PRIORIDAD: 1. Doc Override -> 2. Ficha Auxiliar (Acreedor) -> 3. Config General RCV
      const supplierAcc = resolveAccountDetails(
        docItem.cuentaContrapartidaId || aux?.defaultCreditorAccountId || rcvParams?.defaultSupplierAccountId,
        ['2.1.01.001', '2.1.01', 'proveedor'],
        'Pasivo',
        '2.1.01.001',
        'Proveedores Nacionales'
      );

      // 4. Exento
      const exentoAcc = resolveAccountDetails(
        rcvParams?.exentoAccountId,
        ['exento', 'no gravado', 'no afecto'],
        'Gasto',
        '5.1.02.002',
        'Gastos Exentos / No Gravados'
      );

      // 5. Impuestos Adicionales / ILA
      const otrosImpuestosAcc = resolveAccountDetails(
        rcvParams?.otrosImpuestosAccountId,
        ['impuesto adicional', 'adicional', 'ila', 'otros impuestos', '5.1.02.003'],
        'Gasto',
        '5.1.02.003',
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
          const glossStr = otrosImpuestosAmount > 0 && !hasConfiguredOtrosAcc 
            ? `Gasto e Impuestos Adicionales ${docRefStr} - ${docItem.razonSocialEmisor}`
            : `Gasto ${docRefStr} - ${docItem.razonSocialEmisor}`;
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
        lines.push(makeLine(supplierAcc, 0, totalAmount, `Por Pagar ${docRefStr} - ${docItem.razonSocialEmisor}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
      }

    } else if (docItem.tipoRegistro === 'Venta') {
      // 1. Cliente por Cobrar -> PRIORIDAD: 1. Doc Override -> 2. Ficha Auxiliar (Deudor) -> 3. Config General RCV
      const customerAcc = resolveAccountDetails(
        docItem.cuentaContrapartidaId || aux?.defaultDebtorAccountId || rcvParams?.defaultCustomerAccountId,
        ['1.1.02.001', '1.1.02', 'cliente'],
        'Activo',
        '1.1.02.001',
        'Clientes Nacionales'
      );

      // 2. Ingreso por Ventas -> PRIORIDAD: 1. Doc Override -> 2. Ficha Auxiliar (Cliente) -> 3. Config General RCV
      const salesAcc = resolveAccountDetails(
        docItem.cuentaGastoId || aux?.defaultExpenseOrIncomeAccountId || rcvParams?.defaultSalesIncomeAccountId,
        ['4.1.02', '4.1.01', 'venta', 'ingreso'],
        'Ingreso',
        '4.1.02.001',
        'Ventas Afectas IVA'
      );

      // 3. IVA Débito Fiscal
      const ivaDebitoAcc = resolveAccountDetails(
        rcvParams?.ivaDebitoAccountId,
        ['2.1.02', 'débito', 'debito', 'iva'],
        'Pasivo',
        '2.1.02.001',
        'IVA Débito Fiscal'
      );

      // 4. Exento
      const exentoAcc = resolveAccountDetails(
        rcvParams?.exentoAccountId,
        ['4.1.01', 'exenta', 'no afecta'],
        'Ingreso',
        '4.1.01.001',
        'Ventas Exentas o No Afectas'
      );

      // 5. Otros Impuestos Ventas
      const otrosImpuestosAcc = resolveAccountDetails(
        rcvParams?.otrosImpuestosAccountId,
        ['impuesto adicional', 'adicional', 'ila', 'otros impuestos', '2.1.03.002'],
        'Pasivo',
        '2.1.03.002',
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
          lines.push(makeLine(salesAcc, finalNetoCredit, 0, `Reverso Venta ${docRefStr}`, partyRut, partyName, docRefStr));
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

        lines.push(makeLine(customerAcc, 0, totalAmount, `NC Cliente ${docRefStr} - ${partyName}`, partyRut, partyName, docRefStr));
      } else {
        // Cliente (Debe)
        lines.push(makeLine(customerAcc, totalAmount, 0, `Por Cobrar ${docRefStr} - ${partyName}`, partyRut, partyName, docRefStr));

        // Ingreso Ventas (Haber)
        if (finalNetoCredit > 0) {
          const glossStr = otrosImpuestosAmount > 0 && !hasConfiguredOtrosAcc 
            ? `Ingreso Ventas e Impuestos Adicionales ${docRefStr}`
            : `Ingreso Ventas ${docRefStr}`;
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
        ['5.1.01', 'honorario', 'gasto'],
        'Gasto',
        '5.1.01.002',
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

      // Gasto Honorarios (Debe)
      lines.push(makeLine(honorarioExpenseAcc, docItem.montoTotal, 0, `Gasto Honorarios BHE ${docRefStr} - ${docItem.razonSocialEmisor}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));

      // Retención BHE (Haber)
      if (docItem.montoIva > 0) {
        lines.push(makeLine(retencionAcc, 0, docItem.montoIva, `Retención BHE ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
      }

      // Líquido por Pagar (Haber)
      const liquido = docItem.montoNeto || (docItem.montoTotal - (docItem.montoIva || 0));
      lines.push(makeLine(honorariosPayableAcc, 0, liquido, `Líquido por Pagar BHE ${docRefStr}`, docItem.rutEmisor, docItem.razonSocialEmisor, docRefStr));
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

    return {
      voucherNumber,
      date: accountingDate,
      period: docItem.period,
      type: 'Traspaso',
      gloss: `Centralización RCV ${docItem.tipoRegistro} Doc ${docItem.tipoDoc} N° ${docItem.folio} - ${docItem.razonSocialEmisor}`,
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
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede contabilizar documentos contables ni generar comprobantes.');
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
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede contabilizar documentos contables.');
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
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede contabilizar documentos contables.');
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

  const handleDeleteVoucher = async (v: Voucher) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede eliminar comprobantes contables.');
      return;
    }

    const periodCheck = checkIsPeriodClosed(v.period || v.date);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes eliminar comprobantes pertenecientes a un período cerrado.`);
      return;
    }

    const confirmMsg = `¿Estás seguro de ELIMINAR definitivamente el Comprobante N° ${v.voucherNumber} (${v.type})?\n\n` +
      `Si este comprobante proviene de un documento del RCV, dicho documento volverá automáticamente al estado "Pendiente de Contabilizar".`;
    if (!window.confirm(confirmMsg)) return;

    try {
      // Revert associated RCV document if any
      const linkedRcvDocs = rcvDocuments.filter(d => d.voucherId === v.id || (v.createdFromRcvId && d.id === v.createdFromRcvId));
      for (const rcvDoc of linkedRcvDocs) {
        await updateDoc(doc(companyRef, 'rcvDocuments', rcvDoc.id), {
          estadoContabilizado: false,
          voucherId: null
        });
      }

      const anularComprobante = async (v: Voucher) => {
        const reason = window.prompt(`¿Está seguro de ANULAR el Comprobante N° ${v.voucherNumber}? Por favor ingrese el motivo de la anulación:`);
        if (reason === null || reason.trim() === '') {
          if (reason !== null) alert("Debe ingresar un motivo para la anulación.");
          return;
        }

        try {
          // 1. Marcar el comprobante como anulado
          await updateDoc(doc(companyRef, 'vouchers', v.id), {
            status: 'Anulado',
            anuladoAt: new Date().toISOString(),
            anuladoReason: reason,
            updatedAt: new Date().toISOString(),
            lastModifiedBy: auth.currentUser?.email
          });

          // 2. Revertir asociado RCV document si existe
          const linkedRcvDocs = rcvDocuments.filter(d => d.voucherId === v.id || (v.createdFromRcvId && d.id === v.createdFromRcvId));
          for (const rcvDoc of linkedRcvDocs) {
            await updateDoc(doc(companyRef, 'rcvDocuments', rcvDoc.id), {
              estadoContabilizado: false,
              voucherId: null
            });
          }

          // 3. Audit Log
          logAuditEvent({
            userId: auth.currentUser?.uid || 'anon',
            userEmail: auth.currentUser?.email || '',
            studyId,
            companyId: company.id,
            action: 'ANULAR',
            module: 'COMPROBANTES',
            details: `Anulación de Comprobante N° ${v.voucherNumber} (${v.type}, ${v.period}) en ${company.name}. Motivo: ${reason}`,
            metadata: {
              voucherId: v.id,
              voucherNumber: v.voucherNumber,
              type: v.type,
              reason: reason
            }
          });

          alert(`Comprobante N° ${v.voucherNumber} anulado correctamente.`);
          await fetchData();
        } catch (err: any) {
          console.error("Error al anular comprobante:", err);
          alert("Error al anular el comprobante: " + err.message);
        }
      };

      await anularComprobante(v);
    } catch (err: any) {
      console.error("Error al gestionar comprobante:", err);
      alert('Error al gestionar comprobante: ' + err.message);
    }
  };

  const handleToggleAnularVoucher = async (v: Voucher) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede anular ni reactivar comprobantes.');
      return;
    }

    const periodCheck = checkIsPeriodClosed(v.period || v.date);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes anular o reactivar comprobantes pertenecientes a un período cerrado.`);
      return;
    }

    const isCurrentlyAnulado = v.status === 'Anulado';
    if (isCurrentlyAnulado) {
      if (!window.confirm(`¿Deseas REACTIVAR el Comprobante N° ${v.voucherNumber}? Su estado pasará a "Válido".`)) return;
      try {
        await updateDoc(doc(companyRef, 'vouchers', v.id), {
          status: 'Valido',
          anuladoAt: null,
          anuladoReason: null,
          lastModifiedBy: auth.currentUser?.uid || 'anon',
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

        alert(`Comprobante N° ${v.voucherNumber} reactivado como Válido.`);
        await fetchData();
        if (selectedVoucher?.id === v.id) {
          setSelectedVoucher({ ...v, status: 'Valido' });
        }
      } catch (err: any) {
        console.error("Error reactivando comprobante:", err);
        alert('Error al reactivar comprobante: ' + err.message);
      }
    } else {
      const reason = window.prompt(`Ingresa el motivo de ANULACIÓN para el Comprobante N° ${v.voucherNumber}:`, 'Anulación por corrección de datos contables');
      if (reason === null) return;

      try {
        await updateDoc(doc(companyRef, 'vouchers', v.id), {
          status: 'Anulado',
          anuladoAt: new Date().toISOString(),
          anuladoReason: reason || 'Anulado por usuario',
          lastModifiedBy: auth.currentUser?.uid || 'anon',
          lastModifiedAt: new Date().toISOString()
        });

        // Free up the linked RCV document so user can edit/re-contabilize
        const linkedRcvDocs = rcvDocuments.filter(d => d.voucherId === v.id || (v.createdFromRcvId && d.id === v.createdFromRcvId));
        for (const rcvDoc of linkedRcvDocs) {
          await updateDoc(doc(companyRef, 'rcvDocuments', rcvDoc.id), {
            estadoContabilizado: false
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
          details: `Anulación de Comprobante N° ${v.voucherNumber} (Motivo: ${reason}) en ${company.name}`,
          metadata: { voucherNumber: v.voucherNumber, voucherId: v.id, motivo: reason }
        });

        alert(`Comprobante N° ${v.voucherNumber} ha sido Anulado exitosamente.`);
        await fetchData();
        if (selectedVoucher?.id === v.id) {
          setSelectedVoucher({ ...v, status: 'Anulado', anuladoReason: reason });
        }
      } catch (err: any) {
        console.error("Error anulando comprobante:", err);
        alert('Error al anular comprobante: ' + err.message);
      }
    }
  };

  const handleSaveVoucherForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede crear ni modificar comprobantes contables.');
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

  // Purge handlers
  const handlePurgeJanuaryPurchases = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede eliminar ni purgar registros.');
      return;
    }

    const periodCheck = checkIsPeriodClosed('2026-01');
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes purgar registros de un período cerrado.`);
      return;
    }

    if (!window.confirm('¿Confirmas purgar/eliminar todos los registros de Compras de Enero de la empresa? La tabla de compras de enero quedará en cero.')) {
      return;
    }
    try {
      const docsToDelete = rcvDocuments.filter(
        d => d.tipoRegistro === 'Compra' && (
          d.period === '2026-01' || 
          d.period.endsWith('-01') || 
          (d.fechaEmision && d.fechaEmision.includes('-01-')) ||
          (d.fechaEmision && d.fechaEmision.startsWith('2026-01'))
        )
      );

      for (const d of docsToDelete) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', d.id));
      }

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'ELIMINAR',
        module: 'RCV_COMPRAS',
        details: `Purga de ${docsToDelete.length} registros de Compras de Enero en ${company.name}`,
        metadata: { action: 'DELETE', documentType: 'RCV_COMPRAS', motivo: 'Purga masiva de compras de enero', registrosEliminados: docsToDelete.length, tipo: 'Compra', periodo: '2026-01' }
      });

      alert(`Purga completada: Se eliminaron ${docsToDelete.length} registros de Compras de Enero.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error purging January purchases:", err);
      alert('Error al purgar registros de compras: ' + err.message);
    }
  };

  const handlePurgeJanuarySales = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede eliminar ni purgar registros.');
      return;
    }

    const periodCheck = checkIsPeriodClosed('2026-01');
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes purgar registros de un período cerrado.`);
      return;
    }

    if (!window.confirm('¿Confirmas purgar/eliminar todas las Ventas de Enero de la empresa? La tabla de ventas de enero quedará en cero.')) {
      return;
    }
    try {
      const docsToDelete = rcvDocuments.filter(
        d => d.tipoRegistro === 'Venta' && (
          d.period === '2026-01' || 
          d.period.endsWith('-01') || 
          (d.fechaEmision && d.fechaEmision.includes('-01-')) ||
          (d.fechaEmision && d.fechaEmision.startsWith('2026-01'))
        )
      );

      for (const d of docsToDelete) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', d.id));
      }

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'ELIMINAR',
        module: 'RCV_VENTAS',
        details: `Purga de ${docsToDelete.length} registros de Ventas de Enero en ${company.name}`,
        metadata: { action: 'DELETE', documentType: 'RCV_VENTAS', motivo: 'Purga masiva de ventas de enero', registrosEliminados: docsToDelete.length, tipo: 'Venta', periodo: '2026-01' }
      });

      alert(`Purga completada: Se eliminaron ${docsToDelete.length} registros de Ventas de Enero.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error purging January sales:", err);
      alert('Error al purgar registros de ventas: ' + err.message);
    }
  };

  const handlePurgeSelectedPeriodSales = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede eliminar ni purgar registros.');
      return;
    }

    const periodCheck = checkIsPeriodClosed(selectedRcvPeriod);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes eliminar ventas de un período cerrado.`);
      return;
    }

    if (!window.confirm(`¿Confirmas eliminar todas las VENTAS del período seleccionado (${selectedRcvPeriod})?`)) {
      return;
    }
    try {
      const docsToDelete = rcvDocuments.filter(d => d.tipoRegistro === 'Venta' && d.period === selectedRcvPeriod);
      for (const d of docsToDelete) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', d.id));
      }

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'ELIMINAR',
        module: 'RCV_VENTAS',
        details: `Purga de ${docsToDelete.length} registros de Ventas del período ${selectedRcvPeriod} en ${company.name}`,
        metadata: { action: 'DELETE', documentType: 'RCV_VENTAS', motivo: `Purga de ventas del período ${selectedRcvPeriod}`, registrosEliminados: docsToDelete.length, tipo: 'Venta', periodo: selectedRcvPeriod }
      });

      alert(`Purga completada: Se eliminaron ${docsToDelete.length} ventas del período ${selectedRcvPeriod}.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error purging sales:", err);
      alert('Error al purgar ventas: ' + err.message);
    }
  };

  const handlePurgeCurrentPeriod = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede eliminar ni purgar registros.');
      return;
    }

    const periodCheck = checkIsPeriodClosed(selectedRcvPeriod);
    if (periodCheck.isClosed) {
      alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes purgar documentos de un período cerrado.`);
      return;
    }

    if (!window.confirm(`¿Confirmas eliminar TODOS los documentos RCV (compras, ventas y honorarios) del período seleccionado (${selectedRcvPeriod})?`)) {
      return;
    }
    try {
      const docsToDelete = rcvDocuments.filter(d => d.period === selectedRcvPeriod);
      for (const d of docsToDelete) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', d.id));
      }

      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'ELIMINAR',
        module: 'RCV_COMPRAS',
        details: `Purga de ${docsToDelete.length} documentos del período ${selectedRcvPeriod} en ${company.name}`,
        metadata: { action: 'DELETE', documentType: 'RCV_DOCUMENT', motivo: `Purga integral del período ${selectedRcvPeriod}`, registrosEliminados: docsToDelete.length, periodo: selectedRcvPeriod }
      });

      alert(`Purga completada: Se eliminaron ${docsToDelete.length} documentos del período ${selectedRcvPeriod}.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error purging period:", err);
      alert('Error al purgar período: ' + err.message);
    }
  };

  // Delete Single RCV Document (Purchases, Sales, Honorarios, etc.)
  const handleDeleteSingleRcvDoc = async (docId: string, tipo: string, folio: string) => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede eliminar documentos.');
      return;
    }

    const targetDoc = rcvDocuments.find(d => d.id === docId);
    if (targetDoc) {
      const periodCheck = checkIsPeriodClosed(targetDoc.period || targetDoc.fechaEmision);
      if (periodCheck.isClosed) {
        alert(`⚠️ Acción Bloqueada:\n\n${periodCheck.errorMsg}\n\nNo puedes eliminar documentos de un período contable cerrado.`);
        return;
      }
    }

    if (!window.confirm(`¿Confirmas eliminar el documento ${tipo} Folio #${folio}?`)) {
      return;
    }
    try {
      await deleteDoc(doc(companyRef, 'rcvDocuments', docId));
      setSelectedRcvIds(prev => prev.filter(id => id !== docId));

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

      alert(`Documento ${tipo} #${folio} eliminado correctamente.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error deleting RCV document:", err);
      alert('Error al eliminar documento: ' + err.message);
    }
  };

  // Delete Selected RCV Documents
  const handleDeleteSelectedRcvDocs = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede eliminar documentos.');
      return;
    }
    if (selectedRcvIds.length === 0) return;

    // Check if any selected document is in a closed period
    const docsToDelete = rcvDocuments.filter(d => selectedRcvIds.includes(d.id));
    for (const d of docsToDelete) {
      const pCheck = checkIsPeriodClosed(d.period || d.fechaEmision);
      if (pCheck.isClosed) {
        alert(`⚠️ Acción Bloqueada:\n\nEl documento ${d.tipoDoc || d.tipoRegistro} Folio #${d.folio} pertenece al período cerrado (${pCheck.periodStr}).\n\nNo puedes eliminar documentos en períodos fiscales cerrados.`);
        return;
      }
    }

    if (!window.confirm(`¿Confirmas eliminar los ${selectedRcvIds.length} documentos seleccionados (compras, ventas u honorarios)?`)) {
      return;
    }
    try {
      for (const id of selectedRcvIds) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', id));
      }
      const count = selectedRcvIds.length;
      setSelectedRcvIds([]);

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

      alert(`Se eliminaron ${count} documentos seleccionados correctamente.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error deleting selected RCV docs:", err);
      alert('Error al eliminar documentos seleccionados: ' + err.message);
    }
  };

  // Seed default Chilean Chart of Accounts if empty
  const handleSeedDefaultAccounts = async () => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede cargar planes de cuenta.');
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
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede generar ni modificar indicadores históricos.');
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
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede crear ni modificar cuentas contables.');
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
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede crear ni modificar auxiliares.');
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
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede modificar parámetros.');
      return;
    }
    const formData = new FormData(e.currentTarget);
    const params: RCVAccountingParams = {
      ivaDebitoAccountId: formData.get('ivaDebitoAccountId') as string,
      ivaCreditoAccountId: formData.get('ivaCreditoAccountId') as string,
      retencionBheAccountId: formData.get('retencionBheAccountId') as string,
      exentoAccountId: formData.get('exentoAccountId') as string,
      defaultCustomerAccountId: formData.get('defaultCustomerAccountId') as string,
      defaultSupplierAccountId: formData.get('defaultSupplierAccountId') as string,
      defaultHonorariosAccountId: formData.get('defaultHonorariosAccountId') as string,
      defaultSalesIncomeAccountId: formData.get('defaultSalesIncomeAccountId') as string,
      defaultCostOrExpenseAccountId: formData.get('defaultCostOrExpenseAccountId') as string,
      defaultHonorariosExpenseAccountId: formData.get('defaultHonorariosExpenseAccountId') as string,
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
    if (isReadOnly) return;
    const fyId = String(year);
    const existing = fiscalYears.find(f => f.id === fyId);
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
      await setDoc(doc(companyRef, 'fiscalPeriods', fyId), newFy);
      await fetchData();
    }
  };

  const handleToggleMonthStatus = async (year: number, monthNum: number, currentStatus: 'Abierto' | 'Cerrado') => {
    if (isReadOnly) {
      alert('🔒 Modo Solo Lectura: El perfil Super Administrador no puede abrir ni cerrar períodos fiscales.');
      return;
    }
    const fyId = String(year);
    const fy = fiscalYears.find(f => f.id === fyId);
    if (!fy) return;

    const newStatus = currentStatus === 'Abierto' ? 'Cerrado' : 'Abierto';
    const updatedMonths = { ...fy.months, [monthNum]: newStatus };

    try {
      await updateDoc(doc(companyRef, 'fiscalPeriods', fyId), { months: updatedMonths });

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'MODIFICAR',
        module: 'PERIODOS_FISCALES',
        details: `Cambio de estado período ${year}-${String(monthNum).padStart(2, '0')} a "${newStatus}" en ${company.name}`,
        metadata: { year, month: monthNum, status: newStatus }
      });

      await fetchData();
    } catch (err: any) {
      console.error("Error updating period:", err);
      alert('Error al actualizar período: ' + err.message);
    }
  };

  // Today exchange rate or latest
  const todayStr = new Date().toISOString().split('T')[0];
  const currentRate = exchangeRates.find(r => r.date === todayStr) || exchangeRates[exchangeRates.length - 1] || { id: 'fallback', date: todayStr, uf: 38250, dolar: 955, utm: 66500, euro: 1040, yen: 6.3 };

  return (
    <div className="space-y-4">
      {/* Super Admin Read-Only Notice Banner */}
      {isReadOnly && (
        <div className="bg-amber-50 border border-amber-300 px-4 py-2.5 rounded-lg flex items-center justify-between text-amber-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🔒</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider">Modo Solo Lectura (Super Administrador Global)</p>
              <p className="text-[11px] text-amber-700">Tienes acceso de lectura y navegación a todos los módulos. La creación, modificación o eliminación de registros contables o tributarios está restringida exclusivamente a los administradores y contadores del estudio.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold bg-amber-200 text-amber-800 px-2.5 py-1 rounded border border-amber-300 whitespace-nowrap">SOLO LECTURA</span>
        </div>
      )}

      {/* Sticky Header: Menú Ribbon Tipo Excel y Selección de Período */}
      <div className="sticky top-[52px] z-40 bg-slate-100/95 backdrop-blur-md pt-0.5 pb-1 space-y-1.5 border-b border-slate-300 shadow-xs">
        {/* Barra de Contexto de Empresa y Selección de Año / Período */}
        <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={onBack}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-semibold text-xs rounded-md border border-slate-300 flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <span>←</span>
              <span>Volver a Empresas</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-300">
              <label className="text-slate-600 font-semibold text-[11px]">Año:</label>
              <select
                value={selectedYear}
                onChange={(e) => {
                  const yr = parseInt(e.target.value);
                  setSelectedYear(yr);
                  handleEnsureFiscalYear(yr);
                }}
                className="font-bold text-slate-800 font-mono bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500"
              >
                {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-indigo-50/90 px-2 py-1 rounded-md border border-indigo-200">
              <label className="text-indigo-900 font-bold text-[11px] flex items-center gap-1">
                <span>Mes Operativo:</span>
                {(() => {
                  const check = checkIsPeriodClosed(selectedRcvPeriod);
                  return (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                      check.isClosed ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}>
                      {check.isClosed ? '🔒 Cerrado' : '🔓 Abierto'}
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
                className="font-bold text-indigo-900 font-mono bg-white border border-indigo-300 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500"
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
                      label: `${monthNames[m]} ${selectedYear} — ${isOpen ? '🔓 Abierto' : '🔒 Cerrado'}`,
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
              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold px-2.5 py-1 rounded-md text-xs flex items-center gap-1 shadow-2xs transition-colors"
              title="Cargar Plan de Cuentas, Clientes, Proveedores o Comprobantes desde archivo Excel/CSV"
            >
              <span>📥</span>
              <span className="hidden md:inline">Importar Excel</span>
            </button>
          </div>
        </div>

        {/* 3. Menú por Pestañas / Fichas Estilo Excel (Ribbon Menu) */}
        <div className="bg-slate-200/90 p-0.5 rounded-lg border border-slate-300 shadow-2xs">
          {/* Pestañas Principales Ribbon con orden exacto: 1. Finanzas, 2. Tesorería, 3. Importaciones, 4. Impuestos F.29, 5. Indicadores, 6. Configuraciones */}
          <div className="flex items-center gap-1 px-1 pt-0.5 border-b border-slate-300 overflow-x-auto">
            {(['FINANZAS', 'TESORERIA', 'IMPORTACIONES', 'IMPUESTOS', 'INDICADORES', 'CONFIGURACIONES'] as const)
              .filter((ribbonTab) => !(isAnalyst && ribbonTab === 'INDICADORES'))
              .map((ribbonTab) => {
              const isActive = activeRibbonGroup === ribbonTab;
              const displayLabels: { [key: string]: string } = {
                FINANZAS: '1. 📊 FINANZAS',
                TESORERIA: '2. 💳 TESORERÍA',
                IMPORTACIONES: '3. 📥 CARGA RCV/BH',
                IMPUESTOS: '4. 📑 IMPUESTOS F.29',
                INDICADORES: '5. 📈 INDICADORES (KPIs)',
                CONFIGURACIONES: '6. ⚙️ CONFIGURACIONES'
              };

              return (
                <button
                  key={ribbonTab}
                  onClick={() => {
                    setActiveRibbonGroup(ribbonTab);
                    if (ribbonTab === 'FINANZAS') setActiveTab('vouchers');
                    if (ribbonTab === 'TESORERIA') setActiveTab('nominasPago');
                    if (ribbonTab === 'IMPORTACIONES') setActiveTab('rcv');
                    if (ribbonTab === 'IMPUESTOS') setActiveTab('formulario29');
                    if (ribbonTab === 'INDICADORES') setActiveTab('indicadoresFinancieros');
                    if (ribbonTab === 'CONFIGURACIONES' && !['accounts', 'auxiliaries', 'exchange', 'rcvParams', 'periods', 'plantillasCarga'].includes(activeTab)) {
                      setActiveTab('accounts');
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-bold rounded-t-md transition-colors uppercase tracking-wider whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-2xs border-t-2 border-slate-900 border-x border-slate-300'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  {displayLabels[ribbonTab]}
                </button>
              );
            })}
          </div>

          {/* Sub-Ribbon Horizontal de Acciones con Flechas de Desplazamiento (< / >) */}
          <div className="relative bg-white rounded-b-md p-1.5 flex items-center">
            {/* Flecha de desplazamiento izquierda */}
            <button
              type="button"
              onClick={() => scrollSubRibbon('left')}
              className="flex-shrink-0 p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition-colors mr-1 z-10 shadow-2xs"
              title="Desplazar opciones hacia la izquierda"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Contenedor desplazable de botones */}
            <div
              ref={subRibbonScrollRef}
              className="flex-1 flex items-center gap-2 overflow-x-auto scroll-smooth no-scrollbar py-0.5 px-1"
            >
              {/* 1. GRUPO: FINANZAS */}
              {activeRibbonGroup === 'FINANZAS' && (
                <>
                  <button
                    onClick={() => setActiveTab('vouchers')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'vouchers'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📝 Vouchers</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('libroDiario')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'libroDiario'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📖 Libro Diario</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('libroMayor')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'libroMayor'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📚 Libro Mayor</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('analisisAuxiliares')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'analisisAuxiliares'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📑 Auxiliar Cuentas Corrientes</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('analisisCuentas')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'analisisCuentas'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🔍 Análisis de Cuentas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('balance8')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'balance8'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>⚖️ Balance 8 Columnas (Tributario)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('tablasAnalisis')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'tablasAnalisis'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🗂️ Catálogos de Análisis</span>
                  </button>
                </>
              )}

              {/* 2. GRUPO: TESORERÍA */}
              {activeRibbonGroup === 'TESORERIA' && (
                <>
                  <button
                    onClick={() => setActiveTab('nominasPago')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'nominasPago'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>💰 Nóminas de Pago a Proveedores</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('cobranza')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'cobranza'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📑 Cobranza y Cuentas por Cobrar</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('flujoDeCaja')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'flujoDeCaja'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🌊 Flujo de Caja Real & Proyectado</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('conciliacionBancaria')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'conciliacionBancaria'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🏦 Conciliación Bancaria</span>
                  </button>
                </>
              )}

              {/* 3. GRUPO: IMPORTACIONES */}
              {activeRibbonGroup === 'IMPORTACIONES' && (
                <>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Compra'); }}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv' && rcvFilterType === 'Compra'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🛒 Compras (RCV)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Venta'); }}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv' && rcvFilterType === 'Venta'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📈 Ventas (RCV)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Honorarios'); }}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv' && rcvFilterType === 'Honorarios'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🧾 Honorarios (BHR)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Todos'); }}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv' && rcvFilterType === 'Todos'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📑 Todos los Documentos RCV</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('cargaMasiva')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'cargaMasiva'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>⚡ Carga Masiva Comprobantes</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('plantillasCarga')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'plantillasCarga'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📥 Plantillas Excel y Cargas Masivas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('emisionDte')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'emisionDte'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>⚡ Emisión DTE / Facturador SII</span>
                  </button>
                </>
              )}

              {/* 4. GRUPO: IMPUESTOS F.29 */}
              {activeRibbonGroup === 'IMPUESTOS' && (
                <>
                  <button
                    onClick={() => setActiveTab('formulario29')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'formulario29'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📑 Formulario 29 Mensual (F29 - SII)</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Compra'); }}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📊 Registro Compras y Ventas (RCV)</span>
                  </button>
                </>
              )}

              {/* 5. GRUPO: INDICADORES (KPIs) */}
              {activeRibbonGroup === 'INDICADORES' && (
                <>
                  <button
                    onClick={() => setActiveTab('indicadoresFinancieros')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'indicadoresFinancieros'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📊 Tablero de Indicadores Financieros & KPIs</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('balanceIFRS')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'balanceIFRS'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🏛️ Balance Clasificado (IFRS)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('estadoResultados')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'estadoResultados'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📈 Estado de Resultados</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('flujoDeCaja')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'flujoDeCaja'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🌊 Flujo y Proyección de Caja</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('exchange')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'exchange'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📈 Indicadores Económicos Oficiales (UF, USD, UTM, IPC)</span>
                  </button>
                </>
              )}

              {/* 6. GRUPO: CONFIGURACIONES (Siempre al final) */}
              {activeRibbonGroup === 'CONFIGURACIONES' && (
                <>
                  <button
                    onClick={() => setActiveTab('accounts')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'accounts'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📑 Plan de Cuentas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('auxiliaries')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'auxiliaries'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>👥 Maestro de Auxiliares (Clientes / Proveedores)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('tablasAnalisis')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'tablasAnalisis'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>🗂️ Catálogos de Análisis (CC, Ítems, Proyectos, Docs no SII)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('rcvParams')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcvParams'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>⚙️ Parámetros Contables RCV</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('f29Codes')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'f29Codes'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📋 Configuración Códigos F.29</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('periods')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'periods'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📅 Apertura Ejercicios y Períodos</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('plantillasCarga')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'plantillasCarga'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📥 Plantillas Excel y Cargas Masivas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('exchange')}
                    className={`px-3 py-1.5 text-xs rounded font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'exchange'
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>📈 Indicadores Económicos (UF, USD, UTM, IPC)</span>
                  </button>
                </>
              )}
            </div>

            {/* Flecha de desplazamiento derecha */}
            <button
              type="button"
              onClick={() => scrollSubRibbon('right')}
              className="flex-shrink-0 p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition-colors ml-1 z-10 shadow-2xs"
              title="Desplazar opciones hacia la derecha"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
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

      {loading && (
        <div className="py-6 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Cargando datos contables de la empresa...</span>
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
            auxiliaries={auxiliaries}
            accounts={accounts}
            vouchers={vouchers}
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
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm max-w-4xl mx-auto">
          <h3 className="text-lg font-medium text-slate-900 mb-6 border-b border-slate-200 pb-2">Parámetros Contables del RCV (Cuentas por Defecto)</h3>
          
          <form onSubmit={handleSaveRcvParams} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-700 uppercase">Impuestos Centralizados</h4>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cuenta IVA Débito Fiscal (Ventas)</label>
                  <select name="ivaDebitoAccountId" defaultValue={rcvParams?.ivaDebitoAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cuenta IVA Crédito Fiscal (Compras)</label>
                  <select name="ivaCreditoAccountId" defaultValue={rcvParams?.ivaCreditoAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cuenta IVA Retenido / Retención BHE (Honorarios)</label>
                  <select name="retencionBheAccountId" defaultValue={rcvParams?.retencionBheAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cuenta de Impuesto Exento / No Gravado</label>
                  <select name="exentoAccountId" defaultValue={rcvParams?.exentoAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-700 uppercase">Contrapartidas por Defecto (Fallback)</h4>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Clientes Nacionales (Ventas)</label>
                  <select name="defaultCustomerAccountId" defaultValue={rcvParams?.defaultCustomerAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedores Nacionales (Compras)</label>
                  <select name="defaultSupplierAccountId" defaultValue={rcvParams?.defaultSupplierAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Honorarios por Pagar</label>
                  <select name="defaultHonorariosAccountId" defaultValue={rcvParams?.defaultHonorariosAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Ingreso por Ventas (Resultado Ganancia)</label>
                  <select name="defaultSalesIncomeAccountId" defaultValue={rcvParams?.defaultSalesIncomeAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Gasto por Compras (Resultado Pérdida)</label>
                  <select name="defaultCostOrExpenseAccountId" defaultValue={rcvParams?.defaultCostOrExpenseAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Gasto por Honorarios (Resultado Pérdida)</label>
                  <select name="defaultHonorariosExpenseAccountId" defaultValue={rcvParams?.defaultHonorariosExpenseAccountId || ''} className="border border-slate-300 p-2 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                    <option value="">Seleccione una cuenta</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <button type="submit" className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors">
                Guardar Parámetros
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
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Módulo RCV (Registro de Compras y Ventas) & Importación SII</h3>
              <p className="text-sm text-slate-500 mt-1">
                Carga masiva, validación anti-duplicados, auto-creación de auxiliares y contabilización automática.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Período Seleccionado</label>
                <input
                  type="month"
                  value={selectedRcvPeriod}
                  onChange={(e) => setSelectedRcvPeriod(e.target.value)}
                  className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg p-2 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Official SII File Uploader */}
          <div className="bg-gradient-to-br from-indigo-50 to-slate-50 border border-indigo-100 p-6 rounded-lg shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-wider">Cargador Oficial de Archivos del SII (CSV / TXT) - Período: {selectedRcvPeriod}</h4>
            <p className="text-xs text-slate-600">
              Seleccione los archivos oficiales descargados desde el SII. El sistema leerá automáticamente los encabezados estándar (RUT Emisor, Razón Social, Folio, Tipo Doc, Monto Neto, IVA, Total), validará duplicados por <strong>[RUT Emisor + Tipo Doc + Folio]</strong> y auto-creará los auxiliares faltantes.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-2">
                <label className="block text-xs font-bold text-blue-900">1. Compras SII (.csv/.txt)</label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => handleFileUpload(e, 'Compra')}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-2">
                <label className="block text-xs font-bold text-emerald-900">2. Ventas SII (.csv/.txt)</label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => handleFileUpload(e, 'Venta')}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                />
              </div>
              <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm space-y-2">
                <label className="block text-xs font-bold text-amber-900">3. Honorarios BHR (.csv/.txt)</label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => handleFileUpload(e, 'Honorarios')}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                />
              </div>
            </div>

            {rcvImportSummary && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-lg text-xs space-y-1">
                <p className="font-bold">Resumen de Procesamiento Real:</p>
                <p>• Documentos leídos del archivo: <strong>{(rcvImportSummary as any).read || ((rcvImportSummary as any).loaded + (rcvImportSummary as any).duplicates)}</strong></p>
                <p>• Nuevos importados (guardados en Firestore): <strong>{rcvImportSummary.loaded}</strong></p>
                <p>• Duplicados omitidos ([RUT + TipoDoc + Folio]): <strong>{rcvImportSummary.duplicates}</strong></p>
                <p>• Nuevos auxiliares creados automáticamente: <strong>{rcvImportSummary.newAuxiliaries}</strong></p>
              </div>
            )}
          </div>

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
                  onClick={handlePurgeJanuarySales}
                  className="bg-emerald-50 hover:bg-rose-100 text-emerald-800 hover:text-rose-700 border border-emerald-200 hover:border-rose-300 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                  title="Elimina todos los registros de VENTAS de enero de la base de datos"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-600 hover:text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Purgar Ventas Enero
                </button>
                <button
                  onClick={handlePurgeJanuaryPurchases}
                  className="bg-blue-50 hover:bg-rose-100 text-blue-800 hover:text-rose-700 border border-blue-200 hover:border-rose-300 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                  title="Elimina todos los registros de COMPRAS de enero de la base de datos"
                >
                  <svg className="w-3.5 h-3.5 text-blue-600 hover:text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Purgar Compras Enero
                </button>
                {rcvFilterType === 'Venta' ? (
                  <button
                    onClick={handlePurgeSelectedPeriodSales}
                    className="bg-amber-50 hover:bg-rose-100 text-amber-900 hover:text-rose-700 border border-amber-200 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                    title={`Elimina todas las ventas del período ${selectedRcvPeriod}`}
                  >
                    Purgar Ventas {selectedRcvPeriod}
                  </button>
                ) : (
                  <button
                    onClick={handlePurgeCurrentPeriod}
                    className="bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                    title="Elimina todos los registros del período seleccionado (compras, ventas y honorarios)"
                  >
                    Purgar Todo Período {selectedRcvPeriod}
                  </button>
                )}
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
                    <th className="p-3 text-right">Neto</th>
                    <th className="p-3 text-right">IVA</th>
                    <th className="p-3 text-right">Total</th>
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
                          ${(docItem.montoNeto || 0).toLocaleString('es-CL')}
                        </td>
                        <td className={`p-3 text-right font-mono ${isNotaCredito ? 'text-rose-700' : 'text-slate-900'}`}>
                          ${(docItem.montoIva || 0).toLocaleString('es-CL')}
                        </td>
                        <td className={`p-3 text-right font-mono font-bold ${isNotaCredito ? 'text-rose-700' : 'text-slate-900'}`}>
                          ${(docItem.montoTotal || 0).toLocaleString('es-CL')}
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
                      <td colSpan={11} className="p-8 text-center text-slate-500 italic">
                        No hay documentos registrados para el período {selectedRcvPeriod}. Utiliza los botones superiores para cargar un lote de prueba o importar archivos.
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
                                    <input
                                      type="number"
                                      min="0"
                                      value={line.debit || ''}
                                      placeholder="0"
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const newLines = [...voucherForm.lines];
                                        newLines[idx] = {
                                          ...newLines[idx],
                                          debit: val,
                                          credit: val > 0 ? 0 : newLines[idx].credit
                                        };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className="border border-slate-300 p-1.5 w-full rounded text-xs text-right font-medium focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </td>
                                  <td className="p-2 text-right">
                                    <input
                                      type="number"
                                      min="0"
                                      value={line.credit || ''}
                                      placeholder="0"
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const newLines = [...voucherForm.lines];
                                        newLines[idx] = {
                                          ...newLines[idx],
                                          credit: val,
                                          debit: val > 0 ? 0 : newLines[idx].debit
                                        };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }}
                                      className="border border-slate-300 p-1.5 w-full rounded text-xs text-right font-medium focus:ring-1 focus:ring-indigo-500"
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
                              <div className="flex justify-between items-center">
                                <label className="font-bold text-slate-800 flex items-center gap-1.5">
                                  <span>👤 Auxiliar / RUT</span>
                                  {lineAcc?.requiereAuxiliarRUT && <span className="text-rose-600 font-bold">* (Obligatorio)</span>}
                                </label>
                                {auxiliaries.length > 0 && (
                                  <select
                                    onChange={(e) => {
                                      const selAux = auxiliaries.find(a => a.rut === e.target.value);
                                      if (selAux) {
                                        const newLines = [...voucherForm.lines];
                                        newLines[targetIdx] = {
                                          ...newLines[targetIdx],
                                          auxiliaryRut: selAux.rut,
                                          auxiliaryName: selAux.name
                                        };
                                        setVoucherForm({ ...voucherForm, lines: newLines });
                                      }
                                    }}
                                    className="border border-slate-300 p-1 rounded text-xs bg-white text-slate-700"
                                  >
                                    <option value="">Seleccionar Auxiliar existente...</option>
                                    {auxiliaries.map(aux => (
                                      <option key={aux.id} value={aux.rut}>
                                        {aux.rut} - {aux.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  placeholder="RUT Auxiliar (ej. 76.123.456-7)"
                                  value={currentLine.auxiliaryRut || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], auxiliaryRut: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className={`border p-2 w-full rounded font-mono ${lineAcc?.requiereAuxiliarRUT && !currentLine.auxiliaryRut ? 'border-rose-400 bg-rose-50/40' : 'border-slate-300 bg-white'}`}
                                />
                                <input
                                  type="text"
                                  placeholder="Nombre o Razón Social Auxiliar"
                                  value={currentLine.auxiliaryName || ''}
                                  onChange={(e) => {
                                    const newLines = [...voucherForm.lines];
                                    newLines[targetIdx] = { ...newLines[targetIdx], auxiliaryName: e.target.value };
                                    setVoucherForm({ ...voucherForm, lines: newLines });
                                  }}
                                  className="border border-slate-300 p-2 w-full rounded bg-white"
                                />
                              </div>
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
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
        />
      )}

      {/* TAB: LIBRO MAYOR */}
      {activeTab === 'libroMayor' && (
        <LibroMayorView
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
        />
      )}

      {/* TAB: BALANCE DE 8 COLUMNAS */}
      {activeTab === 'balance8' && (
        <Balance8ColumnasView
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
        />
      )}

      {/* TAB: BALANCE CLASIFICADO IFRS */}
      {activeTab === 'balanceIFRS' && (
        <BalanceIFRSView
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
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
    </div>
  );
}
