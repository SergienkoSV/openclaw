import { normalizeOptionalString } from "../../shared/string-coerce.js";
import type {
  StructuredDeliveryResult,
  StructuredDeliveryTrustedFieldPaths,
  StructuredDeliveryTrustedFields,
  StructuredDeliveryTrustedItem,
  StructuredDeliveryValidationIssue,
} from "./types.js";

function issue(path: string, message: string): StructuredDeliveryValidationIssue {
  return { code: "trusted_field_invalid", path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function readStructuredDeliveryPath(source: unknown, path?: string): unknown {
  const normalized = normalizeOptionalString(path);
  if (!normalized) {
    return undefined;
  }
  let cursor = source;
  for (const segment of normalized.split(".")) {
    const key = segment.trim();
    if (!key) {
      return undefined;
    }
    if (!isRecord(cursor) && !Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function normalizeTrustedItems(raw: unknown): {
  items?: StructuredDeliveryTrustedItem[];
  issues: StructuredDeliveryValidationIssue[];
} {
  if (raw == null) {
    return { issues: [] };
  }
  if (!Array.isArray(raw)) {
    return {
      issues: [issue("items", "trusted items must be an array")],
    };
  }
  const issues: StructuredDeliveryValidationIssue[] = [];
  const items: StructuredDeliveryTrustedItem[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      issues.push(issue(`items.${index}`, "trusted item must be an object"));
      continue;
    }
    const id = normalizeOptionalString(entry.id);
    const title = normalizeOptionalString(entry.title);
    const subtitle = normalizeOptionalString(entry.subtitle);
    if (!id && !title && !subtitle) {
      continue;
    }
    items.push({
      ...(id ? { id } : {}),
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
    });
  }
  return {
    items: items.length > 0 ? items : undefined,
    issues,
  };
}

export function extractStructuredDeliveryTrustedFields(params: {
  source: unknown;
  paths?: StructuredDeliveryTrustedFieldPaths;
}): StructuredDeliveryResult<StructuredDeliveryTrustedFields> {
  const paths = params.paths ?? {};
  const issues: StructuredDeliveryValidationIssue[] = [];
  const url = normalizeOptionalString(readStructuredDeliveryPath(params.source, paths.urlPath));
  const target = normalizeOptionalString(
    readStructuredDeliveryPath(params.source, paths.targetPath),
  );
  const surface = normalizeOptionalString(
    readStructuredDeliveryPath(params.source, paths.surfacePath),
  );
  const accountId = normalizeOptionalString(
    readStructuredDeliveryPath(params.source, paths.accountIdPath),
  );
  const rawThreadId = readStructuredDeliveryPath(params.source, paths.threadIdPath);
  const threadId =
    typeof rawThreadId === "number" && Number.isFinite(rawThreadId)
      ? Math.trunc(rawThreadId)
      : normalizeOptionalString(rawThreadId);
  const normalizedItems = normalizeTrustedItems(
    readStructuredDeliveryPath(params.source, paths.itemsPath),
  );
  issues.push(...normalizedItems.issues);
  const metadata = readStructuredDeliveryPath(params.source, paths.metadataPath);
  if (metadata != null && !isRecord(metadata)) {
    issues.push(issue("metadata", "trusted metadata must be an object"));
  }
  if (issues.length > 0) {
    return {
      ok: false,
      code: "trusted_field_invalid",
      issues,
    };
  }
  return {
    ok: true,
    value: {
      ...(url ? { url } : {}),
      ...(target ? { target } : {}),
      ...(surface ? { surface } : {}),
      ...(accountId ? { accountId } : {}),
      ...(threadId != null ? { threadId } : {}),
      ...(normalizedItems.items ? { items: normalizedItems.items } : {}),
      ...(isRecord(metadata) ? { metadata } : {}),
    },
  };
}

export function validateRequiredTrustedFields(params: {
  trusted: StructuredDeliveryTrustedFields;
  required?: Array<keyof StructuredDeliveryTrustedFields>;
}): StructuredDeliveryResult<StructuredDeliveryTrustedFields> {
  const issues: StructuredDeliveryValidationIssue[] = [];
  for (const field of params.required ?? []) {
    const value = params.trusted[field];
    const missing = Array.isArray(value)
      ? value.length === 0
      : value == null || (typeof value === "string" && value.trim() === "");
    if (missing) {
      issues.push({
        code: "trusted_field_missing",
        path: field,
        message: `${field} is required`,
      });
    }
  }
  if (issues.length > 0) {
    return {
      ok: false,
      code: "trusted_field_missing",
      issues,
    };
  }
  return { ok: true, value: params.trusted };
}
