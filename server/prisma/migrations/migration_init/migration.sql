CREATE TYPE "Direction" AS ENUM ('LENT', 'BORROWED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "principalPaise" INTEGER NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Entry_principalPaise_positive" CHECK ("principalPaise" > 0)
);

CREATE TABLE "Repayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Repayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Repayment_amountPaise_positive" CHECK ("amountPaise" > 0)
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "sid" TEXT NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("sid")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Person_userId_name_idx" ON "Person"("userId", "name");
CREATE INDEX "Person_userId_archivedAt_idx" ON "Person"("userId", "archivedAt");
CREATE INDEX "Entry_userId_occurredAt_idx" ON "Entry"("userId", "occurredAt");
CREATE INDEX "Entry_userId_direction_idx" ON "Entry"("userId", "direction");
CREATE INDEX "Entry_personId_idx" ON "Entry"("personId");
CREATE UNIQUE INDEX "Entry_userId_idempotencyKey_key" ON "Entry"("userId", "idempotencyKey");
CREATE INDEX "Repayment_entryId_idx" ON "Repayment"("entryId");
CREATE INDEX "Repayment_userId_occurredAt_idx" ON "Repayment"("userId", "occurredAt");
CREATE UNIQUE INDEX "Repayment_userId_idempotencyKey_key" ON "Repayment"("userId", "idempotencyKey");
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "Session_expire_idx" ON "Session"("expire");

ALTER TABLE "Person" ADD CONSTRAINT "Person_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
