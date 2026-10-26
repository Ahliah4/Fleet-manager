-- Phase 1 schema. This is the target shape for the local-first fleet app's shared
-- backend. It intentionally excludes fuel tracking, dispatch, odometer/mileage, GPS,
-- customer/booking, attachments, notifications, and settlements. Those are not part
-- of this phase's agreed scope.

CREATE SCHEMA IF NOT EXISTS app_security;
REVOKE ALL ON SCHEMA app_security FROM PUBLIC;

CREATE TYPE fleet_status AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'closed');
CREATE TYPE fleet_role AS ENUM (
  'fleet_owner',
  'fleet_admin',
  'fleet_manager',
  'finance_manager',
  'fleet_member',
  'read_only'
);
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended', 'removed');
CREATE TYPE driver_status AS ENUM ('active', 'inactive');
CREATE TYPE hire_status AS ENUM ('planned', 'active', 'completed', 'cancelled');
CREATE TYPE finance_status AS ENUM ('posted', 'voided');
CREATE TYPE audit_actor_type AS ENUM ('user', 'platform_admin', 'worker', 'migration', 'system');
CREATE TYPE platform_admin_status AS ENUM ('active', 'suspended');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idp_subject text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status user_status NOT NULL DEFAULT 'active',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_idp_subject_length CHECK (length(btrim(idp_subject)) BETWEEN 1 AND 255),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
  CONSTRAINT users_email_length CHECK (length(email) BETWEEN 3 AND 320 AND position('@' IN email) > 1),
  CONSTRAINT users_display_name_length CHECK (length(btrim(display_name)) BETWEEN 1 AND 120)
);

CREATE TABLE fleets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  status fleet_status NOT NULL DEFAULT 'pending',
  owner_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  status_window_days integer NOT NULL DEFAULT 30,
  policy jsonb NOT NULL DEFAULT
    '{"member_can_write": true, "member_can_export": true, "readonly_can_export": false, "manager_can_manage_members": false, "manager_can_assign_manager": false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleets_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT fleets_timezone_length CHECK (length(btrim(timezone)) BETWEEN 1 AND 80),
  CONSTRAINT fleets_status_window CHECK (status_window_days IN (7, 14, 30, 60, 90)),
  CONSTRAINT fleets_owner_present_when_active CHECK (status <> 'active' OR owner_user_id IS NOT NULL),
  CONSTRAINT fleets_policy_object CHECK (jsonb_typeof(policy) = 'object')
);

CREATE INDEX fleets_status_idx ON fleets (status);

CREATE TABLE fleet_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role fleet_role NOT NULL,
  status membership_status NOT NULL DEFAULT 'invited',
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  joined_at timestamptz,
  suspended_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_memberships_fleet_user_unique UNIQUE (fleet_id, user_id)
);

CREATE UNIQUE INDEX fleet_memberships_one_active_per_user_idx
  ON fleet_memberships (user_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX fleet_memberships_one_active_owner_per_fleet_idx
  ON fleet_memberships (fleet_id)
  WHERE role = 'fleet_owner' AND status = 'active';

CREATE INDEX fleet_memberships_fleet_status_idx
  ON fleet_memberships (fleet_id, status);

CREATE TABLE platform_admins (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  status platform_admin_status NOT NULL DEFAULT 'active',
  mfa_enrolled_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admins_mfa_before_active
    CHECK (status <> 'active' OR mfa_enrolled_at IS NOT NULL)
);

CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT,
  registration_number text NOT NULL,
  registration_normalized text GENERATED ALWAYS AS (lower(btrim(registration_number))) STORED,
  make text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL,
  colour text,
  notes text,
  insurance_expiry date,
  road_tax_expiry date,
  roadworthy_expiry date,
  next_service_date date,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT vehicles_fleet_id_unique UNIQUE (fleet_id, id),
  CONSTRAINT vehicles_registration_length CHECK (length(btrim(registration_number)) BETWEEN 1 AND 24),
  CONSTRAINT vehicles_make_length CHECK (length(btrim(make)) BETWEEN 1 AND 60),
  CONSTRAINT vehicles_model_length CHECK (length(btrim(model)) BETWEEN 1 AND 60),
  CONSTRAINT vehicles_year_range CHECK (year BETWEEN 1900 AND 2100),
  CONSTRAINT vehicles_colour_length CHECK (colour IS NULL OR length(colour) <= 40),
  CONSTRAINT vehicles_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)
);

CREATE UNIQUE INDEX vehicles_fleet_registration_active_idx
  ON vehicles (fleet_id, registration_normalized)
  WHERE deleted_at IS NULL;

