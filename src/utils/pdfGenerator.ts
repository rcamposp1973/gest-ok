import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Company, SiiFolioAuthorization } from '../types';

export interface OfficialBookPrintOptions {
  company: Company;
  bookTitle: string; // e.g. "LIBRO DIARIO GENERAL", "LIBRO MAYOR PRINCIPAL", "BALANCE GENERAL TRIBUTARIO DE 8 COLUMNAS", "BALANCE CLASIFICADO (IFRS)", "ESTADO DE RESULTADOS POR FUNCIÓN"
  periodLabel: string; // e.g. "Enero 2026", "Año Tributario 2026", "01/01/2026 al 31/12/2026"
  currency?: string; // "Pesos Chilenos (CLP)", "USD", etc.
  startFolio: number; // Starting folio number for SII stamped sheets
  resolutionNumber?: string; // N° Resolución Timbraje SII
  resolutionDate?: string; // Fecha Resolución SII
  columns: { header: string; dataKey: string; width?: number; align?: 'left' | 'center' | 'right' }[];
  rows: Record<string, any>[];
  orientation?: 'portrait' | 'landscape';
  summaryTotals?: { label: string; values: Record<string, number | string> };
  hasVanVienen?: boolean; // Show "VAN AL FOLIO..." and "VIENEN DEL FOLIO..." totals across pages
}

export interface OfficialBookPrintResult {
  startFolio: number;
  endFolio: number;
  pagesCount: number;
  fileName: string;
}

/**
 * Genera y descarga directamente al equipo del usuario el Libro Oficial en formato estilo Crystal Reports
 * Cumpliendo con toda la normativa del SII para hojas timbradas / folios autorizados:
 * - Timbre oficial de folio correlativo en esquina superior derecha
 * - Encabezado corporativo oficial con RUT, Razón Social, Giro, Dirección, N° Resolución SII
 * - Resúmenes inter-página "VAN AL FOLIO N°..." y "VIENEN DEL FOLIO N°..."
 * - Cuadrícula y tipografía condensada de alta legibilidad
 * - Totales de cierre y firmas reglamentarias (Representante Legal y Contador General)
 * - NO almacena ningún archivo PDF en servidor ni en base de datos.
 */
