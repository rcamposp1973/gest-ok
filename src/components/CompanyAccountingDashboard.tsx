import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { Company, ChartOfAccount, Auxiliary, ExchangeRate, FiscalPeriodYear, RCVDocument, Voucher, VoucherLine, RCVAccountingParams, BankReconciliation } from '../types';
import { syncOnlineChileanIndicators, generateOfficialChileanIndicators } from '../utils/chileanEconomicIndicators';
import LibroDiarioView from './LibroDiarioView';
import LibroMayorView from './LibroMayorView';
import Balance8ColumnasView from './Balance8ColumnasView';
import BalanceIFRSView from './BalanceIFRSView';
import EstadoResultadosView from './EstadoResultadosView';
import IndicadoresFinancierosView from './IndicadoresFinancierosView';
import FlujoDeCajaView from './FlujoDeCajaView';
import NominasPagoView from './NominasPagoView';
import CobranzaView from './CobranzaView';
import ConciliacionBancariaView from './ConciliacionBancariaView';
import CargaMasivaComprobantesView from './CargaMasivaComprobantesView';
import Formulario29View from './Formulario29View';
import PlantillasYCargaMasivaView from './PlantillasYCargaMasivaView';
import ExcelImportCenterModal from './ExcelImportCenterModal';
import IndicadoresEconomicosView from './IndicadoresEconomicosView';
import { useProcess } from '../context/ProcessContext';

interface CompanyAccountingDashboardProps {
  studyId: string;
  company: Company;
  onBack: () => void;
}

