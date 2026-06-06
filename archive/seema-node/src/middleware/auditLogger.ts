import prisma from '../lib/prisma';
import logger from '../utils/logger';

interface AuditLogParams {
  firmId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Creates an audit log entry in the database.
 * Designed to be called from route handlers after successful operations.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        firmId: params.firmId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        ipAddress: params.ipAddress || null,
        details: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });

    logger.debug('Audit log created', {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.userId,
    });
  } catch (err) {
    // Audit logging should never break the main request flow
    logger.error('Failed to create audit log', {
      error: err instanceof Error ? err.message : 'Unknown error',
      params,
    });
  }
}
