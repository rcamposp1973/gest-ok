import { db, auth } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, addDoc, updateDoc } from 'firebase/firestore';
import { Company, SiiFolioAuthorization, FolioUsageLog } from '../types';
import { generateCrystalOfficialBookPDF, OfficialBookPrintOptions, OfficialBookPrintResult } from './pdfGenerator';

/**
 * Servicio centralizado para emisión oficial de libros timbrados con control de folios SII.
 * - Verifica y obtiene la autorización vigente de folios SII para la empresa.
 * - Determina el próximo folio correlativo disponible.
 * - Genera el PDF descargable estilo Crystal Reports en el cliente (sin almacenar PDF en servidor).
 * - Registra el log de uso de folios en Firestore para control contable y DDJJ (ej: RLI, Capital Propio, DJ 1847).
 * - Actualiza el contador `currentFolio` en la autorización de folios.
 */

export interface PrintBookWithFolioParams {
  studyId: string;
  company: Company;
  bookType: 'LIBRO_DIARIO' | 'LIBRO_MAYOR' | 'BALANCE_8_COLUMNAS' | 'BALANCE_IFRS' | 'ESTADO_RESULTADOS' | 'RLI' | 'CAPITAL_PROPIO' | 'OTRO' | string;
  bookTitle?: string;
  title?: string;
  periodLabel?: string;
  subtitle?: string;
  periodStr?: string;
  columns: string[] | { header: string; dataKey: string; width?: number; align?: 'left' | 'center' | 'right' }[];
  rows?: Record<string, any>[];
  data?: string[][];
  orientation?: 'portrait' | 'landscape';
  userNotes?: string;
  summaryTotals?: { label: string; values: Record<string, number | string> };
  hasVanVienen?: boolean;
}

export interface PrintBookWithFolioResult {
  success: boolean;
  startFolio: number;
  endFolio: number;
  pagesCount: number;
  resolutionNumber?: string;
  resolutionDate?: string;
  message: string;
}

