import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'fleet_database.dart';

class BackupFile {
  const BackupFile({
    required this.path,
    required this.counts,
    required this.exportedAt,
  });

  final String path;
  final Map<String, int> counts;
  final String exportedAt;
}

class BackupPreview {
  const BackupPreview({
    required this.fileName,
    required this.exportedAt,
    required this.counts,
    required this.data,
  });

  final String fileName;
  final String exportedAt;
  final Map<String, int> counts;
  final Map<String, Object?> data;

  int get total => counts.values.fold(0, (sum, value) => sum + value);
}

class BackupService {
  BackupService._();

  static Future<BackupFile> exportBackup() async {
    final data = await FleetDatabase.instance.exportData();
    final directory = await getApplicationDocumentsDirectory();
    final backupDirectory = Directory('${directory.path}/ip_motors_backups');
    if (!await backupDirectory.exists()) {
      await backupDirectory.create(recursive: true);
    }
    final stamp = DateTime.now()
        .toIso8601String()
        .replaceAll(RegExp(r'[:.]'), '-')
        .substring(0, 19);
    final file = File('${backupDirectory.path}/ip-motors-backup-$stamp.json');
    await file.writeAsString(const JsonEncoder.withIndent('  ').convert(data));

    final rawCounts = data['counts'];
    final counts = <String, int>{};
    if (rawCounts is Map) {
      for (final entry in rawCounts.entries) {
        counts['${entry.key}'] = (entry.value as num?)?.toInt() ?? 0;
      }
    }
    return BackupFile(
      path: file.path,
      counts: counts,
      exportedAt: '${data['exported_at']}',
    );
  }

  static Future<BackupPreview?> chooseBackup() async {
    final picked = await FilePicker.pickFile(
      dialogTitle: 'Choose an IP Motors backup',
      type: FileType.custom,
      allowedExtensions: ['json'],
    );
    if (picked == null) return null;

    final bytes = await picked.readAsBytes();
    final decoded = jsonDecode(utf8.decode(bytes));
    if (decoded is! Map) {
      throw const FormatException('That file is not a valid JSON backup.');
    }
    final data = decoded.map((key, value) => MapEntry('$key', value));
    if (data['format'] != 'ip-motors-backup') {
      throw const FormatException(
        'That file is not an IP Motors Fleet Manager backup.',
      );
    }
    final rawCounts = data['counts'];
    final counts = <String, int>{};
    if (rawCounts is Map) {
      for (final entry in rawCounts.entries) {
        counts['${entry.key}'] = (entry.value as num?)?.toInt() ?? 0;
      }
    }
    return BackupPreview(
      fileName: picked.name,
      exportedAt: '${data['exported_at'] ?? 'Unknown date'}',
      counts: counts,
      data: data,
    );
  }

  static Future<void> restore(BackupPreview preview) async {
    await FleetDatabase.instance.restoreData(preview.data);
  }

  static Future<void> shareBackup(BackupFile backup) async {
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(backup.path, mimeType: 'application/json')],
        subject: 'IP Motors Fleet Manager backup',
        text: 'IP Motors Fleet Manager backup. Keep this file somewhere safe.',
      ),
    );
  }

  static Future<String> exportCsv({
    required String fileName,
    required String csv,
    required String subject,
  }) async {
    final directory = await getApplicationDocumentsDirectory();
    final reportDirectory = Directory('${directory.path}/ip_motors_reports');
    if (!await reportDirectory.exists()) {
      await reportDirectory.create(recursive: true);
    }
    final stamp = DateTime.now()
        .toIso8601String()
        .replaceAll(RegExp(r'[:.]'), '-')
        .substring(0, 19);
    final file = File('${reportDirectory.path}/$fileName-$stamp.csv');
    await file.writeAsString(csv);
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: 'text/csv')],
        subject: subject,
        text: subject,
      ),
    );
    return file.path;
  }
}
