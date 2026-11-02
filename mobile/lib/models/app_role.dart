enum AppRole {
  fleetOwner(
    label: 'Fleet Owner',
    shortLabel: 'FO',
    storageKey: 'fleet_owner',
    description:
        'Full local access, including vehicle deletion when no linked records '
        'block it.',
  ),
  fleetAdmin(
    label: 'Fleet Admin',
    shortLabel: 'FA',
    storageKey: 'fleet_admin',
    description: 'Can delete vehicles when no linked records block them.',
  ),
  fleetManager(
    label: 'Fleet Manager',
    shortLabel: 'FM',
    storageKey: 'fleet_manager',
    description: 'Can delete vehicles when no linked records block them.',
  ),
  fleetMember(
    label: 'Fleet Member',
    shortLabel: 'ME',
    storageKey: 'fleet_member',
    description: 'Can add and edit vehicles, but cannot delete them.',
  );

  const AppRole({
    required this.label,
    required this.shortLabel,
    required this.storageKey,
    required this.description,
  });

  final String label;
  final String shortLabel;
  final String storageKey;
  final String description;

  bool get canDeleteVehicles => this != AppRole.fleetMember;

  static AppRole fromStorage(String? value) {
    for (final role in values) {
      if (role.storageKey == value) return role;
    }
    return AppRole.fleetOwner;
  }
}