CREATE INDEX vehicles_fleet_deleted_idx ON vehicles (fleet_id, deleted_at);
CREATE INDEX vehicles_fleet_insurance_idx ON vehicles (fleet_id, insurance_expiry);
CREATE INDEX vehicles_fleet_road_tax_idx ON vehicles (fleet_id, road_tax_expiry);
CREATE INDEX vehicles_fleet_roadworthy_idx ON vehicles (fleet_id, roadworthy_expiry);
CREATE INDEX vehicles_fleet_service_idx ON vehicles (fleet_id, next_service_date);

CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  phone text,
  licence_number text,
  licence_expiry date,
  status driver_status NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drivers_fleet_id_unique UNIQUE (fleet_id, id),
  CONSTRAINT drivers_full_name_length CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
  CONSTRAINT drivers_phone_length CHECK (phone IS NULL OR length(phone) <= 32),
  CONSTRAINT drivers_licence_length CHECK (licence_number IS NULL OR length(licence_number) <= 40),
  CONSTRAINT drivers_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)
);

CREATE INDEX drivers_fleet_status_idx ON drivers (fleet_id, status);

CREATE TABLE hires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  status hire_status NOT NULL DEFAULT 'planned',
  starts_at timestamptz NOT NULL,
  expected_end_at timestamptz,
  actual_end_at timestamptz,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hires_fleet_id_unique UNIQUE (fleet_id, id),
  CONSTRAINT hires_vehicle_fk
    FOREIGN KEY (fleet_id, vehicle_id)
    REFERENCES vehicles (fleet_id, id) ON DELETE RESTRICT,
  CONSTRAINT hires_driver_fk
    FOREIGN KEY (fleet_id, driver_id)
    REFERENCES drivers (fleet_id, id) ON DELETE RESTRICT,
  CONSTRAINT hires_expected_end_after_start
    CHECK (expected_end_at IS NULL OR expected_end_at > starts_at),
  CONSTRAINT hires_actual_end_after_start
    CHECK (actual_end_at IS NULL OR actual_end_at >= starts_at),
  CONSTRAINT hires_notes_length CHECK (notes IS NULL OR length(notes) <= 2000)
);

CREATE INDEX hires_fleet_status_idx ON hires (fleet_id, status, expected_end_at);
CREATE INDEX hires_fleet_vehicle_idx ON hires (fleet_id, vehicle_id, starts_at DESC);
CREATE INDEX hires_fleet_driver_idx ON hires (fleet_id, driver_id, starts_at DESC);

CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT,
  vehicle_id uuid NOT NULL,
  entry_date date NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'ZMW',
  supplier text,
  payment_method text,
  notes text,
  status finance_status NOT NULL DEFAULT 'posted',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_fleet_id_unique UNIQUE (fleet_id, id),
  CONSTRAINT expenses_vehicle_fk
    FOREIGN KEY (fleet_id, vehicle_id)
    REFERENCES vehicles (fleet_id, id) ON DELETE RESTRICT,
  CONSTRAINT expenses_category_length CHECK (length(btrim(category)) BETWEEN 1 AND 80),
  CONSTRAINT expenses_description_length CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  CONSTRAINT expenses_amount_positive CHECK (amount > 0),
  CONSTRAINT expenses_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT expenses_supplier_length CHECK (supplier IS NULL OR length(supplier) <= 120),
  CONSTRAINT expenses_payment_method_length CHECK (payment_method IS NULL OR length(payment_method) <= 40),
  CONSTRAINT expenses_notes_length CHECK (notes IS NULL OR length(notes) <= 1000),
  CONSTRAINT expenses_void_fields_consistent CHECK (
    (status = 'posted' AND void_reason IS NULL AND voided_at IS NULL AND voided_by IS NULL)
    OR
    (status = 'voided' AND void_reason IS NOT NULL AND btrim(void_reason) <> '' AND voided_at IS NOT NULL)
  )
);

CREATE INDEX expenses_fleet_date_idx ON expenses (fleet_id, entry_date DESC);
CREATE INDEX expenses_fleet_vehicle_idx ON expenses (fleet_id, vehicle_id, entry_date DESC);
CREATE INDEX expenses_fleet_status_idx ON expenses (fleet_id, status);