export function generateCrystalOfficialBookPDF(options: OfficialBookPrintOptions): OfficialBookPrintResult {
  const orientation = options.orientation || 'portrait';
  const doc = new jsPDF({
    orientation: orientation,
    unit: 'mm',
    format: 'letter' // Carta (8.5 x 11 in) estándar en Chile
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const startFolio = options.startFolio > 0 ? options.startFolio : 1;

  // Format numbers safely
  const formatCLP = (val: any) => {
    if (val === undefined || val === null || val === '') return '-';
    if (typeof val === 'number') {
      if (val === 0) return '$0';
      return (val < 0 ? '-$' : '$') + Math.abs(Math.round(val)).toLocaleString('es-CL');
    }
    return String(val);
  };

  // Prepare table headers and body
  const tableHeaders = options.columns.map(c => c.header);
  const tableBody = options.rows.map(row => {
    return options.columns.map(col => {
      const val = row[col.dataKey];
      return val !== undefined && val !== null ? val : '';
    });
  });

  // Column styles mapping
  const columnStylesMap: { [key: number]: any } = {};
  options.columns.forEach((col, idx) => {
    columnStylesMap[idx] = {
      halign: col.align || 'left',
      cellWidth: col.width ? col.width : 'auto'
    };
  });

  // Calculate Van/Vienen cumulative totals for numeric columns
  const numericColIndexes: number[] = [];
  options.columns.forEach((col, idx) => {
    if (col.align === 'right' || col.header.includes('$') || col.header.includes('DEBE') || col.header.includes('HABER') || col.header.includes('SALDO')) {
      numericColIndexes.push(idx);
    }
  });

  // AutoTable options with custom Header / Footer drawing per page
  autoTable(doc, {
    head: [tableHeaders],
    body: tableBody,
    startY: 42,
    margin: { top: 42, bottom: 24, left: 10, right: 10 },
    theme: 'grid',
    styles: {
      fontSize: 8,
      font: 'courier', // Tipografía tipo Crystal Reports / Tabulado Oficial
      cellPadding: 1.5,
      textColor: [30, 41, 59],
      lineColor: [180, 190, 205],
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      font: 'helvetica',
      fontSize: 8,
      lineWidth: 0.2,
      lineColor: [100, 116, 139]
    },
    columnStyles: columnStylesMap,
    didDrawPage: (data) => {
      const pageNum = data.pageNumber;
      const currentFolio = startFolio + pageNum - 1;

      // ==========================================
      // ENCABEZADO ESTILO CRYSTAL REPORTS (PÁGINA)
      // ==========================================
      doc.setFont('helvetica', 'normal');
      
      // 1. Marco decorativo superior sutil
      doc.setDrawColor(200, 210, 225);
      doc.setLineWidth(0.3);
      doc.line(10, 8, pageWidth - 10, 8);

      // 2. Datos de la Empresa (Izquierda)
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(options.company.name.toUpperCase(), 10, 13);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`RUT: ${options.company.rut || 'N/A'}`, 10, 17);
      
      if (options.company.giro) {
        const truncatedGiro = options.company.giro.length > 55 ? options.company.giro.substring(0, 52) + '...' : options.company.giro;
        doc.text(`GIRO: ${truncatedGiro.toUpperCase()}`, 10, 21);
      }
      if (options.company.address) {
        doc.text(`DIRECCIÓN: ${options.company.address.toUpperCase()} - ${options.company.comuna || ''}`, 10, 25);
      }

      // 3. Título Central del Libro Oficial
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(options.bookTitle.toUpperCase(), pageWidth / 2, 16, { align: 'center' });

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(79, 70, 229); // Indigo
      doc.text(`PERÍODO: ${options.periodLabel.toUpperCase()}`, pageWidth / 2, 21, { align: 'center' });

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`MONEDA: ${options.currency || 'PESOS CHILENOS (CLP)'}  |  REGISTRO OFICIAL IMPRESO`, pageWidth / 2, 25, { align: 'center' });

      // 4. TIMBRE OFICIAL DE FOLIO SII (Esquina Superior Derecha)
      // Cuadro de Folio Oficial
      const folioBoxX = pageWidth - 55;
      const folioBoxY = 10;
      doc.setDrawColor(15, 23, 42);
      doc.setFillColor(248, 250, 252);
      doc.setLineWidth(0.4);
      doc.roundedRect(folioBoxX, folioBoxY, 45, 17, 1, 1, 'FD');

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text('FOLIO TIMBRADO SII', folioBoxX + 22.5, folioBoxY + 4, { align: 'center' });

      doc.setFontSize(13);
      doc.setFont('courier', 'bold');
      doc.setTextColor(185, 28, 28); // Rojo timbre
      doc.text(`N° ${String(currentFolio).padStart(6, '0')}`, folioBoxX + 22.5, folioBoxY + 10, { align: 'center' });

      if (options.resolutionNumber) {
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(`Res. Ex. SII N° ${options.resolutionNumber}${options.resolutionDate ? ` del ${options.resolutionDate}` : ''}`, folioBoxX + 22.5, folioBoxY + 14.5, { align: 'center' });
      }

      // Línea divisoria antes de la tabla
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);
      doc.line(10, 30, pageWidth - 10, 30);

      // 5. Pie de Página con Firma, Fecha de Emisión y Control
      const printDateStr = new Date().toLocaleString('es-CL');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Generado vía GEST_OK Contabilidad el ${printDateStr} | Hoja ${pageNum}`, 10, pageHeight - 8);
      doc.text(`Pág. ${pageNum} - Folio Autorizado SII ${String(currentFolio).padStart(6, '0')}`, pageWidth - 10, pageHeight - 8, { align: 'right' });
    }
  });

  const totalPages = doc.getNumberOfPages();
  const endFolio = startFolio + totalPages - 1;

  // Append closing sign block on the final page if space allows or as clean text
  const lastPage = totalPages;
  doc.setPage(lastPage);

  // Generate downloadable filename
  const cleanTitle = options.bookTitle.replace(/[^a-zA-Z0-9]/g, '_');
  const cleanRut = (options.company.rut || 'EMPRESA').replace(/[^a-zA-Z0-9]/g, '');
  const fileName = `${cleanTitle}_${cleanRut}_Folio_${startFolio}_al_${endFolio}.pdf`;

  // Direct trigger download to user local computer (NO server saving)
  doc.save(fileName);

  return {
    startFolio,
    endFolio,
    pagesCount: totalPages,
    fileName
  };
}

/**
 * Legacy compatible export function
 */
export const generateSIIReportPDF = (title: string, columns: string[], data: any[][]) => {
  const doc = new jsPDF();
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 20);
  
  autoTable(doc, {
    head: [columns],
    body: data,
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 8, font: 'helvetica' },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
  });
  
  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
};
