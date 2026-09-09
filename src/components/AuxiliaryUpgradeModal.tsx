import React, { useState, useRef, useMemo } from 'react';
import { 
  Auxiliary, 
  ChartOfAccount, 
  CostCenterMaster, 
  ExpenseItemMaster, 
  ProjectMaster, 
  ProductMaster 
} from '../types';
import { db } from '../lib/firebase';
import { doc, collection, writeBatch, setDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { 
  X, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  RefreshCw, 
  Layers, 
  Users, 
  Sparkles, 
  Search, 
  Filter, 
  HelpCircle,
  FileText,
  Building2,
  Check,
  ChevronRight,
  Database
} from 'lucide-react';
import { cleanRutString, formatChileanRut, validateRutModulo11 } from '../utils/rutMatcher';
import { analyzeRut } from './AuxiliariesGrid';

export interface AuxiliaryUpgradeRow {
  rowIdx: number;
  originalData: any;
  cleanRut: string;
  formattedRut: string;
  isValidRut: boolean;
  isGarbageRut: boolean;
  name: string;
  role: 'Deudor' | 'Acreedor' | 'Ambos';
  estado: 'Activo' | 'Inactivo';
  email: string;
  phone: string;
  banco: string;
  tipoCuenta: 'Corriente' | 'Vista' | 'Ahorro' | 'RUT' | '';
  numeroCuenta: string;
  
  // Account mappings
  debtorAccountCode: string;
  debtorAccountId?: string;
  debtorAccountName?: string;
  
  creditorAccountCode: string;
  creditorAccountId?: string;
  creditorAccountName?: string;
  
  expenseOrIncomeAccountCode: string;
  expenseOrIncomeAccountId?: string;
  expenseOrIncomeAccountName?: string;
  
  // Master dimensions
  defaultCostCenter: string;
  defaultExpenseItem: string;
  defaultProject: string;
  defaultProduct: string;
  defaultGloss: string;
  
  // Upgrade comparison
  status: 'UPDATE' | 'NEW' | 'UNCHANGED' | 'ERROR';
  existingAux?: Auxiliary;
  changes: {
    field: string;
    label: string;
    oldValue: string;
    newValue: string;
  }[];
  errorMessage?: string;
}

interface AuxiliaryUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  companyId: string;
  companyName: string;
  companyRut: string;
  auxiliaries: Auxiliary[];
  accounts: ChartOfAccount[];
  costCenters?: CostCenterMaster[];
  expenseItems?: ExpenseItemMaster[];
  projects?: ProjectMaster[];
  products?: ProductMaster[];
  onSuccess: () => Promise<void>;
}

