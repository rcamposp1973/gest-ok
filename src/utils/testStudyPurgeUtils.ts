import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logAuditEvent } from './auditLogger';

export interface TestStudyPurgeStats {
  vouchersDeleted: number;
  rcvDeleted: number;
  reconciliationsDeleted: number;
  accountsDeleted: number;
  auxiliariesDeleted: number;
  totalDeleted: number;
  purgedCompaniesCount: number;
}

/**
 * Checks if a given study name or ID corresponds to the Test Study (ESTUDIO DE PRUEBA).
 */
export function isTestStudy(studyId: string, studyName?: string): boolean {
  if (!studyId && !studyName) return false;
  const nameClean = (studyName || '').trim().toUpperCase();
  const idClean = (studyId || '').trim().toUpperCase();

  return (
    nameClean === 'ESTUDIO DE PRUEBA' ||
    nameClean === 'EST_PRUEBA' ||
    nameClean.includes('ESTUDIO DE PRUEBA') ||
    nameClean.includes('ESTUDIO PRUEBA') ||
    nameClean.includes('DEMO') ||
    idClean === 'EST_PRUEBA' ||
    idClean === 'ESTUDIO_DE_PRUEBA' ||
    idClean === 'ESTUDIO-DE-PRUEBA'
  );
}

/**
 * Purges transactional accounting and financial data from ALL companies in ESTUDIO DE PRUEBA,
 * or from a specific company within ESTUDIO DE PRUEBA.
 *
 * This resets vouchers, RCV invoices/purchases/sales, bank reconciliations, bank statement lines,
 * leaving chart of accounts or company structure intact (or clearing test transactions).
 */
export async function executeTestStudyDataPurge(
  studyId: string,
  studyName: string,
  targetCompanyId?: string,
  userEmail?: string,
  userId?: string
): Promise<TestStudyPurgeStats> {
  // Strict safety check: Must be ESTUDIO DE PRUEBA
  if (!isTestStudy(studyId, studyName)) {
    throw new Error(`Acción denegada: La purga de datos está estrictamente restringida y SOLO permitida en 'ESTUDIO DE PRUEBA'. El estudio actual (${studyName || studyId}) tiene trazabilidad contable protegida.`);
  }

  const stats: TestStudyPurgeStats = {
    vouchersDeleted: 0,
    rcvDeleted: 0,
    reconciliationsDeleted: 0,
    accountsDeleted: 0,
    auxiliariesDeleted: 0,
    totalDeleted: 0,
    purgedCompaniesCount: 0
  };

  const studyDocRef = doc(db, 'studies', studyId);

  // 1. Determine companies to purge
  let companyIdsToPurge: string[] = [];
  if (targetCompanyId) {
    companyIdsToPurge = [targetCompanyId];
  } else {
    const companiesSnap = await getDocs(collection(studyDocRef, 'companies'));
    companyIdsToPurge = companiesSnap.docs.map(d => d.id);
  }

  stats.purgedCompaniesCount = companyIdsToPurge.length;

  // Subcollections to purge inside each company in ESTUDIO DE PRUEBA
  const subcollections = [
    'vouchers',
    'rcvDocuments',
    'bankReconciliations',
    'dteDocuments',
    'accountMatches',
    'bankConfig'
  ];

  for (const compId of companyIdsToPurge) {
    const compRef = doc(studyDocRef, 'companies', compId);

    for (const subColName of subcollections) {
      try {
        const subSnap = await getDocs(collection(compRef, subColName));
        if (!subSnap.empty) {
          let batch = writeBatch(db);
          let batchCount = 0;

          for (const itemDoc of subSnap.docs) {
            batch.delete(itemDoc.ref);
            batchCount++;

            if (subColName === 'vouchers') stats.vouchersDeleted++;
            else if (subColName === 'rcvDocuments') stats.rcvDeleted++;
            else if (subColName === 'bankReconciliations') stats.reconciliationsDeleted++;
            else if (subColName === 'accounts') stats.accountsDeleted++;
            else if (subColName === 'auxiliaries') stats.auxiliariesDeleted++;
            stats.totalDeleted++;

            if (batchCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          }

          if (batchCount > 0) {
            await batch.commit();
          }
        }
      } catch (colErr) {
        console.warn(`Error purging subcollection ${subColName} in company ${compId}:`, colErr);
      }
    }
  }

  // Audit log the test purge
  try {
    logAuditEvent({
      userId: userId || 'demo_user',
      userEmail: userEmail || 'sistema@estudiodeprueba.cl',
      studyId,
      companyId: targetCompanyId || 'ALL_TEST_COMPANIES',
      action: 'PURGA',
      module: 'DEMO_PURGE',
      details: `Purga controlada de datos de demostración en ESTUDIO DE PRUEBA (${stats.totalDeleted} registros eliminados en ${stats.purgedCompaniesCount} empresa(s)).`,
      metadata: {
        action: 'PURGE_TEST_DATA',
        studyId,
        studyName,
        targetCompanyId: targetCompanyId || 'ALL',
        stats
      }
    });
  } catch (auditErr) {
    console.warn("Could not write audit log for test purge:", auditErr);
  }

  return stats;
}
