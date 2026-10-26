import 'dart:convert';

import 'package:file_picker/file_picker.dart';

import '../models/vehicle.dart';
import '../utils/formatting.dart';
import 'fleet_database.dart';

class VehicleImportResult {
  const VehicleImportResult({
    required this.added,
    required this.duplicates,
    required this.invalid,
  });

  final int added;
  final int duplicates;
  final int invalid;
}

/// Vehicles read from a CSV before they are written to the local database.
class ParsedVehicleCsv {
  const ParsedVehicleCsv({required this.vehicles, required this.invalid});

  final List<Vehicle> vehicles;

  /// Rows skipped because required values were missing or a date could not be
  /// read. They are never written, so the caller can report them and the user
  /// can repair the file and import again.
  final int invalid;
}

class VehicleImportService {
  VehicleImportService._();

  static const _requiredColumns = ['Registration', 'Make', 'Model'];
  static const _firstVehicleYear = 1950;

  static Future<VehicleImportResult?> chooseAndImportCsv() async {
    final picked = await FilePicker.pickFile(
      dialogTitle: 'Choose the recovered fleet vehicle CSV',
      type: FileType.custom,
      allowedExtensions: ['csv'],
    );
    if (picked == null) return null;

    final bytes = await picked.readAsBytes();
    final content = utf8.decode(bytes, allowMalformed: true);
    final parsed = parseCsv(content);

    final duplicates = await FleetDatabase.instance.importVehicles(
      parsed.vehicles,
    );
    return VehicleImportResult(
      added: parsed.vehicles.length - duplicates,
      duplicates: duplicates,
      invalid: parsed.invalid,
    );
  }

  /// Reads a recovered fleet-report CSV without touching local storage.
  ///
  /// Column names are matched case-insensitively. Only Registration, Make, and
  /// Model are required; later columns are used when present so both the old
  /// nine-column report and a full vehicle export can be imported.
  static ParsedVehicleCsv parseCsv(String content) {
    final rows = _parseCsv(content);
    if (rows.length < 2) {
      throw const FormatException('The CSV has no vehicle rows to import.');
    }

    final headers = rows.first.map(_header).toList(growable: false);
    final columns = {for (var i = 0; i < headers.length; i++) headers[i]: i};
    int? index(String name) => columns[_header(name)];

    if (_requiredColumns.any((name) => index(name) == null)) {
      throw const FormatException(
        'This file is missing Registration, Make, or Model columns. Choose '
        'the fleet report CSV and try again.',
      );
    }

    String cell(List<String> row, String name) {
      final i = index(name);
      return i == null || i >= row.length ? '' : row[i].trim();
    }

    final latestYear = DateTime.now().year + 1;
    final vehicles = <Vehicle>[];
    var invalid = 0;

    for (final row in rows.skip(1)) {
      if (row.every((value) => value.trim().isEmpty)) continue;

      final registration = cell(row, 'Registration');
      final make = cell(row, 'Make');
      final model = cell(row, 'Model');
      final yearText = cell(row, 'Year');
      final year = int.tryParse(yearText);

      if (registration.isEmpty ||
          make.isEmpty ||
          model.isEmpty ||
          (yearText.isNotEmpty &&
              (year == null ||
                  year < _firstVehicleYear ||
                  year > latestYear))) {
        invalid++;
        continue;
      }

      final dates = <String, String?>{};
      var datesValid = true;
      for (final column in const [
        'Insurance Expiry',
        'Road Tax Expiry',
        'Roadworthy Expiry',
        'Next Service',
      ]) {
        final raw = cell(row, column);
        final date = _readDate(raw);
        if (date == null && raw.isNotEmpty) {
          datesValid = false;
          break;
        }
        dates[column] = date;
      }
      if (!datesValid) {
        invalid++;
        continue;
      }

      final sourceStatus = cell(row, 'Status');
      final sourceNotes = cell(row, 'Notes');
      final status = _mapStatus(sourceStatus);
      final notes = StringBuffer();
      if (sourceNotes.isNotEmpty) notes.write('$sourceNotes ');
      notes.write('Imported from fleet report CSV.');
      // The old report used Active/Expired-style labels that describe
      // compliance, not availability. Keep the original label in the notes
      // instead of guessing a mapping.
      if (sourceStatus.isNotEmpty &&
          status == 'Available' &&
          !_isAppStatus(sourceStatus)) {
        notes.write(' Source status: $sourceStatus.');
      }

      vehicles.add(
        Vehicle(
          registrationNumber: registration.toUpperCase(),
          make: make,
          model: model,
          year: year,
          colour: cell(row, 'Colour').isEmpty ? null : cell(row, 'Colour'),
          status: status,
          insuranceExpiry: dates['Insurance Expiry'],
          roadTaxExpiry: dates['Road Tax Expiry'],
          roadworthyExpiry: dates['Roadworthy Expiry'],
          nextServiceDate: dates['Next Service'],
          notes: notes.toString(),
        ),
      );
    }

    return ParsedVehicleCsv(vehicles: vehicles, invalid: invalid);
  }

  static String _header(String value) =>
      value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

  static bool _isAppStatus(String value) => vehicleStatuses.any(
    (status) => status.toLowerCase() == value.trim().toLowerCase(),
  );

  static String _mapStatus(String value) {
    for (final status in vehicleStatuses) {
      if (status.toLowerCase() == value.trim().toLowerCase()) return status;
    }
    return 'Available';
  }

  static String? _readDate(String value) {
    if (value.isEmpty) return null;
    final parsed = DateTime.tryParse(value);
    return parsed == null ? null : dateToIso(parsed);
  }

  static List<List<String>> _parseCsv(String input) {
    final text = input.startsWith('\uFEFF') ? input.substring(1) : input;
    final rows = <List<String>>[];
    var row = <String>[];
    final field = StringBuffer();
    var quoted = false;

    for (var i = 0; i < text.length; i++) {
      final char = text[i];
      if (quoted) {
        if (char == '"') {
          if (i + 1 < text.length && text[i + 1] == '"') {
            field.write('"');
            i++;
          } else {
            quoted = false;
          }
        } else {
          field.write(char);
        }
      } else if (char == '"' && field.isEmpty) {
        quoted = true;
      } else if (char == ',') {
        row.add(field.toString());
        field.clear();
      } else if (char == '\n' || char == '\r') {
        if (char == '\r' && i + 1 < text.length && text[i + 1] == '\n') {
          i++;
        }
        row.add(field.toString());
        field.clear();
        rows.add(row);
        row = <String>[];
      } else {
        field.write(char);
      }
    }
    if (field.isNotEmpty || row.isNotEmpty) {
      row.add(field.toString());
      rows.add(row);
    }
    if (quoted) {
      throw const FormatException(
        'The CSV has an unfinished quoted field. Re-export or repair the file and try again.',
      );
    }
    return rows;
  }
}