export default function AuxiliaryUpgradeModal({
  isOpen,
  onClose,
  studyId,
  companyId,
  companyName,
  companyRut,
  auxiliaries,
  accounts,
  costCenters = [],
  expenseItems = [],
  projects = [],
  products = [],
  onSuccess
}: AuxiliaryUpgradeModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'processing' | 'completed'>('upload');
  const [parsedRows, setParsedRows] = useState<AuxiliaryUpgradeRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPDATE' | 'NEW' | 'UNCHANGED' | 'ERROR'>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processProgress, setProcessProgress] = useState<number>(0);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [summaryResults, setSummaryResults] = useState<{
    updated: number;
    created: number;
    unchanged: number;
    errors: number;
  }>({ updated: 0, created: 0, unchanged: 0, errors: 0 });

  // Config options
  const [updateExisting, setUpdateExisting] = useState<boolean>(true);
  const [createNew, setCreateNew] = useState<boolean>(true);
  const [normalizeRuts, setNormalizeRuts] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const companyRef = doc(db, 'studies', studyId, 'companies', companyId);

  // Map of existing auxiliaries by clean RUT for O(1) matching
  const existingAuxMap = useMemo(() => {
    const map = new Map<string, Auxiliary>();
    auxiliaries.forEach(aux => {
      const clean = cleanRutString(aux.rut || '');
      if (clean) {
        map.set(clean, aux);
      }
    });
    return map;
  }, [auxiliaries]);

  // Map of accounts for fast lookup by code or ID or name
  const accountLookup = useMemo(() => {
    const byId = new Map<string, ChartOfAccount>();
    const byNormalizedCode = new Map<string, ChartOfAccount>();
    const byName = new Map<string, ChartOfAccount>();

    accounts.forEach(acc => {
      byId.set(acc.id, acc);
      const cleanCode = (acc.code || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
      if (cleanCode) byNormalizedCode.set(cleanCode, acc);
      if (acc.code) byNormalizedCode.set(acc.code.toLowerCase().trim(), acc);
      if (acc.name) byName.set(acc.name.toLowerCase().trim(), acc);
    });

    return { byId, byNormalizedCode, byName };
  }, [accounts]);

  const findAccountMatch = (query: string): ChartOfAccount | undefined => {
    if (!query || typeof query !== 'string') return undefined;
    const trimmed = query.trim();
    if (!trimmed) return undefined;

    // 1. Direct ID match
    if (accountLookup.byId.has(trimmed)) return accountLookup.byId.get(trimmed);

    // 2. Direct code match (e.g. 1-1-03-01 or 1.1.03.001)
    const lower = trimmed.toLowerCase();
    if (accountLookup.byNormalizedCode.has(lower)) return accountLookup.byNormalizedCode.get(lower);

    // 3. Clean numeric code match
    const cleanNum = trimmed.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
    if (cleanNum && accountLookup.byNormalizedCode.has(cleanNum)) {
      return accountLookup.byNormalizedCode.get(cleanNum);
    }

    // 4. Bracket pattern [1-1-03-01] Nombre Cuenta
    const bracketMatch = trimmed.match(/\[(.*?)\]/);
    if (bracketMatch && bracketMatch[1]) {
      const codeInside = bracketMatch[1].trim().toLowerCase();
      if (accountLookup.byNormalizedCode.has(codeInside)) return accountLookup.byNormalizedCode.get(codeInside);
      const cleanInside = codeInside.replace(/[^0-9a-zA-Z]/g, '');
      if (accountLookup.byNormalizedCode.has(cleanInside)) return accountLookup.byNormalizedCode.get(cleanInside);
    }

    // 5. Name match
    if (accountLookup.byName.has(lower)) return accountLookup.byName.get(lower);

    return undefined;
  };

  // =========================================================================
  // 1. GENERAR Y DESCARGAR EXCEL COMPLETO DE BASE DE AUXILIARES CON GUÍAS
  // =========================================================================
  const handleDownloadFullBaseExcel = () => {
    const wb = XLSX.utils.book_new();

    // HOJA 1: BASE DE AUXILIARES
    const auxSheetData = auxiliaries.map((aux, idx) => {
      const dAcc = aux.defaultDebtorAccountId ? accountLookup.byId.get(aux.defaultDebtorAccountId) : null;
      const cAcc = aux.defaultCreditorAccountId ? accountLookup.byId.get(aux.defaultCreditorAccountId) : null;
      const eAcc = aux.defaultExpenseOrIncomeAccountId ? accountLookup.byId.get(aux.defaultExpenseOrIncomeAccountId) : null;
      const analysis = analyzeRut(aux.rut, aux.name);

      return {
        'RUT': analysis.formatted || aux.rut || '',
        'Razon_Social': aux.name || '',
        'Glosa_Sugerida': aux.defaultGloss || '',
        'Rol': aux.role || 'Deudor',
        'Estado': aux.estado || 'Activo',
        'Email': aux.email || '',
        'Telefono': aux.phone || '',
        'Codigo_Cuenta_Deudor': dAcc ? dAcc.code : '',
        'Nombre_Cuenta_Deudor': dAcc ? dAcc.name : '',
        'Codigo_Cuenta_Acreedor': cAcc ? cAcc.code : '',
        'Nombre_Cuenta_Acreedor': cAcc ? cAcc.name : '',
        'Codigo_Cuenta_Gasto_Ingreso': eAcc ? eAcc.code : '',
        'Nombre_Cuenta_Gasto_Ingreso': eAcc ? eAcc.name : '',
        'Centro_Costo': aux.defaultCostCenter || '',
        'Item_Gasto': aux.defaultExpenseItem || '',
        'Proyecto': aux.defaultProject || '',
        'Producto': aux.defaultProduct || '',
        'Banco': aux.banco || '',
        'Tipo_Cuenta': aux.tipoCuenta || '',
        'Numero_Cuenta': aux.numeroCuenta || ''
      };
    });

    // Si la base está vacía, colocar un registro de ejemplo
    if (auxSheetData.length === 0) {
      auxSheetData.push({
        'RUT': '76.123.456-7',
        'Razon_Social': 'EMPRESA EJEMPLO DE SERVICIOS SPA',
        'Rol': 'Ambos',
        'Estado': 'Activo',
        'Email': 'contacto@ejemplo.cl',
        'Telefono': '+56912345678',
        'Codigo_Cuenta_Deudor': '1-1-03-01',
        'Nombre_Cuenta_Deudor': 'Clientes Nacionales',
        'Codigo_Cuenta_Acreedor': '2-1-01-01',
        'Nombre_Cuenta_Acreedor': 'Proveedores Nacionales',
        'Codigo_Cuenta_Gasto_Ingreso': '5-1-01-01',
        'Nombre_Cuenta_Gasto_Ingreso': 'Gastos Generales',
        'Glosa_Sugerida': 'Servicios de Mantención y Soporte Mensual',
        'Centro_Costo': 'Administración',
        'Item_Gasto': 'Insumos',
        'Proyecto': 'General',
        'Producto': '',
        'Banco': 'Banco de Chile',
        'Tipo_Cuenta': 'Corriente',
        'Numero_Cuenta': '123456789'
      });
    }

    const wsAux = XLSX.utils.json_to_sheet(auxSheetData);
    XLSX.utils.book_append_sheet(wb, wsAux, 'Base_Auxiliares');

    // HOJA 2: GUÍA DE PLAN DE CUENTAS
    const accountsData = accounts.map(acc => ({
      'Codigo_Cuenta': acc.code,
      'Nombre_Cuenta': acc.name,
      'Clasificacion': acc.type,
      'Exige_Auxiliar': acc.requiereAuxiliarRUT ? 'SI' : 'NO',
      'Exige_Centro_Costo': acc.requiereCentroCosto ? 'SI' : 'NO',
      'Exige_Item_Gasto': acc.requiereItemGasto ? 'SI' : 'NO',
      'Exige_Documento': acc.requiereDocumento ? 'SI' : 'NO'
    }));
    const wsAcc = XLSX.utils.json_to_sheet(accountsData);
    XLSX.utils.book_append_sheet(wb, wsAcc, 'Guia_Plan_Cuentas');

    // HOJA 3: GUÍA DE CENTROS DE COSTO Y DIMENSIONES
    const dimensionsData: any[] = [];
    costCenters.forEach(cc => {
      dimensionsData.push({ 'Dimension': 'Centro de Costo', 'Codigo': cc.code || '', 'Nombre': cc.name });
    });
    expenseItems.forEach(ei => {
      dimensionsData.push({ 'Dimension': 'Item de Gasto', 'Codigo': ei.code || '', 'Nombre': ei.name });
    });
    projects.forEach(pr => {
      dimensionsData.push({ 'Dimension': 'Proyecto', 'Codigo': pr.code || '', 'Nombre': pr.name });
    });
    products.forEach(pd => {
      dimensionsData.push({ 'Dimension': 'Producto', 'Codigo': pd.code || '', 'Nombre': pd.name });
    });
    if (dimensionsData.length === 0) {
      dimensionsData.push({ 'Dimension': 'Centro de Costo', 'Codigo': 'ADM', 'Nombre': 'Administración General' });
    }
    const wsDim = XLSX.utils.json_to_sheet(dimensionsData);
    XLSX.utils.book_append_sheet(wb, wsDim, 'Guia_Centros_Costos');

    // HOJA 4: INSTRUCCIONES DE UPGRADE
    const instructions = [
      { 'PASO': '1. EDITAR EN EXCEL', 'INSTRUCCION': 'Modifica o completa las columnas en la hoja "Base_Auxiliares". Puedes asignar cuentas contables predeterminadas para que al importar del SII o hacer conciliación se completen solas.' },
      { 'PASO': '2. COPIAR CUENTAS', 'INSTRUCCION': 'Consulta la hoja "Guia_Plan_Cuentas" para copiar el código exacto de la cuenta contable (ej. 1-1-03-01 o 2-1-01-01).' },
      { 'PASO': '3. AGREGAR NUEVOS', 'INSTRUCCION': 'Puedes agregar nuevas filas con nuevos RUTs al final de la lista. El sistema los registrará automáticamente como nuevos auxiliares.' },
      { 'PASO': '4. ROLES DISPONIBLES', 'INSTRUCCION': 'En la columna Rol puedes ingresar: "Deudor" (Cliente), "Acreedor" (Proveedor) o "Ambos".' },
      { 'PASO': '5. GUARDAR Y SUBIR', 'INSTRUCCION': 'Guarda el archivo y cárgalo en el botón "Actualizar / Upgrade desde Excel" para previsualizar los cambios y aplicarlos en 1 clic.' }
    ];
    const wsInst = XLSX.utils.json_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instrucciones_Upgrade');

    const cleanCompName = (companyName || 'Empresa').replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(wb, `Base_Auxiliares_${cleanCompName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // =========================================================================
  // 2. PARSEAR ARCHIVO EXCEL / CSV Y REALIZAR SMART MATCH CONTRA AUXILIARES
  // =========================================================================
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Preferir hoja "Base_Auxiliares" o "Auxiliares" o la primera hoja
        let sheetName = workbook.SheetNames.find(n => 
          n.toLowerCase().includes('base_auxiliar') || 
          n.toLowerCase().includes('auxiliar') ||
          n.toLowerCase().includes('cliente') ||
          n.toLowerCase().includes('proveedor')
        ) || workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          alert('El archivo no contiene filas de datos para procesar.');
          return;
        }

        processRawExcelRows(rawJson);
      } catch (err: any) {
        console.error('Error al leer archivo Excel:', err);
        alert('Error al leer el archivo Excel: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processRawExcelRows = (rawRows: any[]) => {
    const processed: AuxiliaryUpgradeRow[] = [];
    let updatedCount = 0;
    let createdCount = 0;
    let unchangedCount = 0;
    let errorCount = 0;

    rawRows.forEach((row, idx) => {
      // Normalizar claves del objeto
      const normalizedRow: { [key: string]: any } = {};
      Object.keys(row).forEach(key => {
        const cleanKey = key
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, '');
        normalizedRow[cleanKey] = row[key];
      });

      // Extraer campos con heurística flexible
      const rawRut = String(
        normalizedRow['rut'] || 
        normalizedRow['rutformateado'] || 
        normalizedRow['rutoriginal'] || 
        normalizedRow['rutosocial'] || 
        normalizedRow['identificador'] ||
        row['RUT'] ||
        row['Rut'] ||
        row['rut'] ||
        ''
      ).trim();

      const name = String(
        normalizedRow['razonsocial'] || 
        normalizedRow['razonsocialnombre'] || 
        normalizedRow['nombre'] || 
        normalizedRow['auxiliar'] ||
        normalizedRow['razon_social'] ||
        row['Razon_Social'] ||
        row['Razón Social'] ||
        row['Nombre'] ||
        ''
      ).trim();

      // Validación del RUT
      const cleanRut = cleanRutString(rawRut);
      const analysis = analyzeRut(rawRut, name);
      const isValidRut = analysis.isValid;
      const isGarbageRut = analysis.isGarbage;
      const formattedRut = analysis.formatted || rawRut;

      // Rol
      const rawRole = String(
        normalizedRow['rol'] || 
        normalizedRow['rolprincipal'] || 
        normalizedRow['role'] || 
        normalizedRow['tiporol'] ||
        ''
      ).trim().toLowerCase();

      let role: 'Deudor' | 'Acreedor' | 'Ambos' = 'Deudor';
      if (rawRole.includes('ambos') || rawRole.includes('both')) role = 'Ambos';
      else if (rawRole.includes('acreedor') || rawRole.includes('proveedor') || rawRole.includes('supplier')) role = 'Acreedor';
      else if (rawRole.includes('deudor') || rawRole.includes('cliente') || rawRole.includes('customer')) role = 'Deudor';

      // Estado
      const rawEstado = String(normalizedRow['estado'] || normalizedRow['status'] || 'Activo').trim().toLowerCase();
      const estado: 'Activo' | 'Inactivo' = rawEstado.includes('inact') ? 'Inactivo' : 'Activo';

      // Datos de contacto y banco
      const email = String(normalizedRow['email'] || normalizedRow['correo'] || normalizedRow['correoelectronico'] || '').trim();
      const phone = String(normalizedRow['telefono'] || normalizedRow['fono'] || normalizedRow['celular'] || normalizedRow['phone'] || '').trim();
      const banco = String(normalizedRow['banco'] || normalizedRow['bank'] || '').trim();
      
      const rawTipoCuenta = String(normalizedRow['tipocuenta'] || normalizedRow['tipodecuenta'] || '').trim().toLowerCase();
      let tipoCuenta: 'Corriente' | 'Vista' | 'Ahorro' | 'RUT' | '' = '';
      if (rawTipoCuenta.includes('corriente')) tipoCuenta = 'Corriente';
      else if (rawTipoCuenta.includes('vista')) tipoCuenta = 'Vista';
      else if (rawTipoCuenta.includes('ahorro')) tipoCuenta = 'Ahorro';
      else if (rawTipoCuenta.includes('rut')) tipoCuenta = 'RUT';

      const numeroCuenta = String(normalizedRow['numerocuenta'] || normalizedRow['nrocuenta'] || normalizedRow['cuenta'] || '').trim();

      // Cuentas contables
      const rawDebtorAcc = String(
        normalizedRow['codigocuentadeudor'] || 
        normalizedRow['cuentadeudor'] || 
        normalizedRow['cuentacliente'] || 
        normalizedRow['codigocuentacliente'] || 
        ''
      ).trim();
      const debtorMatch = findAccountMatch(rawDebtorAcc);

      const rawCreditorAcc = String(
        normalizedRow['codigocuentaacreedor'] || 
        normalizedRow['cuentaacreedor'] || 
        normalizedRow['cuentaproveedor'] || 
        normalizedRow['codigocuentaproveedor'] || 
        ''
      ).trim();
      const creditorMatch = findAccountMatch(rawCreditorAcc);

      const rawExpenseAcc = String(
        normalizedRow['codigocuentagastoingreso'] || 
        normalizedRow['cuentagastoingreso'] || 
        normalizedRow['cuentagasto'] || 
        normalizedRow['cuentaingreso'] || 
        ''
      ).trim();
      const expenseMatch = findAccountMatch(rawExpenseAcc);

      // Dimensiones de análisis y glosa
      const defaultGloss = String(
        normalizedRow['glosasugerida'] || 
        normalizedRow['glosa'] || 
        normalizedRow['glosapordefecto'] || 
        normalizedRow['glosadefecto'] || 
        normalizedRow['descripcion'] || 
        row['Glosa_Sugerida'] ||
        row['Glosa Sugerida'] ||
        row['Glosa'] ||
        row['glosa'] ||
        ''
      ).trim();
      const defaultCostCenter = String(normalizedRow['centrocosto'] || normalizedRow['centrodecosto'] || normalizedRow['cc'] || '').trim();
      const defaultExpenseItem = String(normalizedRow['itemgasto'] || normalizedRow['itemdegasto'] || normalizedRow['item'] || '').trim();
      const defaultProject = String(normalizedRow['proyecto'] || normalizedRow['project'] || '').trim();
      const defaultProduct = String(normalizedRow['producto'] || normalizedRow['product'] || '').trim();

      // Comparación y Matching contra la base de datos actual
      const existingAux = existingAuxMap.get(cleanRut);
      const changes: AuxiliaryUpgradeRow['changes'] = [];
      let rowStatus: AuxiliaryUpgradeRow['status'] = 'NEW';
      let errorMessage: string | undefined = undefined;

      if (!cleanRut || isGarbageRut) {
        rowStatus = 'ERROR';
        errorMessage = analysis.reason || 'RUT inválido o vacío';
        errorCount++;
      } else if (existingAux) {
        // Comparar campo por campo para detectar upgrades
        if (name && name !== existingAux.name) {
          changes.push({ field: 'name', label: 'Razón Social', oldValue: existingAux.name || '(Vacío)', newValue: name });
        }
        if (role && role !== existingAux.role) {
          changes.push({ field: 'role', label: 'Rol', oldValue: existingAux.role || 'Deudor', newValue: role });
        }
        if (estado && estado !== (existingAux.estado || 'Activo')) {
          changes.push({ field: 'estado', label: 'Estado', oldValue: existingAux.estado || 'Activo', newValue: estado });
        }
        if (email && email !== existingAux.email) {
          changes.push({ field: 'email', label: 'Email', oldValue: existingAux.email || '(Vacío)', newValue: email });
        }
        if (phone && phone !== existingAux.phone) {
          changes.push({ field: 'phone', label: 'Teléfono', oldValue: existingAux.phone || '(Vacío)', newValue: phone });
        }
        if (banco && banco !== existingAux.banco) {
          changes.push({ field: 'banco', label: 'Banco', oldValue: existingAux.banco || '(Vacío)', newValue: banco });
        }
        if (tipoCuenta && tipoCuenta !== existingAux.tipoCuenta) {
          changes.push({ field: 'tipoCuenta', label: 'Tipo Cuenta', oldValue: existingAux.tipoCuenta || '(Vacío)', newValue: tipoCuenta });
        }
        if (numeroCuenta && numeroCuenta !== existingAux.numeroCuenta) {
          changes.push({ field: 'numeroCuenta', label: 'N° Cuenta', oldValue: existingAux.numeroCuenta || '(Vacío)', newValue: numeroCuenta });
        }

        // Glosa sugerida
        if (defaultGloss && defaultGloss !== (existingAux.defaultGloss || '')) {
          changes.push({ field: 'defaultGloss', label: 'Glosa Sugerida', oldValue: existingAux.defaultGloss || '(Vacío)', newValue: defaultGloss });
        }

        // Cuentas contables
        const oldDebtorAcc = existingAux.defaultDebtorAccountId ? accountLookup.byId.get(existingAux.defaultDebtorAccountId) : null;
        if (debtorMatch && debtorMatch.id !== existingAux.defaultDebtorAccountId) {
          changes.push({ 
            field: 'defaultDebtorAccountId', 
            label: 'Cuenta Deudor (Cliente)', 
            oldValue: oldDebtorAcc ? `[${oldDebtorAcc.code}] ${oldDebtorAcc.name}` : '(Sin Asignar)', 
            newValue: `[${debtorMatch.code}] ${debtorMatch.name}` 
          });
        }

        const oldCreditorAcc = existingAux.defaultCreditorAccountId ? accountLookup.byId.get(existingAux.defaultCreditorAccountId) : null;
        if (creditorMatch && creditorMatch.id !== existingAux.defaultCreditorAccountId) {
          changes.push({ 
            field: 'defaultCreditorAccountId', 
            label: 'Cuenta Acreedor (Proveedor)', 
            oldValue: oldCreditorAcc ? `[${oldCreditorAcc.code}] ${oldCreditorAcc.name}` : '(Sin Asignar)', 
            newValue: `[${creditorMatch.code}] ${creditorMatch.name}` 
          });
        }

        const oldExpenseAcc = existingAux.defaultExpenseOrIncomeAccountId ? accountLookup.byId.get(existingAux.defaultExpenseOrIncomeAccountId) : null;
        if (expenseMatch && expenseMatch.id !== existingAux.defaultExpenseOrIncomeAccountId) {
          changes.push({ 
            field: 'defaultExpenseOrIncomeAccountId', 
            label: 'Cuenta Gasto / Ingreso', 
            oldValue: oldExpenseAcc ? `[${oldExpenseAcc.code}] ${oldExpenseAcc.name}` : '(Sin Asignar)', 
            newValue: `[${expenseMatch.code}] ${expenseMatch.name}` 
          });
        }

        // Dimensiones
        if (defaultCostCenter && defaultCostCenter !== existingAux.defaultCostCenter) {
          changes.push({ field: 'defaultCostCenter', label: 'Centro de Costo', oldValue: existingAux.defaultCostCenter || '(Vacío)', newValue: defaultCostCenter });
        }
        if (defaultExpenseItem && defaultExpenseItem !== existingAux.defaultExpenseItem) {
          changes.push({ field: 'defaultExpenseItem', label: 'Item de Gasto', oldValue: existingAux.defaultExpenseItem || '(Vacío)', newValue: defaultExpenseItem });
        }
        if (defaultProject && defaultProject !== existingAux.defaultProject) {
          changes.push({ field: 'defaultProject', label: 'Proyecto', oldValue: existingAux.defaultProject || '(Vacío)', newValue: defaultProject });
        }
        if (defaultProduct && defaultProduct !== existingAux.defaultProduct) {
          changes.push({ field: 'defaultProduct', label: 'Producto', oldValue: existingAux.defaultProduct || '(Vacío)', newValue: defaultProduct });
        }

        if (changes.length > 0) {
          rowStatus = 'UPDATE';
          updatedCount++;
        } else {
          rowStatus = 'UNCHANGED';
          unchangedCount++;
        }
      } else {
        rowStatus = 'NEW';
        createdCount++;
      }

      processed.push({
        rowIdx: idx + 1,
        originalData: row,
        cleanRut,
        formattedRut,
        isValidRut,
        isGarbageRut,
        name: name || formattedRut,
        role,
        estado,
        email,
        phone,
        banco,
        tipoCuenta,
        numeroCuenta,
        debtorAccountCode: rawDebtorAcc,
        debtorAccountId: debtorMatch?.id,
        debtorAccountName: debtorMatch ? `[${debtorMatch.code}] ${debtorMatch.name}` : undefined,
        creditorAccountCode: rawCreditorAcc,
        creditorAccountId: creditorMatch?.id,
        creditorAccountName: creditorMatch ? `[${creditorMatch.code}] ${creditorMatch.name}` : undefined,
        expenseOrIncomeAccountCode: rawExpenseAcc,
        expenseOrIncomeAccountId: expenseMatch?.id,
        expenseOrIncomeAccountName: expenseMatch ? `[${expenseMatch.code}] ${expenseMatch.name}` : undefined,
        defaultCostCenter,
        defaultExpenseItem,
        defaultProject,
        defaultProduct,
        defaultGloss,
        status: rowStatus,
        existingAux,
        changes,
        errorMessage
      });
    });

    setParsedRows(processed);
    setSummaryResults({
      updated: updatedCount,
      created: createdCount,
      unchanged: unchangedCount,
      errors: errorCount
    });
    setStep('preview');
  };

  // =========================================================================
  // 3. EJECUTAR EL UPGRADE MASIVO EN BATCH A FIRESTORE
  // =========================================================================
  const handleExecuteUpgrade = async () => {
    setIsProcessing(true);
    setStep('processing');
    setProcessProgress(0);
    setProcessStatus('Preparando operaciones de actualización masiva...');

    try {
      const rowsToApply = parsedRows.filter(r => {
        if (r.status === 'ERROR') return false;
        if (r.status === 'UPDATE' && !updateExisting) return false;
        if (r.status === 'NEW' && !createNew) return false;
        if (r.status === 'UNCHANGED') return false;
        return true;
      });

      if (rowsToApply.length === 0) {
        alert('No hay registros seleccionados para actualizar o crear.');
        setStep('preview');
        setIsProcessing(false);
        return;
      }

      const CHUNK_SIZE = 400;
      const totalRows = rowsToApply.length;
      let appliedCount = 0;

      for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
        const chunk = rowsToApply.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(row => {
          const finalRut = normalizeRuts && row.isValidRut ? row.formattedRut : (row.formattedRut || row.cleanRut);
          
          if (row.status === 'UPDATE' && row.existingAux) {
            const auxDocRef = doc(companyRef, 'auxiliaries', row.existingAux.id);
            const updatePayload: any = {
              rut: finalRut,
              lastModifiedAt: new Date().toISOString(),
              lastModifiedBy: 'UPGRADE_EXCEL'
            };

            if (row.name) updatePayload.name = row.name;
            if (row.role) updatePayload.role = row.role;
            if (row.estado) updatePayload.estado = row.estado;
            if (row.email) updatePayload.email = row.email;
            if (row.phone) updatePayload.phone = row.phone;
            if (row.banco) updatePayload.banco = row.banco;
            if (row.tipoCuenta) updatePayload.tipoCuenta = row.tipoCuenta;
            if (row.numeroCuenta) updatePayload.numeroCuenta = row.numeroCuenta;
            if (row.debtorAccountId) updatePayload.defaultDebtorAccountId = row.debtorAccountId;
            if (row.creditorAccountId) updatePayload.defaultCreditorAccountId = row.creditorAccountId;
            if (row.expenseOrIncomeAccountId) updatePayload.defaultExpenseOrIncomeAccountId = row.expenseOrIncomeAccountId;
            if (row.defaultCostCenter) updatePayload.defaultCostCenter = row.defaultCostCenter;
            if (row.defaultExpenseItem) updatePayload.defaultExpenseItem = row.defaultExpenseItem;
            if (row.defaultProject) updatePayload.defaultProject = row.defaultProject;
            if (row.defaultProduct) updatePayload.defaultProduct = row.defaultProduct;
            if (row.defaultGloss !== undefined) updatePayload.defaultGloss = row.defaultGloss || '';

            batch.set(auxDocRef, updatePayload, { merge: true });
          } else if (row.status === 'NEW') {
            const newId = `aux_${row.cleanRut.replace(/[^a-zA-Z0-9]/g, '')}`;
            const newDocRef = doc(companyRef, 'auxiliaries', newId);
            
            const newAuxPayload: any = {
              id: newId,
              rut: finalRut,
              name: row.name || finalRut,
              role: row.role || 'Deudor',
              estado: row.estado || 'Activo',
              email: row.email || '',
              phone: row.phone || '',
              banco: row.banco || '',
              tipoCuenta: row.tipoCuenta || '',
              numeroCuenta: row.numeroCuenta || '',
              defaultDebtorAccountId: row.debtorAccountId || '',
              defaultCreditorAccountId: row.creditorAccountId || '',
              defaultExpenseOrIncomeAccountId: row.expenseOrIncomeAccountId || '',
              defaultCostCenter: row.defaultCostCenter || '',
              defaultExpenseItem: row.defaultExpenseItem || '',
              defaultProject: row.defaultProject || '',
              defaultProduct: row.defaultProduct || '',
              defaultGloss: row.defaultGloss || '',
              creationMode: 'IMPORTACION_MASIVA',
              createdAt: new Date().toISOString()
            };

            batch.set(newDocRef, newAuxPayload, { merge: true });
          }
        });

        await batch.commit();
        appliedCount += chunk.length;
        const currentPct = Math.round((appliedCount / totalRows) * 100);
        setProcessProgress(currentPct);
        setProcessStatus(`Actualizando en base de datos: ${appliedCount} de ${totalRows} registros (${currentPct}%)...`);
      }

      setProcessStatus('Recargando datos en memoria...');
      await onSuccess();
      setStep('completed');
    } catch (err: any) {
      console.error('Error al aplicar upgrade masivo:', err);
      alert('Ocurrió un error al aplicar la actualización masiva: ' + err.message);
      setStep('preview');
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtrado de la lista en el preview
  const filteredPreviewRows = useMemo(() => {
    return parsedRows.filter(row => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false;
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        const matches = 
          row.cleanRut.toLowerCase().includes(q) ||
          row.formattedRut.toLowerCase().includes(q) ||
          row.name.toLowerCase().includes(q) ||
          row.email.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [parsedRows, statusFilter, searchFilter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* ENCABEZADO DEL MODAL */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-400/30 text-indigo-300">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight text-white">
                  Upgrade y Actualización Masiva de Auxiliares desde Excel
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {companyName}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Descarga la base a Excel, edita configuraciones y cuentas en lote, y vuelve a cargarla para actualizarla al instante.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENIDO PRINCIPAL SEGÚN PASO */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* PASO 1: CARGA DE ARCHIVO Y DESCARGA DE BASE */}
          {step === 'upload' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              
              {/* PANEL DE DESCARGA PREVIA DE LA BASE DE DATOS ACTUAL */}
              <div className="bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/50 p-5 rounded-2xl border border-indigo-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-indigo-600" />
                    <h4 className="font-bold text-slate-900 text-sm">Paso 1: Descargar Base Actual de Auxiliares</h4>
                  </div>
                  <p className="text-xs text-slate-600 max-w-xl">
                    Exporta un archivo Excel (.xlsx) con los <strong>{auxiliaries.length} auxiliares registrados</strong> y pestañas de guía con el Plan de Cuentas y Centros de Costos para copiar los códigos fácilmente.
                  </p>
                </div>
                <button
                  onClick={handleDownloadFullBaseExcel}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                >
                  <FileSpreadsheet className="w-4 h-4 text-indigo-200" />
                  <span>Descargar Base en Excel ({auxiliaries.length} Auxiliares)</span>
                </button>
              </div>

              {/* PANEL DE SUBIDA DEL ARCHIVO EXCEL MODIFICADO */}
              <div className="border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-2xl p-8 bg-slate-50/60 hover:bg-indigo-50/30 transition-all text-center space-y-4">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
                  <Upload className="w-8 h-8 animate-bounce" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-base">Paso 2: Sube tu archivo Excel o CSV modificado</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Arrastra aquí tu archivo o haz clic para seleccionarlo. El sistema comparará cada RUT y detectará automáticamente las modificaciones.
                  </p>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="pt-2 flex justify-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-xl text-sm shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Seleccionar Archivo Excel (.xlsx / .csv)</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 font-mono pt-1">
                  Formatos soportados: Microsoft Excel (.xlsx, .xls) y valores separados por coma (.csv)
                </p>
              </div>

              {/* TARJETAS DE VENTAJAS Y FUNCIONALIDADES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
                    <RefreshCw className="w-4 h-4" />
                    <span>Smart Merge por RUT</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Si el auxiliar ya existe, solo actualizará las cuentas y campos modificados sin sobreescribir datos innecesarios ni duplicar registros.
                  </p>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Vinculación de Cuentas</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Reconoce códigos de cuenta con puntos o guiones (ej. 1-1-03-01 o 1.1.03.001) y los vincula directamente al Plan de Cuentas.
                  </p>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-1.5">
                  <div className="flex items-center gap-2 text-purple-700 font-bold text-xs">
                    <Users className="w-4 h-4" />
                    <span>Creación Automática</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Las nuevas filas con RUTs no existentes se registrarán automáticamente como nuevos auxiliares de la empresa.
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* PASO 2: PREVISUALIZACIÓN Y DIFF DETALLADO */}
          {step === 'preview' && (
            <div className="space-y-4">
              
              {/* TARJETAS DE RESUMEN DEL PARSEO */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`p-3 rounded-xl border text-left transition-all ${statusFilter === 'ALL' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'}`}
                >
                  <div className="text-[11px] uppercase tracking-wider font-semibold opacity-70">Total Leídos</div>
                  <div className="text-xl font-black">{parsedRows.length}</div>
                </button>

                <button
                  onClick={() => setStatusFilter('UPDATE')}
                  className={`p-3 rounded-xl border text-left transition-all ${statusFilter === 'UPDATE' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-indigo-50/60 hover:bg-indigo-100 text-indigo-900 border-indigo-200'}`}
                >
                  <div className="text-[11px] uppercase tracking-wider font-semibold opacity-80 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    <span>Para Actualizar</span>
                  </div>
                  <div className="text-xl font-black">{summaryResults.updated}</div>
                </button>

                <button
                  onClick={() => setStatusFilter('NEW')}
                  className={`p-3 rounded-xl border text-left transition-all ${statusFilter === 'NEW' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-emerald-50/60 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                >
                  <div className="text-[11px] uppercase tracking-wider font-semibold opacity-80 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Nuevos Auxiliares</span>
                  </div>
                  <div className="text-xl font-black">{summaryResults.created}</div>
                </button>

                <button
                  onClick={() => setStatusFilter('UNCHANGED')}
                  className={`p-3 rounded-xl border text-left transition-all ${statusFilter === 'UNCHANGED' ? 'bg-slate-700 text-white border-slate-700 shadow-md' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}
                >
                  <div className="text-[11px] uppercase tracking-wider font-semibold opacity-80">Sin Cambios</div>
                  <div className="text-xl font-black">{summaryResults.unchanged}</div>
                </button>
              </div>

              {summaryResults.errors > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Se detectaron <strong>{summaryResults.errors} filas con errores o RUT inválido</strong> que serán omitidas automáticamente.</span>
                  </div>
                  <button
                    onClick={() => setStatusFilter('ERROR')}
                    className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-800 font-bold rounded-lg border border-rose-300 text-[11px]"
                  >
                    Ver Errores
                  </button>
                </div>
              )}

              {/* BARRA DE FILTRO Y BÚSQUEDA */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <div className="relative w-full sm:w-80">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar en la lista procesada..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* OPCIONES DE APLICACIÓN */}
                <div className="flex items-center gap-4 text-xs text-slate-700">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={updateExisting}
                      onChange={e => setUpdateExisting(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <span>Actualizar existentes ({summaryResults.updated})</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={createNew}
                      onChange={e => setCreateNew(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                    />
                    <span>Crear nuevos ({summaryResults.created})</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={normalizeRuts}
                      onChange={e => setNormalizeRuts(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <span>Normalizar RUTs (XX.XXX.XXX-X)</span>
                  </label>
                </div>
              </div>

              {/* TABLA DE PREVISUALIZACIÓN DETALLADA */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs max-h-[380px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5 w-12 text-center">Fila</th>
                      <th className="p-2.5 w-28">Estado</th>
                      <th className="p-2.5 w-32">RUT</th>
                      <th className="p-2.5">Razón Social / Nombre</th>
                      <th className="p-2.5">Rol</th>
                      <th className="p-2.5">Detalle de Modificaciones (Upgrade)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No hay registros que coincidan con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filteredPreviewRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 text-center font-mono text-slate-400 text-[11px]">{row.rowIdx}</td>
                          
                          <td className="p-2.5">
                            {row.status === 'UPDATE' && (
                              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded-md text-[10px] flex items-center gap-1 w-fit border border-indigo-200">
                                <RefreshCw className="w-2.5 h-2.5" />
                                <span>Actualizar</span>
                              </span>
                            )}
                            {row.status === 'NEW' && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-md text-[10px] flex items-center gap-1 w-fit border border-emerald-200">
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>Nuevo</span>
                              </span>
                            )}
                            {row.status === 'UNCHANGED' && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-medium rounded-md text-[10px] w-fit">
                                Sin cambios
                              </span>
                            )}
                            {row.status === 'ERROR' && (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded-md text-[10px] flex items-center gap-1 w-fit border border-rose-200">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>Error</span>
                              </span>
                            )}
                          </td>

                          <td className="p-2.5 font-mono font-bold text-slate-900">
                            {row.formattedRut}
                          </td>

                          <td className="p-2.5 font-medium text-slate-800">
                            {row.name}
                          </td>

                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              row.role === 'Ambos' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                              row.role === 'Acreedor' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                              'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}>
                              {row.role}
                            </span>
                          </td>

                          <td className="p-2.5">
                            {row.status === 'UPDATE' && row.changes.length > 0 && (
                              <div className="space-y-1">
                                {row.changes.map((ch, cIdx) => (
                                  <div key={cIdx} className="text-[11px] flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-600">{ch.label}:</span>
                                    <span className="text-slate-400 line-through text-[10px]">{ch.oldValue}</span>
                                    <ArrowRight className="w-2.5 h-2.5 text-indigo-500" />
                                    <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                      {ch.newValue}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {row.status === 'NEW' && (
                              <div className="text-[11px] text-emerald-700 space-y-0.5">
                                <div>Nuevo auxiliar listo para ser incorporado al maestro.</div>
                                {(row.debtorAccountName || row.creditorAccountName) && (
                                  <div className="text-[10px] text-slate-500">
                                    {row.debtorAccountName && <span>Deudor: {row.debtorAccountName} </span>}
                                    {row.creditorAccountName && <span>Acreedor: {row.creditorAccountName}</span>}
                                  </div>
                                )}
                              </div>
                            )}

                            {row.status === 'UNCHANGED' && (
                              <span className="text-[11px] text-slate-400 italic">
                                Coincide exactamente con la base de datos actual.
                              </span>
                            )}

                            {row.status === 'ERROR' && (
                              <span className="text-[11px] text-rose-600 font-medium">
                                {row.errorMessage || 'RUT malformado'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* PASO 3: PROCESANDO */}
          {step === 'processing' && (
            <div className="py-12 text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full mx-auto flex items-center justify-center animate-spin">
                <RefreshCw className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-900">Aplicando Upgrade en Base de Datos</h4>
                <p className="text-xs text-slate-500">{processStatus}</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                <div 
                  className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${processProgress}%` }}
                ></div>
              </div>
              <p className="text-xs font-mono font-bold text-indigo-700">{processProgress}% Completado</p>
            </div>
          )}

          {/* PASO 4: COMPLETADO */}
          {step === 'completed' && (
            <div className="py-10 text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center">
                <Check className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-black text-slate-900">¡Upgrade Masivo Completado con Éxito!</h4>
                <p className="text-xs text-slate-600">
                  La base de auxiliares de <strong>{companyName}</strong> ha sido actualizada y sincronizada en tiempo real.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-3 text-left">
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Auxiliares Actualizados</div>
                  <div className="text-lg font-black text-indigo-600">{updateExisting ? summaryResults.updated : 0}</div>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">Nuevos Creados</div>
                  <div className="text-lg font-black text-emerald-600">{createNew ? summaryResults.created : 0}</div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all shadow cursor-pointer"
              >
                Cerrar y Ver Maestro de Auxiliares
              </button>
            </div>
          )}

        </div>

        {/* PIE DEL MODAL CON BOTONES DE ACCIÓN */}
        {step !== 'processing' && step !== 'completed' && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            {step === 'upload' ? (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadFullBaseExcel}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Base Excel</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Cargar Archivo Modificado</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>← Cargar otro archivo</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleExecuteUpgrade}
                    disabled={isProcessing || (summaryResults.updated === 0 && summaryResults.created === 0)}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-200" />
                    <span>Aplicar Actualización Masiva ({summaryResults.updated + summaryResults.created} Registros)</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
