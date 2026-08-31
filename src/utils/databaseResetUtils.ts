import { collection, collectionGroup, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface PurgeStats {
  studiesDeleted: number;
  companiesDeleted: number;
  usersDeleted: number;
  vouchersDeleted: number;
  accountsDeleted: number;
  auxiliariesDeleted: number;
  rcvDeleted: number;
  reconciliationsDeleted: number;
  economicIndicatorsDeleted: number;
  auditLogsDeleted: number;
  totalDocumentsDeleted: number;
}

/**
 * Deletes all documents from a Firestore collectionGroup in batches of 400.
 */
async function deleteEntireCollectionGroup(groupName: string): Promise<number> {
  let count = 0;
  try {
    const snap = await getDocs(collectionGroup(db, groupName));
    if (snap.empty) return 0;

    let batch = writeBatch(db);
    let batchCount = 0;

    for (const d of snap.docs) {
      batch.delete(d.ref);
      batchCount++;
      count++;

      if (batchCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn(`Warning deleting collectionGroup ${groupName}:`, err);
  }
  return count;
}

/**
 * Deletes all documents from a top-level collection in batches of 400.
 */
async function deleteEntireCollection(collectionName: string, preserveCondition?: (docId: string, data: any) => boolean): Promise<number> {
  let count = 0;
  try {
    const snap = await getDocs(collection(db, collectionName));
    if (snap.empty) return 0;

    let batch = writeBatch(db);
    let batchCount = 0;

    for (const d of snap.docs) {
      if (preserveCondition && preserveCondition(d.id, d.data())) {
        continue;
      }
      batch.delete(d.ref);
      batchCount++;
      count++;

      if (batchCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } catch (err) {
    console.warn(`Warning deleting collection ${collectionName}:`, err);
  }
  return count;
}

/**
 * Executes a full purge of the database, leaving it at ZERO except for the Super Admin accounts in `superUsers`.
 */
export async function executeCompleteDatabasePurge(): Promise<PurgeStats> {
  const stats: PurgeStats = {
    studiesDeleted: 0,
    companiesDeleted: 0,
    usersDeleted: 0,
    vouchersDeleted: 0,
    accountsDeleted: 0,
    auxiliariesDeleted: 0,
    rcvDeleted: 0,
    reconciliationsDeleted: 0,
    economicIndicatorsDeleted: 0,
    auditLogsDeleted: 0,
    totalDocumentsDeleted: 0
  };

  // 1. Delete all nested subcollections via collectionGroup
  stats.vouchersDeleted += await deleteEntireCollectionGroup('vouchers');
  stats.accountsDeleted += await deleteEntireCollectionGroup('accounts');
  stats.auxiliariesDeleted += await deleteEntireCollectionGroup('auxiliaries');
  stats.rcvDeleted += await deleteEntireCollectionGroup('rcv');
  stats.reconciliationsDeleted += await deleteEntireCollectionGroup('bankReconciliations');
  stats.economicIndicatorsDeleted += await deleteEntireCollectionGroup('economicIndicators');
  stats.economicIndicatorsDeleted += await deleteEntireCollectionGroup('historicalExchangeRates');
  stats.companiesDeleted += await deleteEntireCollectionGroup('companies');
  stats.usersDeleted += await deleteEntireCollectionGroup('users');
  
  // Secondary / potential extra subcollections
  await deleteEntireCollectionGroup('dteDocuments');
  await deleteEntireCollectionGroup('fixedAssets');
  await deleteEntireCollectionGroup('cashFlow');
  await deleteEntireCollectionGroup('paymentOrders');

  // 2. Delete top-level collections
  stats.studiesDeleted += await deleteEntireCollection('studies');
  stats.auditLogsDeleted += await deleteEntireCollection('auditLogs');
  await deleteEntireCollection('historicalExchangeRates');
  await deleteEntireCollection('economicIndicators');
  await deleteEntireCollection('dtes');

  // Clean any non-root superUsers if necessary, but PRESERVE all superUsers marked as Super Admin or root
  // We keep superUsers intact so the Super Admin account and password remain 100% active.

  stats.totalDocumentsDeleted = 
    stats.studiesDeleted +
    stats.companiesDeleted +
    stats.usersDeleted +
    stats.vouchersDeleted +
    stats.accountsDeleted +
    stats.auxiliariesDeleted +
    stats.rcvDeleted +
    stats.reconciliationsDeleted +
    stats.economicIndicatorsDeleted +
    stats.auditLogsDeleted;

  return stats;
}
