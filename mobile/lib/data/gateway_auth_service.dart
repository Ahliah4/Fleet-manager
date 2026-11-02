import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import 'neon_auth_service.dart';

/// Public build-time configuration for the HTTPS authentication gateway.
const authGatewayUrl = String.fromEnvironment('AUTH_GATEWAY_URL');
const mobileRedirectUri = String.fromEnvironment(
  'MOBILE_REDIRECT_URI',
  defaultValue: 'fleetops://auth/callback',
);

/// Authenticates through the gateway's system-browser + PKCE flow.
///
/// The browser keeps the Better Auth cookie. Flutter stores only the rotating
/// refresh token in platform secure storage; the short-lived access token is
/// memory-only and is sent to the Fastify API as a bearer credential.
class GatewayAuthService extends NeonAuthService {
  GatewayAuthService({String? gatewayUrl, super.storage, super.httpClient})
    : _gatewayUrl = (gatewayUrl ?? authGatewayUrl).replaceFirst(
        RegExp(r'/+$'),
        '',
      ),
      super(authUrl: '');

  final String _gatewayUrl;
  static const _refreshKey = 'fleet_gateway_refresh_token';
  String? _accessToken;

  @override
  bool get isConfigured =>
      _gatewayUrl.startsWith('https://') ||
      (!kReleaseMode &&
          (_gatewayUrl.startsWith('http://localhost:') ||
              _gatewayUrl.startsWith('http://127.0.0.1:') ||
              _gatewayUrl.startsWith('http://10.0.2.2:')));

  @override
  bool get apiConfigured =>
      fleetApiUrl.startsWith('https://') ||
      (!kReleaseMode &&
          (fleetApiUrl.startsWith('http://localhost:') ||
              fleetApiUrl.startsWith('http://127.0.0.1:') ||
              fleetApiUrl.startsWith('http://10.0.2.2:')));

  @override
  bool get usesGateway => true;

  @override
  Future<NeonAuthSession?> restoreSession() async {
    _requireConfigured();
    final refresh = await storage.read(key: _refreshKey);
    if (refresh == null || refresh.isEmpty) return null;
    try {
      await _refresh(refresh);
      final api = await loadApiSession();
      return _sessionFromApi(api);
    } on NeonAuthException {
      await signOutLocal();
      return null;
    }
  }

  @override
  Future<NeonAuthSession> signIn(String email, String password) async {
    _ignoreCredentials(email, password);
    _requireConfigured();
    final api = await _browserAuthorize('/auth/sign-in');
    return _sessionFromApi(api);
  }

  @override
  Future<NeonAuthSession?> signUp(
    String name,
    String email,
    String password,
  ) async {
    _ignoreCredentials(name, email);
    _ignoreCredentials(password, '');
    _requireConfigured();
    final api = await _browserAuthorize('/auth/sign-up');
    return _sessionFromApi(api);
  }

  @override
  Future<void> sendVerificationCode(String email) async {
    throw const NeonAuthException(
      'Email verification is completed in the secure sign-in window.',
    );
  }

  @override
  Future<void> verifyEmail(String email, String code) async {
    throw const NeonAuthException(
      'Email verification is completed in the secure sign-in window.',
    );
  }

  @override
  Future<void> requestPasswordReset(String email) async {
    _requireConfigured();
    await _browserAuthorize('/auth/sign-in');
  }

  @override
  Future<void> resetPassword(String email, String code, String password) async {
    throw const NeonAuthException(
      'Password recovery is completed in the secure sign-in window.',
    );
  }

  @override
  Future<String> getBearerToken() async {
    _requireConfigured();
    final token = _accessToken;
    if (token != null && !_isNearExpiry(token)) return token;
    final refresh = await storage.read(key: _refreshKey);
    if (refresh == null || refresh.isEmpty) {
      throw const NeonAuthException('Please sign in again to continue.');
    }
    await _refresh(refresh);
    return _accessToken!;
  }

