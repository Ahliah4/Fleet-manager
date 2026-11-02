import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

import 'neon_auth_service.dart';

/// A structured, user-safe API failure. Technical provider detail stays in the
/// server log; the client only receives a stable code and a plain message.
class FleetApiException implements Exception {
  const FleetApiException({
    required this.statusCode,
    required this.code,
    required this.message,
  });

  final int statusCode;
  final String code;
  final String message;

  bool get isAuthentication => statusCode == 401 || code == 'AUTH_REQUIRED';
  bool get isPermission => statusCode == 403;
  bool get isNetwork => statusCode == 0;
  bool get isServer => statusCode >= 500;
  bool get isConflict => statusCode == 409;
  bool get isTransient => isNetwork || isServer || statusCode == 429;

  @override
  String toString() => message;
}

class FleetApiClient {
  FleetApiClient({required this.auth, String? baseUrl, HttpClient? httpClient})
    : _baseUrl = (baseUrl ?? fleetApiUrl).replaceFirst(RegExp(r'/+$'), ''),
      _httpClient = httpClient ?? HttpClient();

  final NeonAuthService auth;
  final String _baseUrl;
  final HttpClient _httpClient;

  bool get isConfigured {
    if (_baseUrl.startsWith('https://')) return true;
    if (kReleaseMode) return false;
    return _baseUrl.startsWith('http://localhost:') ||
        _baseUrl.startsWith('http://127.0.0.1:') ||
        _baseUrl.startsWith('http://10.0.2.2:');
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query}) =>
      _send('GET', path, query: query);

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, Object?>? body,
  }) => _send('POST', path, body: body);

  Future<Map<String, dynamic>> patch(
    String path, {
    Map<String, Object?>? body,
  }) => _send('PATCH', path, body: body);

  Future<Map<String, dynamic>> delete(String path) => _send('DELETE', path);

  Future<List<Map<String, dynamic>>> listAll(
    String path,
    String key, {
    int pageSize = 100,
  }) async {
    final items = <Map<String, dynamic>>[];
    var offset = 0;
    while (true) {
      final page = await get(
        path,
        query: {'limit': '$pageSize', 'offset': '$offset'},
      );
      final batch = page[key];
      if (batch is! List) {
        throw const FleetApiException(
          statusCode: 502,
          code: 'INVALID_RESPONSE',
          message: 'Fleet Operations returned an unexpected response.',
        );
      }
      items.addAll(
        batch.whereType<Map>().map((value) => Map<String, dynamic>.from(value)),
      );
      final pagination = page['pagination'];
      final total = pagination is Map ? pagination['total'] : null;
      offset += batch.length;
      if (batch.isEmpty || (total is num && offset >= total)) break;
    }
    return items;
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Map<String, Object?>? body,
    bool canRetryAuth = true,
  }) async {
    if (!isConfigured) {
      throw const FleetApiException(
        statusCode: 0,
        code: 'NOT_CONFIGURED',
        message: 'The shared fleet service is not configured for this build.',
      );
    }
    final token = await auth.getBearerToken();
    final uri = Uri.parse(
      '$_baseUrl$path',
    ).replace(queryParameters: query == null || query.isEmpty ? null : query);

    try {
      final request = await _httpClient.openUrl(method, uri);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(body));
      }
      final response = await request.close();
      final text = await response.transform(utf8.decoder).join();

      if (response.statusCode == 401 && canRetryAuth) {
        final refreshed = await auth.refreshAccessToken();
        if (refreshed) {
          return await _send(
            method,
            path,
            query: query,
            body: body,
            canRetryAuth: false,
          );
        }
      }

      final decoded = text.isEmpty ? <String, dynamic>{} : jsonDecode(text);
      if (response.statusCode >= 200 && response.statusCode < 300) {
        if (decoded is Map<String, dynamic>) return decoded;
        return <String, dynamic>{'data': decoded};
      }

      final error = decoded is Map ? decoded['error'] : null;
      final code = error is Map && error['code'] is String
          ? error['code'] as String
          : 'REQUEST_FAILED';
      final message = error is Map && error['message'] is String
          ? error['message'] as String
          : _fallbackMessage(response.statusCode);
      throw FleetApiException(
        statusCode: response.statusCode,
        code: code,
        message: message,
      );
    } on FleetApiException {
      rethrow;
    } on NeonAuthException catch (error) {
      throw FleetApiException(
        statusCode: 401,
        code: 'AUTH_REQUIRED',
        message: error.message,
      );
    } on SocketException {
      throw const FleetApiException(
        statusCode: 0,
        code: 'NETWORK_UNAVAILABLE',
        message:
            'You are offline. Changes are saved on this device and will '
            'sync when the connection returns.',
      );
    } on HttpException {
      throw const FleetApiException(
        statusCode: 0,
        code: 'NETWORK_UNAVAILABLE',
        message: 'Could not reach Fleet Operations. Check your connection.',
      );
    } on FormatException {
      throw const FleetApiException(
        statusCode: 502,
        code: 'INVALID_RESPONSE',
        message: 'Fleet Operations returned an unexpected response.',
      );
    }
  }

  String _fallbackMessage(int status) {
    if (status == 401) return 'Please sign in again to continue.';
    if (status == 403) return 'You do not have permission to do that.';
    if (status == 404) return 'That record is no longer available.';
    if (status == 409) return 'That record changed on another device.';
    if (status >= 500) {
      return 'Fleet Operations is unavailable right now. Try again shortly.';
    }
    return 'The request could not be completed.';
  }
}
