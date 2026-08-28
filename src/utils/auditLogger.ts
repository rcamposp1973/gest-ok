import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { AuditLog } from '../types';

export interface LogAuditParams {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  studyId?: string;
  studyName?: string;
  companyId?: string;
  companyName?: string;
  action: AuditLog['action'];
  module: AuditLog['module'];
  details: string;
  metadata?: { [key: string]: any };
}

/**
 * Registers an audit event in Firestore (collection: 'auditLogs')
 * Stores exact timestamp, user info, study, company, action and module.
 */
export async function logAuditEvent(params: LogAuditParams): Promise<string | null> {
  try {
    const currentUser = auth.currentUser;
    const resolvedUserId = params.userId || currentUser?.uid || 'anon';
    const resolvedEmail = params.userEmail || currentUser?.email || 'sistema@gestok.cl';
    const nowIso = new Date().toISOString();

    const logData: Omit<AuditLog, 'id'> = {
      timestamp: nowIso,
      userId: resolvedUserId,
      userEmail: resolvedEmail,
      userRole: params.userRole || 'USUARIO',
      studyId: params.studyId || '',
      studyName: params.studyName || '',
      companyId: params.companyId || '',
      companyName: params.companyName || '',
      action: params.action,
      module: params.module,
      details: params.details,
      metadata: params.metadata || {}
    };

    const docRef = await addDoc(collection(db, 'auditLogs'), logData);

    // Also write to 'audit_logs' collection for strict requirement compatibility
    try {
      const actionMap: { [key: string]: string } = {
        'ELIMINAR': 'DELETE',
        'ANULAR': 'CANCEL',
        'CREAR': 'CREATE',
        'MODIFICAR': 'UPDATE'
      };

      const mappedAction = params.metadata?.action || actionMap[params.action] || params.action;
      const docType = params.metadata?.documentType || params.module;
      const docId = params.metadata?.documentId || params.metadata?.voucherId || params.metadata?.batchId || params.metadata?.rcvDocId || '';
      const motivoStr = params.metadata?.motivo || params.details || '';

      await addDoc(collection(db, 'audit_logs'), {
        userId: resolvedUserId,
        userEmail: resolvedEmail,
        action: mappedAction,
        documentType: docType,
        documentId: docId,
        timestamp: nowIso,
        motivo: motivoStr,
        details: params.details,
        module: params.module,
        studyId: params.studyId || '',
        companyId: params.companyId || '',
        metadata: params.metadata || {}
      });
    } catch (e) {
      console.warn('[AuditLogger] Error al registrar en audit_logs:', e);
    }

    return docRef.id;
  } catch (error) {
    console.warn('[AuditLogger] Error al registrar evento de auditoría:', error);
    return null;
  }
}