  @override
  Future<Map<String, dynamic>> loadApiSession() async {
    if (!apiConfigured) {
      throw const NeonAuthException(
        'Fleet service is not configured for this build.',
      );
    }
    final token = await getBearerToken();
    final uri = Uri.parse(
      '${fleetApiUrl.replaceFirst(RegExp(r'/+$'), '')}/v1/me',
    );
    try {
      final request = await httpClient.getUrl(uri);
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      dynamic decoded;
      try {
        decoded = jsonDecode(body);
      } catch (_) {
        throw const NeonAuthException(
          'We couldn’t load your fleet access. Please try again.',
        );
      }
      if (response.statusCode == 401) {
        _accessToken = null;
        throw const NeonAuthException(
          'Your sign-in has expired. Please try again.',
        );
      }
      if (response.statusCode == 403) {
        throw const NeonAuthException(
          'Your account is not connected to an active fleet yet. Ask the fleet owner to invite you.',
        );
      }
      if (response.statusCode < 200 ||
          response.statusCode >= 300 ||
          decoded is! Map<String, dynamic>) {
        throw const NeonAuthException(
          'We couldn’t load your fleet access. Please try again.',
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

  @override
  Future<bool> refreshAccessToken() async {
    final refresh = await storage.read(key: _refreshKey);
    if (refresh == null || refresh.isEmpty) return false;
    try {
      await _refresh(refresh);
      return true;
    } on NeonAuthException {
      await signOutLocal();
      return false;
    }
  }

  @override
  Future<void> signOut() async {
    final refresh = await storage.read(key: _refreshKey);
    if (refresh != null && refresh.isNotEmpty) {
      try {
        await _post('/mobile/revoke', {'refresh_token': refresh});
      } catch (_) {
        // Local credentials are cleared even if the gateway is unreachable.
      }
    }
    await signOutLocal();
  }

  @override
  Future<void> signOutLocal() async {
    _accessToken = null;
    await storage.delete(key: _refreshKey);
  }

  Future<Map<String, dynamic>> _browserAuthorize(String page) async {
    final verifier = _randomVerifier();
    final state = _randomVerifier().substring(0, 32);
    final challenge = base64Url
        .encode(sha256.convert(utf8.encode(verifier)).bytes)
        .replaceAll('=', '');
    final start = Uri.parse('$_gatewayUrl/mobile/start').replace(
      queryParameters: {
        'code_challenge': challenge,
        'state': state,
        'redirect_uri': mobileRedirectUri,
        'auth_path': page,
      },
    );
    final callback = await FlutterWebAuth2.authenticate(
      url: start.toString(),
      callbackUrlScheme: Uri.parse(mobileRedirectUri).scheme,
    );
    final callbackUri = Uri.parse(callback);
    if (callbackUri.queryParameters['state'] != state) {
      throw const NeonAuthException('The sign-in verification failed.');
    }
    final code = callbackUri.queryParameters['code'];
    if (code == null || code.isEmpty) {
      throw const NeonAuthException(
        'Sign-in was cancelled or could not be completed.',
      );
    }
    final token = await _post('/mobile/exchange', {
      'code': code,
      'code_verifier': verifier,
    });
    final access = token['accessToken'];
    final refresh = token['refreshToken'];
    if (access is! String ||
        refresh is! String ||
        access.isEmpty ||
        refresh.isEmpty) {
      throw const NeonAuthException(
        'Secure sign-in did not return a valid session.',
      );
    }
    _accessToken = access;
    await storage.write(key: _refreshKey, value: refresh);
    return loadApiSession();
  }

  Future<void> _refresh(String refreshToken) async {
    final token = await _post('/mobile/refresh', {
      'refresh_token': refreshToken,
    });
    final access = token['accessToken'];
    final nextRefresh = token['refreshToken'];
    if (access is! String ||
        nextRefresh is! String ||
        access.isEmpty ||
        nextRefresh.isEmpty) {
      throw const NeonAuthException(
        'Your secure session has expired. Please sign in again.',
      );
    }
    _accessToken = access;
    await storage.write(key: _refreshKey, value: nextRefresh);
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, String> body,
  ) async {
    try {
      final request = await httpClient.postUrl(Uri.parse('$_gatewayUrl$path'));
      request.headers.contentType = ContentType.json;
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.write(jsonEncode(body));
      final response = await request.close();
      final text = await response.transform(utf8.decoder).join();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw const NeonAuthException(
          'The secure sign-in service rejected the request.',
        );
      }
      final decoded = jsonDecode(text);
      if (decoded is! Map<String, dynamic>) {
        throw const NeonAuthException(
          'The secure sign-in service returned an unexpected response.',
        );
      }
      return decoded;
    } on NeonAuthException {
      rethrow;
    } catch (_) {
      throw const NeonAuthException(
        'Could not connect to the secure sign-in service. Check your connection and try again.',
      );
    }
  }

  NeonAuthSession _sessionFromApi(Map<String, dynamic> value) {
    final user = value['user'];
    if (user is! Map<String, dynamic>) {
      throw const NeonAuthException(
        'Your account is not ready for fleet access yet.',
      );
    }
    return NeonAuthSession(
      email: user['email'] as String? ?? '',
      name: user['displayName'] as String? ?? '',
    );
  }

  String _randomVerifier() {
    final random = Random.secure();
    final bytes = List<int>.generate(48, (_) => random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  bool _isNearExpiry(String token) {
    try {
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(token.split('.')[1]))),
      );
      final expiry = payload is Map ? payload['exp'] : null;
      return expiry is! num ||
          DateTime.now().millisecondsSinceEpoch ~/ 1000 > expiry - 30;
    } catch (_) {
      return true;
    }
  }

  void _requireConfigured() {
    if (!isConfigured) {
      throw const NeonAuthException(
        'Secure sign-in is not configured for this build yet.',
      );
    }
  }

  void _ignoreCredentials(String first, String second) {
    // The system browser collects credentials so Flutter never handles them.
  }
}