CREATE TABLE income_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT,
  entry_date date NOT NULL,
  description text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'ZMW',
  vehicle_id uuid,
  driver_id uuid,
  payment_method text,
  reference text,
  notes text,
  status finance_status NOT NULL DEFAULT 'posted',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT income_entries_fleet_id_unique UNIQUE (fleet_id, id),
  CONSTRAINT income_entries_vehicle_fk
    FOREIGN KEY (fleet_id, vehicle_id)
    REFERENCES vehicles (fleet_id, id) ON DELETE RESTRICT,
  CONSTRAINT income_entries_driver_fk
    FOREIGN KEY (fleet_id, driver_id)
    REFERENCES drivers (fleet_id, id) ON DELETE RESTRICT,
  CONSTRAINT income_entries_description_length CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  CONSTRAINT income_entries_amount_positive CHECK (amount > 0),
  CONSTRAINT income_entries_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT income_entries_payment_method_length CHECK (payment_method IS NULL OR length(payment_method) <= 40),
  CONSTRAINT income_entries_reference_length CHECK (reference IS NULL OR length(reference) <= 80),
  CONSTRAINT income_entries_notes_length CHECK (notes IS NULL OR length(notes) <= 1000),
  CONSTRAINT income_entries_void_fields_consistent CHECK (
    (status = 'posted' AND void_reason IS NULL AND voided_at IS NULL AND voided_by IS NULL)
    OR
    (status = 'voided' AND void_reason IS NOT NULL AND btrim(void_reason) <> '' AND voided_at IS NOT NULL)
  )
);

CREATE INDEX income_entries_fleet_date_idx ON income_entries (fleet_id, entry_date DESC);
CREATE INDEX income_entries_fleet_vehicle_idx ON income_entries (fleet_id, vehicle_id, entry_date DESC);
CREATE INDEX income_entries_fleet_driver_idx ON income_entries (fleet_id, driver_id, entry_date DESC);
CREATE INDEX income_entries_fleet_status_idx ON income_entries (fleet_id, status);

CREATE TABLE remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT,
  entry_date date NOT NULL,
  driver_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'ZMW',
  vehicle_id uuid,
  payment_method text,
  reference text,
  notes text,
  status finance_status NOT NULL DEFAULT 'posted',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remittances_fleet_id_unique UNIQUE (fleet_id, id),
  CONSTRAINT remittances_driver_fk
    FOREIGN KEY (fleet_id, driver_id)
    REFERENCES drivers (fleet_id, id) ON DELETE RESTRICT,
  CONSTRAINT remittances_vehicle_fk
    FOREIGN KEY (fleet_id, vehicle_id)
    REFERENCES vehicles (fleet_id, id) ON DELETE RESTRICT,
  CONSTRAINT remittances_period_order CHECK (period_end >= period_start),
  CONSTRAINT remittances_amount_positive CHECK (amount > 0),
  CONSTRAINT remittances_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT remittances_payment_method_length CHECK (payment_method IS NULL OR length(payment_method) <= 40),
  CONSTRAINT remittances_reference_length CHECK (reference IS NULL OR length(reference) <= 80),
  CONSTRAINT remittances_notes_length CHECK (notes IS NULL OR length(notes) <= 1000),
  CONSTRAINT remittances_void_fields_consistent CHECK (
    (status = 'posted' AND void_reason IS NULL AND voided_at IS NULL AND voided_by IS NULL)
    OR
    (status = 'voided' AND void_reason IS NOT NULL AND btrim(void_reason) <> '' AND voided_at IS NOT NULL)
  )
);

CREATE INDEX remittances_fleet_date_idx ON remittances (fleet_id, entry_date DESC);
CREATE INDEX remittances_fleet_driver_idx ON remittances (fleet_id, driver_id, period_start DESC);
CREATE INDEX remittances_fleet_vehicle_idx ON remittances (fleet_id, vehicle_id, entry_date DESC);
CREATE INDEX remittances_fleet_status_idx ON remittances (fleet_id, status);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_type audit_actor_type NOT NULL,
  fleet_id uuid REFERENCES fleets(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  reason text,
  correlation_id text NOT NULL,
  ip inet,
  user_agent text,
  metadata jsonb,
  CONSTRAINT audit_events_action_length CHECK (length(btrim(action)) BETWEEN 1 AND 120),
  CONSTRAINT audit_events_target_type_length CHECK (target_type IS NULL OR length(target_type) <= 80),
  CONSTRAINT audit_events_target_id_length CHECK (target_id IS NULL OR length(target_id) <= 120),
  CONSTRAINT audit_events_reason_length CHECK (reason IS NULL OR length(reason) <= 500),
  CONSTRAINT audit_events_correlation_length CHECK (length(btrim(correlation_id)) BETWEEN 1 AND 120),
  CONSTRAINT audit_events_user_agent_length CHECK (user_agent IS NULL OR length(user_agent) <= 500),
  CONSTRAINT audit_events_metadata_object CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_events_fleet_time_idx ON audit_events (fleet_id, occurred_at DESC);
CREATE INDEX audit_events_actor_time_idx ON audit_events (actor_user_id, occurred_at DESC);
CREATE INDEX audit_events_target_idx ON audit_events (target_type, target_id);

-- RLS context helpers. A missing or blank setting returns NULL/false, never a
-- wildcard. The API sets these values from the authenticated membership in the
-- same transaction as the request's queries.
CREATE FUNCTION app_security.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE FUNCTION app_security.current_fleet_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.fleet_id', true), '')::uuid;
$$;

CREATE FUNCTION app_security.current_role_name()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.role', true), '');
$$;

CREATE FUNCTION app_security.has_permission(permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    permission = ANY (
      string_to_array(
        NULLIF(current_setting('app.permissions', true), ''),
        ','
      )
    ),
    false
  );
$$;

CREATE FUNCTION app_security.member_can_write()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT (policy ->> 'member_can_write')::boolean
      FROM fleets
      WHERE id = app_security.current_fleet_id()
        AND jsonb_typeof(policy -> 'member_can_write') = 'boolean'
    ),
    false
  );
