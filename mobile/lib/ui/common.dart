import 'package:flutter/material.dart';

import '../utils/formatting.dart';
import 'fleet_theme.dart';

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.label, {super.key});
  final String label;

  @override
  Widget build(BuildContext context) => Text(
    label.toUpperCase(),
    style: const TextStyle(
      fontFamily: 'Manrope',
      fontSize: 10,
      fontWeight: FontWeight.w700,
      letterSpacing: 1.2,
      color: FleetColors.muted,
    ),
  );
}

/// Compact screen heading. One short line of context at most, and the
/// primary action sits beside the title wherever there is room.
class PageHeading extends StatelessWidget {
  const PageHeading({
    super.key,
    required this.title,
    this.subtitle,
    this.actions = const [],
  });

  final String title;
  final String? subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(
            title,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 26,
              height: 1.1,
              fontWeight: FontWeight.w800,
              letterSpacing: -.9,
              color: FleetColors.ink,
            ),
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(
            subtitle!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 12,
              height: 1.4,
              color: FleetColors.muted,
            ),
          ),
        ],
      ],
    );

    if (actions.isEmpty) return heading;

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 520) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(child: heading),
              const SizedBox(width: 14),
              Wrap(spacing: 8, runSpacing: 8, children: actions),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            heading,
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: actions),
          ],
        );
      },
    );
  }
}

/// Consistent page padding so every screen breathes the same way.
EdgeInsets screenPadding(BuildContext context) {
  final wide = MediaQuery.sizeOf(context).width >= 760;
  return EdgeInsets.fromLTRB(wide ? 28 : 16, 16, wide ? 28 : 16, 24);
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.margin = EdgeInsets.zero,
  });

  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: margin,
      child: Padding(padding: padding, child: child),
    );
  }
}

class PanelHeading extends StatelessWidget {
  const PanelHeading({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.action,
  });

  final String title;
  final String? subtitle;
  final String? trailing;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 15.5,
                  fontWeight: FontWeight.w800,
                  color: FleetColors.ink,
                  letterSpacing: -.35,
                ),
              ),
            ),
            if (trailing != null)
              Text(
                trailing!,
                style: const TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 10.5,
                  fontWeight: FontWeight.w600,
                  color: FleetColors.muted,
                ),
              ),
            if (action != null) ...[const SizedBox(width: 4), action!],
          ],
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 5),
          Text(
            subtitle!,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 10.5,
              color: FleetColors.muted,
              height: 1.5,
            ),
          ),
        ],
      ],
    );
  }
}

class MetricTile extends StatelessWidget {
  const MetricTile({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.helper,
    this.dark = false,
    this.alert = false,
    this.success = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final String? helper;
  final bool dark;
  final bool alert;
  final bool success;

  @override
  Widget build(BuildContext context) {
    final foreground = dark ? FleetColors.white : FleetColors.ink;
    final valueColor = alert
        ? FleetColors.red
        : success
        ? FleetColors.success
        : foreground;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: dark ? FleetColors.heroGradient : null,
        color: dark ? null : FleetColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: dark
            ? null
            : Border.all(color: FleetColors.warmGrey, width: .7),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(
                icon,
                size: 16,
                color: alert
                    ? FleetColors.red
                    : success
                    ? FleetColors.success
                    : (dark
                          ? FleetColors.white.withValues(alpha: .82)
                          : FleetColors.muted),
              ),
              const Spacer(),
              if (alert)
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    color: FleetColors.red,
                    shape: BoxShape.circle,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(
                  value,
                  maxLines: 1,
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 21,
                    height: 1.05,
                    fontWeight: FontWeight.w800,
                    color: valueColor,
                    letterSpacing: -.6,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: dark
                      ? FleetColors.white.withValues(alpha: .74)
                      : FleetColors.muted,
                ),
              ),
              if (helper != null) ...[
                const SizedBox(height: 2),
                Text(
                  helper!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Manrope',
                    fontSize: 9.5,
                    height: 1.3,
                    color: dark
                        ? FleetColors.white.withValues(alpha: .50)
                        : FleetColors.faint,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.label, {super.key, this.overrideColor});

  final String label;
  final Color? overrideColor;

  Color get color {
    if (overrideColor != null) return overrideColor!;
    switch (label) {
      case 'Available':
      case 'Completed':
      case 'Active':
      case 'Compliant':
      case 'Up to date':
      case 'Assigned':
        return FleetColors.ink;
      case 'On hire':
        return FleetColors.ink;
      case 'Maintenance':
        return FleetColors.muted;
      case 'Cancelled':
      case 'Overdue':
      case 'Expired':
      case 'Voided':
        return FleetColors.red;
      default:
        return FleetColors.muted;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
    this.actionLabel,
    this.actionIcon = Icons.add_rounded,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String body;
  final String? actionLabel;
  final IconData actionIcon;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 8),
      child: Column(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: FleetColors.mist,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: FleetColors.ink, size: 20),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Manrope',
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: FleetColors.ink,
              letterSpacing: -.2,
            ),
          ),
          const SizedBox(height: 4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Text(
              body,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'Manrope',
                fontSize: 11.5,
                color: FleetColors.muted,
                height: 1.5,
              ),
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: onAction,
              icon: Icon(actionIcon, size: 18),
              label: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}

class InlineAlert extends StatelessWidget {
  const InlineAlert({
    super.key,
    required this.message,
    this.onDismiss,
    this.tone = AlertTone.error,
  });

  final String message;
  final VoidCallback? onDismiss;
  final AlertTone tone;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      AlertTone.error => FleetColors.red,
      AlertTone.warning => FleetColors.red,
      AlertTone.success => FleetColors.success,
      AlertTone.info => FleetColors.ink,
    };
    final icon = switch (tone) {
      AlertTone.error => Icons.error_outline_rounded,
      AlertTone.warning => Icons.warning_amber_rounded,
      AlertTone.success => Icons.check_circle_outline_rounded,
      AlertTone.info => Icons.info_outline_rounded,
    };
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: tone == AlertTone.error || tone == AlertTone.warning
            ? FleetColors.red.withValues(alpha: .06)
            : FleetColors.surface,
        border: Border.all(color: color.withValues(alpha: .32)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 17, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                fontFamily: 'Manrope',
                fontSize: 11.5,
                color: FleetColors.ink,
                height: 1.45,
              ),
            ),
          ),
          if (onDismiss != null)
            InkWell(
              onTap: onDismiss,
              borderRadius: BorderRadius.circular(8),
              child: const Padding(
                padding: EdgeInsets.only(left: 6),
                child: Icon(Icons.close_rounded, size: 16),
              ),
            ),
        ],
      ),
    );
  }
}

