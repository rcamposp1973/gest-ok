import React, { useState } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, addDoc, setDoc, doc } from 'firebase/firestore';
import { Company, ChartOfAccount, Auxiliary, Voucher, VoucherLine, FiscalPeriodYear } from '../types';
import { useProcess } from '../context/ProcessContext';
import { logAuditEvent } from '../utils/auditLogger';
import { sanitizeVoucherLines } from '../utils/voucherValidation';
import * as XLSX from 'xlsx';

// Normaliza fechas en formatos DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, DD-MM-YYYY, YYYY/MM/DD o serial de Excel a ISO YYYY-MM-DD
function normalizeDateToIso(val?: any): string {
  if (!val) return '';
  const cleaned = String(val).trim();
  if (!cleaned) return '';

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // YYYY/MM/DD o YYYY/M/D
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // D/M/YYYY o DD/MM/YYYY (Estándar chileno como 3/3/2026)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // D-M-YYYY o DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(cleaned)) {
    const [d, m, y] = cleaned.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Serial numérico de Excel (ej: 45000 a 48000 para años 2023-2031)
  const num = Number(cleaned);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    try {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const targetDate = new Date(excelEpoch.getTime() + num * 86400000);
      return targetDate.toISOString().split('T')[0];
    } catch {
      // Ignorar fallback
    }
  }

  // Intento nativo de fecha si es parseable
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= 2035) {
    return parsed.toISOString().split('T')[0];
  }

  return '';
}

// Normaliza el período a formato YYYY-MM
function normalizePeriod(periodVal?: any, dateIso?: string): string {
  if (periodVal) {
    const p = String(periodVal).trim();
    // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(p)) return p;
    // YYYYMM (ej: 202603)
    if (/^\d{6}$/.test(p)) return `${p.slice(0, 4)}-${p.slice(4, 6)}`;
    // MM/YYYY o M/YYYY (ej: 03/2026 o 3/2026)
    if (/^\d{1,2}\/\d{4}$/.test(p)) {
      const [m, y] = p.split('/');
      return `${y}-${m.padStart(2, '0')}`;
    }
    // MM-YYYY o M-YYYY
    if (/^\d{1,2}-\d{4}$/.test(p)) {
      const [m, y] = p.split('-');
      return `${y}-${m.padStart(2, '0')}`;
    }
  }

  // Derivar de fecha ISO si está disponible
  if (dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return dateIso.slice(0, 7);
  }

  return '';
}

// Limpia montos numéricos de strings con puntos de miles o comas decimales
function parseAmount(val?: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[$ ]/g, '').replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Detecta si una fila está totalmente vacía
function isRowBlank(row: any[]): boolean {
  if (!row || row.length === 0) return true;
  return row.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
}

// Detecta si una fila corresponde a un encabezado de plantilla repetido
function isHeaderRow(row: any[]): boolean {
  if (!row || row.length === 0) return false;
  const first = String(row[0] || '').toLowerCase().trim();
  const second = String(row[1] || '').toLowerCase().trim();
  return (
    first.includes('numero') ||
    first.includes('comprobante') ||
    first.includes('n°') ||
    first.includes('num') ||
    first.includes('codigo') ||
    first.includes('rut') ||
    second.includes('fecha') ||
    second.includes('date') ||
    second.includes('nombre') ||
    second.includes('razon')
  );
}

// Parser CSV seguro que respeta comillas y múltiples delimitadores
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      if (inQuotes && line[i + 1] === char) {
        current += char;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

function detectDelimiter(firstLine: string): string {
  const semiCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  if (semiCount >= commaCount && semiCount >= tabCount && semiCount > 0) return ';';
  if (commaCount > semiCount && commaCount >= tabCount) return ',';
  if (tabCount > 0) return '\t';
  return ';';
}

interface ExcelImportCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  studyId: string;
  company: Company;
  accounts: ChartOfAccount[];
  auxiliaries: Auxiliary[];
  vouchers?: Voucher[];
  fiscalYears?: FiscalPeriodYear[];
  initialTab?: ImportType;
  onDataImported: () => void;
  onNavigateToVouchers?: (period?: string, year?: string, month?: string) => void;
}

type ImportType = 'cuentas' | 'clientes' | 'proveedores' | 'comprobantes';

