import 'package:flutter/material.dart';

import '../data/neon_auth_service.dart';
import '../ui/fleet_theme.dart';

enum _AuthMode { signIn, signUp, verify, requestReset, reset }

class AuthScreen extends StatefulWidget {
  const AuthScreen({
    required this.auth,
    required this.onContinueOffline,
    required this.onSignedIn,
    super.key,
  });

  final NeonAuthService auth;
  final VoidCallback onContinueOffline;
  final ValueChanged<NeonAuthSession> onSignedIn;

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  _AuthMode _mode = _AuthMode.signIn;
  bool _busy = false;
  bool _passwordVisible = false;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!widget.auth.usesGateway && !_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      switch (_mode) {
        case _AuthMode.signIn:
          final session = await widget.auth.signIn(_email.text, _password.text);
          if (widget.auth.apiConfigured) await widget.auth.loadApiSession();
          if (mounted) widget.onSignedIn(session);
        case _AuthMode.signUp:
          final session = await widget.auth.signUp(
            _name.text,
            _email.text,
            _password.text,
          );
          if (session != null) {
            if (mounted) widget.onSignedIn(session);
            break;
          }
          if (!mounted) return;
          setState(() {
            _mode = _AuthMode.verify;
            _message = 'We sent a verification code to your email.';
          });
        case _AuthMode.verify:
          await widget.auth.verifyEmail(_email.text, _code.text);
          if (!mounted) return;
          setState(() {
            _mode = _AuthMode.signIn;
            _message = 'Email verified. Sign in to continue.';
            _code.clear();
          });
        case _AuthMode.requestReset:
          await widget.auth.requestPasswordReset(_email.text);
          if (!mounted) return;
          setState(() {
            _mode = _AuthMode.reset;
            _message = 'If that account exists, we sent a reset code.';
          });
        case _AuthMode.reset:
          await widget.auth.resetPassword(
            _email.text,
            _code.text,
            _password.text,
          );
          if (!mounted) return;
          setState(() {
            _mode = _AuthMode.signIn;
            _message = 'Password updated. Sign in with your new password.';
            _code.clear();
            _password.clear();
          });
      }
    } on NeonAuthException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'We couldn’t complete that request. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _changeMode(_AuthMode mode) {
    setState(() {
      _mode = mode;
      _error = null;
      _message = null;
      _code.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return Scaffold(
      backgroundColor: FleetColors.canvas,
      body: SafeArea(
        child: Stack(
          children: [
            const _AuthHero(),
            Align(
              alignment: Alignment.topCenter,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Column(
                    children: [
                      const _BrandLockup(),
                      const SizedBox(height: 22),
                      AnimatedSwitcher(
                        duration: reduceMotion
                            ? Duration.zero
                            : const Duration(milliseconds: 180),
                        switchInCurve: Curves.easeOutCubic,
                        switchOutCurve: Curves.easeOutCubic,
                        transitionBuilder: (child, animation) => FadeTransition(
                          opacity: animation,
                          child: ScaleTransition(
                            scale: Tween<double>(
                              begin: .98,
                              end: 1,
                            ).animate(animation),
                            child: child,
                          ),
                        ),
                        child: _AuthPanel(
                          key: ValueKey(_mode),
                          formKey: _formKey,
                          mode: _mode,
                          gateway: widget.auth.usesGateway,
                          name: _name,
                          email: _email,
                          password: _password,
                          code: _code,
                          passwordVisible: _passwordVisible,
                          busy: _busy,
                          error: _error,
                          message: _message,
                          onPasswordVisibilityChanged: () => setState(
                            () => _passwordVisible = !_passwordVisible,
                          ),
                          onSubmit: _submit,
                          onModeChanged: _changeMode,
                          onContinueOffline: widget.onContinueOffline,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthHero extends StatelessWidget {
  const _AuthHero();

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Align(
      alignment: Alignment.topCenter,
      child: Container(
        height: 222,
        decoration: const BoxDecoration(gradient: FleetColors.heroGradient),
        child: Stack(
          children: [
            Positioned(
              top: -128,
              right: -86,
              child: _ring(270, const Color(0x1FFFFFFF)),
            ),
            Positioned(
              top: 54,
              left: -74,
              child: _ring(156, const Color(0x16FFFFFF)),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _ring(double size, Color color) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      border: Border.all(color: color),
    ),
  );
}

class _BrandLockup extends StatelessWidget {
  const _BrandLockup();

  @override
  Widget build(BuildContext context) => Column(
    children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Image.asset(
          'assets/images/ip_motors_logo.jpg',
          width: 172,
          height: 96,
          fit: BoxFit.contain,
          semanticLabel: 'IP Motors and Logistics',
        ),
      ),
      const SizedBox(height: 4),
      const Text(
        'FLEET OPERATIONS',
        style: TextStyle(
          color: Color(0xCFFFFFFF),
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.6,
        ),
      ),
    ],
  );
}

class _AuthPanel extends StatelessWidget {
  const _AuthPanel({
    super.key,
    required this.formKey,
    required this.mode,
    required this.gateway,
    required this.name,
    required this.email,
    required this.password,
    required this.code,
    required this.passwordVisible,
    required this.busy,
    required this.error,
    required this.message,
    required this.onPasswordVisibilityChanged,
    required this.onSubmit,
    required this.onModeChanged,
    required this.onContinueOffline,
  });

  final GlobalKey<FormState> formKey;
  final _AuthMode mode;
  final bool gateway;
  final TextEditingController name;
  final TextEditingController email;
  final TextEditingController password;
  final TextEditingController code;
  final bool passwordVisible;
  final bool busy;
  final String? error;
  final String? message;
  final VoidCallback onPasswordVisibilityChanged;
  final Future<void> Function() onSubmit;
  final ValueChanged<_AuthMode> onModeChanged;
  final VoidCallback onContinueOffline;

  bool get _signingUp => mode == _AuthMode.signUp;
  bool get _verifying => mode == _AuthMode.verify;
  bool get _requestingReset => mode == _AuthMode.requestReset;
  bool get _resetting => mode == _AuthMode.reset;

  @override
  Widget build(BuildContext context) {
    final title = _verifying
        ? 'Confirm your email'
        : _resetting
        ? 'Choose a new password'
        : _requestingReset
        ? 'Reset your password'
        : _signingUp
        ? 'Create your account'
        : 'Sign in to your fleet';
    final subtitle = _verifying
        ? 'Enter the code sent to ${email.text.trim()}.'
        : _resetting
        ? 'Use the code in your email, then set a new password.'
        : _requestingReset
        ? 'We will send a one-time reset code to your email.'
        : _signingUp
        ? 'Start with your work email. Fleet access is assigned by an owner.'
        : 'Manage vehicles, compliance and hires in one place.';

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
      decoration: BoxDecoration(
        color: FleetColors.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: FleetColors.warmGrey),
        boxShadow: FleetColors.cardShadow,
      ),
      child: AutofillGroup(
        child: Form(
          key: formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 7),
              Text(
                subtitle,
                style: Theme.of(context).textTheme.bodyMedium
                    ?.copyWith(color: FleetColors.muted),
              ),
              const SizedBox(height: 24),
              if (gateway) ...[
                Container(
                  padding: const EdgeInsets.all(13),
                  decoration: BoxDecoration(
                    color: FleetColors.mist,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text(
                    'Your sign-in opens in a secure browser window. Fleet Operations never handles or stores your password.',
                    style: TextStyle(color: FleetColors.muted, height: 1.4),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              if (!gateway && _signingUp) ...[
                _field(
                  controller: name,
                  label: 'Full name',
                  icon: Icons.person_outline_rounded,
                  autofillHints: const [AutofillHints.name],
                  validator: (value) => (value?.trim().isEmpty ?? true)
                      ? 'Enter your name.'
                      : null,
                ),
                const SizedBox(height: 12),
              ],
              if (!gateway && !_verifying && !_resetting) ...[
                _field(
                  controller: email,
                  label: 'Email address',
                  icon: Icons.mail_outline_rounded,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  validator: (value) => (value?.contains('@') ?? false)
                      ? null
                      : 'Enter a valid email address.',
                ),
                const SizedBox(height: 12),
              ],
              if (!gateway && (_verifying || _resetting)) ...[
                _field(
                  controller: code,
                  label: 'Email code',
                  icon: Icons.mark_email_read_outlined,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  validator: (value) => (value?.trim().isNotEmpty ?? false)
                      ? null
                      : 'Enter the code from your email.',
                ),
                const SizedBox(height: 12),
              ],
              if (!gateway && !_requestingReset && !_verifying) ...[
                _field(
                  controller: password,
                  label: _resetting ? 'New password' : 'Password',
                  icon: Icons.lock_outline_rounded,
                  obscure: !passwordVisible,
                  autofillHints: [
                    _signingUp || _resetting
                        ? AutofillHints.newPassword
                        : AutofillHints.password,
                  ],
                  suffix: IconButton(
                    tooltip: passwordVisible
                        ? 'Hide password'
                        : 'Show password',
                    onPressed: onPasswordVisibilityChanged,
                    icon: Icon(
                      passwordVisible
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                    ),
                  ),
                  validator: (value) => (value?.length ?? 0) < 8
                      ? 'Use at least 8 characters.'
                      : null,
                ),
              ],
              if (error != null) _feedback(error!, isError: true),
              if (message != null) _feedback(message!),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: busy ? null : onSubmit,
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(54),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: busy
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: FleetColors.white,
                        ),
                      )
                    : Text(_primaryLabel),
              ),
              const SizedBox(height: 8),
              _modeActions(),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 18),
                child: Row(
                  children: [
                    Expanded(child: Divider()),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'OR',
                        style: TextStyle(
                          color: FleetColors.faint,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Expanded(child: Divider()),
                  ],
                ),
              ),
              OutlinedButton.icon(
                onPressed: busy ? null : onContinueOffline,
                icon: const Icon(Icons.phone_android_rounded, size: 19),
                label: const Text('Use saved fleet data'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String get _primaryLabel {
    if (_verifying) return 'Verify email';
    if (_resetting) return 'Update password';
    if (_requestingReset) return 'Send reset code';
    if (_signingUp) return 'Create account';
    return 'Sign in';
  }

  Widget _modeActions() {
    if (gateway) {
      return TextButton(
        onPressed: busy
            ? null
            : () => onModeChanged(
                _signingUp ? _AuthMode.signIn : _AuthMode.signUp,
              ),
        child: Text(
          _signingUp
              ? 'Already have an account? Sign in'
              : 'New here? Create an account',
        ),
      );
    }
    if (_verifying || _resetting || _requestingReset) {
      return TextButton(
        onPressed: busy ? null : () => onModeChanged(_AuthMode.signIn),
        child: const Text('Back to sign in'),
      );
    }
    if (_signingUp) {
      return TextButton(
        onPressed: busy ? null : () => onModeChanged(_AuthMode.signIn),
        child: const Text('Already have an account? Sign in'),
      );
    }
    return Column(
      children: [
        TextButton(
          onPressed: busy ? null : () => onModeChanged(_AuthMode.requestReset),
          child: const Text('Forgot password?'),
        ),
        TextButton(
          onPressed: busy ? null : () => onModeChanged(_AuthMode.signUp),
          child: const Text('New here? Create an account'),
        ),
      ],
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    required String? Function(String?) validator,
    bool obscure = false,
    TextInputType? keyboardType,
    Iterable<String>? autofillHints,
    Widget? suffix,
  }) => TextFormField(
    controller: controller,
    obscureText: obscure,
    keyboardType: keyboardType,
    autocorrect: false,
    enableSuggestions: !obscure,
    textInputAction: TextInputAction.next,
    autofillHints: autofillHints,
    validator: validator,
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon, size: 20),
      suffixIcon: suffix,
    ),
  );

  Widget _feedback(String value, {bool isError = false}) => Container(
    margin: const EdgeInsets.only(top: 16),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: isError ? const Color(0x14D21F2C) : FleetColors.mist,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Row(
      children: [
        Icon(
          isError
              ? Icons.info_outline_rounded
              : Icons.check_circle_outline_rounded,
          color: isError ? FleetColors.red : FleetColors.ink,
          size: 18,
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              color: isError ? FleetColors.red : FleetColors.ink,
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ),
      ],
    ),
  );
}
