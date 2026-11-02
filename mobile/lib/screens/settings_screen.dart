import 'package:flutter/material.dart';

import '../data/backup_service.dart';
import '../data/fleet_api_client.dart';
import '../data/fleet_sync_service.dart';
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
  bool _syncing = false;
  String? _message;
  String? _error;
  SyncStatus? _syncStatus;

  @override
  void initState() {
    super.initState();
    _loadSyncStatus();
  }

  Future<void> _loadSyncStatus() async {
    try {
      final status = await FleetSyncService.instance.status();
      if (mounted) setState(() => _syncStatus = status);
    } catch (_) {
      // Widget tests and previews may not initialize a SQLite factory. The
      // card still renders from the configured state.
    }
  }

  Future<void> _syncNow() async {
    setState(() {
      _syncing = true;
      _error = null;
      _message = null;
    });
    try {
      final result = await FleetSyncService.instance.syncNow();
      if (!mounted) return;
      setState(() {
        if (result.authRequired) {
          _error = result.message;
        } else {
          _message = result.message;
        }
      });
      await widget.onChanged();
    } on FleetApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'We couldn’t sync with the shared workspace.');
      }
    } finally {
      if (mounted) {
        setState(() => _syncing = false);
        await _loadSyncStatus();
      }
    }
  }

  Future<void> _previewImport() async {
    setState(() {
      _working = true;
      _error = null;
      _message = null;
    });
    try {
      final preview = await FleetSyncService.instance.previewVehicleImport();
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Vehicle import preview'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('New vehicles: ${preview.newVehicles}'),
                Text('Already on the server: ${preview.matches}'),
                Text('Conflicts: ${preview.conflicts}'),
                Text('Invalid rows: ${preview.invalid}'),
                if (preview.conflictSamples.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Review: ${preview.conflictSamples.join(', ')}',
                    style: const TextStyle(fontSize: 12),
                  ),
                ],
                const SizedBox(height: 12),
                const Text(
                  'This is a dry run. No server records were changed. The real '
                  'import stays blocked until the owner explicitly approves it.',
                  style: TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } on FleetApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'We couldn’t compare the local and server fleet.');
      }
    } finally {
      if (mounted) setState(() => _working = false);
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
        _message =
            'Backup created with ${_total(backup.counts)} records. '
            'The share sheet opens so you can save it outside the app.';
      });
      try {
        await BackupService.shareBackup(backup);
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _message = 'Backup created. The share sheet was unavailable.';
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'We couldn’t create a backup. Try again.');
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
        _message =
            'Imported ${result.added} vehicle'
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
        () => _error = 'We couldn’t import that CSV. Check that it is the recovered fleet report and try again.',
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
        return ListView(
          padding: screenPadding(context),
          children: [
            const PageHeading(
              title: 'Settings & backup',
              subtitle: 'Back up, restore, or import fleet records',
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
            _sharedWorkspaceCard(),
            const SizedBox(height: 12),
            _backupCard(),
            const SizedBox(height: 12),
            _importCard(),
            const SizedBox(height: 12),
            _storageCard(counts),
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
          const PanelHeading(title: 'Saved records'),
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
        ],
      ),
    );
  }

  Widget _sharedWorkspaceCard() {
    final status = _syncStatus;
    final configured = status?.configured ?? FleetSyncService.instance.isConfigured;
    final pending = status?.pending ?? 0;
    final conflicts = status?.conflicts ?? 0;
    final last = status?.lastSyncedAt;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PanelHeading(title: 'Shared workspace'),
          const SizedBox(height: 6),
          Text(
            configured
                ? 'This device is linked to the shared fleet API. Local edits '
                      'are queued while offline and reviewed when they conflict.'
                : 'This build has no shared fleet API configured. Records stay '
                      'on this device until a staging API URL is supplied.',
            style: const TextStyle(
              fontSize: 11.5,
              color: FleetColors.muted,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _CountChip(label: 'Queued', value: pending),
              _CountChip(label: 'Conflicts', value: conflicts),
            ],
          ),
          if (last != null) ...[
            const SizedBox(height: 8),
            Text(
              'Last synchronized ${formatDateTime(last.toIso8601String())}',
              style: const TextStyle(
                fontSize: 10.5,
                color: FleetColors.muted,
              ),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _syncing || !configured ? null : _syncNow,
              icon: _syncing
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: FleetColors.white,
                      ),
                    )
                  : const Icon(Icons.sync_rounded, size: 18),
              label: Text(_syncing ? 'Synchronizing…' : 'Sync now'),
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _working || !configured ? null : _previewImport,
              icon: const Icon(Icons.fact_check_outlined, size: 18),
              label: const Text('Preview vehicle import'),
            ),
          ),
          if (conflicts > 0) ...[
            const SizedBox(height: 8),
            const Text(
              'Conflicting records were not overwritten. Review the record on '
              'each device before saving again.',
              style: TextStyle(
                fontSize: 10.5,
                color: FleetColors.muted,
                height: 1.4,
              ),
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
          const PanelHeading(title: 'Backup & restore'),
          const SizedBox(height: 6),
          const Text(
            'Export every record to a file you can keep outside the app.',
            style: TextStyle(
              fontSize: 11.5,
              color: FleetColors.muted,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 12),
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
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _working ? null : _restoreBackup,
              icon: const Icon(Icons.upload_file_rounded, size: 18),
              label: const Text('Restore from backup'),
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Restoring replaces all local records and asks for confirmation '
            'first.',
            style: TextStyle(
              fontSize: 10.5,
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
          const PanelHeading(title: 'Import vehicles'),
          const SizedBox(height: 6),
          const Text(
            'Add vehicles from a CSV export. Existing registrations are kept.',
            style: TextStyle(
              fontSize: 11.5,
              color: FleetColors.muted,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _working ? null : _importVehicleCsv,
              icon: const Icon(Icons.table_view_outlined, size: 18),
              label: const Text('Import vehicle CSV'),
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
