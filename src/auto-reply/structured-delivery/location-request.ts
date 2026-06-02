import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { validateStructuredDeliveryRoute } from "./schema.js";
import type {
  LocationRequestEnvelope,
  StructuredDeliveryFailureCode,
  StructuredDeliveryResult,
  StructuredDeliveryValidationIssue,
} from "./types.js";

const DEFAULT_BUTTON_LABEL = "Share location";
const MAX_MESSAGE_CHARS = 2000;
const MAX_BUTTON_LABEL_CHARS = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function issue(
  code: StructuredDeliveryFailureCode,
  path: string,
  message: string,
): StructuredDeliveryValidationIssue {
  return { code, path, message };
}

function invalid<T>(issues: StructuredDeliveryValidationIssue[]): StructuredDeliveryResult<T> {
  return {
    ok: false,
    code: "model_copy_invalid",
    issues,
  };
}

function boundedRequiredString(params: {
  raw: unknown;
  path: string;
  maxChars: number;
  code?: StructuredDeliveryFailureCode;
  issues: StructuredDeliveryValidationIssue[];
}): string | undefined {
  const code = params.code ?? "model_copy_invalid";
  const value = normalizeOptionalString(params.raw);
  if (!value) {
    params.issues.push(issue(code, params.path, `${params.path} is required`));
    return undefined;
  }
  if (value.length > params.maxChars) {
    params.issues.push(
      issue(code, params.path, `${params.path} must be at most ${params.maxChars} characters`),
    );
    return undefined;
  }
  return value;
}

function normalizeButtonLabel(params: {
  raw: unknown;
  hasRaw: boolean;
  issues: StructuredDeliveryValidationIssue[];
}): string | undefined {
  if (!params.hasRaw) {
    return DEFAULT_BUTTON_LABEL;
  }
  return boundedRequiredString({
    raw: params.raw,
    path: "buttonLabel",
    maxChars: MAX_BUTTON_LABEL_CHARS,
    issues: params.issues,
  });
}

export function buildLocationRequestEnvelope(
  args: unknown,
): StructuredDeliveryResult<LocationRequestEnvelope> {
  if (!isRecord(args)) {
    return invalid([
      issue("model_copy_invalid", "$", "request_user_location arguments must be an object"),
    ]);
  }

  const issues: StructuredDeliveryValidationIssue[] = [];
  const message = boundedRequiredString({
    raw: args.message,
    path: "message",
    maxChars: MAX_MESSAGE_CHARS,
    issues,
  });
  const buttonLabel = normalizeButtonLabel({
    raw: args.buttonLabel,
    hasRaw: Object.hasOwn(args, "buttonLabel"),
    issues,
  });

  if (issues.length > 0 || !message || !buttonLabel) {
    return invalid(issues);
  }

  return {
    ok: true,
    value: {
      kind: "location_request",
      message,
      button: {
        label: buttonLabel,
        requestLocation: true,
      },
    },
  };
}

export function validateLocationRequestEnvelope(
  envelope: LocationRequestEnvelope,
): StructuredDeliveryResult<LocationRequestEnvelope> {
  const issues: StructuredDeliveryValidationIssue[] = [];
  const message = boundedRequiredString({
    raw: envelope.message,
    path: "message",
    maxChars: MAX_MESSAGE_CHARS,
    code: "envelope_invalid",
    issues,
  });
  const label = boundedRequiredString({
    raw: envelope.button?.label,
    path: "button.label",
    maxChars: MAX_BUTTON_LABEL_CHARS,
    code: "envelope_invalid",
    issues,
  });
  if (envelope.button?.requestLocation !== true) {
    issues.push(
      issue("envelope_invalid", "button.requestLocation", "button.requestLocation must be true"),
    );
  }
  issues.push(...validateStructuredDeliveryRoute(envelope.route));
  if (issues.length > 0 || !message || !label) {
    return {
      ok: false,
      code: "envelope_invalid",
      issues,
    };
  }
  return {
    ok: true,
    value: {
      ...envelope,
      message,
      button: {
        label,
        requestLocation: true,
      },
    },
  };
}

export const locationRequestTesting = {
  DEFAULT_BUTTON_LABEL,
  MAX_BUTTON_LABEL_CHARS,
  MAX_MESSAGE_CHARS,
};
