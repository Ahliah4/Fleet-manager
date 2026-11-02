import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The Neon Auth URL is public application configuration, not a credential.
const neonAuthUrl = String.fromEnvironment('NEON_AUTH_URL');
const fleetApiUrl = String.fromEnvironment('FLEET_API_URL');

// Neon Managed Better Auth does not currently document a Flutter-native
// credential handoff. The direct cookie implementation below is retained only
// as a development investigation and is deliberately disabled in release
// builds. Shared staging must use the HTTPS gateway handoff instead.
const _allowUnsupportedNeonAuthForDevelopment = bool.fromEnvironment(
  'ALLOW_UNSUPPORTED_NEON_AUTH_FOR_DEVELOPMENT_ONLY',
);

class NeonAuthException implements Exception {
  const NeonAuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

class NeonAuthSession {
  const NeonAuthSession({required this.email, required this.name});
  final String email;
  final String name;
}

/// Development-only investigation of Better Auth HTTP endpoints.
///
/// Do not enable this in a staging or release build. Flutter must receive its
/// credentials through the supported browser-to-gateway handoff instead.
class NeonAuthService {
  NeonAuthService({
    String? authUrl,
    FlutterSecureStorage? storage,
    HttpClient? httpClient,
  }) : _authUrl = (authUrl ?? neonAuthUrl).replaceFirst(RegExp(r'/+$'), ''),
       _storage = storage ?? const FlutterSecureStorage(),
       _httpClient = httpClient ?? HttpClient();

  final String _authUrl;
  final FlutterSecureStorage _storage;
  final HttpClient _httpClient;
  static const _cookieKey = 'neon_auth_session_cookie';
  String? _bearerToken;

  /// True for the supported browser-to-gateway implementation. The legacy
  /// Better Auth cookie path remains false and is disabled by default.
  bool get usesGateway => false;

  /// Shared dependencies for the gateway implementation.
  FlutterSecureStorage get storage => _storage;
  HttpClient get httpClient => _httpClient;

  bool get isConfigured =>
      _allowUnsupportedNeonAuthForDevelopment &&
      _authUrl.startsWith('https://');
  bool get apiConfigured => fleetApiUrl.startsWith('https://');

  Future<NeonAuthSession?> restoreSession() async {
    _requireConfigured();
    final cookie = await _storage.read(key: _cookieKey);
    if (cookie == null || cookie.isEmpty) return null;
    final response = await _request('GET', '/get-session', cookie: cookie);
    if (response.sessionCookie != null && response.sessionCookie!.isNotEmpty) {
      await _storage.write(key: _cookieKey, value: response.sessionCookie);
    }
    if (response.statusCode == 401 ||
        response.statusCode == 403 ||
        response.body == 'null') {
      await signOutLocal();
      return null;
    }
    final json = _decode(response);
    final user = _asMap(_asMap(json)?['user']);
    if (user == null) {
      await signOutLocal();
      return null;
    }
    return NeonAuthSession(
      email: user['email'] as String? ?? '',
      name: user['name'] as String? ?? '',
    );
  }

  Future<NeonAuthSession> signIn(String email, String password) async {
    _requireConfigured();
    final response = await _request(
      'POST',
      '/sign-in/email',
      body: {'email': email.trim(), 'password': password},
    );
    final cookie = _sessionCookie(response);
    final json = _decode(response);
    if (cookie == null || cookie.isEmpty) {
      throw const NeonAuthException(
        'Sign in succeeded, but a secure session could not be saved. Please try again.',
      );
    }
    await _storage.write(key: _cookieKey, value: cookie);
    final user = _asMap(_asMap(json)?['user']);
    if (user == null) {
      throw const NeonAuthException('Sign in could not be completed.');
    }
    _bearerToken = null;
    return NeonAuthSession(
      email: user['email'] as String? ?? email.trim(),
      name: user['name'] as String? ?? '',
    );
  }

  Future<NeonAuthSession?> signUp(
    String name,
    String email,
    String password,
  ) async {
    _requireConfigured();
    final response = await _request(
      'POST',
      '/sign-up/email',
      body: {'name': name.trim(), 'email': email.trim(), 'password': password},
    );
    _decode(response);
    return null;
  }

