import type { ZodError } from "zod";

export type FieldErrors = Record<string, string>;

export interface ErrorPayload {
  error: {
    code: string;
    message: string;
    fieldErrors?: FieldErrors;
    supportReference: string;
    retryable: boolean;
  };
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;
  readonly retryable: boolean;
  readonly logLevel: "info" | "warn" | "error";

  constructor(options: {
    statusCode: number;
    code: string;
    message: string;
    fieldErrors?: FieldErrors;
    retryable?: boolean;
    logLevel?: "info" | "warn" | "error";
    cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
    this.retryable = options.retryable ?? false;
    this.logLevel = options.logLevel ?? "warn";
  }
}

export function authRequired(): AppError {
  return new AppError({
    statusCode: 401,
    code: "AUTH_REQUIRED",
    message: "Sign in to continue.",
  });
}

export function authInvalid(): AppError {
  return new AppError({
    statusCode: 401,
    code: "AUTH_INVALID",
    message: "Your session has expired or is not valid. Sign in again.",
  });
}

export function authNotConfigured(): AppError {
  return new AppError({
    statusCode: 503,
    code: "AUTH_NOT_CONFIGURED",
    message:
      "Sign-in is not configured for this environment. Contact your administrator.",
    retryable: false,
    logLevel: "error",
  });
}

export function accountNotProvisioned(): AppError {
  return new AppError({
    statusCode: 403,
    code: "ACCOUNT_NOT_PROVISIONED",
    message:
      "Your sign-in worked, but this account is not set up for Fleet Manager yet. Ask your fleet owner or administrator to invite you.",
  });
}

export function noActiveFleet(): AppError {
  return new AppError({
    statusCode: 403,
    code: "NO_ACTIVE_FLEET",
    message:
      "You are signed in, but you are not a member of a fleet. Ask your fleet owner or administrator to invite you.",
  });
}

export function fleetInactive(): AppError {
  return new AppError({
    statusCode: 403,
    code: "FLEET_INACTIVE",
    message:
      "This fleet is not active. Contact your fleet owner or support if you believe this is a mistake.",
  });
}

export function membershipConflict(): AppError {
  return new AppError({
    statusCode: 500,
    code: "MEMBERSHIP_CONFLICT",
    message:
      "We could not determine which fleet you belong to. Contact support with this reference.",
    logLevel: "error",
  });
}

export function permissionDenied(message?: string): AppError {
  return new AppError({
    statusCode: 403,
    code: "PERMISSION_DENIED",
    message:
      message ??
      "You do not have permission to do that. Ask your fleet owner if you need access.",
  });
}

export function notFound(message?: string): AppError {
  return new AppError({
    statusCode: 404,
    code: "NOT_FOUND",
    message:
      message ??
      "We could not find that record. It may have been removed or belong to another fleet.",
  });
}

export function duplicateVehicle(): AppError {
  return new AppError({
    statusCode: 409,
    code: "VEHICLE_DUPLICATE",
    message: "A vehicle with this registration is already in this fleet.",
    fieldErrors: {
      registrationNumber: "Enter a different registration number.",
    },
  });
}

export function alreadyVoided(recordName: string): AppError {
  return new AppError({
    statusCode: 409,
    code: "ALREADY_VOIDED",
    message: `This ${recordName} has already been voided.`,
    fieldErrors: {
      status: "Voided records cannot be voided again.",
    },
  });
}

export function invalidReference(): AppError {
  return new AppError({
    statusCode: 400,
    code: "INVALID_REFERENCE",
    message:
      "A vehicle, driver, or other record you selected does not exist in your fleet. Refresh the list and try again.",
  });
}

export function validationFailed(error: ZodError): AppError {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_request";
    if (fieldErrors[key]) {
      continue;
    }
    fieldErrors[key] = humanizeIssue(issue.code, issue.message);
  }

  return new AppError({
    statusCode: 400,
    code: "VALIDATION_FAILED",
    message: "Check the highlighted fields and try again.",
    fieldErrors,
  });
}

function humanizeIssue(code: string, fallback: string): string {
  switch (code) {
    case "invalid_type":
      return "This value is not the right type.";
    case "too_small":
      return "This value is too short or too small.";
    case "too_big":
      return "This value is too long or too large.";
    case "invalid_format":
      return "This value has an invalid format.";
    case "unrecognized_keys":
      return "This field is not accepted here.";
    default:
      return fallback;
  }
}
