-- Owner/admin-managed invitations for the shared fleet application.
--
-- This migration is intentionally NOT applied automatically. Run it only against
-- the Neon development branch after the authenticated gateway and owner bootstrap
-- have been verified. A public identity is never assigned a fleet role here.

CREATE TYPE fleet_invitation_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');

CREATE TABLE fleet_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id uuid NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT,
  invited_email text NOT NULL,
  invited_email_normalized text GENERATED ALWAYS AS (lower(btrim(invited_email))) STORED,
  role fleet_role NOT NULL,
  status fleet_invitation_status NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invited_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_invitations_email_length
    CHECK (length(btrim(invited_email)) BETWEEN 3 AND 320 AND position('@' IN invited_email) > 1),
  CONSTRAINT fleet_invitations_no_owner_role CHECK (role <> 'fleet_owner'),
  CONSTRAINT fleet_invitations_expiry_after_invitation CHECK (expires_at > invited_at),
  CONSTRAINT fleet_invitations_status_timestamps CHECK (
    (status = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL)
    OR (status = 'accepted' AND accepted_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND accepted_at IS NULL AND revoked_at IS NOT NULL)
    OR (status = 'expired' AND accepted_at IS NULL AND revoked_at IS NULL)
  )
);

CREATE UNIQUE INDEX fleet_invitations_fleet_email_pending_idx
  ON fleet_invitations (fleet_id, invited_email_normalized)
  WHERE status = 'pending';

CREATE INDEX fleet_invitations_fleet_status_idx
  ON fleet_invitations (fleet_id, status, expires_at);

CREATE TRIGGER fleet_invitations_set_updated_at
  BEFORE UPDATE ON fleet_invitations
  FOR EACH ROW EXECUTE FUNCTION app_security.set_updated_at();

ALTER TABLE fleet_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY fleet_invitations_select ON fleet_invitations
  FOR SELECT TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.members.read')
  );

CREATE POLICY fleet_invitations_insert ON fleet_invitations
  FOR INSERT TO app_rw
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.members.manage')
    AND invited_by = app_security.current_user_id()
    AND role <> 'fleet_owner'
    AND status = 'pending'
    AND accepted_at IS NULL
    AND revoked_at IS NULL
  );

CREATE POLICY fleet_invitations_update ON fleet_invitations
  FOR UPDATE TO app_rw
  USING (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.members.manage')
  )
  WITH CHECK (
    fleet_id = app_security.current_fleet_id()
    AND app_security.has_permission('fleet.members.manage')
    AND role <> 'fleet_owner'
  );

GRANT SELECT, INSERT, UPDATE ON fleet_invitations TO app_rw;

-- Invitation acceptance goes through this narrow SECURITY DEFINER function. A
-- user without a fleet membership cannot read arbitrary invitations or insert
-- directly into fleet_memberships.
CREATE FUNCTION app_security.accept_fleet_invitation(p_invitation_id uuid)
RETURNS TABLE (membership_id uuid, fleet_id uuid, role fleet_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_security
AS $$
DECLARE
  v_user_id uuid := app_security.current_user_id();
  v_email text;
  v_invitation public.fleet_invitations%ROWTYPE;
  v_membership_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT lower(btrim(email)) INTO v_email FROM public.users WHERE id = v_user_id;
  IF v_email IS NULL THEN RETURN; END IF;

  SELECT * INTO v_invitation
  FROM public.fleet_invitations
  WHERE id = p_invitation_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_invitation.expires_at <= now() THEN
    UPDATE public.fleet_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RETURN;
  END IF;

  IF v_invitation.invited_email_normalized <> v_email
     OR v_invitation.role = 'fleet_owner' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fleet_memberships
    WHERE user_id = v_user_id AND status = 'active'
  ) THEN RETURN; END IF;

  INSERT INTO public.fleet_memberships (
    fleet_id, user_id, role, status, invited_by, invited_at, joined_at
  ) VALUES (
    v_invitation.fleet_id, v_user_id, v_invitation.role, 'active',
    v_invitation.invited_by, v_invitation.invited_at, now()
  )
  ON CONFLICT (fleet_id, user_id) DO UPDATE
  SET role = EXCLUDED.role,
      status = 'active',
      invited_by = EXCLUDED.invited_by,
      invited_at = EXCLUDED.invited_at,
      joined_at = EXCLUDED.joined_at,
      suspended_at = NULL,
      removed_at = NULL
  WHERE public.fleet_memberships.status <> 'active'
  RETURNING id INTO v_membership_id;

  IF v_membership_id IS NULL THEN RETURN; END IF;

  UPDATE public.fleet_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN QUERY SELECT v_membership_id, v_invitation.fleet_id, v_invitation.role;
END;
$$;

REVOKE ALL ON FUNCTION app_security.accept_fleet_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_security.accept_fleet_invitation(uuid) TO app_rw;
