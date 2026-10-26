import 'package:flutter/material.dart';

import '../data/backup_service.dart';
import '../data/fleet_database.dart';
import '../data/vehicle_import_service.dart';
import '../models/fleet_snapshot.dart';
import '../ui/common.dart';
import '../ui/fleet_theme.dart';
import '../utils/formatting.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.snapshot,
    required this.onChanged,
  });

  final FleetSnapshot snapshot;
  final Future<void> Function() onChanged;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _working = false;
  String? _lastBackupPath;
  String? _message;
  String? _error;
  String? _databasePath;

  @override
  void initState() {
    super.initState();
    _loadPath();
  }

  Future<void> _loadPath() async {
    try {
      final path = await FleetDatabase.instance.databasePath;
      if (mounted) setState(() => _databasePath = path);
    } catch (_) {
      // The storage error is shown by the main shell when the database fails.
    }
  }

  Future<void> _exportBackup() async {
    setState(() {
      _working = true;
      _error = null;
      _message = null;
    });
    try {
      final backup = await BackupService.exportBackup();
      await widget.onChanged();
      if (!mounted) return;
      setState(() {
        _lastBackupPath = backup.path;
        _message =
            'Backup created with ${_total(backup.counts)} records. '
            'The share sheet opens so you can save it outside the app.';
      });
      try {
        await BackupService.shareBackup(backup);
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _message =
              'Backup saved on this phone at ${backup.path}. The share '
              'sheet was unavailable.';
        });
      }
    } catch (error) {
      if (!mounted) return;
      setState(
        () => _error = 'We couldn’t create a backup. ${error.toString()}',
      );
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _restoreBackup() async {
    setState(() {
      _working = true;
      _error = null;
      _message = null;
    });
    try {
      final preview = await BackupService.chooseBackup();
      if (!mounted) return;
      if (preview == null) {
        setState(() => _working = false);
        return;
      }

      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Replace all local records?'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Backup file: ${preview.fileName}\n'
                  'Exported: ${formatDateTime(preview.exportedAt)}\n'
                  'Records: ${_total(preview.counts)}',
                  style: const TextStyle(fontSize: 12, height: 1.5),
                ),
                const SizedBox(height: 12),
                Text(
                  _countsText(preview.counts),
                  style: const TextStyle(fontSize: 11, height: 1.5),
                ),
                const SizedBox(height: 14),
                const InlineAlert(
                  message:
                      'This replaces every vehicle, driver, expense, '
                      'hire, income, and remittance record currently saved on '
                      'this phone. It does not merge. Financial history is '
                      'replaced too, so export a backup first if you need the '
                      'current data.',
                  tone: AlertTone.warning,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              style: FilledButton.styleFrom(
                backgroundColor: FleetColors.red,
                foregroundColor: FleetColors.white,
              ),
              child: const Text('Replace local data'),
            ),
          ],
        ),
      );
      if (confirmed != true) {
        if (mounted) setState(() => _working = false);
        return;
      }

      await BackupService.restore(preview);
      await widget.onChanged();
      if (!mounted) return;
      setState(() {
        _message =
            'Backup restored. ${_total(preview.counts)} saved records '
            'now replace the local data on this phone.';
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error is FormatException
            ? error.message
            : 'We couldn’t restore that backup. ${error.toString()}';
      });
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _importVehicleCsv() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Import recovered vehicle list?'),
        content: const Text(
          'Choose the fleet report CSV. New vehicles and their insurance, '
          'road-tax, and roadworthy dates will be added. Existing matching '
          'registrations are skipped, so their saved records are not replaced. '
          'The old report status is kept in the notes; availability starts as '
          'Available and can be changed per vehicle.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Choose CSV'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _working = true;
      _error = null;
      _message = null;
    });
    try {
      final result = await VehicleImportService.chooseAndImportCsv();
      if (result == null) return;
      await widget.onChanged();
      if (!mounted) return;
      setState(() {
        _message = 'Imported ${result.added} vehicle'
            '${result.added == 1 ? '' : 's'}.'
            '${result.duplicates > 0 ? ' Skipped ${result.duplicates} matching registration${result.duplicates == 1 ? '' : 's'}.' : ''}'
            '${result.invalid > 0 ? ' Skipped ${result.invalid} incomplete or invalid row${result.invalid == 1 ? '' : 's'}.' : ''}';
      });
    } on FormatException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(
        () => _error =
            'We couldn’t import that CSV. Check that it is the recovered fleet report and try again.',
      );
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  int _total(Map<String, int> counts) =>
      counts.values.fold(0, (sum, value) => sum + value);

  String _countsText(Map<String, int> counts) {
    const labels = {
      'vehicles': 'Vehicles',
      'drivers': 'Drivers',
      'expenses': 'Expenses',
      'hires': 'Hires',
      'income': 'Income entries',
      'remittances': 'Remittances',
    };
    return labels.entries
        .map((entry) => '${entry.value}: ${counts[entry.key] ?? 0}')
        .join('  ·  ');
  }

  @override
  Widget build(BuildContext context) {
    final counts = {
      'vehicles': widget.snapshot.vehicles.length,
      'drivers': widget.snapshot.drivers.length,
      'expenses': widget.snapshot.expenses.length,
      'hires': widget.snapshot.hires.length,
      'income': widget.snapshot.income.length,
      'remittances': widget.snapshot.remittances.length,
    };

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 760;
        return ListView(
          padding: EdgeInsets.fromLTRB(wide ? 30 : 18, 22, wide ? 30 : 18, 28),
          children: [
            const PageHeading(
              eyebrow: 'Data & device',
              title: 'Settings & backup',
              description:
                  'Protect the records saved on this phone and understand the '
                  'limits of local-only access.',
            ),
            const SizedBox(height: 14),
            if (_message != null) ...[
              InlineAlert(
                message: _message!,
                tone: AlertTone.success,
                onDismiss: () => setState(() => _message = null),
              ),
              const SizedBox(height: 10),
            ],
            if (_error != null) ...[
              InlineAlert(
                message: _error!,
                onDismiss: () => setState(() => _error = null),
              ),
              const SizedBox(height: 10),
            ],
            if (wide)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: _storageCard(counts)),
                  const SizedBox(width: 13),
                  Expanded(child: _backupCard()),
                ],
              )
            else ...[
              _storageCard(counts),
              const SizedBox(height: 13),
              _backupCard(),
            ],
            const SizedBox(height: 13),
            _importCard(),
            const SizedBox(height: 13),
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const PanelHeading(
                    title: 'Local-only access',
                    trailing: 'IMPORTANT',
                  ),
                  const SizedBox(height: 10),
                  const InfoBanner(
                    icon: Icons.shield_outlined,
                    text:
                        'Local records are stored only on this device. There '
                        'is no cloud account, team sync, or server backup. '
                        'Anyone with access to this phone can open the app and '
                        'its records.',
                    tone: AlertTone.warning,
                  ),
                  const SizedBox(height: 9),
                  const InfoBanner(
                    icon: Icons.admin_panel_settings_outlined,
                    text:
                        'Roles are not securely enforced. The owner, finance '
                        'manager, and driver records in this MVP are a local '
                        'workflow only until authentication and a shared '
                        'backend exist. Do not treat this app as an access '
                        'control system.',
                  ),
                  const SizedBox(height: 9),
                  const InfoBanner(
                    icon: Icons.lock_outline_rounded,
                    text:
                        'Financial history is protected in the app: expenses, '
                        'income, and remittances can be voided with a reason but '
                        'not deleted. A restore or device loss can still replace '
                        'or remove local data, so keep regular backups.',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 13),
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const PanelHeading(
                    title: 'Data protection summary',
                    trailing: 'MVP',
                  ),
                  const SizedBox(height: 10),
                  const DetailRow(
                    label: 'Storage engine',
                    value: 'SQLite database on this phone',
                  ),
                  DetailRow(
                    label: 'Database path',
                    value: _databasePath ?? 'Resolving…',
                  ),
                  const DetailRow(
                    label: 'Backup format',
                    value: 'JSON file with all six record tables',
                  ),
                  const DetailRow(
                    label: 'Report format',
                    value: 'CSV export with date-filtered records',
                  ),
                  const DetailRow(
                    label: 'Data sharing',
                    value: 'None · no Supabase, no cloud sync',
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Backups can contain personal and financial information. '
                    'Store them somewhere safe and share them only with '
                    'authorised people.',
                    style: TextStyle(
                      fontSize: 10,
                      color: FleetColors.muted,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 9),
            const LocalDataNotice(),
            const SizedBox(height: 14),
            const Center(
              child: Text(
                'IP Motors Fleet Manager · Flutter MVP 1.0.0',
                style: TextStyle(fontSize: 9.5, color: FleetColors.muted),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _storageCard(Map<String, int> counts) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(
            title: 'Records on this device',
            trailing: 'SQLITE',
          ),
          const SizedBox(height: 11),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _CountChip(label: 'Vehicles', value: counts['vehicles']!),
              _CountChip(label: 'Drivers', value: counts['drivers']!),
              _CountChip(label: 'Expenses', value: counts['expenses']!),
              _CountChip(label: 'Hires', value: counts['hires']!),
              _CountChip(label: 'Income', value: counts['income']!),
              _CountChip(label: 'Remittances', value: counts['remittances']!),
            ],
          ),
          const SizedBox(height: 11),
          Text(
            'Loaded ${formatDateTime(widget.snapshot.loadedAt.toIso8601String())}. '
            'Counts come from the saved records, not sample data.',
            style: const TextStyle(
              fontSize: 10,
              color: FleetColors.muted,
              height: 1.4,
            ),
          ),
          if (_lastBackupPath != null) ...[
            const SizedBox(height: 10),
            const Divider(),
            const SizedBox(height: 6),
            const Text(
              'LAST BACKUP CREATED',
              style: TextStyle(
                fontSize: 8.5,
                letterSpacing: .7,
                fontWeight: FontWeight.w700,
                color: FleetColors.muted,
              ),
            ),
            const SizedBox(height: 3),
            SelectableText(
              _lastBackupPath!,
              style: const TextStyle(fontSize: 9.5, height: 1.4),
            ),
          ],
        ],
      ),
    );
  }

  Widget _backupCard() {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Backup and restore', trailing: 'JSON'),
          const SizedBox(height: 9),
          const Text(
            'Export every vehicle, driver, expense, hire, income, and '
            'remittance record to a JSON file. Restoring replaces all local '
            'records, so export first if you need the current data.',
            style: TextStyle(
              fontSize: 11,
              color: FleetColors.muted,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 13),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _working ? null : _exportBackup,
              icon: _working
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: FleetColors.white,
                      ),
                    )
                  : const Icon(Icons.download_rounded, size: 18),
              label: Text(_working ? 'Working…' : 'Export backup'),
              style: FilledButton.styleFrom(
                backgroundColor: FleetColors.ink,
                foregroundColor: FleetColors.white,
                minimumSize: const Size(0, 46),
              ),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _working ? null : _restoreBackup,
              icon: const Icon(Icons.upload_file_rounded, size: 18),
              label: const Text('Restore from backup'),
              style: OutlinedButton.styleFrom(
                foregroundColor: FleetColors.ink,
                minimumSize: const Size(0, 46),
                side: const BorderSide(color: FleetColors.warmGrey),
              ),
            ),
          ),
          const SizedBox(height: 9),
          const Text(
            'Exporting opens the phone share sheet. Restoring shows a preview '
            'and requires confirmation before any local record is replaced.',
            style: TextStyle(
              fontSize: 10,
              color: FleetColors.muted,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _importCard() {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Recover vehicle records', trailing: 'CSV'),
          const SizedBox(height: 9),
          const Text(
            'Import the vehicle export recovered from the previous fleet '
            'system. The app adds vehicles and document dates, while keeping '
            'existing registrations intact.',
            style: TextStyle(
              fontSize: 11,
              color: FleetColors.muted,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _working ? null : _importVehicleCsv,
              icon: const Icon(Icons.table_view_outlined, size: 18),
              label: const Text('Import vehicle CSV'),
              style: OutlinedButton.styleFrom(
                foregroundColor: FleetColors.ink,
                minimumSize: const Size(0, 46),
                side: const BorderSide(color: FleetColors.warmGrey),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CountChip extends StatelessWidget {
  const _CountChip({required this.label, required this.value});
  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: FleetColors.canvas,
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 9.5, color: FleetColors.muted),
          ),
          const SizedBox(width: 5),
          Text(
            '$value',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: FleetColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}
