-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AppStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EnvironmentName" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AI_AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'VALIDATING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'DESTRUCTIVE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('BUILDING', 'PUBLISHED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "PlatformTarget" AS ENUM ('WEB', 'ANDROID', 'IOS', 'WINDOWS', 'MACOS', 'LINUX');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('RUNTIME_BUNDLE', 'NATIVE_BINARY', 'SOURCE_ARCHIVE');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('PENDING', 'BUILDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "MigrationDirection" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AppStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppVersion" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "parentVersionId" TEXT,
    "schemaVersion" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "changeSummary" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdByActorType" "ActorType" NOT NULL DEFAULT 'USER',
    "sourceProposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppEnvironment" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" "EnvironmentName" NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentContractVersion" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contract" JSONB NOT NULL,
    "deprecatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComponentContractVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecMigration" (
    "id" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "direction" "MigrationDirection" NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecMigration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "conversationId" TEXT,
    "baseVersionId" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "rationale" TEXT,
    "operations" JSONB NOT NULL,
    "validationResult" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdByActorType" "ActorType" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appVersionId" TEXT NOT NULL,
    "environment" "EnvironmentName" NOT NULL,
    "releaseNumber" INTEGER NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'BUILDING',
    "publishedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildArtifact" (
    "id" TEXT NOT NULL,
    "appVersionId" TEXT NOT NULL,
    "target" "PlatformTarget" NOT NULL,
    "artifactType" "ArtifactType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "secretRef" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT,
    "proposalId" TEXT,
    "actorUserId" TEXT,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_organizationId_role_idx" ON "Membership"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "App_organizationId_status_idx" ON "App"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "App_organizationId_slug_key" ON "App"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "AppVersion_appId_createdAt_idx" ON "AppVersion"("appId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppVersion_appId_versionNumber_key" ON "AppVersion"("appId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AppEnvironment_appId_name_key" ON "AppEnvironment"("appId", "name");

-- CreateIndex
CREATE INDEX "ComponentContractVersion_type_idx" ON "ComponentContractVersion"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentContractVersion_type_version_key" ON "ComponentContractVersion"("type", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SpecMigration_fromVersion_toVersion_direction_key" ON "SpecMigration"("fromVersion", "toVersion", "direction");

-- CreateIndex
CREATE INDEX "AiConversation_organizationId_createdAt_idx" ON "AiConversation"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiProposal_organizationId_appId_status_idx" ON "AiProposal"("organizationId", "appId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_proposalId_approverUserId_key" ON "Approval"("proposalId", "approverUserId");

-- CreateIndex
CREATE INDEX "Release_appId_environment_status_idx" ON "Release"("appId", "environment", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Release_appId_environment_releaseNumber_key" ON "Release"("appId", "environment", "releaseNumber");

-- CreateIndex
CREATE INDEX "BuildArtifact_appVersionId_target_idx" ON "BuildArtifact"("appVersionId", "target");

-- CreateIndex
CREATE INDEX "Integration_organizationId_providerKey_idx" ON "Integration"("organizationId", "providerKey");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppVersion" ADD CONSTRAINT "AppVersion_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppVersion" ADD CONSTRAINT "AppVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "AppVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppEnvironment" ADD CONSTRAINT "AppEnvironment_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppEnvironment" ADD CONSTRAINT "AppEnvironment_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "AppVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposal" ADD CONSTRAINT "AiProposal_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "AppVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AiProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_appVersionId_fkey" FOREIGN KEY ("appVersionId") REFERENCES "AppVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildArtifact" ADD CONSTRAINT "BuildArtifact_appVersionId_fkey" FOREIGN KEY ("appVersionId") REFERENCES "AppVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AiProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