export default function CompanyAccountingDashboard({ studyId, company, onBack }: CompanyAccountingDashboardProps) {
  const { withProcess } = useProcess();
  type RibbonGroup = 'FINANZAS' | 'TESORERIA' | 'IMPORTACIONES' | 'IMPUESTOS' | 'INDICADORES' | 'CONFIGURACIONES';
  const [activeRibbonGroup, setActiveRibbonGroup] = useState<RibbonGroup>('FINANZAS');
  const [activeTab, setActiveTab] = useState<'accounts' | 'auxiliaries' | 'periods' | 'rcv' | 'exchange' | 'rcvParams' | 'vouchers' | 'libroDiario' | 'libroMayor' | 'balance8' | 'balanceIFRS' | 'estadoResultados' | 'indicadoresFinancieros' | 'flujoDeCaja' | 'nominasPago' | 'cobranza' | 'conciliacionBancaria' | 'cargaMasiva' | 'formulario29' | 'plantillasCarga'>('vouchers');
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

  // UI states for vouchers
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [voucherFilterType, setVoucherFilterType] = useState<string>('Todos');
  const [voucherSearchQuery, setVoucherSearchQuery] = useState<string>('');

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
    status: 'Valido' | 'Anulado' | 'Descuadrado';
    lines: VoucherLine[];
    createdFromRcvId?: string;
  } | null>(null);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedRcvPeriod, setSelectedRcvPeriod] = useState<string>('2026-08');
  const [selectedRcvIds, setSelectedRcvIds] = useState<string[]>([]);
  const [rcvImportSummary, setRcvImportSummary] = useState<{ loaded: number; duplicates: number; newAuxiliaries: number } | null>(null);

  // Editing states
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [editingAuxiliary, setEditingAuxiliary] = useState<Auxiliary | null>(null);
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
      const fetchedAccounts = accSnap.docs.map(d => ({ id: d.id, ...d.data() } as ChartOfAccount));
      fetchedAccounts.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      setAccounts(fetchedAccounts);

      const auxSnap = await getDocs(collection(companyRef, 'auxiliaries'));
      setAuxiliaries(auxSnap.docs.map(d => ({ id: d.id, ...d.data() } as Auxiliary)));

      const exSnap = await getDocs(collection(companyRef, 'exchangeRates'));
      let fetchedRates = exSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExchangeRate));
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
      setFiscalYears(fySnap.docs.map(d => ({ id: d.id, ...d.data() } as FiscalPeriodYear)));

      const rcvSnap = await getDocs(collection(companyRef, 'rcvDocuments'));
      setRcvDocuments(rcvSnap.docs.map(d => ({ id: d.id, ...d.data() } as RCVDocument)));

      const vouchSnap = await getDocs(collection(companyRef, 'vouchers'));
      const fetchedVouchers = vouchSnap.docs.map(d => ({ id: d.id, ...d.data() } as Voucher));
      fetchedVouchers.sort((a, b) => (b.voucherNumber || 0) - (a.voucherNumber || 0));
      setVouchers(fetchedVouchers);

      const bankRecSnap = await getDocs(collection(companyRef, 'bankReconciliations'));
      setBankReconciliations(bankRecSnap.docs.map(d => ({ id: d.id, ...d.data() } as BankReconciliation)));

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
  }, [studyId, company.id]);

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
        const isDuplicate = currentRcvs.some(
          ex => ex.rutEmisor === item.rutEmisor && ex.tipoDoc === item.tipoDoc && String(ex.folio) === String(item.folio)
        );

        if (isDuplicate) {
          duplicates++;
          continue;
        }

        let aux = currentAuxs.find(a => a.rut === item.rutEmisor);
        if (!aux) {
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
      default:
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
        let detectedPeriod = selectedRcvPeriod;

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
          
          const { dateStr, periodStr } = normalizeChileanDate(rawFecha, selectedRcvPeriod);
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

          let cleanRut = (item.rutEmisor || '').trim().toLowerCase();
          let aux = currentAuxs.find(a => (a.rut || '').trim().toLowerCase() === cleanRut);
          if (!aux) {
            const newAuxData = {
              rut: item.rutEmisor,
              name: item.razonSocialEmisor,
              role: (tipoRegistro === 'Venta' ? 'Deudor' : 'Acreedor') as 'Deudor' | 'Acreedor',
              estado: 'Activo' as const,
              defaultDebtorAccountIds: [],
              defaultCreditorAccountIds: []
            };
            const auxRef = await addDoc(collection(companyRef, 'auxiliaries'), newAuxData);
            aux = { id: auxRef.id, ...newAuxData };
            currentAuxs.push(aux);
            newAuxCount++;
          }

          await addDoc(collection(companyRef, 'rcvDocuments'), item);
          loaded++;
        }

        setRcvImportSummary({
          read: readCount,
          loaded,
          duplicates,
          newAuxiliaries: newAuxCount
        } as any);

        if (detectedPeriod && detectedPeriod !== selectedRcvPeriod) {
          setSelectedRcvPeriod(detectedPeriod);
        }

        alert(`¡Importación completada con éxito!\n• Total líneas leídas: ${readCount}\n• Documentos nuevos guardados: ${loaded}\n• Duplicados omitidos: ${duplicates}\n• Nuevos auxiliares creados: ${newAuxCount}\nPeríodo activo: ${detectedPeriod}`);

        await fetchData();
        e.target.value = '';
      } catch (err: any) {
        console.error("Error parsing file:", err);
        alert('Error al procesar archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Helper to resolve an account object by ID, fallback keywords, or fallback type
  const resolveAccountDetails = (
    accountId?: string,
    fallbackKeywords: string[] = [],
    fallbackType?: string,
    defaultCode = '9.9.99',
    defaultName = 'Cuenta por Asignar'
  ): { id: string; code: string; name: string } => {
    if (accountId) {
      const found = accounts.find(a => a.id === accountId);
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
    const cleanRut = (docItem.rutEmisor || '').toLowerCase().replace(/[^0-9k]/g, '');
    const aux = auxiliaries.find(
      a => (a.rut || '').toLowerCase().replace(/[^0-9k]/g, '') === cleanRut
    );

    const lines: VoucherLine[] = [];
    const docRefStr = `${docItem.tipoDoc} #${docItem.folio}`;

    if (docItem.tipoRegistro === 'Compra') {
      // 1. Gasto / Costo
      const expenseAcc = resolveAccountDetails(
        aux?.defaultExpenseOrIncomeAccountId || rcvParams?.defaultCostOrExpenseAccountId,
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

      // 3. Proveedor por Pagar
      const supplierAcc = resolveAccountDetails(
        aux?.defaultCreditorAccountId || rcvParams?.defaultSupplierAccountId,
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

      // 5. Impuestos Adicionales / ILA (Opcional - Si no está configurado, se imputa a la cuenta de costo/gasto)
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

      // Detección de Impuestos Adicionales (ILA, carnes, licores, harinas, diesel, etc.)
      const explicitOtros = Number(docItem.montoOtrosImpuestos) || 0;
      const calculatedOtros = totalAmount - (netoAmount + ivaAmount + exentoAmount);
      const otrosImpuestosAmount = explicitOtros > 0 ? explicitOtros : (calculatedOtros > 0 ? calculatedOtros : 0);

      const hasConfiguredOtrosAcc = Boolean(rcvParams?.otrosImpuestosAccountId && accounts.some(a => a.id === rcvParams.otrosImpuestosAccountId));
      const finalNetoDebit = hasConfiguredOtrosAcc ? netoAmount : (netoAmount + otrosImpuestosAmount);

      const isNotaCredito = docItem.tipoDoc === '61' || String(docItem.tipoDoc).includes('61');

      if (isNotaCredito) {
        // En Nota de Crédito de Compras: Proveedor al Debe, Gasto e IVA al Haber
        lines.push({
          accountId: supplierAcc.id,
          accountCode: supplierAcc.code,
          accountName: supplierAcc.name,
          debit: totalAmount,
          credit: 0,
          auxiliaryRut: docItem.rutEmisor,
          auxiliaryName: docItem.razonSocialEmisor,
          documentRef: docRefStr,
          gloss: `NC Proveedor ${docRefStr} - ${docItem.razonSocialEmisor}`
        });

        if (finalNetoDebit > 0) {
          lines.push({
            accountId: expenseAcc.id,
            accountCode: expenseAcc.code,
            accountName: expenseAcc.name,
            debit: 0,
            credit: finalNetoDebit,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Reverso Gasto ${docRefStr} - ${docItem.razonSocialEmisor}`
          });
        }

        if (hasConfiguredOtrosAcc && otrosImpuestosAmount > 0) {
          lines.push({
            accountId: otrosImpuestosAcc.id,
            accountCode: otrosImpuestosAcc.code,
            accountName: otrosImpuestosAcc.name,
            debit: 0,
            credit: otrosImpuestosAmount,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Reverso Impuestos Adicionales ${docRefStr}`
          });
        }

        if (ivaAmount > 0) {
          lines.push({
            accountId: ivaAcc.id,
            accountCode: ivaAcc.code,
            accountName: ivaAcc.name,
            debit: 0,
            credit: ivaAmount,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Reverso IVA Crédito ${docRefStr}`
          });
        }

        if (exentoAmount > 0) {
          lines.push({
            accountId: exentoAcc.id,
            accountCode: exentoAcc.code,
            accountName: exentoAcc.name,
            debit: 0,
            credit: exentoAmount,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Reverso Exento ${docRefStr}`
          });
        }
      } else {
        // Facturas y documentos regulares de Compra
        if (finalNetoDebit > 0) {
          lines.push({
            accountId: expenseAcc.id,
            accountCode: expenseAcc.code,
            accountName: expenseAcc.name,
            debit: finalNetoDebit,
            credit: 0,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: otrosImpuestosAmount > 0 && !hasConfiguredOtrosAcc 
              ? `Gasto e Impuestos Adicionales ${docRefStr} - ${docItem.razonSocialEmisor}`
              : `Gasto ${docRefStr} - ${docItem.razonSocialEmisor}`
          });
        }

        if (hasConfiguredOtrosAcc && otrosImpuestosAmount > 0) {
          lines.push({
            accountId: otrosImpuestosAcc.id,
            accountCode: otrosImpuestosAcc.code,
            accountName: otrosImpuestosAcc.name,
            debit: otrosImpuestosAmount,
            credit: 0,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Impuestos Adicionales / ILA ${docRefStr}`
          });
        }

        if (ivaAmount > 0) {
          lines.push({
            accountId: ivaAcc.id,
            accountCode: ivaAcc.code,
            accountName: ivaAcc.name,
            debit: ivaAmount,
            credit: 0,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `IVA Crédito Fiscal ${docRefStr}`
          });
        }

        if (exentoAmount > 0) {
          lines.push({
            accountId: exentoAcc.id,
            accountCode: exentoAcc.code,
            accountName: exentoAcc.name,
            debit: exentoAmount,
            credit: 0,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Monto Exento ${docRefStr}`
          });
        }

        // Proveedor (Haber)
        lines.push({
          accountId: supplierAcc.id,
          accountCode: supplierAcc.code,
          accountName: supplierAcc.name,
          debit: 0,
          credit: totalAmount,
          auxiliaryRut: docItem.rutEmisor,
          auxiliaryName: docItem.razonSocialEmisor,
          documentRef: docRefStr,
          gloss: `Por Pagar ${docRefStr} - ${docItem.razonSocialEmisor}`
        });
      }

    } else if (docItem.tipoRegistro === 'Venta') {
      // 1. Cliente por Cobrar
      const customerAcc = resolveAccountDetails(
        aux?.defaultDebtorAccountId || rcvParams?.defaultCustomerAccountId,
        ['1.1.02.001', '1.1.02', 'cliente'],
        'Activo',
        '1.1.02.001',
        'Clientes Nacionales'
      );

      // 2. Ingreso por Ventas
      const salesAcc = resolveAccountDetails(
        aux?.defaultExpenseOrIncomeAccountId || rcvParams?.defaultSalesIncomeAccountId,
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

      if (isNotaCredito) {
        // En Nota de Crédito de Ventas: Ingresos e IVA al Debe, Cliente al Haber
        if (finalNetoCredit > 0) {
          lines.push({
            accountId: salesAcc.id,
            accountCode: salesAcc.code,
            accountName: salesAcc.name,
            debit: finalNetoCredit,
            credit: 0,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Reverso Venta ${docRefStr}`
          });
        }

        if (hasConfiguredOtrosAcc && otrosImpuestosAmount > 0) {
          lines.push({
            accountId: otrosImpuestosAcc.id,
            accountCode: otrosImpuestosAcc.code,
            accountName: otrosImpuestosAcc.name,
            debit: otrosImpuestosAmount,
            credit: 0,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Reverso Impuestos Adicionales ${docRefStr}`
          });
        }

        if (ivaAmount > 0) {
          lines.push({
            accountId: ivaDebitoAcc.id,
            accountCode: ivaDebitoAcc.code,
            accountName: ivaDebitoAcc.name,
            debit: ivaAmount,
            credit: 0,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Reverso IVA Débito ${docRefStr}`
          });
        }

        if (exentoAmount > 0) {
          lines.push({
            accountId: exentoAcc.id,
            accountCode: exentoAcc.code,
            accountName: exentoAcc.name,
            debit: exentoAmount,
            credit: 0,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Reverso Venta Exenta ${docRefStr}`
          });
        }

        lines.push({
          accountId: customerAcc.id,
          accountCode: customerAcc.code,
          accountName: customerAcc.name,
          debit: 0,
          credit: totalAmount,
          auxiliaryRut: docItem.rutEmisor,
          auxiliaryName: docItem.razonSocialEmisor,
          documentRef: docRefStr,
          gloss: `NC Cliente ${docRefStr} - ${docItem.razonSocialEmisor}`
        });
      } else {
        // Cliente (Debe)
        lines.push({
          accountId: customerAcc.id,
          accountCode: customerAcc.code,
          accountName: customerAcc.name,
          debit: totalAmount,
          credit: 0,
          auxiliaryRut: docItem.rutEmisor,
          auxiliaryName: docItem.razonSocialEmisor,
          documentRef: docRefStr,
          gloss: `Por Cobrar ${docRefStr} - ${docItem.razonSocialEmisor}`
        });

        // Ingreso Ventas (Haber)
        if (finalNetoCredit > 0) {
          lines.push({
            accountId: salesAcc.id,
            accountCode: salesAcc.code,
            accountName: salesAcc.name,
            debit: 0,
            credit: finalNetoCredit,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: otrosImpuestosAmount > 0 && !hasConfiguredOtrosAcc 
              ? `Ingreso Ventas e Impuestos Adicionales ${docRefStr}`
              : `Ingreso Ventas ${docRefStr}`
          });
        }

        if (hasConfiguredOtrosAcc && otrosImpuestosAmount > 0) {
          lines.push({
            accountId: otrosImpuestosAcc.id,
            accountCode: otrosImpuestosAcc.code,
            accountName: otrosImpuestosAcc.name,
            debit: 0,
            credit: otrosImpuestosAmount,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Impuestos Adicionales ${docRefStr}`
          });
        }

        if (ivaAmount > 0) {
          lines.push({
            accountId: ivaDebitoAcc.id,
            accountCode: ivaDebitoAcc.code,
            accountName: ivaDebitoAcc.name,
            debit: 0,
            credit: ivaAmount,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `IVA Débito Fiscal ${docRefStr}`
          });
        }

        if (exentoAmount > 0) {
          lines.push({
            accountId: exentoAcc.id,
            accountCode: exentoAcc.code,
            accountName: exentoAcc.name,
            debit: 0,
            credit: exentoAmount,
            auxiliaryRut: docItem.rutEmisor,
            auxiliaryName: docItem.razonSocialEmisor,
            documentRef: docRefStr,
            gloss: `Venta Exenta ${docRefStr}`
          });
        }
      }

    } else { // Honorarios (BHE)
      const honorarioExpenseAcc = resolveAccountDetails(
        aux?.defaultExpenseOrIncomeAccountId || rcvParams?.defaultHonorariosExpenseAccountId,
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
        aux?.defaultCreditorAccountId || rcvParams?.defaultHonorariosAccountId,
        ['honorarios por pagar', 'honorarios', '2.1.01'],
        'Pasivo',
        '2.1.01.003',
        'Honorarios por Pagar'
      );

      // Gasto Honorarios (Debe)
      lines.push({
        accountId: honorarioExpenseAcc.id,
        accountCode: honorarioExpenseAcc.code,
        accountName: honorarioExpenseAcc.name,
        debit: docItem.montoTotal,
        credit: 0,
        auxiliaryRut: docItem.rutEmisor,
        auxiliaryName: docItem.razonSocialEmisor,
        documentRef: docRefStr,
        gloss: `Gasto Honorarios BHE ${docRefStr} - ${docItem.razonSocialEmisor}`
      });

      // Retención BHE (Haber)
      if (docItem.montoIva > 0) {
        lines.push({
          accountId: retencionAcc.id,
          accountCode: retencionAcc.code,
          accountName: retencionAcc.name,
          debit: 0,
          credit: docItem.montoIva,
          auxiliaryRut: docItem.rutEmisor,
          auxiliaryName: docItem.razonSocialEmisor,
          documentRef: docRefStr,
          gloss: `Retención BHE ${docRefStr}`
        });
      }

      // Líquido por Pagar (Haber)
      const liquido = docItem.montoNeto || (docItem.montoTotal - (docItem.montoIva || 0));
      lines.push({
        accountId: honorariosPayableAcc.id,
        accountCode: honorariosPayableAcc.code,
        accountName: honorariosPayableAcc.name,
        debit: 0,
        credit: liquido,
        auxiliaryRut: docItem.rutEmisor,
        auxiliaryName: docItem.razonSocialEmisor,
        documentRef: docRefStr,
        gloss: `Líquido por Pagar BHE ${docRefStr}`
      });
    }

    const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
    const isCuadrado = Math.abs(totalDebit - totalCredit) < 0.01;

    return {
      voucherNumber,
      date: docItem.fechaEmision || new Date().toISOString().split('T')[0],
      period: docItem.period,
      type: 'Traspaso',
      gloss: `Centralización RCV ${docItem.tipoRegistro} Doc ${docItem.tipoDoc} N° ${docItem.folio} - ${docItem.razonSocialEmisor}`,
      lines,
      totalDebit,
      totalCredit,
      status: isCuadrado ? 'Valido' : 'Descuadrado',
      isDescuadrado: !isCuadrado,
      descuadreDifference: isCuadrado ? 0 : totalDebit - totalCredit,
      createdFromRcvId: docItem.id,
      createdAt: new Date().toISOString()
    };
  };

  const handleContabilizarSingle = async (docId: string) => {
    try {
      const docItem = rcvDocuments.find(d => d.id === docId);
      if (!docItem) return;

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
    if (selectedRcvIds.length === 0) return;
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

      setSelectedRcvIds([]);
      alert(`Se contabilizaron ${count} documentos exitosamente y se generaron sus respectivos comprobantes.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error contabilizando seleccionados:", err);
      alert('Error al contabilizar seleccionados: ' + err.message);
    }
  };

  const handleContabilizarAllPending = async () => {
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

      await deleteDoc(doc(companyRef, 'vouchers', v.id));

      if (selectedVoucher?.id === v.id) setSelectedVoucher(null);
      if (voucherForm?.id === v.id) setVoucherForm(null);

      alert(`Comprobante N° ${v.voucherNumber} eliminado correctamente.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error al eliminar comprobante:", err);
      alert('Error al eliminar comprobante: ' + err.message);
    }
  };

  const handleToggleAnularVoucher = async (v: Voucher) => {
    const isCurrentlyAnulado = v.status === 'Anulado';
    if (isCurrentlyAnulado) {
      if (!window.confirm(`¿Deseas REACTIVAR el Comprobante N° ${v.voucherNumber}? Su estado pasará a "Válido".`)) return;
      try {
        await updateDoc(doc(companyRef, 'vouchers', v.id), {
          status: 'Valido',
          anuladoAt: null,
          anuladoReason: null
        });

        // Restore RCV state if linked
        const linkedRcvDocs = rcvDocuments.filter(d => d.voucherId === v.id || (v.createdFromRcvId && d.id === v.createdFromRcvId));
        for (const rcvDoc of linkedRcvDocs) {
          await updateDoc(doc(companyRef, 'rcvDocuments', rcvDoc.id), {
            estadoContabilizado: true
          });
        }

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
          anuladoReason: reason || 'Anulado por usuario'
        });

        // Free up the linked RCV document so user can edit/re-contabilize
        const linkedRcvDocs = rcvDocuments.filter(d => d.voucherId === v.id || (v.createdFromRcvId && d.id === v.createdFromRcvId));
        for (const rcvDoc of linkedRcvDocs) {
          await updateDoc(doc(companyRef, 'rcvDocuments', rcvDoc.id), {
            estadoContabilizado: false
          });
        }

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
    if (!voucherForm) return;

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
          const payload: any = {
            voucherNumber: Number(voucherForm.voucherNumber),
            date: voucherForm.date,
            period,
            type: voucherForm.type,
            gloss: voucherForm.gloss,
            status: voucherForm.status || 'Valido',
            lines: validLines.map(l => ({
              accountId: l.accountId || '',
              accountCode: l.accountCode || '',
              accountName: l.accountName || '',
              debit: Number(l.debit) || 0,
              credit: Number(l.credit) || 0,
              auxiliaryRut: l.auxiliaryRut || '',
              auxiliaryName: l.auxiliaryName || '',
              documentRef: l.documentRef || '',
              gloss: l.gloss || ''
            })),
            totalDebit,
            totalCredit,
            createdFromRcvId: voucherForm.createdFromRcvId || null
          };

          if (voucherForm.id) {
            await updateDoc(doc(companyRef, 'vouchers', voucherForm.id), {
              ...payload,
              updatedAt: new Date().toISOString()
            });
            alert(`Comprobante N° ${voucherForm.voucherNumber} modificado exitosamente.`);
            if (selectedVoucher?.id === voucherForm.id) {
              setSelectedVoucher({ id: voucherForm.id, ...payload });
            }
          } else {
            await addDoc(collection(companyRef, 'vouchers'), {
              ...payload,
              createdAt: new Date().toISOString()
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

      alert(`Purga completada: Se eliminaron ${docsToDelete.length} registros de Compras de Enero.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error purging January purchases:", err);
      alert('Error al purgar registros de compras: ' + err.message);
    }
  };

  const handlePurgeJanuarySales = async () => {
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

      alert(`Purga completada: Se eliminaron ${docsToDelete.length} registros de Ventas de Enero.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error purging January sales:", err);
      alert('Error al purgar registros de ventas: ' + err.message);
    }
  };

  const handlePurgeSelectedPeriodSales = async () => {
    if (!window.confirm(`¿Confirmas eliminar todas las VENTAS del período seleccionado (${selectedRcvPeriod})?`)) {
      return;
    }
    try {
      const docsToDelete = rcvDocuments.filter(d => d.tipoRegistro === 'Venta' && d.period === selectedRcvPeriod);
      for (const d of docsToDelete) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', d.id));
      }
      alert(`Purga completada: Se eliminaron ${docsToDelete.length} ventas del período ${selectedRcvPeriod}.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error purging sales:", err);
      alert('Error al purgar ventas: ' + err.message);
    }
  };

  const handlePurgeCurrentPeriod = async () => {
    if (!window.confirm(`¿Confirmas eliminar TODOS los documentos RCV (compras, ventas y honorarios) del período seleccionado (${selectedRcvPeriod})?`)) {
      return;
    }
    try {
      const docsToDelete = rcvDocuments.filter(d => d.period === selectedRcvPeriod);
      for (const d of docsToDelete) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', d.id));
      }
      alert(`Purga completada: Se eliminaron ${docsToDelete.length} documentos del período ${selectedRcvPeriod}.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error purging period:", err);
      alert('Error al purgar período: ' + err.message);
    }
  };

  // Delete Single RCV Document (Purchases, Sales, Honorarios, etc.)
  const handleDeleteSingleRcvDoc = async (docId: string, tipo: string, folio: string) => {
    if (!window.confirm(`¿Confirmas eliminar el documento ${tipo} Folio #${folio}?`)) {
      return;
    }
    try {
      await deleteDoc(doc(companyRef, 'rcvDocuments', docId));
      setSelectedRcvIds(prev => prev.filter(id => id !== docId));
      alert(`Documento ${tipo} #${folio} eliminado correctamente.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error deleting RCV document:", err);
      alert('Error al eliminar documento: ' + err.message);
    }
  };

  // Delete Selected RCV Documents
  const handleDeleteSelectedRcvDocs = async () => {
    if (selectedRcvIds.length === 0) return;
    if (!window.confirm(`¿Confirmas eliminar los ${selectedRcvIds.length} documentos seleccionados (compras, ventas u honorarios)?`)) {
      return;
    }
    try {
      for (const id of selectedRcvIds) {
        await deleteDoc(doc(companyRef, 'rcvDocuments', id));
      }
      const count = selectedRcvIds.length;
      setSelectedRcvIds([]);
      alert(`Se eliminaron ${count} documentos seleccionados correctamente.`);
      await fetchData();
    } catch (err: any) {
      console.error("Error deleting selected RCV docs:", err);
      alert('Error al eliminar documentos seleccionados: ' + err.message);
    }
  };

  // Seed default Chilean Chart of Accounts if empty
  const handleSeedDefaultAccounts = async () => {
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
      { code: '4', name: 'INGRESOS', type: 'Ingreso', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '4.1.01', name: 'Ventas Exentas o No Afectas', type: 'Ingreso', parentCode: '4', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '4.1.02', name: 'Ventas Afectas IVA', type: 'Ingreso', parentCode: '4', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5', name: 'GASTOS', type: 'Gasto', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.1.01', name: 'Remuneraciones y Leyes Sociales', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' },
      { code: '5.1.02', name: 'Gastos Generales y Administrativos', type: 'Gasto', parentCode: '5', requiereCentroCosto: true, requiereAuxiliarRUT: true, requiereConciliacionBancaria: false, requiereDocumento: true, estado: 'Activo' }
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
      const payload = {
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
        estado: editingAccount ? editingAccount.estado : 'Activo'
      };

      if (editingAccount) {
        await updateDoc(doc(companyRef, 'chartOfAccounts', editingAccount.id), payload);
        alert('Cuenta actualizada exitosamente.');
        setEditingAccount(null);
      } else {
        await addDoc(collection(companyRef, 'chartOfAccounts'), payload);
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

  // Save Auxiliary
  const handleSaveAuxiliary = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const rut = (formData.get('rut') as string || '').toLowerCase().trim();
    const name = formData.get('name') as string;
    const role = formData.get('role') as any;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;

    const defaultDebtorAccountId = formData.get('defaultDebtorAccountId') as string;
    const defaultCreditorAccountId = formData.get('defaultCreditorAccountId') as string;
    const defaultExpenseOrIncomeAccountId = formData.get('defaultExpenseOrIncomeAccountId') as string;

    if (!rut || !name || !role) {
      alert('Complete los campos obligatorios (RUT, Nombre, Rol).');
      return;
    }

    try {
      const payload = {
        rut,
        name,
        role,
        email,
        phone,
        defaultDebtorAccountId,
        defaultCreditorAccountId,
        defaultExpenseOrIncomeAccountId,
        estado: editingAuxiliary ? editingAuxiliary.estado : 'Activo'
      };

      if (editingAuxiliary) {
        await updateDoc(doc(companyRef, 'auxiliaries', editingAuxiliary.id), payload);
        alert('Auxiliar actualizado exitosamente.');
        setEditingAuxiliary(null);
      } else {
        await addDoc(collection(companyRef, 'auxiliaries'), payload);
        alert('Auxiliar registrado exitosamente.');
      }
      e.currentTarget.reset();
      await fetchData();
    } catch (err: any) {
      console.error("Error saving auxiliary:", err);
      alert('Error al guardar auxiliar: ' + err.message);
    }
  };

  const handleSaveRcvParams = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
      alert('Parámetros contables guardados exitosamente.');
    } catch (err: any) {
      console.error("Error saving rcv params:", err);
      alert('Error al guardar parámetros: ' + err.message);
    }
  };

  // Fiscal Period Initialization or Toggle Month
  const handleEnsureFiscalYear = async (year: number) => {
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
    const fyId = String(year);
    const fy = fiscalYears.find(f => f.id === fyId);
    if (!fy) return;

    const newStatus = currentStatus === 'Abierto' ? 'Cerrado' : 'Abierto';
    const updatedMonths = { ...fy.months, [monthNum]: newStatus };

    try {
      await updateDoc(doc(companyRef, 'fiscalPeriods', fyId), { months: updatedMonths });
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
      {/* Sticky Header: Huincha de Factores + Contexto de Empresa + Menú Ribbon Tipo Excel */}
      <div className="sticky top-[41px] z-40 bg-slate-100/95 backdrop-blur-md pt-0.5 pb-1 space-y-1.5 border-b border-slate-300 shadow-xs">
        {/* 1. Barra de Indicadores Económicos (UF, Dólar, UTM, Euro, Yen) - Ubicada pegada al top */}
        {showExchangeBar ? (
          <div className="bg-slate-900 text-slate-200 px-3 py-1.5 rounded-lg text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs border border-slate-800">
            <div
              onClick={() => setShowHistoricalRatesModal(true)}
              className="flex items-center gap-2 cursor-pointer group hover:text-white transition-colors"
              title="Haz clic para desplegar el histórico completo"
            >
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              <span className="font-bold text-slate-300 uppercase tracking-wider text-[11px] group-hover:text-indigo-300">
                Indicadores ({currentRate.date})
              </span>
            </div>

            <div
              onClick={() => setShowHistoricalRatesModal(true)}
              className="flex flex-wrap items-center gap-2.5 sm:gap-4 text-xs font-mono cursor-pointer hover:opacity-90 transition-opacity"
              title="Haz clic para ver el histórico completo"
            >
              <div className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                <span className="text-slate-400 mr-1 font-sans text-[11px]">UF:</span>
                <span className="text-white font-semibold">${currentRate.uf?.toLocaleString('es-CL')}</span>
              </div>
              <div className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                <span className="text-slate-400 mr-1 font-sans text-[11px]">Dólar:</span>
                <span className="text-white font-semibold">${currentRate.dolar?.toLocaleString('es-CL')}</span>
              </div>
              <div className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                <span className="text-slate-400 mr-1 font-sans text-[11px]">UTM:</span>
                <span className="text-white font-semibold">${currentRate.utm?.toLocaleString('es-CL')}</span>
              </div>
              <div className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                <span className="text-slate-400 mr-1 font-sans text-[11px]">Euro:</span>
                <span className="text-white font-semibold">${currentRate.euro?.toLocaleString('es-CL')}</span>
              </div>
              <div className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 hidden md:block">
                <span className="text-slate-400 mr-1 font-sans text-[11px]">Yen:</span>
                <span className="text-white font-semibold">${currentRate.yen?.toLocaleString('es-CL')}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowHistoricalRatesModal(true)}
                className="text-[11px] text-indigo-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded font-medium transition-colors border border-slate-700 flex items-center gap-1"
              >
                <span>📊</span>
                <span>Histórico Completo</span>
              </button>
              <button
                type="button"
                onClick={() => setShowExchangeBar(false)}
                className="text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
                title="Ocultar barra de factores"
              >
                ✕ Ocultar Huincha Factores
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end pr-1">
            <button
              type="button"
              onClick={() => setShowExchangeBar(true)}
              className="text-[11px] text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-0.5 rounded font-medium border border-indigo-200 transition-colors shadow-2xs"
            >
              📊 Mostrar Huincha Factores (UF, USD, UTM...)
            </button>
          </div>
        )}

        {/* 2. Barra de Contexto de Empresa y Retorno (Fija y Compacta) */}
        <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={onBack}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-semibold text-xs rounded-md border border-slate-300 flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <span>←</span>
              <span>Volver al Inicio</span>
            </button>

            <div className="h-4 w-px bg-slate-300 hidden sm:block"></div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase text-slate-900 tracking-tight">{company.name}</span>
              <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                RUT: {company.rut}
              </span>
              {company.giro && (
                <span className="text-xs text-slate-500 hidden md:inline truncate max-w-sm">
                  • {company.giro}
                </span>
              )}
            </div>
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

            <div className="flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200">
              <label className="text-indigo-900 font-bold text-[11px]">Mes Activo:</label>
              <select
                value={selectedRcvPeriod}
                onChange={(e) => setSelectedRcvPeriod(e.target.value)}
                className="font-bold text-indigo-900 font-mono bg-white border border-indigo-300 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500"
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
                      label: `${monthNames[m]} ${selectedYear} (${isOpen ? 'Abierto' : 'Cerrado'})`,
                      isOpen
                    });
                  }
                  return monthOptions.map(opt => (
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
        <div className="bg-slate-200/80 p-0.5 rounded-lg border border-slate-300 shadow-xs">
          {/* Pestañas Principales Ribbon con orden exacto: 1. Finanzas, 2. Tesorería, 3. Importaciones, 4. Impuestos F.29, 5. Indicadores, 6. Configuraciones */}
          <div className="flex items-center gap-1 px-1 pt-0.5 border-b border-slate-300/80 overflow-x-auto">
            {(['FINANZAS', 'TESORERIA', 'IMPORTACIONES', 'IMPUESTOS', 'INDICADORES', 'CONFIGURACIONES'] as const).map((ribbonTab) => {
              const isActive = activeRibbonGroup === ribbonTab;
              const displayLabels: { [key: string]: string } = {
                FINANZAS: '1. 📊 FINANZAS',
                TESORERIA: '2. 💳 TESORERÍA',
                IMPORTACIONES: '3. 📥 IMPORTACIONES',
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
                  className={`px-3 py-1.5 text-xs font-bold rounded-t-md transition-all uppercase tracking-wider whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-indigo-700 shadow-xs border-t-2 border-indigo-600 border-x border-slate-300'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
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
              className="flex-shrink-0 p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors mr-1 z-10 shadow-2xs"
              title="Desplazar opciones hacia la izquierda"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
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
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'vouchers'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📝 Comprobantes Contables</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'vouchers' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('libroDiario')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'libroDiario'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📖 Libro Diario</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'libroDiario' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('libroMayor')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'libroMayor'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📚 Libro Mayor</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'libroMayor' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('balance8')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'balance8'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>⚖️ Balance 8 Columnas</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'balance8' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('balanceIFRS')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'balanceIFRS'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200'
                    }`}
                  >
                    <span>🏛️ Balance Clasificado IFRS</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'balanceIFRS' ? 'bg-indigo-700 text-white' : 'bg-indigo-200 text-indigo-900'}`}>IFRS</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('estadoResultados')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'estadoResultados'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📈 Estado de Resultados (12 Meses)</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'estadoResultados' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                </>
              )}

              {/* 2. GRUPO: TESORERÍA */}
              {activeRibbonGroup === 'TESORERIA' && (
                <>
                  <button
                    onClick={() => setActiveTab('nominasPago')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'nominasPago'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>💰 Nóminas de Pago a Proveedores</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'nominasPago' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('cobranza')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'cobranza'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📑 Cobranza y Cuentas por Cobrar</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'cobranza' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('flujoDeCaja')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'flujoDeCaja'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    <span>🌊 Flujo de Caja Real & Proyectado</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'flujoDeCaja' ? 'bg-indigo-700 text-white' : 'bg-emerald-200 text-emerald-900'}`}>Real</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('conciliacionBancaria')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'conciliacionBancaria'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>🏦 Conciliación Bancaria</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'conciliacionBancaria' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                </>
              )}

              {/* 3. GRUPO: IMPORTACIONES */}
              {activeRibbonGroup === 'IMPORTACIONES' && (
                <>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Compra'); }}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv' && rcvFilterType === 'Compra'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200'
                    }`}
                  >
                    <span>🛒 Compras (RCV)</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'rcv' && rcvFilterType === 'Compra' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Venta'); }}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv' && rcvFilterType === 'Venta'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    <span>📈 Ventas (RCV)</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'rcv' && rcvFilterType === 'Venta' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Honorarios'); }}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv' && rcvFilterType === 'Honorarios'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200'
                    }`}
                  >
                    <span>🧾 Honorarios (BHR)</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'rcv' && rcvFilterType === 'Honorarios' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Todos'); }}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv' && rcvFilterType === 'Todos'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📑 Todos los Documentos RCV</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('cargaMasiva')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'cargaMasiva'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>⚡ Carga Masiva Comprobantes</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'cargaMasiva' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('plantillasCarga')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'plantillasCarga'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    <span>📥 Plantillas Excel y Cargas Masivas</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'plantillasCarga' ? 'bg-emerald-700 text-white' : 'bg-emerald-200 text-emerald-900'}`}>Plantillas</span>
                  </button>
                </>
              )}

              {/* 4. GRUPO: IMPUESTOS F.29 */}
              {activeRibbonGroup === 'IMPUESTOS' && (
                <>
                  <button
                    onClick={() => setActiveTab('formulario29')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'formulario29'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📑 Formulario 29 Mensual (F29 - SII)</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'formulario29' ? 'bg-indigo-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>Activo</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('rcv'); setRcvFilterType('Compra'); }}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcv'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
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
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'indicadoresFinancieros'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    <span>📊 Tablero de Indicadores Financieros & KPIs</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${activeTab === 'indicadoresFinancieros' ? 'bg-indigo-700 text-white' : 'bg-emerald-200 text-emerald-900'}`}>KPIs</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('flujoDeCaja')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'flujoDeCaja'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>🌊 Flujo y Proyección de Caja</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('exchange')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'exchange'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
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
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'accounts'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📑 Plan de Cuentas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('auxiliaries')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'auxiliaries'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>👥 Maestro de Auxiliares (Clientes / Proveedores)</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('rcvParams')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'rcvParams'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>⚙️ Parámetros Contables RCV</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('periods')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'periods'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <span>📅 Apertura Ejercicios y Períodos</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('plantillasCarga')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'plantillasCarga'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    <span>📥 Plantillas Excel y Cargas Masivas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('exchange')}
                    className={`px-3 py-1.5 text-xs rounded-md font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === 'exchange'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
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
              className="flex-shrink-0 p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors ml-1 z-10 shadow-2xs"
              title="Desplazar opciones hacia la derecha"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
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

      {/* TAB 1: PLAN DE CUENTAS */}
      {activeTab === 'accounts' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm lg:col-span-1">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-slate-900">
                {editingAccount ? 'Modificar Cuenta' : 'Nueva Cuenta Contable'}
              </h3>
              {editingAccount && (
                <button type="button" onClick={() => setEditingAccount(null)} className="text-xs text-slate-500 underline">Cancelar</button>
              )}
            </div>

            <form onSubmit={handleSaveAccount} key={editingAccount?.id || 'new-acc'} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Código Cuenta *</label>
                <input name="code" defaultValue={editingAccount?.code || ''} placeholder="Ej. 1.1.01.001" required className="border border-slate-300 p-2.5 w-full rounded-lg font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Cuenta *</label>
                <input name="name" defaultValue={editingAccount?.name || ''} placeholder="Ej. Banco Santander Cta Cte" required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Cuenta *</label>
                <select name="type" defaultValue={editingAccount?.type || 'Activo'} required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="Activo">Activo</option>
                  <option value="Pasivo">Pasivo</option>
                  <option value="Patrimonio">Patrimonio</option>
                  <option value="Ingreso">Ingreso</option>
                  <option value="Gasto">Gasto</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Código Cuenta Padre (Opcional)</label>
                <input name="parentCode" defaultValue={editingAccount?.parentCode || ''} placeholder="Ej. 1.1.01" className="border border-slate-300 p-2.5 w-full rounded-lg font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>

              {/* Requerimientos base */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <p className="text-xs font-semibold uppercase text-slate-600">Atributos y Requerimientos de Análisis</p>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="requiereCentroCosto" defaultChecked={editingAccount?.requiereCentroCosto || false} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  Requiere Centro de Costo
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="requiereAuxiliarRUT" defaultChecked={editingAccount?.requiereAuxiliarRUT || false} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  Requiere Auxiliar RUT
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="requiereConciliacionBancaria" defaultChecked={editingAccount?.requiereConciliacionBancaria || false} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  Requiere Conciliación Bancaria
                </label>
                <div className="pl-6 pt-1 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">Institución Bancaria (Banco)</label>
                    <select name="bankInstitution" defaultValue={editingAccount?.bankInstitution || ''} className="border border-slate-300 p-1.5 w-full rounded text-xs">
                      <option value="">-- Sin Banco Asociado --</option>
                      <option value="Banco de Chile">Banco de Chile</option>
                      <option value="Banco Santander">Banco Santander</option>
                      <option value="Banco BCI">Banco BCI</option>
                      <option value="Banco Estado">Banco Estado</option>
                      <option value="Banco Itaú">Banco Itaú</option>
                      <option value="Scotiabank">Scotiabank</option>
                      <option value="Banco BICE">Banco BICE</option>
                      <option value="Banco Security">Banco Security</option>
                      <option value="Banco Falabella">Banco Falabella</option>
                      <option value="Banco Ripley">Banco Ripley</option>
                      <option value="Tapp Caja Los Andes">Tapp Caja Los Andes</option>
                      <option value="Mercado Pago">Mercado Pago</option>
                      <option value="Otro">Otro Banco / Institución</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-0.5">N° Cuenta Corriente / Vista</label>
                    <input name="bankAccountNumber" defaultValue={editingAccount?.bankAccountNumber || ''} placeholder="Ej. 123-45678-09" className="border border-slate-300 p-1.5 w-full rounded text-xs font-mono" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="requiereDocumento" defaultChecked={editingAccount?.requiereDocumento || false} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  Requiere Documento (Factura/Boleta)
                </label>
              </div>

              {/* Dynamic / Scalable Attributes Builder */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <p className="text-xs font-semibold uppercase text-slate-600">Atributos Dinámicos Adicionales</p>
                <div className="flex gap-2">
                  <input placeholder="Propiedad (ej. imptoAdicional)" value={customAttrKey} onChange={e => setCustomAttrKey(e.target.value)} className="border border-slate-300 p-2 text-xs w-1/2 rounded" />
                  <input placeholder="Valor" value={customAttrVal} onChange={e => setCustomAttrVal(e.target.value)} className="border border-slate-300 p-2 text-xs w-1/2 rounded" />
                  <button type="button" onClick={() => { if(customAttrKey){ setTempCustomAttrs({...tempCustomAttrs, [customAttrKey]: customAttrVal}); setCustomAttrKey(''); setCustomAttrVal(''); }}} className="bg-slate-800 text-white px-3 py-1 text-xs rounded">+</button>
                </div>
                {Object.keys(tempCustomAttrs).length > 0 && (
                  <div className="text-xs bg-slate-50 p-2 rounded border">
                    {Object.entries(tempCustomAttrs).map(([k, v]) => (
                      <div key={k} className="flex justify-between"><span>{k}: {String(v)}</span></div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition-colors">
                {editingAccount ? 'Guardar Cambios' : 'Registrar Cuenta'}
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-lg font-medium text-slate-900">Plan de Cuentas ({accounts.length})</h3>
                <p className="text-xs text-slate-500 mt-0.5">Catálogo de cuentas contables y parametrización operativa</p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Buscar por código o nombre..."
                  value={accountSearchQuery}
                  onChange={(e) => setAccountSearchQuery(e.target.value)}
                  className="border border-slate-300 p-2 rounded-lg text-xs w-full sm:w-56 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <button
                  onClick={() => setActiveTab('plantillasCarga')}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs px-3 py-2 rounded-lg font-bold transition-colors whitespace-nowrap flex items-center gap-1"
                >
                  <span>📥</span>
                  <span>Carga Masiva Excel</span>
                </button>
                <button
                  onClick={handleSeedDefaultAccounts}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
                >
                  Cargar Estándar
                </button>
              </div>
            </div>

            {accounts.length === 0 ? (
              <p className="text-slate-500 text-sm italic py-4 text-center">No hay cuentas contables registradas. Utiliza el botón superior para cargar el estándar chileno.</p>
            ) : (
              <div className="space-y-1.5 max-h-[550px] overflow-y-auto pr-1">
                {accounts
                  .filter(acc => 
                    !accountSearchQuery || 
                    acc.code.toLowerCase().includes(accountSearchQuery.toLowerCase()) || 
                    acc.name.toLowerCase().includes(accountSearchQuery.toLowerCase())
                  )
                  .map(acc => (
                  <div key={acc.id} className="p-3 border border-slate-200 bg-white hover:bg-slate-50/90 rounded-lg flex items-center justify-between transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-sm font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{acc.code}</span>
                        <span className="text-sm font-normal text-slate-800">{acc.name}</span>
                        <span className="text-xs font-normal text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">{acc.type}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-normal">
                        {acc.requiereCentroCosto && <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">C.Costo</span>}
                        {acc.requiereAuxiliarRUT && <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">Aux. RUT</span>}
                        {acc.requiereConciliacionBancaria && <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">Conciliación</span>}
                        {acc.requiereDocumento && <span className="bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded">Documento</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs pl-2">
                      <button onClick={() => setEditingAccount(acc)} className="text-indigo-600 hover:text-indigo-900 font-medium">Editar</button>
                      <button onClick={async () => { if(window.confirm('¿Eliminar cuenta?')) { await deleteDoc(doc(companyRef, 'chartOfAccounts', acc.id)); await fetchData(); } }} className="text-slate-400 hover:text-red-600 font-medium transition-colors">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AUXILIARIES */}
      {activeTab === 'auxiliaries' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm lg:col-span-1">
            <h3 className="text-lg font-medium text-slate-900 mb-4">
              {editingAuxiliary ? 'Modificar Auxiliar' : 'Registrar Nuevo Auxiliar'}
            </h3>
            <form onSubmit={handleSaveAuxiliary} key={editingAuxiliary?.id || 'new-aux'} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RUT *</label>
                <input name="rut" defaultValue={editingAuxiliary?.rut || ''} placeholder="Ej. 76.123.456-7" required className="border border-slate-300 p-2.5 w-full rounded-lg font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Razón Social / Nombre *</label>
                <input name="name" defaultValue={editingAuxiliary?.name || ''} placeholder="Ej. Comercial SpA" required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rol Principal *</label>
                <select name="role" defaultValue={editingAuxiliary?.role || 'Deudor'} required className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="Deudor">Deudor (Cliente)</option>
                  <option value="Acreedor">Acreedor (Proveedor)</option>
                  <option value="Ambos">Ambos (Cliente y Proveedor)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" name="email" defaultValue={editingAuxiliary?.email || ''} placeholder="auxiliar@empresa.cl" className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input name="phone" defaultValue={editingAuxiliary?.phone || ''} placeholder="+56912345678" className="border border-slate-300 p-2.5 w-full rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="block text-xs font-semibold uppercase text-slate-600">Cuenta Contable de Deudor / Cliente</label>
                <select name="defaultDebtorAccountId" defaultValue={editingAuxiliary?.defaultDebtorAccountId || ''} className="border border-slate-300 p-2.5 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">Seleccione una cuenta (Opcional)</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                </select>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="block text-xs font-semibold uppercase text-slate-600">Cuenta Contable de Acreedor / Proveedor</label>
                <select name="defaultCreditorAccountId" defaultValue={editingAuxiliary?.defaultCreditorAccountId || ''} className="border border-slate-300 p-2.5 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">Seleccione una cuenta (Opcional)</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                </select>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="block text-xs font-semibold uppercase text-slate-600">Cuenta Contable de Ingreso o Costo/Gasto por Defecto</label>
                <select name="defaultExpenseOrIncomeAccountId" defaultValue={editingAuxiliary?.defaultExpenseOrIncomeAccountId || ''} className="border border-slate-300 p-2.5 w-full rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="">Seleccione una cuenta (Opcional)</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition-colors">
                  {editingAuxiliary ? 'Guardar Cambios' : 'Registrar Auxiliar'}
                </button>
                {editingAuxiliary && (
                  <button type="button" onClick={() => setEditingAuxiliary(null)} className="border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-50">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 pb-3 gap-2">
              <div>
                <h3 className="text-lg font-medium text-slate-900">Maestro de Auxiliares ({auxiliaries.length})</h3>
                <p className="text-xs text-slate-500">Cartera de clientes, proveedores y honorarios</p>
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <button
                  onClick={() => setActiveTab('plantillasCarga')}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap flex items-center gap-1"
                >
                  <span>📥</span>
                  <span>Carga Masiva Excel</span>
                </button>
                <button
                  onClick={() => setAuxSubTab('deudores')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${auxSubTab === 'deudores' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  Deudores ({auxiliaries.filter(a => a.role === 'Deudor' || a.role === 'Ambos').length})
                </button>
                <button
                  onClick={() => setAuxSubTab('acreedores')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${auxSubTab === 'acreedores' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  Acreedores ({auxiliaries.filter(a => a.role === 'Acreedor' || a.role === 'Ambos').length})
                </button>
              </div>
            </div>

            {auxSubTab === 'deudores' && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase">Listado de Deudores (Incluye rol Ambos)</h4>
                {auxiliaries.filter(a => a.role === 'Deudor' || a.role === 'Ambos').length === 0 ? (
                  <p className="text-slate-500 text-sm py-4 text-center">No hay deudores registrados.</p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {auxiliaries.filter(a => a.role === 'Deudor' || a.role === 'Ambos').map(aux => (
                      <div key={aux.id} className="p-3 border border-slate-200 bg-slate-50 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{aux.name}</span>
                            <span className="text-xs font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{aux.rut}</span>
                            <span className="text-xs bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded font-medium">{aux.role}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${aux.estado === 'Inactivo' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {aux.estado || 'Activo'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Email: {aux.email || 'N/A'} | Tel: {aux.phone || 'N/A'}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <button onClick={() => setEditingAuxiliary(aux)} className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded">Editar</button>
                          <button onClick={async () => {
                            const newEst = aux.estado === 'Inactivo' ? 'Activo' : 'Inactivo';
                            await updateDoc(doc(companyRef, 'auxiliaries', aux.id), { estado: newEst });
                            await fetchData();
                          }} className="text-amber-600 hover:text-amber-800 bg-amber-50 px-2.5 py-1 rounded">{aux.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}</button>
                          <button onClick={async () => { if(window.confirm('¿Eliminar auxiliar?')) { await deleteDoc(doc(companyRef, 'auxiliaries', aux.id)); await fetchData(); } }} className="text-red-500 hover:text-red-700 bg-red-50 px-2.5 py-1 rounded">Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {auxSubTab === 'acreedores' && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase">Listado de Acreedores (Incluye rol Ambos)</h4>
                {auxiliaries.filter(a => a.role === 'Acreedor' || a.role === 'Ambos').length === 0 ? (
                  <p className="text-slate-500 text-sm py-4 text-center">No hay acreedores registrados.</p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {auxiliaries.filter(a => a.role === 'Acreedor' || a.role === 'Ambos').map(aux => (
                      <div key={aux.id} className="p-3 border border-slate-200 bg-slate-50 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{aux.name}</span>
                            <span className="text-xs font-mono bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{aux.rut}</span>
                            <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded font-medium">{aux.role}</span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${aux.estado === 'Inactivo' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {aux.estado || 'Activo'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Email: {aux.email || 'N/A'} | Tel: {aux.phone || 'N/A'}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <button onClick={() => setEditingAuxiliary(aux)} className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded">Editar</button>
                          <button onClick={async () => {
                            const newEst = aux.estado === 'Inactivo' ? 'Activo' : 'Inactivo';
                            await updateDoc(doc(companyRef, 'auxiliaries', aux.id), { estado: newEst });
                            await fetchData();
                          }} className="text-amber-600 hover:text-amber-800 bg-amber-50 px-2.5 py-1 rounded">{aux.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}</button>
                          <button onClick={async () => { if(window.confirm('¿Eliminar auxiliar?')) { await deleteDoc(doc(companyRef, 'auxiliaries', aux.id)); await fetchData(); } }} className="text-red-500 hover:text-red-700 bg-red-50 px-2.5 py-1 rounded">Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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

      {/* TAB 3: FISCAL PERIODS */}
      {activeTab === 'periods' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h3 className="text-lg font-medium text-slate-900">Apertura y Cierre de Ejercicios y Períodos Tributarios</h3>
              <p className="text-slate-500 text-sm mt-1">Controla el estado mensual (Abierto / Cerrado) para la emisión de libros y balances.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700">Año Comercial:</label>
              <select
                value={selectedYear}
                onChange={e => {
                  const yr = parseInt(e.target.value);
                  setSelectedYear(yr);
                  handleEnsureFiscalYear(yr);
                }}
                className="border border-slate-300 p-2 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {[2026, 2025, 2024, 2023, 2022, 2021, 2020].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {(() => {
            // Ensure fiscal year is initialized in view if missing
            const currentFy = fiscalYears.find(f => f.id === String(selectedYear));
            if (!currentFy) {
              handleEnsureFiscalYear(selectedYear);
              return <p className="text-slate-500 py-6 text-center">Inicializando período para el año {selectedYear}...</p>;
            }

            const monthNames = [
              '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
              'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-4">
                {Object.entries(currentFy.months).map(([mNumStr, status]) => {
                  const mNum = parseInt(mNumStr);
                  const isOpen = status === 'Abierto';
                  return (
                    <div key={mNum} className={`p-4 rounded-xl border transition-all ${isOpen ? 'bg-emerald-50/50 border-emerald-200 shadow-sm' : 'bg-slate-100 border-slate-200'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-slate-900">{monthNames[mNum]} {selectedYear}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                          {status}
                        </span>
                      </div>
                      <button
                        onClick={() => handleToggleMonthStatus(selectedYear, mNum, status as 'Abierto' | 'Cerrado')}
                        className={`w-full mt-2 text-xs font-medium py-2 rounded-lg transition-colors ${
                          isOpen ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {isOpen ? 'Cerrar Período' : 'Abrir Período'}
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
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

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
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

          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Número</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Glosa</th>
                  <th className="p-3 text-right">Total Debe</th>
                  <th className="p-3 text-right">Total Haber</th>
                  <th className="p-3 text-center min-w-[200px]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {vouchers
                  .filter(v => voucherFilterType === 'Todos' || v.type === voucherFilterType)
                  .filter(v => 
                    !voucherSearchQuery ||
                    v.gloss.toLowerCase().includes(voucherSearchQuery.toLowerCase()) ||
                    String(v.voucherNumber).includes(voucherSearchQuery) ||
                    (v.lines && v.lines.some(l => (l.auxiliaryRut || '').toLowerCase().includes(voucherSearchQuery.toLowerCase()) || (l.accountCode || '').includes(voucherSearchQuery)))
                  )
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

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-28">Cuenta</th>
                          <th className="p-3">Nombre Cuenta</th>
                          <th className="p-3">Auxiliar RUT</th>
                          <th className="p-3">Documento Ref</th>
                          <th className="p-3">Detalle / Glosa Línea</th>
                          <th className="p-3 text-right w-32">Debe ($)</th>
                          <th className="p-3 text-right w-32">Haber ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedVoucher.lines.map((line, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-bold text-slate-700">{line.accountCode}</td>
                            <td className="p-3 font-medium text-slate-900">{line.accountName}</td>
                            <td className="p-3 text-slate-600 font-mono">{line.auxiliaryRut || '-'}</td>
                            <td className="p-3 text-slate-600">{line.documentRef || '-'}</td>
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
                        <label className="block font-semibold text-slate-700 mb-1">Glosa General del Comprobante *</label>
                        <input
                          type="text"
                          value={voucherForm.gloss}
                          onChange={e => setVoucherForm({ ...voucherForm, gloss: e.target.value })}
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
                                gloss: 'Ajuste de cuadre'
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
                                gloss: ''
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
                        <table className="w-full text-left text-xs min-w-[850px]">
                          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="p-2.5 w-72">Cuenta Contable *</th>
                              <th className="p-2.5 w-44">Auxiliar RUT / Nombre</th>
                              <th className="p-2.5 w-32">Doc Ref</th>
                              <th className="p-2.5">Detalle / Glosa Línea</th>
                              <th className="p-2.5 text-right w-32">Debe ($)</th>
                              <th className="p-2.5 text-right w-32">Haber ($)</th>
                              <th className="p-2.5 text-center w-12"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {voucherForm.lines.map((line, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-2">
                                  <select
                                    value={line.accountId || ''}
                                    onChange={(e) => {
                                      const selectedAccId = e.target.value;
                                      const accObj = accounts.find(a => a.id === selectedAccId);
                                      const newLines = [...voucherForm.lines];
                                      newLines[idx] = {
                                        ...newLines[idx],
                                        accountId: selectedAccId,
                                        accountCode: accObj?.code || '',
                                        accountName: accObj?.name || ''
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
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    placeholder="RUT / Auxiliar"
                                    value={line.auxiliaryRut || ''}
                                    onChange={(e) => {
                                      const newLines = [...voucherForm.lines];
                                      newLines[idx] = { ...newLines[idx], auxiliaryRut: e.target.value };
                                      setVoucherForm({ ...voucherForm, lines: newLines });
                                    }}
                                    className="border border-slate-300 p-1.5 w-full rounded text-xs focus:ring-1 focus:ring-indigo-500 font-mono"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    placeholder="Ej. Fac 123"
                                    value={line.documentRef || ''}
                                    onChange={(e) => {
                                      const newLines = [...voucherForm.lines];
                                      newLines[idx] = { ...newLines[idx], documentRef: e.target.value };
                                      setVoucherForm({ ...voucherForm, lines: newLines });
                                    }}
                                    className="border border-slate-300 p-1.5 w-full rounded text-xs focus:ring-1 focus:ring-indigo-500"
                                  />
                                </td>
                                <td className="p-2">
                                  <input
                                    type="text"
                                    placeholder="Detalle de línea..."
                                    value={line.gloss || ''}
                                    onChange={(e) => {
                                      const newLines = [...voucherForm.lines];
                                      newLines[idx] = { ...newLines[idx], gloss: e.target.value };
                                      setVoucherForm({ ...voucherForm, lines: newLines });
                                    }}
                                    className="border border-slate-300 p-1.5 w-full rounded text-xs focus:ring-1 focus:ring-indigo-500"
                                  />
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
                            ))}
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
        <IndicadoresFinancierosView
          company={company}
          vouchers={vouchers}
          accounts={accounts}
          fiscalYears={fiscalYears}
          bankReconciliations={bankReconciliations}
          rcvDocuments={rcvDocuments}
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

      {/* TAB: CONCILIACIÓN BANCARIA */}
      {activeTab === 'conciliacionBancaria' && (
        <ConciliacionBancariaView
          studyId={studyId}
          company={company}
          accounts={accounts}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
          onVouchersUpdated={fetchData}
        />
      )}

      {/* TAB: CARGA MASIVA COMPROBANTES */}
      {activeTab === 'cargaMasiva' && (
        <CargaMasivaComprobantesView
          studyId={studyId}
          company={company}
          accounts={accounts}
          vouchers={vouchers}
          fiscalYears={fiscalYears}
          onVouchersUpdated={fetchData}
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

      {/* MODAL GLOBAL DE IMPORTACIÓN EXCEL / CSV */}
      <ExcelImportCenterModal
        isOpen={showExcelImportModal}
        onClose={() => setShowExcelImportModal(false)}
        studyId={studyId}
        company={company}
        accounts={accounts}
        auxiliaries={auxiliaries}
        onDataImported={async () => {
          await fetchData();
        }}
      />
    </div>
  );
}
