import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, writeBatch, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { ChartOfAccount, Company } from '../types';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Download,
  Upload,
  Save,
  Search,
  PlusCircle,
  Copy,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  X,
  Layers
} from 'lucide-react';

interface PlanDeCuentasGridProps {
  studyId: string;
  company: Company;
  onRefreshCompany?: () => void;
}

// 17 Atributos Estándar
export const STANDARD_GRID_COLUMNS = [
  { key: 'code', label: 'COD_CTA', width: 'w-28', type: 'text', required: true, tooltip: 'Código de cuenta (ej: 1101001)' },
  { key: 'name', label: 'NOMBRE_CTA', width: 'w-56', type: 'text', required: true, tooltip: 'Nombre descriptivo de la cuenta' },
  { key: 'isImputable', label: 'IMPUTABLE', width: 'w-24', type: 'boolean', default: true, tooltip: 'Permite registrar movimientos contables directos' },
  { key: 'moneda', label: 'MONEDA', width: 'w-24', type: 'select', options: ['CLP', 'USD', 'EUR', 'UF'], default: 'CLP', tooltip: 'Moneda contable de la cuenta' },
  { key: 'requiereAuxiliarRUT', label: 'REQUIERE AUXILIAR', width: 'w-24', type: 'boolean', default: false, tooltip: 'Exige RUT/Razón social del cliente o proveedor' },
  { key: 'requiereConciliacionBancaria', label: 'REQUIERE CONCILIACION', width: 'w-24', type: 'boolean', default: false, tooltip: 'Exige conciliación con cartola bancaria' },
  { key: 'requiereDocumento', label: 'REQUIERE DOCUMENTO', width: 'w-24', type: 'boolean', default: false, tooltip: 'Exige número de factura, boleta o comprobante' },
  { key: 'requiereVencimiento', label: 'REQUIERE VENCIMIENTO', width: 'w-24', type: 'boolean', default: false, tooltip: 'Exige fecha de vencimiento del documento' },
  { key: 'requiereCentroCosto', label: 'REQUIERE CENTRO_COSTO', width: 'w-24', type: 'boolean', default: false, tooltip: 'Exige asignación a un centro de costos' },
  { key: 'requiereItemGasto', label: 'REQUIERE ITEM_GASTO', width: 'w-24', type: 'boolean', default: false, tooltip: 'Exige clasificador de ítem de gasto' },
  { key: 'requiereProyecto', label: 'REQUIERE PROYECTO', width: 'w-24', type: 'boolean', default: false, tooltip: 'Exige código o nombre de proyecto' },
  { key: 'requiereProducto', label: 'REQUIERE PRODUCTO', width: 'w-24', type: 'boolean', default: false, tooltip: 'Exige ítem o código de producto/servicio' },
  { key: 'esActivoFijo', label: 'ES ACTIVO FIJO', width: 'w-24', type: 'boolean', default: false, tooltip: 'Cuenta sujeta a depreciación de activo fijo' },
  { key: 'requiereCMonetaria', label: 'REQUIERE C. MONETARIA', width: 'w-24', type: 'boolean', default: false, tooltip: 'Aplica Corrección Monetaria tributaria' },
  { key: 'requiereDifCambio', label: 'REQUIERE DIF. CAMBIO', width: 'w-24', type: 'boolean', default: false, tooltip: 'Aplica ajuste por Diferencia de Cambio' },
  { key: 'blce8Columnas', label: 'BLCE 8 COLUM', width: 'w-32', type: 'select', options: ['ACTIVO', 'PASIVO', 'PERDIDA', 'GANANCIA'], default: 'ACTIVO', tooltip: 'Clasificación para Balance Tributario de 8 Columnas' },
  { key: 'codigoIFRS', label: 'IFRS', width: 'w-24', type: 'text', default: '', tooltip: 'Código de agrupación IFRS / NIIF' }
];