  Future<void> sendVerificationCode(String email) async {
    final response = await _request(
      'POST',
      '/email-otp/send-verification-otp',
      body: {'email': email.trim(), 'type': 'email-verification'},
    );
    _decode(response);
  }

  Future<void> verifyEmail(String email, String code) async {
    final response = await _request(
      'POST',
      '/email-otp/verify-email',
      body: {'email': email.trim(), 'otp': code.trim()},
    );
    _decode(response);
  }

  Future<void> requestPasswordReset(String email) async {
    _requireConfigured();
    final response = await _request(
      'POST',
      '/email-otp/request-password-reset',
      body: {'email': email.trim()},
    );
    _decode(response);
  }

  Future<void> resetPassword(String email, String code, String password) async {
    final response = await _request(
      'POST',
      '/email-otp/reset-password',
      body: {'email': email.trim(), 'otp': code.trim(), 'password': password},
    );
    _decode(response);
  }

  Future<String> getBearerToken() async {
    _requireConfigured();
    final current = _bearerToken;
    if (current != null && !_isNearExpiry(current)) return current;
    final cookie = await _storage.read(key: _cookieKey);
    if (cookie == null || cookie.isEmpty) {
      throw const NeonAuthException('Please sign in again to continue.');
    }
    final response = await _request('GET', '/token', cookie: cookie);
    if (response.sessionCookie != null && response.sessionCookie!.isNotEmpty) {
      await _storage.write(key: _cookieKey, value: response.sessionCookie);
    }
    final token = _decode(response)['token'];
    if (token is! String || token.isEmpty) {
      throw const NeonAuthException(
        'Your session has expired. Please sign in again.',
      );
    }
    _bearerToken = token;
    return token;
  }

  /// Calls the authenticated identity endpoint; the API derives all app roles
  /// and fleet access from its own database membership records.
  /// Forces one refresh attempt after an API 401. The browser-gateway
  /// implementation overrides this; the legacy cookie path cannot refresh.
  Future<bool> refreshAccessToken() async => false;

  Future<Map<String, dynamic>> loadApiSession() async {
    if (!fleetApiUrl.startsWith('https://')) {
      throw const NeonAuthException(
        'Fleet service is not configured for this build.',
      );
    }
    final token = await getBearerToken();
    try {
      final request = await _httpClient.getUrl(Uri.parse('$fleetApiUrl/v1/me'));
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      if (response.statusCode == 401) {
        _bearerToken = null;
        throw const NeonAuthException(
          'Your sign-in has expired. Please sign in again.',
        );
      }
      dynamic decoded;
      try {
        decoded = jsonDecode(body);
      } catch (_) {
        throw const NeonAuthException(
          'We couldn’t load your fleet access. Please try again.',
        );
      }
      if (response.statusCode == 403) {
        final code = _asMap(_asMap(decoded)?['error'])?['code'];
        if (code == 'ACCOUNT_NOT_PROVISIONED') {
          throw const NeonAuthException(
            'Your account is not connected to a fleet yet. Ask the fleet owner or an administrator to invite you.',
          );
        }
        if (code == 'NO_ACTIVE_FLEET') {
          throw const NeonAuthException(
            'You’re signed in, but you don’t have an active fleet membership yet. Ask the fleet owner or an administrator to invite you.',
          );
        }
        throw const NeonAuthException(
          'You don’t have access to this fleet. Contact your fleet administrator.',
        );
      }
      if (response.statusCode < 200 ||
          response.statusCode >= 300 ||
          decoded is! Map<String, dynamic>) {
        throw const NeonAuthException(
          'We couldn’t load your fleet access. Please try again.',
        );
      }
      final membership = _asMap(decoded['membership']);
      if (membership == null && decoded['platformAdmin'] != true) {
        throw const NeonAuthException(
          'You’re signed in, but don’t have an active fleet membership yet. Ask the fleet owner or an administrator to invite you.',
        );
      }
      final fleet = _asMap(membership?['fleet']);
      if (membership != null && fleet?['status'] != 'active') {
        throw const NeonAuthException(
          'This fleet is not active yet. Contact the fleet owner or an administrator.',
        );
      }
      return decoded;
    } on NeonAuthException {
      rethrow;
    } catch (_) {
      throw const NeonAuthException(
        'Could not connect to Fleet Operations. Check your connection and try again.',
      );
    }
  }

