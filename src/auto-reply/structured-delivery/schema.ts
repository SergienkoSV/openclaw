import { normalizeOptionalString } from "../../shared/string-coerce.js";
import type {
  AppResultDeliveryEnvelope,
  DeliveryEnvelopeItem,
  ModelDeliveryCopy,
  ModelDeliveryCopyItem,
  StructuredDeliveryFailureCode,
  StructuredDeliveryResult,
  StructuredDeliveryValidationIssue,
} from "./types.js";

const DEFAULT_MAX_TITLE_CHARS = 120;
const DEFAULT_MAX_MESSAGE_CHARS = 2000;
const DEFAULT_MAX_ACTION_LABEL_CHARS = 64;
const DEFAULT_MAX_ITEM_TITLE_CHARS = 160;
const DEFAULT_MAX_ITEM_SUBTITLE_CHARS = 240;
const DEFAULT_MAX_ITEMS = 20;

type ValidationLimits = {
  maxTitleChars?: number;
  maxMessageChars?: number;
  maxActionLabelChars?: number;
  maxItemTitleChars?: number;
  maxItemSubtitleChars?: number;
  maxItems?: number;
};

function issue(
  code: StructuredDeliveryFailureCode,
  path: string,
  message: string,
): StructuredDeliveryValidationIssue {
  return { code, path, message };
}

function invalid<T>(
  code: StructuredDeliveryFailureCode,
  issues: StructuredDeliveryValidationIssue[],
): StructuredDeliveryResult<T> {
  return {
    ok: false,
    code,
    issues,
  };
}