export const STANDARD_CHILEAN_ACCOUNTS_PRESET: Partial<ChartOfAccount>[] = [
  // Activos Disponibles
  { code: '1101001', name: 'CAJA CHICA / EFECTIVO', type: 'Activo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: false, requiereConciliacionBancaria: false, requiereDocumento: false, blce8Columnas: 'ACTIVO', codigoIFRS: '1101' },
  { code: '1101002', name: 'BANCO DE CHILE C/C', type: 'Activo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: false, requiereConciliacionBancaria: true, requiereDocumento: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1101' },
  { code: '1101003', name: 'BANCO SANTANDER C/C', type: 'Activo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: false, requiereConciliacionBancaria: true, requiereDocumento: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1101' },
  { code: '1101004', name: 'BANCO BCI C/C USD', type: 'Activo', isImputable: true, moneda: 'USD', requiereAuxiliarRUT: false, requiereConciliacionBancaria: true, requiereDocumento: true, requiereDifCambio: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1101' },
  // Deudores
  { code: '1102001', name: 'CLIENTES NACIONALES', type: 'Activo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, requiereVencimiento: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1102' },
  { code: '1102002', name: 'CLIENTES EXTRANJEROS', type: 'Activo', isImputable: true, moneda: 'USD', requiereAuxiliarRUT: true, requiereDocumento: true, requiereVencimiento: true, requiereDifCambio: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1102' },
  { code: '1103001', name: 'DOCUMENTOS POR COBRAR', type: 'Activo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, requiereVencimiento: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1102' },
  { code: '1104001', name: 'IVA CREDITO FISCAL', type: 'Activo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1105' },
  { code: '1104002', name: 'PPM (PAGOS PROVISIONALES MENSUALES)', type: 'Activo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: false, requiereCMonetaria: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1105' },
  // Activos Fijos
  { code: '1201001', name: 'TERRENOS', type: 'Activo', isImputable: true, moneda: 'CLP', esActivoFijo: true, requiereCMonetaria: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1201' },
  { code: '1201002', name: 'EDIFICACIONES Y CONSTRUCCIONES', type: 'Activo', isImputable: true, moneda: 'CLP', esActivoFijo: true, requiereCMonetaria: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1201' },
  { code: '1201003', name: 'MAQUINARIAS Y EQUIPOS', type: 'Activo', isImputable: true, moneda: 'CLP', esActivoFijo: true, requiereCMonetaria: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1201' },
  { code: '1201004', name: 'EQUIPOS COMPUTACIONALES', type: 'Activo', isImputable: true, moneda: 'CLP', esActivoFijo: true, requiereCMonetaria: true, blce8Columnas: 'ACTIVO', codigoIFRS: '1201' },
  // Pasivos Corrientes
  { code: '2101001', name: 'PROVEEDORES NACIONALES', type: 'Pasivo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, requiereVencimiento: true, blce8Columnas: 'PASIVO', codigoIFRS: '2101' },
  { code: '2101002', name: 'PROVEEDORES EXTRANJEROS', type: 'Pasivo', isImputable: true, moneda: 'USD', requiereAuxiliarRUT: true, requiereDocumento: true, requiereDifCambio: true, blce8Columnas: 'PASIVO', codigoIFRS: '2101' },
  { code: '2102001', name: 'IVA DEBITO FISCAL', type: 'Pasivo', isImputable: true, moneda: 'CLP', requiereDocumento: false, blce8Columnas: 'PASIVO', codigoIFRS: '2102' },
  { code: '2102002', name: 'RETENCIONES DE IMPUESTO (HONORARIOS/UNICA)', type: 'Pasivo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, blce8Columnas: 'PASIVO', codigoIFRS: '2102' },
  { code: '2103001', name: 'REMUNERACIONES POR PAGAR', type: 'Pasivo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, blce8Columnas: 'PASIVO', codigoIFRS: '2103' },
  { code: '2103002', name: 'IMPOSICIONES POR PAGAR (PREVIRED)', type: 'Pasivo', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, blce8Columnas: 'PASIVO', codigoIFRS: '2103' },
  // Patrimonio
  { code: '3101001', name: 'CAPITAL PAGADO', type: 'Patrimonio', isImputable: true, moneda: 'CLP', requiereCMonetaria: true, blce8Columnas: 'PASIVO', codigoIFRS: '3101' },
  { code: '3102001', name: 'RESULTADOS ACUMULADOS', type: 'Patrimonio', isImputable: true, moneda: 'CLP', requiereCMonetaria: true, blce8Columnas: 'PASIVO', codigoIFRS: '3102' },
  // Pérdidas / Gastos
  { code: '4101001', name: 'COSTO DE VENTAS / MERCADERIAS', type: 'Gasto', isImputable: true, moneda: 'CLP', requiereCentroCosto: true, blce8Columnas: 'PERDIDA', codigoIFRS: '4101' },
  { code: '4201001', name: 'SUELDOS Y SALARIOS', type: 'Gasto', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereCentroCosto: true, blce8Columnas: 'PERDIDA', codigoIFRS: '4201' },
  { code: '4201002', name: 'LEYES SOCIALES', type: 'Gasto', isImputable: true, moneda: 'CLP', requiereCentroCosto: true, blce8Columnas: 'PERDIDA', codigoIFRS: '4201' },
  { code: '4201003', name: 'HONORARIOS PROFESIONALES', type: 'Gasto', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, requiereCentroCosto: true, blce8Columnas: 'PERDIDA', codigoIFRS: '4201' },
  { code: '4202001', name: 'ARRIENDOS Y GASTOS COMUNES', type: 'Gasto', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, requiereCentroCosto: true, blce8Columnas: 'PERDIDA', codigoIFRS: '4202' },
  { code: '4202002', name: 'SERVICIOS BASICOS (LUZ, AGUA, INTERNET)', type: 'Gasto', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, requiereCentroCosto: true, blce8Columnas: 'PERDIDA', codigoIFRS: '4202' },
  { code: '4202003', name: 'GASTOS DE PUBLICIDAD Y MARKETING', type: 'Gasto', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, requiereCentroCosto: true, blce8Columnas: 'PERDIDA', codigoIFRS: '4202' },
  { code: '4203001', name: 'GASTOS BANCARIOS E INTERESES', type: 'Gasto', isImputable: true, moneda: 'CLP', requiereCentroCosto: true, blce8Columnas: 'PERDIDA', codigoIFRS: '4203' },
  // Ganancias / Ingresos
  { code: '5101001', name: 'INGRESOS POR VENTAS Y FACTURACION', type: 'Ingreso', isImputable: true, moneda: 'CLP', requiereAuxiliarRUT: true, requiereDocumento: true, requiereCentroCosto: true, blce8Columnas: 'GANANCIA', codigoIFRS: '5101' },
  { code: '5101002', name: 'INGRESOS POR EXPORTACIONES', type: 'Ingreso', isImputable: true, moneda: 'USD', requiereAuxiliarRUT: true, requiereDocumento: true, requiereDifCambio: true, blce8Columnas: 'GANANCIA', codigoIFRS: '5101' },
  { code: '5201001', name: 'OTROS INGRESOS FUERA DE EXPLOTACION', type: 'Ingreso', isImputable: true, moneda: 'CLP', blce8Columnas: 'GANANCIA', codigoIFRS: '5201' }
];

export default function PlanDeCuentasGrid({ studyId, company, onRefreshCompany }: PlanDeCuentasGridProps) {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterImputable, setFilterImputable] = useState<string>('ALL');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Columnas dinámicas de análisis adicional (persisten en la empresa)
  const [customColumns, setCustomColumns] = useState<string[]>(company.customAccountColumns || []);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  // Cuentas modificadas o creadas localmente pendientes de guardar
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<string>>(new Set());

  // Cargar cuentas desde Firestore
  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'chartOfAccounts'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ChartOfAccount));
      list.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
      setAccounts(list);
      setDirtyRowIds(new Set());
    } catch (err: any) {
      console.error("Error fetching accounts:", err);
      showNotice('error', 'Error al cargar el plan de cuentas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    if (company.customAccountColumns) {
      setCustomColumns(company.customAccountColumns);
    }
  }, [studyId, company.id]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  // Determinar Tipo Contable automáticamente por dígito o Balance 8 Columnas
  const inferTypeFromBalance = (blce: string, code: string): 'Activo' | 'Pasivo' | 'Patrimonio' | 'Ingreso' | 'Gasto' => {
    const firstDigit = (code || '').charAt(0);
    if (firstDigit === '1') return 'Activo';
    if (firstDigit === '2') return 'Pasivo';
    if (firstDigit === '3') return 'Patrimonio';
    if (firstDigit === '4') return 'Gasto';
    if (firstDigit === '5') return 'Ingreso';

    const upper = (blce || '').toUpperCase();
    if (upper === 'ACTIVO') return 'Activo';
    if (upper === 'PASIVO') return 'Pasivo';
    if (upper === 'PERDIDA') return 'Gasto';
    if (upper === 'GANANCIA') return 'Ingreso';
    return 'Activo';
  };

  // Modificación de una celda en una fila
  const handleCellChange = (id: string, field: string, value: any) => {
    setAccounts(prev => prev.map(acc => {
      if (acc.id !== id) return acc;
      const updated = { ...acc };

      if (field.startsWith('custom_')) {
        const colKey = field.replace('custom_', '');
        updated.customAttributes = {
          ...(updated.customAttributes || {}),
          [colKey]: value
        };
      } else {
        (updated as any)[field] = value;

        // Auto-sincronizar type si cambia blce8Columnas
        if (field === 'blce8Columnas') {
          updated.type = inferTypeFromBalance(value, updated.code);
        }
      }

      return updated;
    }));

    setDirtyRowIds(prev => new Set(prev).add(id));
  };

  // Agregar una nueva fila a la grilla
  const handleAddRow = () => {
    const tempId = 'new_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newAcc: ChartOfAccount = {
      id: tempId,
      code: '',
      name: '',
      type: 'Activo',
      isImputable: true,
      moneda: 'CLP',
      requiereAuxiliarRUT: false,
      requiereConciliacionBancaria: false,
      requiereDocumento: false,
      requiereVencimiento: false,
      requiereCentroCosto: false,
      requiereItemGasto: false,
      requiereProyecto: false,
      requiereProducto: false,
      esActivoFijo: false,
      requiereCMonetaria: false,
      requiereDifCambio: false,
      blce8Columnas: 'ACTIVO',
      codigoIFRS: '',
      customAttributes: {},
      estado: 'Activo',
      creationMode: 'MANUAL',
      createdAt: new Date().toISOString()
    };

    setAccounts(prev => [newAcc, ...prev]);
    setDirtyRowIds(prev => new Set(prev).add(tempId));
  };

  // Duplicar una fila existente
  const handleCloneRow = (acc: ChartOfAccount) => {
    const tempId = 'new_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const cloned: ChartOfAccount = {
      ...acc,
      id: tempId,
      code: acc.code ? acc.code + '_COPIA' : '',
      name: acc.name ? acc.name + ' (COPIA)' : '',
      createdAt: new Date().toISOString()
    };

    setAccounts(prev => [cloned, ...prev]);
    setDirtyRowIds(prev => new Set(prev).add(tempId));
    showNotice('success', `Fila clonada. Ajusta el código y nombre antes de guardar.`);
  };

  // Eliminar una fila
  const handleDeleteRow = async (id: string, code: string) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la cuenta ${code || 'seleccionada'}?`)) return;

    if (id.startsWith('new_') || id.startsWith('imported_')) {
      setAccounts(prev => prev.filter(a => a.id !== id));
      setDirtyRowIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }

    try {
      // Verificar si la cuenta tiene imputaciones en comprobantes antes de eliminar
      const vSnap = await getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'vouchers'));
      const hasImputations = vSnap.docs.some(docSnap => {
        const vData = docSnap.data();
        if (vData.status === 'Anulado') return false;
        return (vData.lines || []).some((l: any) => l.accountId === id || (code && l.accountCode === code));
      });

      if (hasImputations) {
        showNotice('error', `🔒 Protección de Integridad: No se puede eliminar la cuenta ${code} porque registra imputaciones en comprobantes contables.`);
        return;
      }

      await deleteDoc(doc(db, 'studies', studyId, 'companies', company.id, 'chartOfAccounts', id));
      setAccounts(prev => prev.filter(a => a.id !== id));
      setDirtyRowIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showNotice('success', `Cuenta ${code} eliminada correctamente.`);
    } catch (err: any) {
      console.error("Error deleting account:", err);
      showNotice('error', 'Error al eliminar cuenta: ' + err.message);
    }
  };

  // Guardar Todos los Cambios (con Anti-Double Click)
  const handleSaveAll = async () => {
    if (isSaving) return; // Anti-double click protection

    // Validar filas modificadas
    const dirtyAccounts = accounts.filter(a => dirtyRowIds.has(a.id));
    if (dirtyAccounts.length === 0) {
      showNotice('success', 'No hay cambios pendientes por guardar.');
      return;
    }

    for (const acc of dirtyAccounts) {
      if (!acc.code || !acc.code.trim()) {
        showNotice('error', 'Existe una cuenta sin COD_CTA. Todas las cuentas deben tener código.');
        return;
      }
      if (!acc.name || !acc.name.trim()) {
        showNotice('error', `La cuenta con código "${acc.code}" no tiene NOMBRE_CTA.`);
        return;
      }
    }

    // Verificar duplicados de código
    const codes = accounts.map(a => a.code.trim().toUpperCase());
    const duplicates = codes.filter((item, index) => codes.indexOf(item) !== index);
    if (duplicates.length > 0) {
      showNotice('error', `Existen códigos duplicados en el plan: ${[...new Set(duplicates)].join(', ')}.`);
      return;
    }

    // Verificar integridad para cuentas modificadas existentes
    try {
      const vSnap = await getDocs(collection(db, 'studies', studyId, 'companies', company.id, 'vouchers'));
      const activeVouchers = vSnap.docs.map(d => d.data()).filter(v => v.status !== 'Anulado');

      for (const acc of dirtyAccounts) {
        if (!acc.id.startsWith('new_') && !acc.id.startsWith('imported_')) {
          const hasImputations = activeVouchers.some(v =>
            (v.lines || []).some((l: any) => l.accountId === acc.id || l.accountCode === acc.code)
          );
          if (hasImputations && acc.isImputable === false) {
            showNotice('error', `🔒 Protección de Integridad: No se puede cambiar a NO IMPUTABLE la cuenta "${acc.code}" porque tiene movimientos en comprobantes.`);
            return;
          }
        }
      }
    } catch (e) {
      console.warn("Error checking voucher integrity:", e);
    }

    setIsSaving(true);
    try {
      const colRef = collection(db, 'studies', studyId, 'companies', company.id, 'chartOfAccounts');

      // Chunk dirtyAccounts into batches of 400 (Firestore allows max 500 ops per batch)
      const chunkSize = 400;
      for (let i = 0; i < dirtyAccounts.length; i += chunkSize) {
        const chunk = dirtyAccounts.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const acc of chunk) {
          const isTempId = acc.id.startsWith('new_') || acc.id.startsWith('imported_');
          const docData = {
            code: acc.code.trim().toUpperCase(),
            name: acc.name.trim().toUpperCase(),
            type: acc.type || inferTypeFromBalance(acc.blce8Columnas || 'ACTIVO', acc.code),
            isImputable: acc.isImputable ?? true,
            moneda: acc.moneda || 'CLP',
            requiereAuxiliarRUT: !!acc.requiereAuxiliarRUT,
            requiereConciliacionBancaria: !!acc.requiereConciliacionBancaria,
            requiereDocumento: !!acc.requiereDocumento,
            requiereVencimiento: !!acc.requiereVencimiento,
            requiereCentroCosto: !!acc.requiereCentroCosto,
            requiereItemGasto: !!acc.requiereItemGasto,
            requiereProyecto: !!acc.requiereProyecto,
            requiereProducto: !!acc.requiereProducto,
            esActivoFijo: !!acc.esActivoFijo,
            requiereCMonetaria: !!acc.requiereCMonetaria,
            requiereDifCambio: !!acc.requiereDifCambio,
            blce8Columnas: (acc.blce8Columnas || 'ACTIVO').toUpperCase(),
            codigoIFRS: (acc.codigoIFRS || '').trim(),
            customAttributes: acc.customAttributes || {},
            estado: acc.estado || 'Activo',
            creationMode: acc.creationMode || (isTempId ? (acc.id.startsWith('imported_') ? 'IMPORTACION_MASIVA' : 'MANUAL') : 'MANUAL'),
            updatedAt: new Date().toISOString()
          };

          if (isTempId) {
            const newDoc = doc(colRef);
            batch.set(newDoc, { ...docData, createdAt: acc.createdAt || new Date().toISOString() });
          } else {
            const existingDoc = doc(colRef, acc.id);
            batch.set(existingDoc, docData, { merge: true });
          }
        }

        await batch.commit();
      }

      showNotice('success', `¡${dirtyAccounts.length} cuenta(s) guardada(s) exitosamente en la base de datos!`);
      await fetchAccounts();
    } catch (err: any) {
      console.error("Error saving accounts batch:", err);
      showNotice('error', 'Error al guardar los cambios: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Cargar Plan Estándar Chileno
  const handleLoadStandardPlan = async () => {
    if (!window.confirm('¿Deseas cargar el Plan Estándar Chileno (30+ cuentas esenciales configuradas con los 17 atributos)? Se mantendrán las cuentas actuales que no coincidan en código.')) {
      return;
    }

    setIsSaving(true);
    try {
      const colRef = collection(db, 'studies', studyId, 'companies', company.id, 'chartOfAccounts');
      const chunkSize = 400;

      for (let i = 0; i < STANDARD_CHILEAN_ACCOUNTS_PRESET.length; i += chunkSize) {
        const chunk = STANDARD_CHILEAN_ACCOUNTS_PRESET.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const std of chunk) {
          const existing = accounts.find(a => a.code === std.code);
          const data = {
            code: std.code!,
            name: std.name!,
            type: std.type!,
            isImputable: std.isImputable ?? true,
            moneda: std.moneda || 'CLP',
            requiereAuxiliarRUT: !!std.requiereAuxiliarRUT,
            requiereConciliacionBancaria: !!std.requiereConciliacionBancaria,
            requiereDocumento: !!std.requiereDocumento,
            requiereVencimiento: !!std.requiereVencimiento,
            requiereCentroCosto: !!std.requiereCentroCosto,
            requiereItemGasto: !!std.requiereItemGasto,
            requiereProyecto: !!std.requiereProyecto,
            requiereProducto: !!std.requiereProducto,
            esActivoFijo: !!std.esActivoFijo,
            requiereCMonetaria: !!std.requiereCMonetaria,
            requiereDifCambio: !!std.requiereDifCambio,
            blce8Columnas: std.blce8Columnas || 'ACTIVO',
            codigoIFRS: std.codigoIFRS || '',
            customAttributes: {},
            estado: 'Activo',
            creationMode: 'SISTEMA',
            updatedAt: new Date().toISOString()
          };

          if (existing && !existing.id.startsWith('new_') && !existing.id.startsWith('imported_')) {
            batch.set(doc(colRef, existing.id), data, { merge: true });
          } else {
            batch.set(doc(colRef), { ...data, createdAt: new Date().toISOString() });
          }
        }

        await batch.commit();
      }

      showNotice('success', '¡Plan Estándar Chileno cargado y guardado exitosamente!');
      await fetchAccounts();
    } catch (err: any) {
      console.error("Error loading standard plan:", err);
      showNotice('error', 'Error al cargar plan estándar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Agregar Columna de Análisis Dinámica
  const handleAddCustomColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingColumn) return; // Anti-double click

    const cleanName = newColumnName.trim().toUpperCase();
    if (!cleanName) return;

    if (STANDARD_GRID_COLUMNS.some(c => c.label === cleanName) || customColumns.includes(cleanName)) {
      alert(`La columna "${cleanName}" ya existe.`);
      return;
    }

    setIsAddingColumn(true);
    try {
      const updatedCols = [...customColumns, cleanName];
      await updateDoc(doc(db, 'studies', studyId, 'companies', company.id), {
        customAccountColumns: updatedCols
      });
      setCustomColumns(updatedCols);
      setNewColumnName('');
      setShowAddColumnModal(false);
      showNotice('success', `Columna de análisis "${cleanName}" agregada exitosamente a la grilla y base de datos.`);
      onRefreshCompany?.();
    } catch (err: any) {
      console.error("Error adding custom column:", err);
      showNotice('error', 'Error al agregar columna: ' + err.message);
    } finally {
      setIsAddingColumn(false);
    }
  };

  // Eliminar Columna de Análisis Dinámica
  const handleRemoveCustomColumn = async (colName: string) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la columna de análisis "${colName}" de la grilla?`)) return;

    try {
      const updatedCols = customColumns.filter(c => c !== colName);
      await updateDoc(doc(db, 'studies', studyId, 'companies', company.id), {
        customAccountColumns: updatedCols
      });
      setCustomColumns(updatedCols);
      showNotice('success', `Columna "${colName}" eliminada.`);
      onRefreshCompany?.();
    } catch (err: any) {
      console.error("Error removing custom column:", err);
      showNotice('error', 'Error al eliminar columna: ' + err.message);
    }
  };

  // Exportar Plan a Excel (.xlsx)
  const handleExportToExcel = () => {
    try {
      const rows = accounts.map(acc => {
        const row: Record<string, any> = {
          'COD_CTA': acc.code,
          'NOMBRE_CTA': acc.name,
          'IMPUTABLE': acc.isImputable !== false ? 'SI' : 'NO',
          'MONEDA': acc.moneda || 'CLP',
          'REQUIERE AUXILIAR': acc.requiereAuxiliarRUT ? 'SI' : 'NO',
          'REQUIERE CONCILIACION': acc.requiereConciliacionBancaria ? 'SI' : 'NO',
          'REQUIERE DOCUMENTO': acc.requiereDocumento ? 'SI' : 'NO',
          'REQUIERE VENCIMIENTO': acc.requiereVencimiento ? 'SI' : 'NO',
          'REQUIERE CENTRO_COSTO': acc.requiereCentroCosto ? 'SI' : 'NO',
          'REQUIERE ITEM_GASTO': acc.requiereItemGasto ? 'SI' : 'NO',
          'REQUIERE PROYECTO': acc.requiereProyecto ? 'SI' : 'NO',
          'REQUIERE PRODUCTO': acc.requiereProducto ? 'SI' : 'NO',
          'ES ACTIVO FIJO': acc.esActivoFijo ? 'SI' : 'NO',
          'REQUIERE C. MONETARIA': acc.requiereCMonetaria ? 'SI' : 'NO',
          'REQUIERE DIF. CAMBIO': acc.requiereDifCambio ? 'SI' : 'NO',
          'BLCE 8 COLUM': (acc.blce8Columnas || 'ACTIVO').toUpperCase(),
          'IFRS': acc.codigoIFRS || ''
        };

        // Agregar columnas personalizadas
        customColumns.forEach(c => {
          const val = acc.customAttributes?.[c];
          row[c] = val === true ? 'SI' : val === false ? 'NO' : (val || '');
        });

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plan_de_Cuentas');
      XLSX.writeFile(wb, `Plan_Cuentas_${company.rut || company.name}_v1.2.xlsx`);
      showNotice('success', 'Plan de cuentas exportado exitosamente a Excel.');
    } catch (err: any) {
      console.error("Error exporting to excel:", err);
      showNotice('error', 'Error al exportar a Excel: ' + err.message);
    }
  };

  // Descargar Plantilla Excel (.xlsx)
  const handleDownloadTemplate = () => {
    try {
      const sampleRows = STANDARD_CHILEAN_ACCOUNTS_PRESET.slice(0, 10).map(acc => {
        const row: Record<string, any> = {
          'COD_CTA': acc.code,
          'NOMBRE_CTA': acc.name,
          'IMPUTABLE': acc.isImputable !== false ? 'SI' : 'NO',
          'MONEDA': acc.moneda || 'CLP',
          'REQUIERE AUXILIAR': acc.requiereAuxiliarRUT ? 'SI' : 'NO',
          'REQUIERE CONCILIACION': acc.requiereConciliacionBancaria ? 'SI' : 'NO',
          'REQUIERE DOCUMENTO': acc.requiereDocumento ? 'SI' : 'NO',
          'REQUIERE VENCIMIENTO': acc.requiereVencimiento ? 'SI' : 'NO',
          'REQUIERE CENTRO_COSTO': acc.requiereCentroCosto ? 'SI' : 'NO',
          'REQUIERE ITEM_GASTO': acc.requiereItemGasto ? 'SI' : 'NO',
          'REQUIERE PROYECTO': acc.requiereProyecto ? 'SI' : 'NO',
          'REQUIERE PRODUCTO': acc.requiereProducto ? 'SI' : 'NO',
          'ES ACTIVO FIJO': acc.esActivoFijo ? 'SI' : 'NO',
          'REQUIERE C. MONETARIA': acc.requiereCMonetaria ? 'SI' : 'NO',
          'REQUIERE DIF. CAMBIO': acc.requiereDifCambio ? 'SI' : 'NO',
          'BLCE 8 COLUM': (acc.blce8Columnas || 'ACTIVO').toUpperCase(),
          'IFRS': acc.codigoIFRS || ''
        };

        customColumns.forEach(c => {
          row[c] = 'NO';
        });

        return row;
      });

      const ws = XLSX.utils.json_to_sheet(sampleRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Plan_Cuentas');
      XLSX.writeFile(wb, `Plantilla_Plan_Cuentas_17_Columnas.xlsx`);
      showNotice('success', 'Plantilla oficial de 17 columnas descargada.');
    } catch (err: any) {
      console.error("Error downloading template:", err);
      showNotice('error', 'Error al descargar plantilla: ' + err.message);
    }
  };

  // Carga Masiva desde archivo Excel (.xlsx o .csv)
  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rawData.length === 0) {
          showNotice('error', 'El archivo Excel no contiene filas.');
          return;
        }

        const parseBool = (val: any) => {
          if (typeof val === 'boolean') return val;
          const s = String(val).trim().toUpperCase();
          return s === 'SI' || s === 'S' || s === 'YES' || s === 'TRUE' || s === '1';
        };

        const importedAccounts: ChartOfAccount[] = [];
        const detectedCustomCols: Set<string> = new Set();

        rawData.forEach((row, idx) => {
          // Buscar columna de código
          const code = String(row['COD_CTA'] || row['CODIGO'] || row['CODIGO_CUENTA'] || row['Cuenta'] || row['Codigo'] || '').trim().toUpperCase();
          const name = String(row['NOMBRE_CTA'] || row['NOMBRE'] || row['DESCRIPCION'] || row['Descripcion'] || '').trim().toUpperCase();

          if (!code || !name) return; // Omitir filas en blanco o inválidas

          const isImputable = row['IMPUTABLE'] !== '' ? parseBool(row['IMPUTABLE']) : true;
          const moneda = String(row['MONEDA'] || 'CLP').trim().toUpperCase();
          const blce8 = String(row['BLCE 8 COLUM'] || row['BALANCE'] || row['TIPO'] || 'ACTIVO').trim().toUpperCase();
          const ifrs = String(row['IFRS'] || row['CODIGO_IFRS'] || '').trim();

          const customAttrs: Record<string, any> = {};

          // Detectar columnas adicionales
          Object.keys(row).forEach(key => {
            const normalizedKey = key.trim().toUpperCase();
            if (
              !['COD_CTA', 'CODIGO', 'CODIGO_CUENTA', 'CUENTA', 'NOMBRE_CTA', 'NOMBRE', 'DESCRIPCION',
                'IMPUTABLE', 'MONEDA', 'REQUIERE AUXILIAR', 'REQUIERE CONCILIACION', 'REQUIERE DOCUMENTO',
                'REQUIERE VENCIMIENTO', 'REQUIERE CENTRO_COSTO', 'REQUIERE ITEM_GASTO', 'REQUIERE PROYECTO',
                'REQUIERE PRODUCTO', 'ES ACTIVO FIJO', 'REQUIERE C. MONETARIA', 'REQUIERE DIF. CAMBIO',
                'BLCE 8 COLUM', 'BALANCE', 'TIPO', 'IFRS', 'CODIGO_IFRS'].includes(normalizedKey)
            ) {
              detectedCustomCols.add(normalizedKey);
              const val = row[key];
              customAttrs[normalizedKey] = (String(val).toUpperCase() === 'SI' || String(val).toUpperCase() === 'NO')
                ? parseBool(val)
                : val;
            }
          });

          importedAccounts.push({
            id: 'imported_' + idx + '_' + Date.now(),
            code,
            name,
            type: inferTypeFromBalance(blce8, code),
            isImputable,
            moneda,
            requiereAuxiliarRUT: parseBool(row['REQUIERE AUXILIAR'] || row['AUXILIAR']),
            requiereConciliacionBancaria: parseBool(row['REQUIERE CONCILIACION'] || row['CONCILIACION']),
            requiereDocumento: parseBool(row['REQUIERE DOCUMENTO'] || row['DOCUMENTO']),
            requiereVencimiento: parseBool(row['REQUIERE VENCIMIENTO'] || row['VENCIMIENTO']),
            requiereCentroCosto: parseBool(row['REQUIERE CENTRO_COSTO'] || row['CENTRO_COSTO']),
            requiereItemGasto: parseBool(row['REQUIERE ITEM_GASTO'] || row['ITEM_GASTO']),
            requiereProyecto: parseBool(row['REQUIERE PROYECTO'] || row['PROYECTO']),
            requiereProducto: parseBool(row['REQUIERE PRODUCTO'] || row['PRODUCTO']),
            esActivoFijo: parseBool(row['ES ACTIVO FIJO'] || row['ACTIVO_FIJO']),
            requiereCMonetaria: parseBool(row['REQUIERE C. MONETARIA'] || row['C_MONETARIA']),
            requiereDifCambio: parseBool(row['REQUIERE DIF. CAMBIO'] || row['DIF_CAMBIO']),
            blce8Columnas: blce8,
            codigoIFRS: ifrs,
            customAttributes: customAttrs,
            estado: 'Activo',
            creationMode: 'IMPORTACION_MASIVA',
            createdAt: new Date().toISOString()
          });
        });

        if (importedAccounts.length === 0) {
          showNotice('error', 'No se encontraron cuentas válidas con COD_CTA y NOMBRE_CTA en el archivo.');
          return;
        }

        // Si se detectaron nuevas columnas de análisis, registrarlas en la empresa
        const newColsArray = Array.from(detectedCustomCols);
        const combinedCols = Array.from(new Set([...customColumns, ...newColsArray]));
        if (combinedCols.length !== customColumns.length) {
          await updateDoc(doc(db, 'studies', studyId, 'companies', company.id), {
            customAccountColumns: combinedCols
          });
          setCustomColumns(combinedCols);
        }

        // Combinar en la grilla y marcar como sucias para guardar
        const mergedList = [...accounts];
        const newDirtySet = new Set(dirtyRowIds);

        importedAccounts.forEach(imp => {
          const existingIdx = mergedList.findIndex(a => a.code === imp.code);
          if (existingIdx >= 0) {
            mergedList[existingIdx] = { ...mergedList[existingIdx], ...imp, id: mergedList[existingIdx].id };
            newDirtySet.add(mergedList[existingIdx].id);
          } else {
            mergedList.push(imp);
            newDirtySet.add(imp.id);
          }
        });

        mergedList.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
        setAccounts(mergedList);
        setDirtyRowIds(newDirtySet);
        showNotice('success', `¡${importedAccounts.length} cuentas importadas a la grilla! Haz clic en "Guardar Todo" para persistir en la base de datos.`);
      } catch (err: any) {
        console.error("Error parsing excel file:", err);
        showNotice('error', 'Error al procesar el archivo Excel: ' + err.message);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Filtrado reactivo en la grilla
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = !q ||
        acc.code?.toLowerCase().includes(q) ||
        acc.name?.toLowerCase().includes(q) ||
        acc.codigoIFRS?.toLowerCase().includes(q) ||
        acc.blce8Columnas?.toLowerCase().includes(q);

      const matchesType = filterType === 'ALL' ||
        (acc.blce8Columnas || '').toUpperCase() === filterType ||
        (acc.type || '').toUpperCase() === filterType;

      const matchesImputable = filterImputable === 'ALL' ||
        (filterImputable === 'SI' && acc.isImputable !== false) ||
        (filterImputable === 'NO' && acc.isImputable === false);

      // Filtros por columna en encabezado
      if (columnFilters.code && !acc.code?.toLowerCase().includes(columnFilters.code.toLowerCase())) return false;
      if (columnFilters.name && !acc.name?.toLowerCase().includes(columnFilters.name.toLowerCase())) return false;
      if (columnFilters.isImputable && columnFilters.isImputable !== 'ALL') {
        const isImp = acc.isImputable !== false ? 'SI' : 'NO';
        if (isImp !== columnFilters.isImputable) return false;
      }
      if (columnFilters.moneda && !acc.moneda?.toLowerCase().includes(columnFilters.moneda.toLowerCase())) return false;
      
      const checkBoolCol = (val: boolean | undefined, filterVal: string) => {
        if (!filterVal || filterVal === 'ALL') return true;
        return filterVal === 'SI' ? val === true : !val;
      };

      if (!checkBoolCol(acc.requiereAuxiliarRUT, columnFilters.reqAux)) return false;
      if (!checkBoolCol(acc.requiereConciliacionBancaria, columnFilters.reqConcil)) return false;
      if (!checkBoolCol(acc.requiereDocumento, columnFilters.reqDoc)) return false;
      if (!checkBoolCol(acc.requiereVencimiento, columnFilters.reqVcto)) return false;
      if (!checkBoolCol(acc.requiereCentroCosto, columnFilters.reqCCosto)) return false;
      if (!checkBoolCol(acc.requiereItemGasto, columnFilters.reqItem)) return false;
      if (!checkBoolCol(acc.requiereProyecto, columnFilters.reqProy)) return false;
      if (!checkBoolCol(acc.requiereProducto, columnFilters.reqProd)) return false;
      if (!checkBoolCol(acc.esActivoFijo, columnFilters.actFijo)) return false;
      if (!checkBoolCol(acc.requiereCMonetaria, columnFilters.cMonet)) return false;
      if (!checkBoolCol(acc.requiereDifCambio, columnFilters.difCambio)) return false;

      if (columnFilters.blce8 && columnFilters.blce8 !== 'ALL') {
        if ((acc.blce8Columnas || '').toUpperCase() !== columnFilters.blce8.toUpperCase()) return false;
      }
      if (columnFilters.ifrs && !acc.codigoIFRS?.toLowerCase().includes(columnFilters.ifrs.toLowerCase())) return false;

      return matchesSearch && matchesType && matchesImputable;
    });
  }, [accounts, searchTerm, filterType, filterImputable, columnFilters]);

  return (
    <div className="space-y-4">
      {/* NOTIFICACIONES */}
      {notification && (
        <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-sm transition-all ${
          notification.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* BARRA SUPERIOR DE HERRAMIENTAS Y ACCIONES EXCEL */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Lado Izquierdo: Resumen y Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
            <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">Plan de Cuentas (Grilla 17 Atributos + Análisis)</h3>
              <p className="text-[11px] text-slate-500 font-mono">{accounts.length} Cuentas Registradas &bull; {customColumns.length} Columnas Dinámicas</p>
            </div>
          </div>

          {/* Buscador */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por código, nombre o IFRS..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg w-64 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Filtro Balance */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700 outline-none"
          >
            <option value="ALL">Todos los Balances</option>
            <option value="ACTIVO">Activo</option>
            <option value="PASIVO">Pasivo</option>
            <option value="PERDIDA">Pérdida (Gasto)</option>
            <option value="GANANCIA">Ganancia (Ingreso)</option>
          </select>

          {/* Filtro Imputable */}
          <select
            value={filterImputable}
            onChange={e => setFilterImputable(e.target.value)}
            className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-700 outline-none"
          >
            <option value="ALL">Imputables y Título</option>
            <option value="SI">Solo Imputables (SI)</option>
            <option value="NO">Solo Cuentas de Título (NO)</option>
          </select>
        </div>

        {/* Lado Derecho: Botones de Acción */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Agregar Fila */}
          <button
            onClick={handleAddRow}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" />
            <span>Nueva Fila</span>
          </button>

          {/* Botón Agregar Columna de Análisis */}
          <button
            onClick={() => setShowAddColumnModal(true)}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-lg border border-indigo-200 shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>+ Columna Análisis</span>
          </button>

          {/* Plantilla Excel */}
          <button
            onClick={handleDownloadTemplate}
            title="Descargar plantilla Excel con las 17 columnas"
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Plantilla</span>
          </button>

          {/* Importar Excel */}
          <label className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5 text-emerald-600" />
            <span>Cargar Excel</span>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleImportExcel} className="hidden" />
          </label>

          {/* Exportar Excel */}
          <button
            onClick={handleExportToExcel}
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-200 shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Exportar Excel</span>
          </button>

          {/* Plan Estándar Chileno */}
          <button
            onClick={handleLoadStandardPlan}
            disabled={isSaving}
            title="Cargar catálogo estándar chileno de cuentas con 17 atributos"
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-lg border border-amber-300 shadow-2xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-700 ${isSaving ? 'animate-spin' : ''}`} />
            <span>Plan Estándar</span>
          </button>

          {/* GUARDAR TODO */}
          <button
            onClick={handleSaveAll}
            disabled={isSaving || dirtyRowIds.size === 0}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all ${
              dirtyRowIds.size > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white ring-2 ring-emerald-300 animate-pulse'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Guardando...' : `Guardar Todo (${dirtyRowIds.size})`}</span>
          </button>
        </div>
      </div>

      {/* TABLA ESTILO HOJA DE CÁLCULO EXCEL */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-xs text-left border-collapse font-sans select-none">
            <thead>
              {/* TÍTULOS DE ATRIBUTOS (17 COLUMNAS OFICIALES) */}
              <tr className="bg-slate-800 text-white text-[11px] font-bold tracking-tight border-b border-slate-900 sticky top-0 z-10 shadow-xs">
                <th className="w-12 px-2 py-2 text-center bg-slate-900 border-r border-slate-700">N°</th>
                <th className="w-28 px-2 py-2 border-r border-slate-700 font-mono">COD_CTA *</th>
                <th className="w-56 px-2 py-2 border-r border-slate-700">NOMBRE_CTA *</th>
                <th className="w-20 px-2 py-2 text-center border-r border-slate-700">IMPUTABLE</th>
                <th className="w-20 px-2 py-2 text-center border-r border-slate-700">MONEDA</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">REQ. AUXILIAR</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">REQ. CONCIL.</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">REQ. DOC.</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">REQ. VCTO.</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">REQ. C.COSTO</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">REQ. ITEM</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">REQ. PROY.</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">REQ. PROD.</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">ACTIVO FIJO</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">C. MONET.</th>
                <th className="w-24 px-2 py-2 text-center border-r border-slate-700">DIF. CAMBIO</th>
                <th className="w-28 px-2 py-2 text-center border-r border-slate-700">BLCE 8 COLUM</th>
                <th className="w-20 px-2 py-2 text-center border-r border-slate-700">IFRS</th>
                {/* Columnas Dinámicas */}
                {customColumns.map(col => (
                  <th key={col} className="w-28 px-2 py-2 text-center border-r border-slate-700 bg-indigo-900 text-indigo-200 relative group">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate" title={col}>{col}</span>
                      <button
                        onClick={() => handleRemoveCustomColumn(col)}
                        className="text-indigo-400 hover:text-rose-300 opacity-70 hover:opacity-100 p-0.5"
                        title={`Eliminar columna ${col}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="w-16 px-2 py-2 text-center bg-slate-900">ACCIONES</th>
              </tr>

              {/* FILA DE FILTROS EN ENCABEZADOS DE COLUMNA */}
              <tr className="bg-slate-900 text-slate-200 text-[10px] border-b-2 border-slate-900 sticky top-[33px] z-10 shadow-xs">
                <th className="p-1 text-center bg-slate-950 border-r border-slate-800 font-mono text-slate-500">🔍</th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar cda..."
                    value={columnFilters.code || ''}
                    onChange={e => setColumnFilters(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 placeholder-slate-500 px-1.5 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400 font-mono"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="Filtrar nombre..."
                    value={columnFilters.name || ''}
                    onChange={e => setColumnFilters(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 placeholder-slate-500 px-1.5 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                <th className="p-1 border-r border-slate-800">
                  <select
                    value={columnFilters.isImputable || 'ALL'}
                    onChange={e => setColumnFilters(prev => ({ ...prev, isImputable: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="ALL">Todos</option>
                    <option value="SI">SI</option>
                    <option value="NO">NO</option>
                  </select>
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="CLP..."
                    value={columnFilters.moneda || ''}
                    onChange={e => setColumnFilters(prev => ({ ...prev, moneda: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 placeholder-slate-500 px-1 py-0.5 rounded text-[10px] text-center outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                {['reqAux', 'reqConcil', 'reqDoc', 'reqVcto', 'reqCCosto', 'reqItem', 'reqProy', 'reqProd', 'actFijo', 'cMonet', 'difCambio'].map(fKey => (
                  <th key={fKey} className="p-1 border-r border-slate-800">
                    <select
                      value={columnFilters[fKey] || 'ALL'}
                      onChange={e => setColumnFilters(prev => ({ ...prev, [fKey]: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-0.5 py-0.5 rounded text-[10px] text-center outline-none focus:ring-1 focus:ring-emerald-400"
                    >
                      <option value="ALL">-</option>
                      <option value="SI">SI</option>
                      <option value="NO">NO</option>
                    </select>
                  </th>
                ))}
                <th className="p-1 border-r border-slate-800">
                  <select
                    value={columnFilters.blce8 || 'ALL'}
                    onChange={e => setColumnFilters(prev => ({ ...prev, blce8: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 px-0.5 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ACTIVO">Activo</option>
                    <option value="PASIVO">Pasivo</option>
                    <option value="PERDIDA">Pérdida</option>
                    <option value="GANANCIA">Ganancia</option>
                  </select>
                </th>
                <th className="p-1 border-r border-slate-800">
                  <input
                    type="text"
                    placeholder="IFRS..."
                    value={columnFilters.ifrs || ''}
                    onChange={e => setColumnFilters(prev => ({ ...prev, ifrs: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 placeholder-slate-500 px-1 py-0.5 rounded text-[10px] outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </th>
                {customColumns.map(col => (
                  <th key={col} className="p-1 border-r border-slate-800 bg-indigo-950">
                    <input
                      type="text"
                      placeholder="Filtro..."
                      onChange={e => {
                        const val = e.target.value.toLowerCase();
                        setColumnFilters(prev => ({ ...prev, [`custom_${col}`]: val }));
                      }}
                      className="w-full bg-slate-900 border border-indigo-700 text-indigo-200 placeholder-indigo-400 px-1 py-0.5 rounded text-[10px] outline-none"
                    />
                  </th>
                ))}
                <th className="p-1 bg-slate-950 text-center">
                  {Object.keys(columnFilters).some(k => columnFilters[k] && columnFilters[k] !== 'ALL') && (
                    <button
                      onClick={() => setColumnFilters({})}
                      className="text-[9px] bg-rose-900/80 hover:bg-rose-800 text-rose-200 px-1 py-0.5 rounded font-bold"
                      title="Limpiar Filtros"
                    >
                      X
                    </button>
                  )}
                </th>
              </tr>
            </thead>

            {/* CUERPO DE LA GRILLA */}
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={19 + customColumns.length} className="p-8 text-center text-slate-500 font-medium">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                      <span>Cargando matriz contable...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={19 + customColumns.length} className="p-8 text-center text-slate-400">
                    <p className="font-semibold text-sm text-slate-700 mb-1">No hay cuentas en la grilla</p>
                    <p className="text-xs text-slate-500 mb-3">Puedes agregar filas manualmente, cargar el Plan Estándar Chileno o importar un archivo Excel.</p>
                    <div className="flex justify-center gap-2">
                      <button onClick={handleAddRow} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Agregar Fila
                      </button>
                      <button onClick={handleLoadStandardPlan} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1">
                        <RefreshCw className="w-3.5 h-3.5" /> Cargar Plan Estándar
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc, index) => {
                  const isDirty = dirtyRowIds.has(acc.id);
                  const isTitleAccount = acc.isImputable === false;

                  return (
                    <tr
                      key={acc.id}
                      className={`hover:bg-amber-50/40 transition-colors ${
                        isDirty ? 'bg-amber-50/60 font-medium' : isTitleAccount ? 'bg-slate-100/70 font-semibold' : 'bg-white'
                      }`}
                    >
                      {/* Índice */}
                      <td className="px-2 py-1.5 text-center font-mono text-[10px] text-slate-400 bg-slate-50 border-r border-slate-200">
                        {index + 1}
                        {isDirty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-1" title="Cambio no guardado" />}
                      </td>

                      {/* A: COD_CTA */}
                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="text"
                          value={acc.code || ''}
                          onChange={e => handleCellChange(acc.id, 'code', e.target.value.toUpperCase())}
                          placeholder="1101001"
                          readOnly={!acc.id.startsWith('new_') && !acc.id.startsWith('imported_')}
                          title={(!acc.id.startsWith('new_') && !acc.id.startsWith('imported_')) ? 'El código de cuenta es inmutable para preservar la integridad de los comprobantes registrados.' : ''}
                          className={`w-full px-2 py-1 font-mono font-bold text-xs rounded outline-none ${
                            (!acc.id.startsWith('new_') && !acc.id.startsWith('imported_'))
                              ? 'bg-slate-100/80 text-slate-500 cursor-not-allowed border-slate-200'
                              : isTitleAccount ? 'text-indigo-900 bg-transparent focus:bg-white focus:ring-1 focus:ring-emerald-500' : 'text-slate-900 bg-transparent focus:bg-white focus:ring-1 focus:ring-emerald-500'
                          }`}
                        />
                      </td>

                      {/* B: NOMBRE_CTA */}
                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="text"
                          value={acc.name || ''}
                          onChange={e => handleCellChange(acc.id, 'name', e.target.value.toUpperCase())}
                          placeholder="NOMBRE DE LA CUENTA"
                          className={`w-full px-2 py-1 text-xs bg-transparent rounded outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500 ${
                            isTitleAccount ? 'font-bold text-slate-900' : 'text-slate-800'
                          }`}
                        />
                      </td>

                      {/* C: IMPUTABLE */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <select
                          value={acc.isImputable !== false ? 'SI' : 'NO'}
                          onChange={e => handleCellChange(acc.id, 'isImputable', e.target.value === 'SI')}
                          className={`px-1.5 py-0.5 rounded text-[11px] font-bold outline-none cursor-pointer ${
                            acc.isImputable !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          <option value="SI">SI</option>
                          <option value="NO">NO</option>
                        </select>
                      </td>

                      {/* D: MONEDA */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <select
                          value={acc.moneda || 'CLP'}
                          onChange={e => handleCellChange(acc.id, 'moneda', e.target.value)}
                          className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-50 border border-slate-200 text-slate-800 outline-none cursor-pointer"
                        >
                          <option value="CLP">CLP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="UF">UF</option>
                        </select>
                      </td>

                      {/* E: REQUIERE AUXILIAR */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereAuxiliarRUT', !acc.requiereAuxiliarRUT)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereAuxiliarRUT ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereAuxiliarRUT ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* F: REQUIERE CONCILIACION */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereConciliacionBancaria', !acc.requiereConciliacionBancaria)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereConciliacionBancaria ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereConciliacionBancaria ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* G: REQUIERE DOCUMENTO */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereDocumento', !acc.requiereDocumento)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereDocumento ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereDocumento ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* H: REQUIERE VENCIMIENTO */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereVencimiento', !acc.requiereVencimiento)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereVencimiento ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereVencimiento ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* I: REQUIERE CENTRO_COSTO */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereCentroCosto', !acc.requiereCentroCosto)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereCentroCosto ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereCentroCosto ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* J: REQUIERE ITEM_GASTO */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereItemGasto', !acc.requiereItemGasto)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereItemGasto ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereItemGasto ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* K: REQUIERE PROYECTO */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereProyecto', !acc.requiereProyecto)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereProyecto ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereProyecto ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* L: REQUIERE PRODUCTO */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereProducto', !acc.requiereProducto)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereProducto ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereProducto ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* M: ES ACTIVO FIJO */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'esActivoFijo', !acc.esActivoFijo)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.esActivoFijo ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.esActivoFijo ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* N: REQUIERE C. MONETARIA */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereCMonetaria', !acc.requiereCMonetaria)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereCMonetaria ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereCMonetaria ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* O: REQUIERE DIF. CAMBIO */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleCellChange(acc.id, 'requiereDifCambio', !acc.requiereDifCambio)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            acc.requiereDifCambio ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {acc.requiereDifCambio ? 'SI' : 'NO'}
                        </button>
                      </td>

                      {/* P: BLCE 8 COLUM */}
                      <td className="p-1 text-center border-r border-slate-200">
                        <select
                          value={(acc.blce8Columnas || 'ACTIVO').toUpperCase()}
                          onChange={e => handleCellChange(acc.id, 'blce8Columnas', e.target.value)}
                          className={`w-full px-1.5 py-0.5 rounded text-[10px] font-bold outline-none cursor-pointer ${
                            (acc.blce8Columnas || '').toUpperCase() === 'ACTIVO'
                              ? 'bg-blue-100 text-blue-800'
                              : (acc.blce8Columnas || '').toUpperCase() === 'PASIVO'
                              ? 'bg-purple-100 text-purple-800'
                              : (acc.blce8Columnas || '').toUpperCase() === 'PERDIDA'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          <option value="ACTIVO">ACTIVO</option>
                          <option value="PASIVO">PASIVO</option>
                          <option value="PERDIDA">PERDIDA</option>
                          <option value="GANANCIA">GANANCIA</option>
                        </select>
                      </td>

                      {/* Q: IFRS */}
                      <td className="p-1 border-r border-slate-200">
                        <input
                          type="text"
                          value={acc.codigoIFRS || ''}
                          onChange={e => handleCellChange(acc.id, 'codigoIFRS', e.target.value)}
                          placeholder="1101"
                          className="w-full px-1.5 py-1 font-mono text-[11px] text-center bg-transparent rounded outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                        />
                      </td>

                      {/* R, S...: Columnas Dinámicas de Análisis */}
                      {customColumns.map(col => {
                        const cellVal = acc.customAttributes?.[col];
                        const isBool = typeof cellVal === 'boolean' || cellVal === undefined;

                        return (
                          <td key={col} className="p-1 text-center border-r border-slate-200 bg-indigo-50/30">
                            {isBool ? (
                              <button
                                type="button"
                                onClick={() => handleCellChange(acc.id, `custom_${col}`, !cellVal)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                  cellVal ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                              >
                                {cellVal ? 'SI' : 'NO'}
                              </button>
                            ) : (
                              <input
                                type="text"
                                value={cellVal || ''}
                                onChange={e => handleCellChange(acc.id, `custom_${col}`, e.target.value)}
                                className="w-full px-1 py-0.5 text-[11px] text-center bg-white border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            )}
                          </td>
                        );
                      })}

                      {/* Acciones por Fila */}
                      <td className="p-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleCloneRow(acc)}
                            title="Clonar fila"
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-indigo-50 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRow(acc.id, acc.code)}
                            title="Eliminar fila"
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PIE DE TABLA EXCEL */}
        <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-300 flex flex-wrap items-center justify-between text-xs text-slate-600 font-mono">
          <div className="flex items-center gap-4">
            <span>Visualizando: {filteredAccounts.length} de {accounts.length} filas</span>
            {dirtyRowIds.size > 0 && (
              <span className="text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded">
                ● {dirtyRowIds.size} fila(s) con cambios pendientes de guardar
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Presiona "Guardar Todo" para sincronizar la base de datos</span>
          </div>
        </div>
      </div>

      {/* MODAL: AGREGAR COLUMNA DE ANÁLISIS DINÁMICA */}
      {showAddColumnModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                <Layers className="w-5 h-5" />
                <h4>Agregar Columna de Análisis Adicional</h4>
              </div>
              <button onClick={() => setShowAddColumnModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomColumn} className="space-y-4">
              <p className="text-xs text-slate-600">
                Esta columna se integrará de forma permanente a la grilla y la base de datos de <strong>{company.name}</strong>, permitiendo exigir análisis contables personalizados por cada cuenta.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la Columna (Dimensión de Análisis) *</label>
                <input
                  type="text"
                  placeholder="Ej: REQUIERE SUCURSAL, REQUIERE ZONA, REQUIERE LOTE"
                  value={newColumnName}
                  onChange={e => setNewColumnName(e.target.value.toUpperCase())}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-bold font-mono focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                  required
                />
              </div>

              <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-[11px] text-indigo-800 space-y-1">
                <p className="font-semibold">💡 Ejemplos recomendados:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li><code>REQUIERE SUCURSAL</code> (Para estudios con múltiples sedes)</li>
                  <li><code>REQUIERE ZONA_GEOGRAFICA</code> (Para análisis regional)</li>
                  <li><code>REQUIERE CONTRATO</code> (Para constructoras / servicios)</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddColumnModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAddingColumn || !newColumnName.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-bold shadow transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isAddingColumn ? 'Agregando...' : 'Crear Columna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