export default function ExcelImportCenterModal({
  isOpen,
  onClose,
  studyId,
  company,
  accounts,
  auxiliaries,
  vouchers = [],
  fiscalYears = [],
  initialTab = 'cuentas',
  onDataImported,
  onNavigateToVouchers
}: ExcelImportCenterModalProps) {
  const { withProcess } = useProcess();
  const [activeTab, setActiveTab] = useState<ImportType>(initialTab);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [detectedBadge, setDetectedBadge] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [importReport, setImportReport] = useState<string | null>(null);
  const [renumberMode, setRenumberMode] = useState<'auto' | 'keep'>('auto');
  const [importedBatchInfo, setImportedBatchInfo] = useState<{
    count: number;
    startNum: number;
    endNum: number;
    period: string;
    year: string;
    month: string;
  } | null>(null);

  // Sync initialTab when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setFileContent('');
      setFileName('');
      setDetectedBadge(null);
      setPreviewData([]);
      setImportReport(null);
      setImportedBatchInfo(null);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const maxExistingVNum = (vouchers || []).reduce((max, v) => Math.max(max, v.voucherNumber || 0), 0);
  const nextRecommendedNum = maxExistingVNum + 1;

  const companyRef = doc(db, 'studies', studyId, 'companies', company.id);

  // Template Download Functions (supports both XLSX and standard CSV with UTF-8 BOM)
  const downloadExcelTemplate = (type: ImportType) => {
    const customCols = company.customAccountColumns || [];

    if (type === 'comprobantes') {
      const sampleData = [
        {
          NumeroComprobante: 1,
          Fecha: '2026-01-02',
          Periodo: '2026-01',
          TipoComprobante: 'Ingreso',
          GlosaComprobante: 'Aporte inicial de capital social',
          CodigoCuenta: accounts[0]?.code || '1.1.01.002',
          NombreCuenta: accounts[0]?.name || 'Banco Estado Cta Cte',
          Debe: 10000000,
          Haber: 0,
          GlosaLinea: 'Deposito bancario capital',
          RUTAuxiliar: '',
          RazonSocialAuxiliar: '',
          TipoDocumento: '',
          FolioDocumento: '',
          FechaVencimiento: '',
          CentroCosto: '',
          ItemGasto: '',
          Proyecto: '',
          Producto: '',
          RefBancaria: 'Cartola 0126',
          ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
        },
        {
          NumeroComprobante: 1,
          Fecha: '2026-01-02',
          Periodo: '2026-01',
          TipoComprobante: 'Ingreso',
          GlosaComprobante: 'Aporte inicial de capital social',
          CodigoCuenta: accounts[1]?.code || '3.1.01',
          NombreCuenta: accounts[1]?.name || 'Capital Social',
          Debe: 0,
          Haber: 10000000,
          GlosaLinea: 'Suscripcion y pago capital social',
          RUTAuxiliar: '',
          RazonSocialAuxiliar: '',
          TipoDocumento: '',
          FolioDocumento: '',
          FechaVencimiento: '',
          CentroCosto: '',
          ItemGasto: '',
          Proyecto: '',
          Producto: '',
          RefBancaria: '',
          ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
        },
        {
          NumeroComprobante: 2,
          Fecha: '2026-01-15',
          Periodo: '2026-01',
          TipoComprobante: 'Egreso',
          GlosaComprobante: 'Pago de arriendo oficina comercial',
          CodigoCuenta: accounts[2]?.code || '5.2.01',
          NombreCuenta: accounts[2]?.name || 'Gastos de Administracion',
          Debe: 850000,
          Haber: 0,
          GlosaLinea: 'Arriendo mes enero',
          RUTAuxiliar: '76.123.456-7',
          RazonSocialAuxiliar: 'INMOBILIARIA CENTRAL SPA',
          TipoDocumento: 'Factura',
          FolioDocumento: '1045',
          FechaVencimiento: '2026-01-25',
          CentroCosto: 'ADMINISTRACION',
          ItemGasto: 'ARRIENDOS',
          Proyecto: 'SEDE CENTRAL',
          Producto: '',
          RefBancaria: 'TRF 98231',
          ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
        },
        {
          NumeroComprobante: 2,
          Fecha: '2026-01-15',
          Periodo: '2026-01',
          TipoComprobante: 'Egreso',
          GlosaComprobante: 'Pago de arriendo oficina comercial',
          CodigoCuenta: accounts[0]?.code || '1.1.01.002',
          NombreCuenta: accounts[0]?.name || 'Banco Estado Cta Cte',
          Debe: 0,
          Haber: 850000,
          GlosaLinea: 'Transferencia bancaria',
          RUTAuxiliar: '76.123.456-7',
          RazonSocialAuxiliar: 'INMOBILIARIA CENTRAL SPA',
          TipoDocumento: 'Factura',
          FolioDocumento: '1045',
          FechaVencimiento: '2026-01-25',
          CentroCosto: 'ADMINISTRACION',
          ItemGasto: '',
          Proyecto: '',
          Producto: '',
          RefBancaria: 'TRF 98231',
          ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
        },
        {
          NumeroComprobante: 3,
          Fecha: '2026-02-28',
          Periodo: '2026-02',
          TipoComprobante: 'Traspaso',
          GlosaComprobante: 'Centralización de Remuneraciones Febrero 2026',
          CodigoCuenta: '4202002',
          NombreCuenta: 'Sueldo Base',
          Debe: 1500000,
          Haber: 0,
          GlosaLinea: 'SUELDO BASE | RECURSOS HUMANOS',
          RUTAuxiliar: '15.432.109-8',
          RazonSocialAuxiliar: 'GONZALEZ PEREZ JUAN PABLO',
          TipoDocumento: 'Liquidacion',
          FolioDocumento: '202602',
          FechaVencimiento: '2026-02-28',
          CentroCosto: 'RRHH',
          ItemGasto: 'SUELDOS',
          Proyecto: '',
          Producto: '',
          RefBancaria: '',
          ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
        },
        {
          NumeroComprobante: 3,
          Fecha: '2026-02-28',
          Periodo: '2026-02',
          TipoComprobante: 'Traspaso',
          GlosaComprobante: 'Centralización de Remuneraciones Febrero 2026',
          CodigoCuenta: '2.1.01.001',
          NombreCuenta: 'Remuneraciones por Pagar',
          Debe: 0,
          Haber: 1500000,
          GlosaLinea: 'Sueldo Líquido por Pagar',
          RUTAuxiliar: '15.432.109-8',
          RazonSocialAuxiliar: 'GONZALEZ PEREZ JUAN PABLO',
          TipoDocumento: 'Liquidacion',
          FolioDocumento: '202602',
          FechaVencimiento: '2026-03-05',
          CentroCosto: 'RRHH',
          ItemGasto: '',
          Proyecto: '',
          Producto: '',
          RefBancaria: '',
          ...customCols.reduce((acc, c) => ({ ...acc, [c]: '' }), {})
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Comprobantes');
      XLSX.writeFile(workbook, `Plantilla_Comprobantes_Contables_${company.rut}.xlsx`);
    } else {
      downloadTemplate(type);
    }
  };

  const downloadTemplate = (type: ImportType) => {
    let headers = '';
    let sampleRows = '';
    let filename = '';
    const customCols = company.customAccountColumns || [];
    const customHeaderStr = customCols.length > 0 ? ';' + customCols.join(';') : '';
    const customEmptyStr = customCols.length > 0 ? ';' + customCols.map(() => '').join(';') : '';

    if (type === 'cuentas') {
      filename = `Plantilla_Plan_de_Cuentas_${company.rut}.csv`;
      headers = 'Codigo;Nombre;Tipo;CodigoPadre;RequiereCentroCosto;RequiereAuxiliarRUT;RequiereConciliacionBancaria;RequiereDocumento;Estado' + customHeaderStr;
      sampleRows = [
        '1;ACTIVO;Activo;;NO;NO;NO;NO;Activo' + customEmptyStr,
        '1.1;ACTIVO CIRCULANTE;Activo;1;NO;NO;NO;NO;Activo' + customEmptyStr,
        '1.1.01;Disponible;Activo;1.1;NO;NO;SI;NO;Activo' + customEmptyStr,
        '1.1.01.001;Caja Moneda Nacional;Activo;1.1.01;NO;NO;NO;NO;Activo' + customEmptyStr,
        '1.1.01.002;Banco Estado Cta Cte;Activo;1.1.01;NO;NO;SI;NO;Activo' + customEmptyStr,
        '1.1.02;Deudores por Ventas;Activo;1.1;NO;SI;NO;SI;Activo' + customEmptyStr,
        '1.1.02.001;Clientes Nacionales;Activo;1.1.02;NO;SI;NO;SI;Activo' + customEmptyStr,
        '2;PASIVO;Pasivo;;NO;NO;NO;NO;Activo' + customEmptyStr,
        '2.1;PASIVO CIRCULANTE;Pasivo;2;NO;NO;NO;NO;Activo' + customEmptyStr,
        '2.1.01;Cuentas por Pagar;Pasivo;2.1;NO;SI;NO;SI;Activo' + customEmptyStr,
        '2.1.01.001;Proveedores Nacionales;Pasivo;2.1.01;NO;SI;NO;SI;Activo' + customEmptyStr,
        '3;PATRIMONIO;Patrimonio;;NO;NO;NO;NO;Activo' + customEmptyStr,
        '3.1.01;Capital Social;Patrimonio;3;NO;NO;NO;NO;Activo' + customEmptyStr,
        '4;RESULTADO GANANCIA;Ingreso;;NO;NO;NO;NO;Activo' + customEmptyStr,
        '4.1.01;Ventas del Giro;Ingreso;4;SI;NO;NO;NO;Activo' + customEmptyStr,
        '5;RESULTADO PERDIDA;Gasto;;NO;NO;NO;NO;Activo' + customEmptyStr,
        '5.1.01;Costo de Ventas;Gasto;5;SI;NO;NO;NO;Activo' + customEmptyStr,
        '5.2.01;Gastos de Administracion;Gasto;5;SI;NO;NO;NO;Activo' + customEmptyStr
      ].join('\n');
    } else if (type === 'clientes') {
      filename = `Plantilla_Clientes_${company.rut}.csv`;
      headers = 'RUT;RazonSocial;GlosaSugerida;Rol;Email;Telefono;Banco;TipoCuenta;NumeroCuenta;CodigoCuentaCliente;CodigoCuentaIngreso;Estado';
      sampleRows = [
        '76123456-7;DISTRIBUIDORA Y COMERCIAL NORTE SPA;Ventas y Distribución Mayorista;Deudor;contacto@disnorte.cl;+56912345678;Banco de Chile;Corriente;1234567890;1.1.02.001;4.1.01;Activo',
        '77987654-3;AGRICOLA SAN ISIDRO LIMITADA;Venta de Productos Agrícolas;Deudor;pagos@sanisidro.cl;+56987654321;Banco Santander;Vista;987654321;1.1.02.001;4.1.01;Activo'
      ].join('\n');
    } else if (type === 'proveedores') {
      filename = `Plantilla_Proveedores_${company.rut}.csv`;
      headers = 'RUT;RazonSocial;GlosaSugerida;Rol;Email;Telefono;Banco;TipoCuenta;NumeroCuenta;CodigoCuentaProveedor;CodigoCuentaGasto;Estado';
      sampleRows = [
        '76543210-K;SERVICIOS INDUSTRIALES DEL SUR SPA;Servicios de Mantención y Soporte Técnico;Acreedor;facturas@serviciosur.cl;+56998765432;Banco Estado;Corriente;456789123;2.1.01.001;5.2.01;Activo',
        '79111222-3;IMPORTADORA GLOBAL CHILE S.A.;Adquisición de Insumos y Repuestos;Acreedor;cobranzas@globalchile.com;+56223334444;Banco BCI;Corriente;888777666;2.1.01.001;5.1.01;Activo'
      ].join('\n');
    } else if (type === 'comprobantes') {
      filename = `Plantilla_Comprobantes_Contables_${company.rut}.csv`;
      headers = 'NumeroComprobante;Fecha;Periodo;TipoComprobante;GlosaComprobante;CodigoCuenta;NombreCuenta;Debe;Haber;GlosaLinea;RUTAuxiliar;RazonSocialAuxiliar;TipoDocumento;FolioDocumento;FechaVencimiento;CentroCosto;ItemGasto;Proyecto;Producto;RefBancaria' + customHeaderStr;
      sampleRows = [
        `1;2026-01-02;2026-01;Ingreso;Aporte inicial de capital social;${accounts[0]?.code || '1.1.01.002'};${accounts[0]?.name || 'Banco Estado Cta Cte'};10000000;0;Deposito bancario capital;;;;;;;;;;Cartola 0126${customEmptyStr}`,
        `1;2026-01-02;2026-01;Ingreso;Aporte inicial de capital social;${accounts[1]?.code || '3.1.01'};${accounts[1]?.name || 'Capital Social'};0;10000000;Suscripcion y pago capital social;;;;;;;;;;${customEmptyStr}`,
        `2;2026-01-15;2026-01;Egreso;Pago de arriendo oficina comercial;${accounts[2]?.code || '5.2.01'};${accounts[2]?.name || 'Gastos de Administracion'};850000;0;Arriendo mes enero;76.123.456-7;INMOBILIARIA CENTRAL SPA;Factura;1045;2026-01-25;ADMINISTRACION;ARRIENDOS;SEDE CENTRAL;;TRF 98231${customEmptyStr}`,
        `2;2026-01-15;2026-01;Egreso;Pago de arriendo oficina comercial;${accounts[0]?.code || '1.1.01.002'};${accounts[0]?.name || 'Banco Estado Cta Cte'};0;850000;Transferencia bancaria;76.123.456-7;INMOBILIARIA CENTRAL SPA;Factura;1045;2026-01-25;ADMINISTRACION;;;;TRF 98231${customEmptyStr}`,
        `3;2026-02-28;2026-02;Traspaso;Centralización de Remuneraciones Febrero 2026;4202002;Sueldo Base;1500000;0;SUELDO BASE | RECURSOS HUMANOS;15.432.109-8;GONZALEZ PEREZ JUAN PABLO;Liquidacion;202602;2026-02-28;RRHH;SUELDOS;;;;${customEmptyStr}`,
        `3;2026-02-28;2026-02;Traspaso;Centralización de Remuneraciones Febrero 2026;2.1.01.001;Remuneraciones por Pagar;0;1500000;Sueldo Líquido por Pagar;15.432.109-8;GONZALEZ PEREZ JUAN PABLO;Liquidacion;202602;2026-03-05;RRHH;;;;;${customEmptyStr}`
      ].join('\n');
    }

    const csvContent = '\uFEFF' + headers + '\n' + sampleRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle File Upload and Preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportReport(null);
    setImportedBatchInfo(null);

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    const processContent = (content: string, fName: string) => {
      setFileContent(content);
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length > 0) {
        const delimiter = detectDelimiter(lines[0]);
        const header = lines[0].toLowerCase();
        const firstRow = lines.length > 1 ? parseCsvLine(lines[1], delimiter) : [];
        const fLower = fName.toLowerCase();

        // 1. Detect Comprobantes
        const isComprobanteFile = 
          fLower.includes('comprobante') || 
          fLower.includes('voucher') || 
          fLower.includes('asiento') ||
          header.includes('comprobante') ||
          header.includes('tipocomprobante') ||
          header.includes('glosacomprobante') ||
          (header.includes('debe') && header.includes('haber')) ||
          (firstRow.length >= 4 && (firstRow[3]?.toLowerCase().includes('ingreso') || firstRow[3]?.toLowerCase().includes('egreso') || firstRow[3]?.toLowerCase().includes('traspaso')));

        // 2. Detect Plan de Cuentas
        const isPlanFile = 
          !isComprobanteFile && (
            fLower.includes('plan') || 
            fLower.includes('cuenta') ||
            header.includes('requierecentrocosto') ||
            header.includes('codigopadre') ||
            header.includes('nombrecuenta')
          );

        // 3. Detect Clientes
        const isClientesFile = 
          fLower.includes('cliente') || 
          fLower.includes('deudor') ||
          header.includes('cuentacontablecobrar');

        // 4. Detect Proveedores
        const isProveedoresFile = 
          fLower.includes('proveedor') || 
          fLower.includes('acreedor') ||
          header.includes('cuentacontablepagar');

        if (isComprobanteFile && activeTab !== 'comprobantes') {
          setActiveTab('comprobantes');
          setDetectedBadge('✨ Archivo identificado como Comprobantes Contables (Se seleccionó la pestaña 4 automáticamente)');
          parsePreview(content, 'comprobantes');
          return;
        } else if (isPlanFile && activeTab !== 'cuentas') {
          setActiveTab('cuentas');
          setDetectedBadge('✨ Archivo identificado como Plan de Cuentas (Se seleccionó la pestaña 1)');
          parsePreview(content, 'cuentas');
          return;
        } else if (isClientesFile && activeTab !== 'clientes') {
          setActiveTab('clientes');
          setDetectedBadge('✨ Archivo identificado como Clientes (Se seleccionó la pestaña 2)');
          parsePreview(content, 'clientes');
          return;
        } else if (isProveedoresFile && activeTab !== 'proveedores') {
          setActiveTab('proveedores');
          setDetectedBadge('✨ Archivo identificado como Proveedores (Se seleccionó la pestaña 3)');
          parsePreview(content, 'proveedores');
          return;
        }
      }
      setDetectedBadge(null);
      parsePreview(content, activeTab);
    };

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Genera CSV delimitado con punto y coma para procesar
          const csv = XLSX.utils.sheet_to_csv(worksheet, { FS: ';' });
          processContent(csv, file.name);
        } catch (err: any) {
          console.error('Error al leer archivo binario Excel:', err);
          alert('No se pudo procesar el archivo Excel seleccionado. Verifique que no esté protegido o dañado.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = (evt.target?.result as string) || '';
        processContent(text, file.name);
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  const parsePreview = (rawCsv: string, type: ImportType) => {
    const lines = rawCsv
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length <= 1) {
      setPreviewData([]);
      return;
    }

    const delimiter = detectDelimiter(lines[0]);
    const parsedRows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i], delimiter);
      if (isRowBlank(row)) continue;
      if (isHeaderRow(row)) continue;
      parsedRows.push(row);
      if (parsedRows.length >= 10) break;
    }

    setPreviewData(parsedRows);
  };

  // Perform Real Batch Import to Firestore
  const handleExecuteImport = async () => {
    if (!fileContent) {
      alert('Por favor seleccione o cargue un archivo primero.');
      return;
    }

    const lines = fileContent
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length <= 1) {
      alert('El archivo no contiene filas de datos.');
      return;
    }

    const delimiter = detectDelimiter(lines[0]);
    const rawRows = lines.slice(1).map(line => parseCsvLine(line, delimiter));
    const rows = rawRows.filter(r => !isRowBlank(r) && !isHeaderRow(r));

    if (rows.length === 0) {
      alert('El archivo no contiene filas de datos válidas para procesar.');
      return;
    }

    // --- PROTECCIÓN CONTRA IMPORTACIÓN EN PESTAÑA INCORRECTA ---
    if (activeTab === 'cuentas') {
      const looksLikeVoucher = rows.some(r => {
        const d = normalizeDateToIso(r[1]);
        const t = String(r[3] || '').toLowerCase();
        return d !== '' && (t.includes('ingreso') || t.includes('egreso') || t.includes('traspaso'));
      });
      if (looksLikeVoucher) {
        setActiveTab('comprobantes');
        alert(
          '🛡️ ¡Protección de Plan de Cuentas activada!\n\n' +
          'El archivo seleccionado corresponde a Comprobantes Contables (contiene fechas y tipos Ingreso/Egreso/Traspaso), pero estaba seleccionada la pestaña "1. Plan de Cuentas".\n\n' +
          'Hemos cambiado automáticamente a la pestaña "4. Comprobantes Contables" para evitar alterar su plan de cuentas. Por favor revise la vista previa y presione "Cargar COMPROBANTES a la Empresa".'
        );
        return;
      }
    }

    if (activeTab === 'comprobantes') {
      const looksLikePlan = rows.some(r => {
        const t = String(r[2] || '').toLowerCase();
        return (t === 'activo' || t === 'pasivo' || t === 'patrimonio' || t === 'ingreso' || t === 'gasto') && !r[1]?.includes('/');
      });
      if (looksLikePlan) {
        setActiveTab('cuentas');
        alert(
          '🛡️ ¡Protección de Comprobantes activada!\n\n' +
          'El archivo seleccionado parece ser un Plan de Cuentas. Hemos cambiado automáticamente a la pestaña "1. Plan de Cuentas".'
        );
        return;
      }
    }

    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      await withProcess(
        `Importando ${rows.length} registros desde Excel/CSV...`,
        async (updateProgress) => {
          if (activeTab === 'cuentas') {
            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const [code, name, typeStr, parentCode, ccStr, auxStr, concStr, docStr, estadoStr] = row;

              updateProgress({
                current: i + 1,
                total: rows.length,
                message: `Importando Plan de Cuentas (${i + 1}/${rows.length})`,
                stage: `${code || ''} - ${name || ''}`
              });

              if (!code || !name) {
                // Si la fila está vacía o incompleta, saltar
                continue;
              }

              let normalizedType: ChartOfAccount['type'] = 'Activo';
              const tLower = (typeStr || '').toLowerCase();
              if (tLower.includes('pasivo')) normalizedType = 'Pasivo';
              else if (tLower.includes('patrimonio')) normalizedType = 'Patrimonio';
              else if (tLower.includes('ingreso') || tLower.includes('ganancia')) normalizedType = 'Ingreso';
              else if (tLower.includes('gasto') || tLower.includes('perdida') || tLower.includes('costo')) normalizedType = 'Gasto';

              const reqCC = ['si', 's', 'true', '1'].includes((ccStr || '').toLowerCase());
              const reqAux = ['si', 's', 'true', '1'].includes((auxStr || '').toLowerCase());
              const reqConc = ['si', 's', 'true', '1'].includes((concStr || '').toLowerCase());
              const reqDoc = ['si', 's', 'true', '1'].includes((docStr || '').toLowerCase());
              const estado = (estadoStr || '').toLowerCase().includes('inactiv') ? 'Inactivo' : 'Activo';

              const userUid = auth.currentUser?.uid || 'import-excel';
              const userEmail = auth.currentUser?.email || '';
              const nowIso = new Date().toISOString();

              const accountPayload: Omit<ChartOfAccount, 'id'> = {
                code: String(code).trim(),
                name: String(name).trim(),
                type: normalizedType,
                parentCode: parentCode ? String(parentCode).trim() : '',
                requiereCentroCosto: reqCC,
                requiereAuxiliarRUT: reqAux,
                requiereConciliacionBancaria: reqConc,
                requiereDocumento: reqDoc,
                estado,
                createdBy: userUid,
                createdByUserEmail: userEmail,
                creationMode: 'IMPORTACION_MASIVA',
                createdAt: nowIso,
                lastModifiedBy: userUid,
                lastModifiedAt: nowIso
              };

              await addDoc(collection(companyRef, 'chartOfAccounts'), accountPayload);
              successCount++;
            }
          } else if (activeTab === 'clientes' || activeTab === 'proveedores') {
            const userUid = auth.currentUser?.uid || 'import-excel';
            const userEmail = auth.currentUser?.email || '';
            const nowIso = new Date().toISOString();

            const existingAuxSnap = await getDocs(collection(companyRef, 'auxiliaries'));
            const existingAuxList = existingAuxSnap.docs.map(d => ({ id: d.id, ...d.data() } as Auxiliary));

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              let rut = '';
              let name = '';
              let defaultGloss = '';
              let roleStr = '';
              let email = '';
              let phone = '';
              let banco = '';
              let tipoCtaStr = '';
              let numCta = '';
              let accCode1 = '';
              let accCode2 = '';
              let estadoStr = '';

              if (row.length >= 12) {
                [rut, name, defaultGloss, roleStr, email, phone, banco, tipoCtaStr, numCta, accCode1, accCode2, estadoStr] = row;
              } else {
                [rut, name, roleStr, email, phone, banco, tipoCtaStr, numCta, accCode1, accCode2, estadoStr] = row;
              }

              updateProgress({
                current: i + 1,
                total: rows.length,
                message: `Importando Auxiliares (${i + 1}/${rows.length})`,
                stage: `${rut} - ${name}`
              });

              if (!rut || !name) {
                continue;
              }

              let role: 'Deudor' | 'Acreedor' | 'Ambos' = activeTab === 'clientes' ? 'Deudor' : 'Acreedor';
              const rLower = (roleStr || '').toLowerCase();
              if (rLower.includes('ambos')) role = 'Ambos';
              else if (rLower.includes('deudor') || rLower.includes('cliente')) role = 'Deudor';
              else if (rLower.includes('acreedor') || rLower.includes('proveedor')) role = 'Acreedor';

              const matchedAcc1 = accounts.find(a => a.code === (accCode1 || '').trim());
              const matchedAcc2 = accounts.find(a => a.code === (accCode2 || '').trim());

              let tipoCuenta: 'Corriente' | 'Vista' | 'Ahorro' | 'RUT' = 'Corriente';
              const tCtaLower = (tipoCtaStr || '').toLowerCase();
              if (tCtaLower.includes('vista')) tipoCuenta = 'Vista';
              else if (tCtaLower.includes('ahorro')) tipoCuenta = 'Ahorro';
              else if (tCtaLower.includes('rut')) tipoCuenta = 'RUT';

              const auxPayload: Omit<Auxiliary, 'id'> = {
                rut: rut.trim(),
                name: name.trim(),
                defaultGloss: defaultGloss ? defaultGloss.trim() : '',
                role,
                email: email || '',
                phone: phone || '',
                banco: banco || '',
                tipoCuenta,
                numeroCuenta: numCta || '',
                defaultDebtorAccountId: role === 'Deudor' || role === 'Ambos' ? (matchedAcc1?.id || '') : '',
                defaultCreditorAccountId: role === 'Acreedor' || role === 'Ambos' ? (matchedAcc1?.id || '') : '',
                defaultExpenseOrIncomeAccountId: matchedAcc2?.id || '',
                estado: (estadoStr || '').toLowerCase().includes('inactiv') ? 'Inactivo' : 'Activo',
                createdBy: userUid,
                createdByUserEmail: userEmail,
                creationMode: 'IMPORTACION_MASIVA',
                createdAt: nowIso,
                lastModifiedBy: userUid,
                lastModifiedAt: nowIso
              };

              const cleanImportRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
              const existingAux = existingAuxList.find(a => (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanImportRut);

              if (existingAux) {
                await setDoc(doc(companyRef, 'auxiliaries', existingAux.id), auxPayload, { merge: true });
              } else {
                const newRef = await addDoc(collection(companyRef, 'auxiliaries'), auxPayload);
                existingAuxList.push({ id: newRef.id, ...auxPayload });
              }
              successCount++;
            }
          } else if (activeTab === 'comprobantes') {
            const vouchersMap = new Map<string, {
              voucherNumber: number;
              date: string;
              period: string;
              type: 'Ingreso' | 'Egreso' | 'Traspaso';
              gloss: string;
              lines: VoucherLine[];
            }>();

            // Detectar índices de columnas dinámicamente según encabezado
            const headerRow = lines.length > 0 ? parseCsvLine(lines[0], delimiter) : [];
            const colMap: { [key: string]: number } = {};
            headerRow.forEach((h, idx) => {
              const cleanH = h.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
              colMap[cleanH] = idx;
            });

            const getColIdx = (aliases: string[], fallbackIdx: number): number => {
              for (const alias of aliases) {
                const cleanA = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (colMap[cleanA] !== undefined) return colMap[cleanA];
              }
              return fallbackIdx;
            };

            const numIdx = getColIdx(['numerocomprobante', 'numcomprobante', 'ncomprobante', 'asiento', 'folio', 'numero', 'num'], 0);
            const dateIdx = getColIdx(['fecha', 'date', 'fechacomprobante', 'fechacontabilizacion'], 1);
            const periodIdx = getColIdx(['periodo', 'period', 'periodocontable', 'mes'], 2);
            const typeIdx = getColIdx(['tipocomprobante', 'tipo', 'type', 'tipovoucher'], 3);
            const vGlossIdx = getColIdx(['glosacomprobante', 'glosageneral', 'glosa', 'descripcion', 'concepto'], 4);
            const codeIdx = getColIdx(['codigocuenta', 'codigo', 'cuenta', 'codcuenta', 'codigocuentacontable'], 5);
            const nameIdx = getColIdx(['nombrecuenta', 'nombre', 'cuenta', 'cuentanombre'], 6);
            const debitIdx = getColIdx(['debe', 'debito', 'cargos', 'cargo', 'debitos'], 7);
            const creditIdx = getColIdx(['haber', 'credito', 'abonos', 'abono', 'creditos'], 8);
            const lineGlossIdx = getColIdx(['glosalinea', 'detalle', 'glosadetalle', 'explicacion'], 9);
            const rutIdx = getColIdx(['rutauxiliar', 'rut', 'auxiliarrut', 'rutcliprov', 'rutcliente', 'rutproveedor'], 10);
            const auxNameIdx = getColIdx(['razonsocialauxiliar', 'nombreauxiliar', 'auxiliarnombre', 'razonsocial', 'razonsocialcliprov', 'nombrecliente'], 11);
            const docTypeIdx = getColIdx(['tipodocumento', 'tipodoc', 'documentotipo', 'dte'], 12);
            const docFolioIdx = getColIdx(['foliodocumento', 'numerodoc', 'numdoc', 'nrodocumento', 'folio', 'factura'], 13);
            const dueIdx = getColIdx(['fechavencimiento', 'vencimiento', 'fvencimiento', 'fvenc', 'duedate'], 14);
            const ccIdx = getColIdx(['centrocosto', 'centrodecosto', 'cc', 'cdecosto'], 15);
            const itemIdx = getColIdx(['itemgasto', 'clasificadorgasto', 'item', 'rubro'], 16);
            const projIdx = getColIdx(['proyecto', 'obra', 'faena'], 17);
            const prodIdx = getColIdx(['producto', 'servicio', 'itemproducto', 'articulo'], 18);
            const bankRefIdx = getColIdx(['refbancaria', 'referenciabancaria', 'refbanco', 'cheque', 'cartola', 'transferencia', 'noperacion'], 19);

            // Rastrear el comprobante activo para filas multilínea que heredan cabecera
            let currentVNum = 1;
            let currentDate = '';
            let currentPeriod = '';
            let currentType: 'Ingreso' | 'Egreso' | 'Traspaso' = 'Traspaso';
            let currentGloss = 'Comprobante importado vía Excel';

            const customCols = company.customAccountColumns || [];

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const getVal = (idx: number): string => (row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '');

              const numStr = getVal(numIdx);
              const dateStr = getVal(dateIdx);
              const periodStr = getVal(periodIdx);
              const typeStr = getVal(typeIdx);
              const vGloss = getVal(vGlossIdx);
              const accCode = getVal(codeIdx);
              const accName = getVal(nameIdx);
              const debeStr = getVal(debitIdx);
              const haberStr = getVal(creditIdx);
              const lineGloss = getVal(lineGlossIdx);
              const auxRut = getVal(rutIdx);
              const auxName = getVal(auxNameIdx);
              const docType = getVal(docTypeIdx);
              const docFolio = getVal(docFolioIdx);
              const dueDate = normalizeDateToIso(getVal(dueIdx));
              const ccCode = getVal(ccIdx);
              const expenseItem = getVal(itemIdx);
              const project = getVal(projIdx);
              const product = getVal(prodIdx);
              const bankRef = getVal(bankRefIdx);

              const debe = parseAmount(debeStr);
              const haber = parseAmount(haberStr);
              const hasAccount = Boolean(accCode);

              // Si la fila no tiene cuenta ni montos, omitir
              if (!hasAccount && debe === 0 && haber === 0) {
                continue;
              }

              // Determinar número de comprobante
              const parsedNum = parseInt(numStr, 10);
              if (!isNaN(parsedNum) && parsedNum > 0) {
                currentVNum = parsedNum;
              }

              // Determinar fecha normalizada (admite D/M/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.)
              const parsedDate = normalizeDateToIso(dateStr);
              if (parsedDate) {
                currentDate = parsedDate;
              }

              // Determinar período normalizado (admite YYYY-MM, 2026-03, 202603, etc.)
              const parsedPeriod = normalizePeriod(periodStr, currentDate);
              if (parsedPeriod) {
                currentPeriod = parsedPeriod;
              } else if (currentDate) {
                currentPeriod = currentDate.slice(0, 7);
              }

              // Si hay período pero no fecha exacta, asignar el primer día del mes
              if (!currentDate && currentPeriod) {
                currentDate = `${currentPeriod}-01`;
              }

              // Si no tiene fecha ni período válido, reportar error y no usar fecha de hoy
              if (!currentDate || !currentPeriod) {
                errorCount++;
                errors.push(`Fila ${i + 2}: El comprobante N° ${currentVNum} no tiene fecha ni período contable válido.`);
                continue;
              }

              // Determinar tipo de comprobante
              if (typeStr) {
                const tLower = typeStr.toLowerCase();
                if (tLower.includes('ingreso')) currentType = 'Ingreso';
                else if (tLower.includes('egreso')) currentType = 'Egreso';
                else if (tLower.includes('traspaso')) currentType = 'Traspaso';
              }

              if (vGloss) {
                currentGloss = vGloss;
              }

              // Clave única para agrupar líneas del mismo comprobante
              const key = `V_${currentVNum}_${currentPeriod}_${currentDate}`;

              const rawCode = accCode;
              const cleanCode = rawCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
              const matchedAcc = accounts.find(a => 
                a.code === rawCode || 
                (a.code || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === cleanCode
              );

              const rawRut = auxRut;
              const cleanRut = rawRut.replace(/[^0-9kK]/g, '').toUpperCase();
              const matchedAux = rawRut ? auxiliaries.find(a => 
                (a.rut || '').replace(/[^0-9kK]/g, '').toUpperCase() === cleanRut
              ) : undefined;

              const formattedDocRef = [docType, docFolio].filter(Boolean).join(' ');

              // Recopilar análisis personalizados
              const customAnalyses: { [key: string]: string } = {};
              customCols.forEach(colName => {
                const cIdx = getColIdx([colName], -1);
                if (cIdx !== -1) {
                  customAnalyses[colName] = getVal(cIdx);
                }
              });

              const lineObj: VoucherLine = {
                id: `imp_line_${Date.now()}_${i}`,
                accountId: matchedAcc?.id || '',
                accountCode: matchedAcc?.code || rawCode,
                accountName: matchedAcc?.name || accName || (rawCode ? `Cuenta ${rawCode}` : 'Cuenta General'),
                gloss: lineGloss || currentGloss,
                auxiliaryRut: rawRut,
                auxiliaryName: auxName || matchedAux?.name || '',
                documentType: docType || '',
                documentRef: formattedDocRef,
                dueDate: dueDate || '',
                costCenter: ccCode || '',
                expenseItem: expenseItem || '',
                project: project || '',
                product: product || '',
                bankDocRef: bankRef || '',
                customAnalyses,
                debit: debe,
                credit: haber
              };

              if (!vouchersMap.has(key)) {
                vouchersMap.set(key, {
                  voucherNumber: currentVNum,
                  date: currentDate,
                  period: currentPeriod,
                  type: currentType,
                  gloss: currentGloss,
                  lines: [lineObj]
                });
              } else {
                vouchersMap.get(key)!.lines.push(lineObj);
              }
            }

            // Validar si algún comprobante pertenece a un período cerrado
            if (fiscalYears && fiscalYears.length > 0) {
              const closedDrafts: string[] = [];
              for (const vData of vouchersMap.values()) {
                const pStr = vData.period || vData.date.slice(0, 7);
                const parts = pStr.split('-');
                if (parts.length >= 2) {
                  const y = parts[0];
                  const m = parseInt(parts[1], 10);
                  const fy = fiscalYears.find(f => String(f.id || f.year) === y);
                  if (fy && fy.months?.[m] === 'Cerrado') {
                    closedDrafts.push(`Comprobante N° ${vData.voucherNumber} (Período ${pStr})`);
                  }
                }
              }

              if (closedDrafts.length > 0) {
                throw new Error(
                  `Acción bloqueada: Se encontraron ${closedDrafts.length} comprobante(s) con fecha en períodos CERRADOS:\n` +
                  closedDrafts.slice(0, 5).join('\n') +
                  (closedDrafts.length > 5 ? `\n...y ${closedDrafts.length - 5} más.` : '') +
                  `\n\nPor favor abre los períodos correspondientes en 'Configuraciones > Períodos Contables' antes de importar.`
                );
              }
            }

            const uniqueVouchers = Array.from(vouchersMap.values());
            const totalVouchers = uniqueVouchers.length;
            let startVNum = 1;
            let endVNum = totalVouchers;

            if (renumberMode === 'auto' && maxExistingVNum > 0) {
              uniqueVouchers.forEach((vData, index) => {
                vData.voucherNumber = maxExistingVNum + index + 1;
              });
              startVNum = maxExistingVNum + 1;
              endVNum = maxExistingVNum + totalVouchers;
            } else if (uniqueVouchers.length > 0) {
              startVNum = uniqueVouchers[0].voucherNumber;
              endVNum = uniqueVouchers[uniqueVouchers.length - 1].voucherNumber;
            }

            let vIdx = 0;
            const userUid = auth.currentUser?.uid || 'import-excel';
            const userEmail = auth.currentUser?.email || '';
            const nowIso = new Date().toISOString();

            for (const vData of uniqueVouchers) {
              vIdx++;
              updateProgress({
                current: vIdx,
                total: totalVouchers,
                message: `Guardando Comprobantes Contables (${vIdx}/${totalVouchers})`,
                stage: `N° ${vData.voucherNumber}: ${vData.gloss}`
              });

              const sanitizedLines = sanitizeVoucherLines(vData.lines, accounts);
              const totalDebit = sanitizedLines.reduce((s, l) => s + l.debit, 0);
              const totalCredit = sanitizedLines.reduce((s, l) => s + l.credit, 0);

              const voucherPayload: Omit<Voucher, 'id'> = {
                voucherNumber: vData.voucherNumber,
                date: vData.date,
                period: vData.period,
                type: vData.type,
                gloss: vData.gloss,
                lines: sanitizedLines,
                totalDebit,
                totalCredit,
                status: 'Valido',
                createdBy: userUid,
                createdByUserEmail: userEmail,
                creationMode: 'IMPORTACION_MASIVA',
                createdAt: nowIso,
                lastModifiedBy: userUid,
                lastModifiedAt: nowIso
              };

              await addDoc(collection(companyRef, 'vouchers'), voucherPayload);
              successCount++;
            }

            if (uniqueVouchers.length > 0) {
              const sampleP = uniqueVouchers[0].period || uniqueVouchers[0].date.slice(0, 7);
              const [y, m] = sampleP.split('-');
              setImportedBatchInfo({
                count: successCount,
                startNum: startVNum,
                endNum: endVNum,
                period: sampleP,
                year: y || '2026',
                month: m || '03'
              });
            }
          }
        }
      );

      // Audit Log
      logAuditEvent({
        userId: auth.currentUser?.uid || 'anon',
        userEmail: auth.currentUser?.email || '',
        studyId,
        companyId: company.id,
        action: 'IMPORTACION_MASIVA',
        module: activeTab === 'cuentas' ? 'PLAN_CUENTAS' : activeTab === 'comprobantes' ? 'COMPROBANTES' : 'AUXILIARES',
        details: `Carga masiva Excel de ${activeTab}: ${successCount} registros procesados con éxito en ${company.name}`,
        metadata: {
          tipo: activeTab,
          archivo: fileName,
          exitosos: successCount,
          errores: errorCount
        }
      });

      setImportReport(`✅ Proceso finalizado con éxito: ${successCount} registros importados correctamente. (Errores/Filas vacías omitidas: ${errorCount})`);
      onDataImported();
    } catch (err: any) {
      console.error('Error importing Excel data:', err);
      setImportReport(`❌ Error durante la importación: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
          <div>
            <h3 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
              <span>📥</span> Centro de Carga Masiva de Archivos Excel / CSV
            </h3>
            <p className="text-xs text-slate-400">
              Empresa: <span className="text-indigo-300 font-bold">{company.name}</span> (RUT: {company.rut})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold px-2 py-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 text-xs font-bold overflow-x-auto">
          {[
            { id: 'cuentas', label: '1. Plan de Cuentas', icon: '🗂️' },
            { id: 'clientes', label: '2. Clientes (Deudores)', icon: '👥' },
            { id: 'proveedores', label: '3. Proveedores (Acreedores)', icon: '🏢' },
            { id: 'comprobantes', label: '4. Comprobantes Contables', icon: '📝' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as ImportType);
                setFileContent('');
                setFileName('');
                setPreviewData([]);
                setImportReport(null);
              }}
              className={`px-4 py-2.5 rounded-t-lg transition-all flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-700 border-t-2 border-indigo-600 border-x border-slate-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Step 1: Download Format Guide */}
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 className="font-bold text-indigo-950 text-xs flex items-center gap-1.5">
                <span>📄</span> Paso 1: Descargar Plantilla Oficial Excel/CSV
              </h4>
              <p className="text-indigo-800 text-[11px] mt-0.5">
                Descargue el formato con los encabezados y filas de ejemplo estándar chilenos para completar su información.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {activeTab === 'comprobantes' && (
                <button
                  type="button"
                  onClick={() => downloadExcelTemplate('comprobantes')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
                  title="Descargar plantilla formateada en formato Excel (.xlsx)"
                >
                  <span>📊</span>
                  <span>Plantilla Excel (.xlsx)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => downloadTemplate(activeTab)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
                title="Descargar plantilla estándar en formato CSV delimitado por punto y coma (;)"
              >
                <span>📥</span>
                <span>Plantilla CSV (.csv)</span>
              </button>
            </div>
          </div>

          {/* Step 2: Upload CSV / File Drop */}
          <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-6 text-center transition-colors bg-slate-50/50 space-y-3">
            <input
              type="file"
              accept=".csv,.txt,.xlsx"
              onChange={handleFileChange}
              id="excel-file-input"
              className="hidden"
            />
            <label
              htmlFor="excel-file-input"
              className="cursor-pointer flex flex-col items-center justify-center gap-2"
            >
              <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center text-xl shadow-xs text-indigo-600">
                📁
              </div>
              <span className="font-bold text-slate-800 text-xs">
                {fileName ? `Archivo seleccionado: ${fileName}` : 'Haga clic para seleccionar archivo Excel/CSV o arrástrelo aquí'}
              </span>
              <span className="text-[11px] text-slate-500">
                Soporta archivos CSV delimitados por punto y coma (;) o coma (,) y libros Excel (.xlsx).
              </span>
            </label>

            {detectedBadge && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-800 font-semibold text-xs border border-indigo-200">
                {detectedBadge}
              </div>
            )}
          </div>

          {/* Opciones de Numeración de Comprobantes */}
          {activeTab === 'comprobantes' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <span>🔢</span> Numeración de Comprobantes a Generar:
              </div>
              <div className="space-y-2 text-xs">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="renumberMode"
                    value="auto"
                    checked={renumberMode === 'auto'}
                    onChange={() => setRenumberMode('auto')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-slate-800 font-bold">
                      Continuar correlativo automáticamente (Recomendado)
                    </span>
                    <p className="text-slate-500 text-[11px]">
                      {maxExistingVNum > 0 
                        ? `Asignará números correlativos a partir del N° ${nextRecommendedNum}, evitando colisiones con los comprobantes existentes en la empresa.`
                        : 'Iniciará la numeración correlativa en N° 1.'}
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="renumberMode"
                    value="keep"
                    checked={renumberMode === 'keep'}
                    onChange={() => setRenumberMode('keep')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-slate-700 font-medium">
                      Conservar números originales del archivo Excel (ej. N° 1, 2, 3...)
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Data Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                  Vista Previa de Filas a Importar (Primeros registros)
                </h5>
                <span className="text-slate-500 text-[11px] font-mono">Total {previewData.length} filas detectadas en muestra</span>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-48">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className={idx === 0 ? 'bg-slate-100 font-bold' : 'hover:bg-slate-50'}>
                        <td className="p-2 text-slate-400 font-sans w-8 text-center">{idx + 1}</td>
                        {row.map((cell: string, cIdx: number) => (
                          <td key={cIdx} className="p-2 text-slate-800 truncate max-w-[150px]">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Result Alert / Report */}
          {importReport && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold ${
                importReport.startsWith('✅')
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              {importReport}
            </div>
          )}

          {/* Tarjeta de Éxito de Comprobantes con Botón Directo */}
          {importedBatchInfo && (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl space-y-3">
              <div className="flex items-center gap-2.5 text-emerald-900 font-black text-sm">
                <span className="text-xl">🎉</span>
                <span>¡{importedBatchInfo.count} Comprobantes Contables guardados en la contabilidad!</span>
              </div>
              <div className="text-xs text-emerald-800 space-y-1 bg-white/70 p-3 rounded-lg border border-emerald-200 font-mono">
                <p>• Rango de Comprobantes: <span className="font-bold text-indigo-700">N° {importedBatchInfo.startNum} al N° {importedBatchInfo.endNum}</span></p>
                <p>• Período Contable: <span className="font-bold">{importedBatchInfo.period}</span> (Año {importedBatchInfo.year}, Mes {importedBatchInfo.month})</p>
              </div>
              {onNavigateToVouchers && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateToVouchers(importedBatchInfo.period, importedBatchInfo.year, importedBatchInfo.month);
                    onClose();
                  }}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <span>🔍 Ver Comprobantes Importados en la Contabilidad (N° {importedBatchInfo.startNum} - N° {importedBatchInfo.endNum})</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-lg border border-slate-300 transition-colors"
          >
            Cerrar
          </button>
          <button
            onClick={handleExecuteImport}
            disabled={isProcessing || !fileContent}
            className={`px-5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-xs ${
              isProcessing || !fileContent
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <span>⚡</span>
            <span>{isProcessing ? 'Importando a la Base de Datos...' : `Cargar ${activeTab.toUpperCase()} a la Empresa`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
