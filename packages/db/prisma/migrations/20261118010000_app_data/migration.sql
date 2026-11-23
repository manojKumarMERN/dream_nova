CREATE TABLE "AppDataSchema" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppDataSchema_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppDataRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,

    CONSTRAINT "AppDataRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppDataMigration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "fromVersion" TEXT NOT NULL,
    "toVersion" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppDataMigration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppDataSchema_organizationId_appId_environment_modelId_key" ON "AppDataSchema"("organizationId", "appId", "environment", "modelId");
CREATE INDEX "AppDataSchema_organizationId_appId_environment_idx" ON "AppDataSchema"("organizationId", "appId", "environment");
CREATE UNIQUE INDEX "AppDataRecord_organizationId_appId_environment_modelId_id_key" ON "AppDataRecord"("organizationId", "appId", "environment", "modelId", "id");
CREATE INDEX "AppDataRecord_organizationId_appId_environment_modelId_idx" ON "AppDataRecord"("organizationId", "appId", "environment", "modelId");
CREATE INDEX "AppDataRecord_organizationId_appId_environment_modelId_createdAt_idx" ON "AppDataRecord"("organizationId", "appId", "environment", "modelId", "createdAt");
CREATE UNIQUE INDEX "AppDataMigration_organizationId_appId_environment_toVersion_key" ON "AppDataMigration"("organizationId", "appId", "environment", "toVersion");
CREATE INDEX "AppDataMigration_organizationId_appId_environment_createdAt_idx" ON "AppDataMigration"("organizationId", "appId", "environment", "createdAt");

ALTER TABLE "AppDataSchema" ADD CONSTRAINT "AppDataSchema_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppDataSchema" ADD CONSTRAINT "AppDataSchema_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppDataRecord" ADD CONSTRAINT "AppDataRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppDataRecord" ADD CONSTRAINT "AppDataRecord_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppDataMigration" ADD CONSTRAINT "AppDataMigration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppDataMigration" ADD CONSTRAINT "AppDataMigration_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppDataSchema" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppDataRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppDataMigration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppDataSchema" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AppDataRecord" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AppDataMigration" FORCE ROW LEVEL SECURITY;

CREATE POLICY "app_data_schema_tenant_isolation" ON "AppDataSchema"
    USING (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
    )
    WITH CHECK (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
    );

CREATE POLICY "app_data_record_tenant_isolation" ON "AppDataRecord"
    USING (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
    )
    WITH CHECK (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
    );

CREATE POLICY "app_data_migration_tenant_isolation" ON "AppDataMigration"
    USING (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
    )
    WITH CHECK (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
    );