function ok<T>(value: T): StructuredDeliveryResult<T> {
  return { ok: true, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedString(params: {
  value: unknown;
  path: string;
  required?: boolean;
  maxChars: number;
  code: StructuredDeliveryFailureCode;
  issues: StructuredDeliveryValidationIssue[];
}): string | undefined {
  const normalized = normalizeOptionalString(params.value);
  if (!normalized) {
    if (params.required) {
      params.issues.push(issue(params.code, params.path, `${params.path} is required`));
    }
    return undefined;
  }
  if (normalized.length > params.maxChars) {
    params.issues.push(
      issue(
        params.code,
        params.path,
        `${params.path} must be at most ${params.maxChars} characters`,
      ),
    );
    return undefined;
  }
  return normalized;
}

function parseJsonObject(raw: string): StructuredDeliveryResult<Record<string, unknown>> {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const jsonText = fenced?.[1]?.trim() ?? trimmed;
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!isRecord(parsed)) {
      return invalid("model_json_invalid", [
        issue("model_json_invalid", "$", "structured delivery response must be a JSON object"),
      ]);
    }
    return ok(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return invalid("model_json_invalid", [
      issue(
        "model_json_invalid",
        "$",
        `structured delivery response is not valid JSON: ${message}`,
      ),
    ]);
  }
}

function normalizeModelItems(
  rawItems: unknown,
  limits: Required<ValidationLimits>,
): {
  items?: ModelDeliveryCopyItem[];
  issues: StructuredDeliveryValidationIssue[];
} {
  const issues: StructuredDeliveryValidationIssue[] = [];
  if (rawItems == null) {
    return { issues };
  }
  if (!Array.isArray(rawItems)) {
    return {
      issues: [issue("model_copy_invalid", "items", "items must be an array")],
    };
  }
  if (rawItems.length > limits.maxItems) {
    issues.push(
      issue("model_copy_invalid", "items", `items must contain at most ${limits.maxItems} entries`),
    );
  }
  const items: ModelDeliveryCopyItem[] = [];
  for (const [index, rawItem] of rawItems.slice(0, limits.maxItems).entries()) {
    if (!isRecord(rawItem)) {
      issues.push(issue("model_copy_invalid", `items.${index}`, "item must be an object"));
      continue;
    }
    const title = boundedString({
      value: rawItem.title,
      path: `items.${index}.title`,
      required: true,
      maxChars: limits.maxItemTitleChars,
      code: "model_copy_invalid",
      issues,
    });
    const subtitle = boundedString({
      value: rawItem.subtitle,
      path: `items.${index}.subtitle`,
      maxChars: limits.maxItemSubtitleChars,
      code: "model_copy_invalid",
      issues,
    });
    if (title) {
      items.push({
        title,
        ...(subtitle ? { subtitle } : {}),
      });
    }
  }
  return {
    items: items.length > 0 ? items : undefined,
    issues,
  };
}

function resolveLimits(limits?: ValidationLimits): Required<ValidationLimits> {
  return {
    maxTitleChars: limits?.maxTitleChars ?? DEFAULT_MAX_TITLE_CHARS,
    maxMessageChars: limits?.maxMessageChars ?? DEFAULT_MAX_MESSAGE_CHARS,
    maxActionLabelChars: limits?.maxActionLabelChars ?? DEFAULT_MAX_ACTION_LABEL_CHARS,
    maxItemTitleChars: limits?.maxItemTitleChars ?? DEFAULT_MAX_ITEM_TITLE_CHARS,
    maxItemSubtitleChars: limits?.maxItemSubtitleChars ?? DEFAULT_MAX_ITEM_SUBTITLE_CHARS,
    maxItems: limits?.maxItems ?? DEFAULT_MAX_ITEMS,
  };
}

export function parseModelDeliveryCopyJson(
  raw: string,
  limits?: ValidationLimits,
): StructuredDeliveryResult<ModelDeliveryCopy> {
  const parsed = parseJsonObject(raw);
  if (!parsed.ok) {
    return parsed;
  }
  return validateModelDeliveryCopy(parsed.value, limits);
}

export function validateModelDeliveryCopy(
  raw: unknown,
  limitsInput?: ValidationLimits,
): StructuredDeliveryResult<ModelDeliveryCopy> {
  const limits = resolveLimits(limitsInput);
  if (!isRecord(raw)) {
    return invalid("model_copy_invalid", [
      issue("model_copy_invalid", "$", "structured delivery copy must be an object"),
    ]);
  }
  const issues: StructuredDeliveryValidationIssue[] = [];
  const title = boundedString({
    value: raw.title,
    path: "title",
    maxChars: limits.maxTitleChars,
    code: "model_copy_invalid",
    issues,
  });
  const message = boundedString({
    value: raw.message,
    path: "message",
    required: true,
    maxChars: limits.maxMessageChars,
    code: "model_copy_invalid",
    issues,
  });
  const primaryActionLabel = boundedString({
    value: raw.primaryActionLabel,
    path: "primaryActionLabel",
    maxChars: limits.maxActionLabelChars,
    code: "model_copy_invalid",
    issues,
  });
  const normalizedItems = normalizeModelItems(raw.items, limits);
  issues.push(...normalizedItems.issues);
  if (issues.length > 0 || !message) {
    return invalid("model_copy_invalid", issues);
  }
  return ok({
    ...(title ? { title } : {}),
    message,
    ...(normalizedItems.items ? { items: normalizedItems.items } : {}),
    ...(primaryActionLabel ? { primaryActionLabel } : {}),
  });
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateEnvelopeItems(items: DeliveryEnvelopeItem[] | undefined) {
  const issues: StructuredDeliveryValidationIssue[] = [];
  if (!items) {
    return issues;
  }
  if (items.length > DEFAULT_MAX_ITEMS) {
    issues.push(
      issue("envelope_invalid", "items", `items must contain at most ${DEFAULT_MAX_ITEMS} entries`),
    );
  }
  for (const [index, item] of items.slice(0, DEFAULT_MAX_ITEMS).entries()) {
    boundedString({
      value: item.title,
      path: `items.${index}.title`,
      required: true,
      maxChars: DEFAULT_MAX_ITEM_TITLE_CHARS,
      code: "envelope_invalid",
      issues,
    });
    boundedString({
      value: item.subtitle,
      path: `items.${index}.subtitle`,
      maxChars: DEFAULT_MAX_ITEM_SUBTITLE_CHARS,
      code: "envelope_invalid",
      issues,
    });
  }
  return issues;
}

export function validateDeliveryEnvelope(
  envelope: AppResultDeliveryEnvelope,
): StructuredDeliveryResult<AppResultDeliveryEnvelope> {
  const issues: StructuredDeliveryValidationIssue[] = [];
  boundedString({
    value: envelope.title,
    path: "title",
    maxChars: DEFAULT_MAX_TITLE_CHARS,
    code: "envelope_invalid",
    issues,
  });
  boundedString({
    value: envelope.message,
    path: "message",
    required: true,
    maxChars: DEFAULT_MAX_MESSAGE_CHARS,
    code: "envelope_invalid",
    issues,
  });
  const label = boundedString({
    value: envelope.primaryAction.label,
    path: "primaryAction.label",
    required: true,
    maxChars: DEFAULT_MAX_ACTION_LABEL_CHARS,
    code: "envelope_invalid",
    issues,
  });
  const url = boundedString({
    value: envelope.primaryAction.url,
    path: "primaryAction.url",
    required: true,
    maxChars: 4096,
    code: "envelope_invalid",
    issues,
  });
  if (url && !isValidHttpUrl(url)) {
    issues.push(
      issue("envelope_invalid", "primaryAction.url", "primaryAction.url must be http(s)"),
    );
  }
  issues.push(...validateEnvelopeItems(envelope.items));
  if (issues.length > 0 || !label || !url) {
    return invalid("envelope_invalid", issues);
  }
  return ok(envelope);
}

export const __testing = {
  DEFAULT_MAX_ITEMS,
  parseJsonObject,
};