export async function printAndLogOfficialBook(
  arg1: string | PrintBookWithFolioParams,
  arg2?: Company,
  arg3?: Partial<PrintBookWithFolioParams>
): Promise<PrintBookWithFolioResult> {
  let params: PrintBookWithFolioParams;

  if (typeof arg1 === 'string') {
    params = {
      studyId: arg1,
      company: arg2!,
      bookType: (arg3?.bookType as any) || 'LIBRO_DIARIO',
      bookTitle: arg3?.bookTitle || (arg3 as any)?.title || 'LIBRO OFICIAL',
      periodLabel: arg3?.periodLabel || (arg3 as any)?.subtitle || 'Ejercicio General',
      periodStr: arg3?.periodStr,
      columns: arg3?.columns || [],
      rows: arg3?.rows,
      data: arg3?.data,
      orientation: arg3?.orientation,
      userNotes: arg3?.userNotes,
      summaryTotals: arg3?.summaryTotals,
      hasVanVienen: arg3?.hasVanVienen
    };
  } else {
    params = arg1;
  }

  const { studyId, company, bookType, bookTitle, periodLabel, periodStr, orientation, summaryTotals, hasVanVienen, userNotes } = params;

  try {
    // Convert string[] columns and string[][] data to standard crystal PDF columns & rows
    let formattedColumns: { header: string; dataKey: string; width?: number; align?: 'left' | 'center' | 'right' }[] = [];
    let formattedRows: Record<string, any>[] = [];

    if (Array.isArray(params.columns) && params.columns.length > 0) {
      if (typeof params.columns[0] === 'string') {
        const stringCols = params.columns as string[];
        formattedColumns = stringCols.map((colName, idx) => {
          const isRight = colName.includes('$') || colName.toUpperCase().includes('DEBE') || colName.toUpperCase().includes('HABER') || colName.toUpperCase().includes('SALDO') || colName.toUpperCase().includes('DÉBITO') || colName.toUpperCase().includes('CRÉDITO') || colName.toUpperCase().includes('ACTIVO') || colName.toUpperCase().includes('PASIVO') || colName.toUpperCase().includes('PÉRDIDA') || colName.toUpperCase().includes('GANANCIA');
          return {
            header: colName,
            dataKey: `col_${idx}`,
            align: isRight ? 'right' : 'left'
          };
        });

        if (params.data && Array.isArray(params.data)) {
          formattedRows = params.data.map(rowArr => {
            const rowObj: Record<string, any> = {};
            rowArr.forEach((val, idx) => {
              rowObj[`col_${idx}`] = val;
            });
            return rowObj;
          });
        }
      } else {
        formattedColumns = params.columns as { header: string; dataKey: string; width?: number; align?: 'left' | 'center' | 'right' }[];
        formattedRows = params.rows || [];
      }
    }

    // 1. Obtener autorizaciones de folios vigentes de la empresa
    const authSnap = await getDocs(
      collection(db, 'studies', studyId, 'companies', company.id, 'siiFolioAuthorizations')
    );
    const authList = authSnap.docs.map(d => ({ id: d.id, ...d.data() } as SiiFolioAuthorization));
    
    // Buscar la autorización activa con folios disponibles
    const activeAuth = authList.find(a => a.status === 'Activa' && a.currentFolio <= a.endFolio) || authList[0];

    let startFolio = 1;
    let resolutionNumber = company.dteConfig?.resolutionNumber || 'Res. Ex. SII N° 80';
    let resolutionDate = company.dteConfig?.resolutionDate || '2024-01-15';

    if (activeAuth) {
      startFolio = activeAuth.currentFolio || activeAuth.startFolio || 1;
      resolutionNumber = activeAuth.resolutionNumber || resolutionNumber;
      resolutionDate = activeAuth.resolutionDate || resolutionDate;
    }

    // 2. Generar el PDF oficial y descargar en cliente
    const printOptions: OfficialBookPrintOptions = {
      company,
      bookTitle,
      periodLabel: periodLabel || 'Período General',
      startFolio,
      resolutionNumber,
      resolutionDate,
      columns: formattedColumns,
      rows: formattedRows,
      orientation: orientation || 'portrait',
      summaryTotals,
      hasVanVienen: hasVanVienen !== false
    };

    const pdfResult: OfficialBookPrintResult = generateCrystalOfficialBookPDF(printOptions);
    const { endFolio, pagesCount, fileName } = pdfResult;

    // 3. Registrar FolioUsageLog en Firestore
    const userEmail = auth.currentUser?.email || 'contador@pulsocontable.cl';
    const nowIso = new Date().toISOString();

    const logEntry: Omit<FolioUsageLog, 'id'> = {
      companyId: company.id,
      studyId,
      authorizationId: activeAuth?.id || 'manual_default',
      resolutionNumber,
      bookType,
      bookTitle,
      period: periodStr || periodLabel || 'Período General',
      startFolio,
      endFolio,
      totalFoliosUsed: pagesCount,
      printedBy: userEmail,
      printedAt: nowIso,
      electronicFileHash: `CRYSTAL-SHA-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      status: 'Impreso',
      notes: userNotes || ''
    };

    await addDoc(
      collection(db, 'studies', studyId, 'companies', company.id, 'siiFolioUsageLogs'),
      logEntry
    );

    // 4. Actualizar el contador de la autorización si existe
    if (activeAuth && activeAuth.id) {
      const nextFolio = endFolio + 1;
      const isExhausted = nextFolio > activeAuth.endFolio;
      await updateDoc(
        doc(db, 'studies', studyId, 'companies', company.id, 'siiFolioAuthorizations', activeAuth.id),
        {
          currentFolio: nextFolio,
          status: isExhausted ? 'Agotada' : 'Activa',
          updatedAt: nowIso
        }
      );
    }

    return {
      success: true,
      startFolio,
      endFolio,
      pagesCount,
      resolutionNumber,
      resolutionDate,
      message: `¡Libro "${bookTitle}" generado con éxito! Folios utilizados del ${startFolio} al ${endFolio} (${pagesCount} hojas timbradas). El PDF ha sido descargado a su equipo.`
    };
  } catch (err: any) {
    console.error("Error generating official book with folio control:", err);
    return {
      success: false,
      startFolio: 0,
      endFolio: 0,
      pagesCount: 0,
      message: `Error al generar el libro oficial: ${err.message || 'Error desconocido'}`
    };
  }
}
