import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/app_role.dart';

void main() {
  group('local workspace role', () {
    test('falls back to Fleet Owner for an unknown stored value', () {
      expect(AppRole.fromStorage(null), AppRole.fleetOwner);
      expect(AppRole.fromStorage('unknown'), AppRole.fleetOwner);
    });

    test('restores every stored role', () {
      for (final role in AppRole.values) {
        expect(AppRole.fromStorage(role.storageKey), role);
      }
    });

    test('only owner, admin, and manager can delete vehicles', () {
      expect(AppRole.fleetOwner.canDeleteVehicles, isTrue);
      expect(AppRole.fleetAdmin.canDeleteVehicles, isTrue);
      expect(AppRole.fleetManager.canDeleteVehicles, isTrue);
      expect(AppRole.fleetMember.canDeleteVehicles, isFalse);
    });
  });
}