$$;

CREATE FUNCTION app_security.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_admins
    WHERE user_id = app_security.current_user_id()
      AND status = 'active'
  );
$$;

CREATE FUNCTION app_security.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION app_security.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only.'
    USING ERRCODE = '42501';
END;
$$;

CREATE FUNCTION app_security.protect_vehicle_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN
      RAISE EXCEPTION 'Vehicles cannot be created already deleted.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.fleet_id IS DISTINCT FROM OLD.fleet_id THEN
    RAISE EXCEPTION 'A vehicle cannot be moved to another fleet.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      IF NOT app_security.has_permission('fleet.vehicles.delete') THEN
        RAISE EXCEPTION 'This role cannot delete vehicles.'
          USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      IF NOT app_security.has_permission('fleet.vehicles.restore') THEN
        RAISE EXCEPTION 'This role cannot restore vehicles.'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'The vehicle deletion fields cannot be changed this way.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.deleted_at IS NULL AND NEW.deleted_by IS NOT NULL THEN
    RAISE EXCEPTION 'The vehicle deletion fields are inconsistent.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.deleted_at IS NOT NULL AND NEW.deleted_by IS NULL THEN
    RAISE EXCEPTION 'The vehicle deletion fields are inconsistent.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app_security.protect_finance_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
  allowed_fields text[] := ARRAY['status', 'void_reason', 'voided_at', 'voided_by', 'updated_at', 'fleet_id'];
  field_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'posted' THEN
    RAISE EXCEPTION 'New financial records must be posted. Void an existing record instead.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'posted' THEN
    IF NEW.void_reason IS NOT NULL OR NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL THEN
      RAISE EXCEPTION 'Posted financial records cannot have void details.'
        USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'Posted financial records cannot be edited. Void the record and create a new one.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status <> 'voided' THEN
    RAISE EXCEPTION 'Financial records can only be posted or voided.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'voided' THEN
    RAISE EXCEPTION 'This financial record has already been voided.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.void_reason IS NULL OR btrim(NEW.void_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to void a financial record.'
      USING ERRCODE = '23514';
  END IF;

  NEW.voided_at := now();
  NEW.voided_by := app_security.current_user_id();

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.fleet_id IS DISTINCT FROM OLD.fleet_id THEN
    RAISE EXCEPTION 'A financial record cannot be moved to another fleet.'
      USING ERRCODE = '42501';
  END IF;

  old_row := to_jsonb(OLD);
  new_row := to_jsonb(NEW);
  FOREACH field_name IN ARRAY allowed_fields LOOP
    old_row := old_row - field_name;
    new_row := new_row - field_name;
  END LOOP;

  IF old_row IS DISTINCT FROM new_row THEN
    RAISE EXCEPTION 'Voiding must not change the original financial values.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER fleets_set_updated_at
  BEFORE UPDATE ON fleets
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER fleet_memberships_set_updated_at
  BEFORE UPDATE ON fleet_memberships
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER platform_admins_set_updated_at
  BEFORE UPDATE ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER vehicles_set_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER drivers_set_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER hires_set_updated_at
  BEFORE UPDATE ON hires
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER income_entries_set_updated_at
  BEFORE UPDATE ON income_entries
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();
CREATE TRIGGER remittances_set_updated_at
  BEFORE UPDATE ON remittances
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();

CREATE TRIGGER vehicles_protect_soft_delete
  BEFORE INSERT OR UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION app_security.protect_vehicle_soft_delete();
CREATE TRIGGER expenses_protect_finance
  BEFORE INSERT OR UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION app_security.protect_finance_record();
CREATE TRIGGER income_entries_protect_finance
  BEFORE INSERT OR UPDATE ON income_entries
  FOR EACH ROW EXECUTE FUNCTION app_security.protect_finance_record();
CREATE TRIGGER remittances_protect_finance
  BEFORE INSERT OR UPDATE ON remittances
  FOR EACH ROW EXECUTE FUNCTION app_security.protect_finance_record();

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION app_security.prevent_audit_mutation();
