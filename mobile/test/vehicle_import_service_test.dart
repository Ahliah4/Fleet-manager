import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/vehicle_import_service.dart';

const _reportHeaders =
    '"Registration","Make","Model","Year","Colour","Insurance Expiry",'
    '"Road Tax Expiry","Roadworthy Expiry","Status"';

void main() {
  group('recovered fleet report import', () {
    test('reads the quoted report shape, trims cells, and keeps dates', () {
      final content =
          '\uFEFF$_reportHeaders\r\n'
          '"BLD1229ZM","Honda ","Fit ","2010","Yellow ","2027-10-14",'
          '"2027-10-14","2027-02-08","Active"\r\n'
          '"BBE7466ZM","Honda ","Fit ","2010","Blue, Metallic",'
          '"2026-12-01","2026-12-24","2027-03-25","Active"\r\n'
          '\r\n';

      final parsed = VehicleImportService.parseCsv(content);

      expect(parsed.invalid, 0);
      expect(parsed.vehicles, hasLength(2));

      final first = parsed.vehicles.first;
      expect(first.registrationNumber, 'BLD1229ZM');
      expect(first.make, 'Honda');
      expect(first.model, 'Fit');
      expect(first.year, 2010);
      expect(first.colour, 'Yellow');
      expect(first.status, 'Available');
      expect(first.insuranceExpiry, '2027-10-14');
      expect(first.roadTaxExpiry, '2027-10-14');
      expect(first.roadworthyExpiry, '2027-02-08');
      expect(
        first.notes,
        'Imported from fleet report CSV. Source status: Active.',
      );
      expect(parsed.vehicles.last.colour, 'Blue, Metallic');
    });

    test('keeps a source status that already matches availability', () {
      final content =
          '$_reportHeaders\n'
          '"BAA 1234","Toyota","Mark X","2015","Black","","","","on hire"';

      final vehicle = VehicleImportService.parseCsv(content).vehicles.single;

      expect(vehicle.status, 'On hire');
      expect(vehicle.notes, 'Imported from fleet report CSV.');
    });

    test('imports optional service date and notes when present', () {
      final content =
          '"Registration","Make","Model","Year","Colour",'
          '"Insurance Expiry","Road Tax Expiry","Roadworthy Expiry",'
          '"Next Service","Status","Notes"\n'
          '"BAA 1234","Toyota","Mark X","2015","Black","","","",'
          '"2026-11-20","Available","Bought at auction"';

      final vehicle = VehicleImportService.parseCsv(content).vehicles.single;

      expect(vehicle.nextServiceDate, '2026-11-20');
      expect(
        vehicle.notes,
        'Bought at auction Imported from fleet report CSV.',
      );
    });

    test('skips incomplete rows and unreadable dates', () {
      final content =
          '$_reportHeaders\n'
          '"AAA111","Toyota","Mark X","2015","Black","","","","Active"\n'
          '"BBB222","Toyota","","2015","Black","","","","Active"\n'
          '"CCC333","Toyota","Mark X","not-a-year","Black","","","","Active"\n'
          '"DDD444","Toyota","Mark X","2015","Black","14/10/2027","","",'
          '"Active"';

      final parsed = VehicleImportService.parseCsv(content);

      expect(parsed.invalid, 3);
      expect(parsed.vehicles, hasLength(1));
      expect(parsed.vehicles.single.registrationNumber, 'AAA111');
    });

    test('rejects a file without the required columns', () {
      expect(
        () => VehicleImportService.parseCsv(
          '"Registration","Model"\n"AAA111","Mark X"',
        ),
        throwsA(
          isA<FormatException>().having(
            (error) => error.message,
            'message',
            contains('missing Registration, Make, or Model'),
          ),
        ),
      );
    });

    test('rejects a file with no vehicle rows', () {
      expect(
        () => VehicleImportService.parseCsv('$_reportHeaders\n'),
        throwsA(
          isA<FormatException>().having(
            (error) => error.message,
            'message',
            contains('no vehicle rows'),
          ),
        ),
      );
    });

    test('rejects an unfinished quoted field', () {
      expect(
        () => VehicleImportService.parseCsv(
          '$_reportHeaders\n"AAA111","Toyota","Mark X","2015","Black',
        ),
        throwsA(
          isA<FormatException>().having(
            (error) => error.message,
            'message',
            contains('unfinished quoted field'),
          ),
        ),
      );
    });
  });
}
