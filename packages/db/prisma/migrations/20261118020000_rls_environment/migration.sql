DROP POLICY IF EXISTS "app_data_schema_tenant_isolation" ON "AppDataSchema";
DROP POLICY IF EXISTS "app_data_record_tenant_isolation" ON "AppDataRecord";
DROP POLICY IF EXISTS "app_data_migration_tenant_isolation" ON "AppDataMigration";

CREATE POLICY "app_data_schema_tenant_isolation" ON "AppDataSchema"
    USING (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
        AND "environment" = current_setting('app.current_environment', true)
    )
    WITH CHECK (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
        AND "environment" = current_setting('app.current_environment', true)
    );

CREATE POLICY "app_data_record_tenant_isolation" ON "AppDataRecord"
    USING (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
        AND "environment" = current_setting('app.current_environment', true)
    )
    WITH CHECK (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
        AND "environment" = current_setting('app.current_environment', true)
    );

CREATE POLICY "app_data_migration_tenant_isolation" ON "AppDataMigration"
    USING (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
        AND "environment" = current_setting('app.current_environment', true)
    )
    WITH CHECK (
        "organizationId" = current_setting('app.current_org_id', true)
        AND "appId" = current_setting('app.current_app_id', true)
        AND "environment" = current_setting('app.current_environment', true)
    );
