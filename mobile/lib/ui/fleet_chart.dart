import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'fleet_theme.dart';

class FleetChartSegment {
  const FleetChartSegment({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final int value;
  final Color color;
}

/// A compact, animated donut for saved fleet status counts.
///
/// The chart only visualises the values it is given. It does not infer or
/// create records, so an empty fleet renders as an empty track.
class FleetMixChart extends StatelessWidget {
  const FleetMixChart({
    super.key,
    required this.segments,
    this.size = 108,
    this.centerValue,
    this.centerLabel = 'FLEET',
  });

  final List<FleetChartSegment> segments;
  final double size;
  final String? centerValue;
  final String centerLabel;

  int get _total => segments.fold(0, (sum, segment) => sum + segment.value);

  @override
  Widget build(BuildContext context) {
    final total = _total;
    final semantics = segments
        .where((segment) => segment.value > 0)
        .map((segment) => '${segment.label}: ${segment.value}')
        .join(', ');
    return Semantics(
      label: total == 0
          ? 'Fleet status chart. No vehicles saved.'
          : 'Fleet status chart. $semantics.',
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 850),
        curve: Curves.easeOutCubic,
        builder: (context, progress, _) => SizedBox(
          width: size,
          height: size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: Size.square(size),
                painter: _FleetMixPainter(
                  segments: segments,
                  total: total,
                  progress: progress,
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    centerValue ?? '$total',
                    style: TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: size * .18,
                      height: 1,
                      letterSpacing: -.8,
                      fontWeight: FontWeight.w800,
                      color: FleetColors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    centerLabel.toUpperCase(),
                    style: TextStyle(
                      fontFamily: 'Manrope',
                      fontSize: size * .075,
                      letterSpacing: .9,
                      fontWeight: FontWeight.w800,
                      color: FleetColors.white.withValues(alpha: .55),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FleetMixPainter extends CustomPainter {
  const _FleetMixPainter({
    required this.segments,
    required this.total,
    required this.progress,
  });

  final List<FleetChartSegment> segments;
  final int total;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * .095;
    final rect = Rect.fromCircle(
      center: size.center(Offset.zero),
      radius: (size.shortestSide - stroke) / 2,
    );
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = FleetColors.white.withValues(alpha: .10);
    canvas.drawArc(rect, 0, math.pi * 2, false, trackPaint);

    if (total == 0 || progress <= 0) return;

    final gap = segments.where((segment) => segment.value > 0).length > 1
        ? .035
        : 0.0;
    var start = -math.pi / 2;
    for (final segment in segments) {
      if (segment.value <= 0) continue;
      final fullSweep = math.pi * 2 * (segment.value / total);
      final sweep = (fullSweep - gap).clamp(0.0, math.pi * 2);
      if (sweep <= 0) continue;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.butt
        ..color = segment.color;
      canvas.drawArc(rect, start, sweep * progress, false, paint);
      start += fullSweep;
    }
  }

  @override
  bool shouldRepaint(covariant _FleetMixPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.total != total ||
        oldDelegate.segments != segments;
  }
}