enum AlertTone { error, warning, success, info }

class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.text,
    this.icon = Icons.info_outline_rounded,
    this.tone = AlertTone.info,
  });

  final String text;
  final IconData icon;
  final AlertTone tone;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      AlertTone.error || AlertTone.warning => FleetColors.red,
      AlertTone.success => FleetColors.success,
      AlertTone.info => FleetColors.ink,
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: tone == AlertTone.info
            ? FleetColors.mist.withValues(alpha: .62)
            : color.withValues(alpha: .06),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: tone == AlertTone.info
              ? FleetColors.warmGrey
              : color.withValues(alpha: .25),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon,
            size: 17,
            color: tone == AlertTone.info ? FleetColors.ink : color,
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                fontFamily: 'Manrope',
                fontSize: 10.5,
                height: 1.55,
                color: FleetColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class FormSectionTitle extends StatelessWidget {
  const FormSectionTitle(this.title, {super.key});
  final String title;

  @override
  Widget build(BuildContext context) => Text(
    title,
    style: const TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w800,
      color: FleetColors.ink,
    ),
  );
}

class AppDateField extends StatelessWidget {
  const AppDateField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.required = false,
    this.helper,
    this.clearable = true,
  });

  final String label;
  final String? value;
  final ValueChanged<String?> onChanged;
  final bool required;
  final String? helper;
  final bool clearable;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final picked = await pickIsoDate(
          context,
          initial: value,
          helpText: label,
        );
        if (picked != null) onChanged(picked);
      },
      borderRadius: BorderRadius.circular(14),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: required ? '$label *' : label,
          helperText: helper,
          suffixIcon: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (clearable && value != null)
                IconButton(
                  tooltip: 'Clear date',
                  onPressed: () => onChanged(null),
                  icon: const Icon(Icons.close_rounded, size: 16),
                ),
              const Padding(
                padding: EdgeInsets.only(right: 10),
                child: Icon(
                  Icons.calendar_today_outlined,
                  size: 16,
                  color: FleetColors.ink,
                ),
              ),
            ],
          ),
        ),
        child: Text(
          value == null ? 'Not set' : formatDate(value),
          style: TextStyle(
            fontSize: 14,
            color: value == null ? FleetColors.muted : FleetColors.ink,
          ),
        ),
      ),
    );
  }
}

class DetailRow extends StatelessWidget {
  const DetailRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 11,
                color: FleetColors.muted,
                height: 1.4,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 11.5,
                color: valueColor ?? FleetColors.ink,
                fontWeight: FontWeight.w600,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class HeroStat {
  const HeroStat(this.label, this.value, {this.alert = false});

  final String label;
  final String value;
  final bool alert;
}

class _HeroStatBlock extends StatelessWidget {
  const _HeroStatBlock(this.stat);

