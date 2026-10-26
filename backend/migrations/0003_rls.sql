-- Tenant isolation and least-privilege grants. app_rw has no DELETE grants on
-- tenant tables, and audit events are insert-only.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE fleets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleets FORCE ROW LEVEL SECURITY;
ALTER TABLE fleet_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE hires ENABLE ROW LEVEL SECURITY;
ALTER TABLE hires FORCE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittances FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY fleets_select ON fleets
  FOR SELECT TO app_rw
  USING (
    id = app_security.current_fleet_id()
    OR app_security.is_platform_admin()
  );

CREATE POLICY users_select ON users
  FOR SELECT TO app_rw
  USING (
    id = app_security.current_user_id()
    OR idp_subject = NULLIF(current_setting('app.idp_subject', true), '')
  );

CREATE POLICY fleet_memberships_select ON fleet_memberships
  FOR SELECT TO app_rw
  USING (
    user_id = app_security.current_user_id()
    OR (
      fleet_id = app_security.current_fleet_id()
      AND app_security.has_permission('fleet.members.read')
    )
  );

CREATE POLICY platform_admins_select ON platform_admins
  FOR SELECT TO app_rw
  USING (user_id = app_security.current_user_id());

-- Finance context may see soft-deleted vehicles through finance joins so historical
-- income, expense, and remittance rows retain registration context. The vehicle
-- endpoints still filter deleted rows, so this is not a deleted-vehicle listing grant.
CREATE POLICY vehicles_select ON vehicles
  FOR SELECT TO app_rw
  USING (
    (
      fleet_id = app_security.current_fleet_id()
      AND (
        app_security.has_permission('fleet.vehicles.read')
        OR app_security.has_permission('finance.context.read')
      )
      AND (
        deleted_at IS NULL
        OR app_security.has_permission('fleet.vehicles.restore')
        OR app_security.has_permission('finance.context.read')
      )
    )
    OR app_security.is_platform_admin()
  );

CREATE POLICY vehicles_insert ON vehicles
  FOR INSERT TO app_rw
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.vehicles.create')
    AND (
      app_security.current_role_name() <> 'fleet_member'
      OR app_security.member_can_write()
    )
    AND deleted_at IS NULL
    AND deleted_by IS NULL
  );

CREATE POLICY vehicles_update ON vehicles
  FOR UPDATE TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND (
      app_security.has_permission('fleet.vehicles.update')
      OR app_security.has_permission('fleet.vehicles.restore')
    )
    AND (
      deleted_at IS NULL
      OR app_security.has_permission('fleet.vehicles.restore')
    )
    AND (
      app_security.current_role_name() <> 'fleet_member'
      OR app_security.member_can_write()
      OR app_security.has_permission('fleet.vehicles.restore')
    )
  )
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND (
      app_security.has_permission('fleet.vehicles.update')
      OR app_security.has_permission('fleet.vehicles.restore')
    )
    AND (
      deleted_at IS NULL
      OR app_security.has_permission('fleet.vehicles.restore')
    )
    AND (
      app_security.current_role_name() <> 'fleet_member'
      OR app_security.member_can_write()
      OR app_security.has_permission('fleet.vehicles.restore')
    )
  );

CREATE POLICY vehicles_delete ON vehicles
  FOR DELETE TO app_rw
  USING (false);

CREATE POLICY drivers_select ON drivers
  FOR SELECT TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND (
      app_security.has_permission('fleet.operations.read')
      OR app_security.has_permission('finance.context.read')
    )
  );

CREATE POLICY drivers_insert ON drivers
  FOR INSERT TO app_rw
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.operations.manage')
  );

CREATE POLICY drivers_update ON drivers
  FOR UPDATE TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.operations.manage')
  )
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.operations.manage')
  );

CREATE POLICY drivers_delete ON drivers
  FOR DELETE TO app_rw
  USING (false);

CREATE POLICY hires_select ON hires
  FOR SELECT TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.operations.read')
  );

CREATE POLICY hires_insert ON hires
  FOR INSERT TO app_rw
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.operations.manage')
  );

CREATE POLICY hires_update ON hires
  FOR UPDATE TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.operations.manage')
  )
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.operations.manage')
  );

CREATE POLICY hires_delete ON hires
  FOR DELETE TO app_rw
  USING (false);

CREATE POLICY expenses_select ON expenses
  FOR SELECT TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.expenses.read')
  );

CREATE POLICY expenses_insert ON expenses
  FOR INSERT TO app_rw
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.expenses.manage')
  );

CREATE POLICY expenses_update ON expenses
  FOR UPDATE TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.expenses.manage')
  )
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.expenses.manage')
  );

CREATE POLICY expenses_delete ON expenses
  FOR DELETE TO app_rw
  USING (false);

CREATE POLICY income_entries_select ON income_entries
  FOR SELECT TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.income.read')
  );

CREATE POLICY income_entries_insert ON income_entries
  FOR INSERT TO app_rw
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.income.manage')
  );

CREATE POLICY income_entries_update ON income_entries
  FOR UPDATE TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.income.manage')
  )
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.income.manage')
  );

CREATE POLICY income_entries_delete ON income_entries
  FOR DELETE TO app_rw
  USING (false);

CREATE POLICY remittances_select ON remittances
  FOR SELECT TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.remittances.read')
  );

CREATE POLICY remittances_insert ON remittances
  FOR INSERT TO app_rw
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.remittances.manage')
  );

CREATE POLICY remittances_update ON remittances
  FOR UPDATE TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.remittances.manage')
  )
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('finance.remittances.manage')
  );

CREATE POLICY remittances_delete ON remittances
  FOR DELETE TO app_rw
  USING (false);

CREATE POLICY audit_events_select ON audit_events
  FOR SELECT TO app_rw
  USING (
    (
      fleet_id = app_security.current_fleet_id()
      AND app_security.has_permission('fleet.audit.read')
    )
    OR actor_user_id = app_security.current_user_id()
  );

CREATE POLICY audit_events_insert ON audit_events
  FOR INSERT TO app_rw
  WITH CHECK (
    actor_user_id = app_security.current_user_id()
    AND (actor_type <> 'platform_admin' OR app_security.is_platform_admin())
    AND (
      app_security.is_platform_admin()
      OR fleet_id = app_security.current_fleet_id()
    )
  );

REVOKE ALL ON SCHEMA app_security FROM PUBLIC;
REVOKE ALL ON SCHEMA app_security FROM app_rw;
GRANT USAGE ON SCHEMA public TO app_rw;
GRANT USAGE ON SCHEMA app_security TO app_rw;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_rw;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_security FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_security FROM app_rw;

GRANT SELECT ON
  users,
  fleets,
  fleet_memberships,
  platform_admins,
  vehicles,
  drivers,
  hires,
  expenses,
  income_entries,
  remittances,
  audit_events
TO app_rw;

GRANT INSERT, UPDATE ON
  vehicles,
  drivers,
  hires,
  expenses,
  income_entries,
  remittances
TO app_rw;

GRANT INSERT ON audit_events TO app_rw;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_security TO app_rw;