  Future<void> signOut() async {
    final cookie = await _storage.read(key: _cookieKey);
    if (cookie != null && cookie.isNotEmpty && isConfigured) {
      try {
        await _request('POST', '/sign-out', cookie: cookie);
      } on NeonAuthException {
        // Local credentials are cleared even when the provider is unreachable.
      }
    }
    await signOutLocal();
  }

  Future<void> signOutLocal() async {
    _bearerToken = null;
    await _storage.delete(key: _cookieKey);
  }

  Future<_AuthResponse> _request(
    String method,
    String path, {
    String? cookie,
    Map<String, Object?>? body,
  }) async {
    try {
      final request = await _httpClient.openUrl(
        method,
        Uri.parse('$_authUrl$path'),
      );
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      if (body != null) request.headers.contentType = ContentType.json;
      if (cookie != null) request.headers.set(HttpHeaders.cookieHeader, cookie);
      if (body != null) request.write(jsonEncode(body));
      final response = await request.close();
      final text = await response.transform(utf8.decoder).join();
      final sessionCookie = _sessionCookieFromHeaders(response);
      return _AuthResponse(response.statusCode, text, sessionCookie);
    } on NeonAuthException {
      rethrow;
    } catch (_) {
      throw const NeonAuthException(
        'Could not connect to the sign-in service. Check your connection and try again.',
      );
    }
  }

  String? _sessionCookie(_AuthResponse response) => response.sessionCookie;

  String? _sessionCookieFromHeaders(HttpClientResponse response) {
    const cookieName = '__Secure-neonauth.session_token=';
    for (final header
        in response.headers[HttpHeaders.setCookieHeader] ?? const <String>[]) {
      final start = header.indexOf(cookieName);
      if (start >= 0) {
        // Keep the cookie name as well as its value. HttpClient expects a
        // complete Cookie header when the session is restored later.
        return header.substring(start).split(';').first;
      }
    }
    return null;
  }

  dynamic _decode(_AuthResponse response) {
    dynamic payload;
    try {
      payload = response.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
    } catch (_) {
      throw const NeonAuthException(
        'The sign-in service returned an unexpected response.',
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final code = _asMap(payload)?['code'];
      if (code == 'INVALID_EMAIL_OR_PASSWORD') {
        throw const NeonAuthException('That email and password do not match.');
      }
      if (code == 'USER_ALREADY_EXISTS') {
        throw const NeonAuthException(
          'An account already exists for this email. Sign in instead.',
        );
      }
      if (code == 'TOO_MANY_ATTEMPTS' || code == 'TOO_MANY_REQUESTS') {
        throw const NeonAuthException(
          'Too many attempts. Wait a few minutes, then try again.',
        );
      }
      if (response.statusCode == 401 || response.statusCode == 403) {
        throw const NeonAuthException('Please sign in again to continue.');
      }
      throw const NeonAuthException(
        'We couldn’t complete that request. Check the details and try again.',
      );
    }
    return payload;
  }

  bool _isNearExpiry(String token) {
    try {
      final payload = _asMap(
        jsonDecode(
          utf8.decode(
            base64Url.decode(base64Url.normalize(token.split('.')[1])),
          ),
        ),
      );
      final expiry = payload?['exp'];
      return expiry is! int ||
          DateTime.now().millisecondsSinceEpoch ~/ 1000 > expiry - 30;
    } catch (_) {
      return true;
    }
  }

  Map<String, dynamic>? _asMap(dynamic value) =>
      value is Map<String, dynamic> ? value : null;

  void _requireConfigured() {
    if (!isConfigured) {
      throw const NeonAuthException(
        'Secure sign-in is not configured on this build yet. Continue with saved fleet data for now.',
      );
    }
  }
}

class _AuthResponse {
  const _AuthResponse(this.statusCode, this.body, this.sessionCookie);
  final int statusCode;
  final String body;
  final String? sessionCookie;
}
