import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';

void main() {
  Future<void> pumpApp(WidgetTester tester, Size size) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const IpMotorsApp());
    await tester.pumpAndSettle();
  }

  testWidgets('phone navigation opens the sections menu', (tester) async {
    await pumpApp(tester, const Size(390, 844));

    expect(find.text('Dashboard'), findsWidgets);

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();

    expect(find.text('All sections'), findsOneWidget);
    expect(find.text('Reports'), findsWidgets);

    await tester.tap(find.text('Settings & backup').last);
    await tester.pumpAndSettle();

    expect(find.text('Settings & backup'), findsWidgets);
  });

  testWidgets('compact phone fits the bottom bar and sections sheet', (
    tester,
  ) async {
    await pumpApp(tester, const Size(320, 640));

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();

    expect(find.text('All sections'), findsOneWidget);

    await tester.tap(find.text('Drivers').last);
    await tester.pumpAndSettle();

    expect(find.text('Drivers'), findsWidgets);
  });

  testWidgets('wide layout shows the grouped side navigation', (tester) async {
    await pumpApp(tester, const Size(1280, 900));

    expect(find.text('OVERVIEW'), findsOneWidget);
    expect(find.text('OPERATIONS'), findsOneWidget);
    expect(find.text('MONEY'), findsOneWidget);
    expect(find.text('DEVICE'), findsOneWidget);
    expect(find.text('More'), findsNothing);

    await tester.tap(find.text('Reports').first);
    await tester.pumpAndSettle();

    expect(find.text('Reports'), findsWidgets);
  });
}
