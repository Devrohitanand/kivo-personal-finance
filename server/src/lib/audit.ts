import type { Prisma } from '@prisma/client';

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditInput {
  userId: string;
  action: 'create' | 'update' | 'archive' | 'delete' | 'settle' | 'login' | 'register';
  entity: 'person' | 'entry' | 'repayment' | 'account' | 'session';
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
}

export async function recordAudit(client: AuditClient, input: AuditInput): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: input.meta ?? undefined,
    },
  });
}
