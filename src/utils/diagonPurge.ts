import { collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export async function purgeDiagonConstruccionesData() {
  try {
    const studiesSnap = await getDocs(collection(db, 'studies'));
    let targetStudyId = null;
    let targetCompanyId = null;

    for (const sDoc of studiesSnap.docs) {
      const sData = sDoc.data();
      const sName = (sData.name || '').toLowerCase();
      if (sName.includes('ricardo ibarra')) {
        targetStudyId = sDoc.id;
        break;
      }
    }

    if (!targetStudyId) {
      throw new Error("No se encontró el estudio contable de Ricardo Ibarra Pérez.");
    }

    const companiesSnap = await getDocs(collection(db, 'studies', targetStudyId, 'companies'));
    for (const cDoc of companiesSnap.docs) {
      const cData = cDoc.data();
      const cName = (cData.name || '').toLowerCase();
      if (cName.includes('diagon construcciones')) {
        targetCompanyId = cDoc.id;
        break;
      }
    }

    if (!targetCompanyId) {
      throw new Error("No se encontró la empresa 'Diagon Construcciones SpA' en el estudio de Ricardo Ibarra Pérez.");
    }

    const compRef = doc(db, 'studies', targetStudyId, 'companies', targetCompanyId);
    let rcvDeleted = 0;
    let vouchersDeleted = 0;

    // 1. Purge rcvDocuments
    const rcvSnap = await getDocs(collection(compRef, 'rcvDocuments'));
    let batch = writeBatch(db);
    let count = 0;
    for (const rDoc of rcvSnap.docs) {
      batch.delete(rDoc.ref);
      rcvDeleted++;
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }

    // 2. Purge vouchers
    const vouchSnap = await getDocs(collection(compRef, 'vouchers'));
    batch = writeBatch(db);
    count = 0;
    for (const vDoc of vouchSnap.docs) {
      batch.delete(vDoc.ref);
      vouchersDeleted++;
      count++;
      if (count >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }

    return {
      success: true,
      message: `Se han eliminado exitosamente ${rcvDeleted} documentos RCV y ${vouchersDeleted} comprobantes (vouchers) para la empresa Diagon Construcciones SpA.`
    };
  } catch (err: any) {
    console.error("Error purging Diagon Construcciones data:", err);
    return { success: false, error: err.message };
  }
}