  final HeroStat stat;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          stat.value,
          maxLines: 1,
          style: TextStyle(
            fontFamily: 'Manrope',
            fontSize: 14,
            fontWeight: FontWeight.w800,
            letterSpacing: -.2,
            color: stat.alert ? FleetColors.red : FleetColors.white,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          stat.label.toUpperCase(),
          maxLines: 1,
          style: TextStyle(
            fontFamily: 'Manrope',
            fontSize: 8.5,
            letterSpacing: .8,
            fontWeight: FontWeight.w800,
            color: FleetColors.white.withValues(alpha: .52),
          ),
        ),
      ],
    );
  }
}

class SummaryHero extends StatelessWidget {
  const SummaryHero({
    super.key,
    required this.eyebrow,
    required this.value,
    required this.label,
    this.helper,
    this.icon,
    this.stats = const [],
    this.chart,
  });

  final String eyebrow;
  final String value;
  final String label;
  final String? helper;
  final IconData? icon;
  final List<HeroStat> stats;
  final Widget? chart;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        gradient: FleetColors.heroGradient,
        borderRadius: BorderRadius.circular(22),
        boxShadow: FleetColors.cardShadow,
      ),
      child: Stack(
        children: [
          Positioned(
            top: -72,
            right: -54,
            child: Container(
              width: 210,
              height: 210,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: FleetColors.white.withValues(alpha: .055),
                  width: 28,
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -80,
            left: -54,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: FleetColors.steel.withValues(alpha: .10),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (icon != null) ...[
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: FleetColors.white.withValues(alpha: .10),
                          borderRadius: BorderRadius.circular(11),
                          border: Border.all(
                            color: FleetColors.white.withValues(alpha: .10),
                          ),
                        ),
                        child: Icon(icon, size: 18, color: FleetColors.white),
                      ),
                      const SizedBox(width: 11),
                    ],
                    Expanded(
                      child: Text(
                        eyebrow.toUpperCase(),
                        style: TextStyle(
                          fontFamily: 'Manrope',
                          fontSize: 9.5,
                          letterSpacing: 1.5,
                          fontWeight: FontWeight.w800,
                          color: FleetColors.white.withValues(alpha: .62),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Align(
                            alignment: Alignment.centerLeft,
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.centerLeft,
                              child: Text(
                                value,
                                maxLines: 1,
                                style: const TextStyle(
                                  fontFamily: 'Manrope',
                                  fontSize: 34,
                                  height: 1.02,
                                  letterSpacing: -1.2,
                                  fontWeight: FontWeight.w800,
                                  color: FleetColors.white,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 7),
                          Text(
                            label.toUpperCase(),
                            style: TextStyle(
                              fontFamily: 'Manrope',
                              fontSize: 9.5,
                              letterSpacing: 1,
                              fontWeight: FontWeight.w800,
                              color: FleetColors.white.withValues(alpha: .62),
                            ),
                          ),
                          if (helper != null) ...[
                            const SizedBox(height: 6),
                            Text(
                              helper!,
                              style: TextStyle(
                                fontFamily: 'Manrope',
                                fontSize: 10.5,
                                height: 1.45,
                                color: FleetColors.white.withValues(alpha: .54),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (chart != null) ...[const SizedBox(width: 16), chart!],
                  ],
                ),
                if (stats.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  Container(
                    height: .7,
                    color: FleetColors.white.withValues(alpha: .14),
                  ),
                  const SizedBox(height: 14),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      if (constraints.maxWidth >= 560) {
                        return Wrap(
                          spacing: 38,
                          runSpacing: 14,
                          children: [
                            for (final stat in stats) _HeroStatBlock(stat),
                          ],
                        );
                      }
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (
                            var index = 0;
                            index < stats.length;
                            index++
                          ) ...[
                            if (index > 0)
                              Container(
                                width: .7,
                                height: 34,
                                margin: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                ),
                                color: FleetColors.white.withValues(alpha: .14),
                              ),
                            Expanded(
                              child: Align(
                                alignment: Alignment.centerLeft,
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerLeft,
                                  child: _HeroStatBlock(stats[index]),
                                ),
                              ),
                            ),
                          ],
                        ],
                      );
                    },
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class StatStrip extends StatelessWidget {
  const StatStrip({super.key, required this.stats, this.title, this.trailing});

  final List<HeroStat> stats;
  final String? title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            PanelHeading(title: title!, trailing: trailing),
            const SizedBox(height: 11),
          ],
          Wrap(
            spacing: 7,
            runSpacing: 7,
            children: stats
                .map(
                  (stat) => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 11,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: stat.alert
                          ? FleetColors.red.withValues(alpha: .07)
                          : FleetColors.mist.withValues(alpha: .58),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: stat.alert
                            ? FleetColors.red.withValues(alpha: .18)
                            : FleetColors.warmGrey.withValues(alpha: .65),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          stat.value,
                          style: TextStyle(
                            fontFamily: 'Manrope',
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -.1,
                            color: stat.alert
                                ? FleetColors.red
                                : FleetColors.ink,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          stat.label,
                          style: const TextStyle(
                            fontFamily: 'Manrope',
                            fontSize: 9.5,
                            fontWeight: FontWeight.w600,
                            color: FleetColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }
}

/// A single quiet strip of figures. Replaces stacks of separate metric cards.
class StatBar extends StatelessWidget {
  const StatBar({super.key, required this.stats});

  final List<HeroStat> stats;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
      decoration: BoxDecoration(
        color: FleetColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: FleetColors.warmGrey, width: .7),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          for (var index = 0; index < stats.length; index++) ...[
            if (index > 0)
              Container(width: .7, height: 30, color: FleetColors.warmGrey),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        stats[index].value,
                        maxLines: 1,
                        style: TextStyle(
                          fontFamily: 'Manrope',
                          fontSize: 19,
                          height: 1.05,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -.5,
                          color: stats[index].alert
                              ? FleetColors.red
                              : FleetColors.ink,
                        ),
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      stats[index].label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 10.5,
                        height: 1.2,
                        color: FleetColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class FleetSearchField extends StatefulWidget {
  const FleetSearchField({
    super.key,
    required this.hint,
    required this.onChanged,
    this.controller,
  });

  final String hint;
  final ValueChanged<String> onChanged;
  final TextEditingController? controller;

  @override
  State<FleetSearchField> createState() => _FleetSearchFieldState();
}

class _FleetSearchFieldState extends State<FleetSearchField> {
  late final TextEditingController _controller =
      widget.controller ?? TextEditingController();
  bool get _ownsController => widget.controller == null;

  @override
  void dispose() {
    if (_ownsController) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: _controller,
      builder: (context, value, _) => TextField(
        controller: _controller,
        onChanged: widget.onChanged,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search_rounded, size: 20),
          hintText: widget.hint,
          suffixIcon: value.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Clear search',
                  onPressed: () {
                    _controller.clear();
                    widget.onChanged('');
                  },
                  icon: const Icon(Icons.close_rounded, size: 17),
                ),
        ),
      ),
    );
  }
}

class FilterWrap extends StatelessWidget {
  const FilterWrap({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 7,
      runSpacing: 7,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: children,
    );
  }
}

class DateFilterChip extends StatelessWidget {
  const DateFilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: FleetColors.ink,
      labelStyle: TextStyle(
        fontFamily: 'Manrope',
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: selected ? FleetColors.white : FleetColors.ink,
      ),
      side: BorderSide(
        color: selected ? FleetColors.ink : FleetColors.warmGrey,
      ),
      backgroundColor: FleetColors.surface,
    );
  }
}

Future<String?> pickIsoDate(
  BuildContext context, {
  String? initial,
  String? helpText,
  DateTime? firstDate,
  DateTime? lastDate,
}) async {
  final now = DateTime.now();
  final parsed = parseIsoDate(initial);
  final selected = await showDatePicker(
    context: context,
    initialDate: parsed ?? now,
    firstDate: firstDate ?? DateTime(1990),
    lastDate: lastDate ?? DateTime(now.year + 20, 12, 31),
    helpText: helpText,
  );
  return selected == null ? null : dateToIso(selected);
}

Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Text(message, style: const TextStyle(height: 1.5)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          child: Text(cancelLabel),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          style: FilledButton.styleFrom(
            backgroundColor: destructive ? FleetColors.red : FleetColors.ink,
            foregroundColor: FleetColors.white,
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}

Future<String?> showReasonDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Void entry',
}) async {
  final controller = TextEditingController();
  final reason = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(title),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message, style: const TextStyle(height: 1.5)),
          const SizedBox(height: 14),
          TextField(
            controller: controller,
            autofocus: true,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Reason for voiding *',
              hintText: 'e.g. Duplicate entry, wrong amount',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            final value = controller.text.trim();
            if (value.isEmpty) return;
            Navigator.pop(dialogContext, value);
          },
          style: FilledButton.styleFrom(
            backgroundColor: FleetColors.red,
            foregroundColor: FleetColors.white,
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  controller.dispose();
  return reason;
}

void showAppMessage(
  BuildContext context,
  String message, {
  bool error = false,
}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: error ? FleetColors.red : FleetColors.obsidian,
        content: Row(
          children: [
            Icon(
              error
                  ? Icons.error_outline_rounded
                  : Icons.check_circle_outline_rounded,
              size: 18,
              color: FleetColors.white,
            ),
            const SizedBox(width: 9),
            Expanded(child: Text(message)),
          ],
        ),
      ),
    );
}
