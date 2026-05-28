import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../../shared/string-coerce.js";
import {
  extractStructuredDeliveryTrustedFields,
  validateRequiredTrustedFields,
} from "./extract.js";
import type {
  PendingStructuredDelivery,
  StructuredDeliveryCaptureFailure,
  StructuredDeliveryDeliveryConfig,
  StructuredDeliveryHookConfig,
  StructuredDeliveryTriggerConfig,
  StructuredDeliveryTrustedFieldPaths,
  StructuredDeliveryTrustedFields,
} from "./types.js";

export type StructuredDeliveryCaptureConfig = {
  enabled?: boolean;
  retry?: {
    maxAttempts?: unknown;
  };
  delivery?: unknown;
  triggers?: unknown[];
};

export type StructuredDeliveryCaptureResult =
  | {
      status: "idle";
    }
  | {
      status: "pending";
      pending: PendingStructuredDelivery;
    }
  | {
      status: "failed";
      failure: StructuredDeliveryCaptureFailure;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readCaptureConfig(config: unknown): StructuredDeliveryCaptureConfig | undefined {
  if (!isRecord(config)) {
    return undefined;
  }
  const raw = config.structuredDelivery;
  return isRecord(raw) ? (raw as StructuredDeliveryCaptureConfig) : undefined;
}

function normalizeToolName(value: unknown): string | undefined {
  return normalizeOptionalLowercaseString(value);
}

function normalizeMcpSelector(value: unknown): string | undefined {
  return normalizeOptionalString(value);
}

function normalizeContract(value: unknown): "app_result" | undefined {
  return normalizeOptionalString(value) === "app_result" ? "app_result" : undefined;
}

function normalizePaths(value: unknown): StructuredDeliveryTrustedFieldPaths | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const fields: StructuredDeliveryTrustedFieldPaths = {};
  for (const key of [
    "urlPath",
    "targetPath",
    "surfacePath",
    "accountIdPath",
    "threadIdPath",
    "itemsPath",
    "metadataPath",
  ] as const) {
    const normalized = normalizeOptionalString(value[key]);
    if (normalized) {
      fields[key] = normalized;
    }
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

const TRUSTED_FIELD_KEYS = new Set<keyof StructuredDeliveryTrustedFields>([
  "url",
  "target",
  "surface",
  "accountId",
  "threadId",
  "items",
  "metadata",
]);

function normalizeRequiredFields(
  value: unknown,
): Array<keyof StructuredDeliveryTrustedFields> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const required: Array<keyof StructuredDeliveryTrustedFields> = [];
  for (const entry of value) {
    const field = normalizeOptionalString(entry);
    if (field && TRUSTED_FIELD_KEYS.has(field as keyof StructuredDeliveryTrustedFields)) {
      required.push(field as keyof StructuredDeliveryTrustedFields);
    }
  }
  return required.length > 0 ? required : undefined;
}

function normalizeMaxAttempts(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 2;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeHookConfig(value: unknown): StructuredDeliveryHookConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const hookPath = normalizeOptionalString(value.path);
  if (!hookPath) {
    return undefined;
  }
  const hook: StructuredDeliveryHookConfig = { path: hookPath };
  if (typeof value.timeoutMs === "number" && Number.isFinite(value.timeoutMs)) {
    hook.timeoutMs = Math.max(1, Math.trunc(value.timeoutMs));
  }
  return hook;
}

function normalizeDeliveryConfig(value: unknown): StructuredDeliveryDeliveryConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const hooks: StructuredDeliveryDeliveryConfig["hooks"] = {};
  if (isRecord(value.hooks)) {
    for (const kind of ["app_result", "location_request"] as const) {
      const normalized = normalizeHookConfig(value.hooks[kind]);
      if (normalized) {
        hooks[kind] = normalized;
      }
    }
  }
  const hasHooks = Object.keys(hooks).length > 0;
  if (!hasHooks) {
    return undefined;
  }
  return {
    hooks,
  };
}

function normalizeTrigger(value: unknown): StructuredDeliveryTriggerConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const tool = normalizeToolName(value.tool);
  const mcpServer = normalizeMcpSelector(value.mcpServer);
  const mcpTool = normalizeMcpSelector(value.mcpTool);
  const contract = normalizeContract(value.contract);
  if (!contract || (!tool && !mcpServer && !mcpTool)) {
    return undefined;
  }
  return {
    ...(tool ? { tool } : {}),
    ...(mcpServer ? { mcpServer } : {}),
    ...(mcpTool ? { mcpTool } : {}),
    contract,
    ...(normalizePaths(value.trustedFields)
      ? { trustedFields: normalizePaths(value.trustedFields) }
      : {}),
    ...(normalizeRequiredFields(value.requiredTrustedFields)
      ? { requiredTrustedFields: normalizeRequiredFields(value.requiredTrustedFields) }
      : {}),
  };
}

function readMcpDetails(result: unknown): { mcpServer?: string; mcpTool?: string } {
  if (!isRecord(result) || !isRecord(result.details)) {
    return {};
  }
  const mcpServer = normalizeMcpSelector(result.details.mcpServer);
  const mcpTool = normalizeMcpSelector(result.details.mcpTool);
  return {
    ...(mcpServer ? { mcpServer } : {}),
    ...(mcpTool ? { mcpTool } : {}),
  };
}

function findTrigger(
  config: StructuredDeliveryCaptureConfig | undefined,
  toolName: string,
  result: unknown,
): StructuredDeliveryTriggerConfig | undefined {
  if (!config || config.enabled !== true || !Array.isArray(config.triggers)) {
    return undefined;
  }
  const normalizedToolName = normalizeToolName(toolName);
  const mcpDetails = readMcpDetails(result);
  for (const entry of config.triggers) {
    const trigger = normalizeTrigger(entry);
    if (!trigger || trigger.contract !== "app_result") {
      continue;
    }
    if (trigger.tool && trigger.tool !== normalizedToolName) {
      continue;
    }
    if (trigger.mcpServer && trigger.mcpServer !== mcpDetails.mcpServer) {
      continue;
    }
    if (trigger.mcpTool && trigger.mcpTool !== mcpDetails.mcpTool) {
      continue;
    }
    if (trigger.tool || trigger.mcpServer || trigger.mcpTool) {
      return trigger;
    }
  }
  return undefined;
}

const DEFAULT_REQUIRED_TRUSTED_FIELDS: Array<keyof StructuredDeliveryTrustedFields> = ["url"];

export function captureStructuredDeliveryFromToolResult(params: {
  config: unknown;
  toolName: string;
  toolCallId?: string;
  result: unknown;
  isToolError: boolean;
}): StructuredDeliveryCaptureResult {
  if (params.isToolError) {
    return { status: "idle" };
  }
  const config = readCaptureConfig(params.config);
  const trigger = findTrigger(config, params.toolName, params.result);
  if (!trigger) {
    return { status: "idle" };
  }
  const mcpDetails = readMcpDetails(params.result);
  const triggerMetadata = {
    toolName: params.toolName,
    ...(params.toolCallId ? { toolCallId: params.toolCallId } : {}),
    ...(mcpDetails.mcpServer ? { mcpServer: mcpDetails.mcpServer } : {}),
    ...(mcpDetails.mcpTool ? { mcpTool: mcpDetails.mcpTool } : {}),
  };

  const extracted = extractStructuredDeliveryTrustedFields({
    source: params.result,
    paths: trigger.trustedFields,
  });
  if (!extracted.ok) {
    return {
      status: "failed",
      failure: {
        trigger: triggerMetadata,
        code: extracted.code,
        issues: extracted.issues,
      },
    };
  }

  const required = validateRequiredTrustedFields({
    trusted: extracted.value,
    required: trigger.requiredTrustedFields ?? DEFAULT_REQUIRED_TRUSTED_FIELDS,
  });
  if (!required.ok) {
    return {
      status: "failed",
      failure: {
        trigger: triggerMetadata,
        code: required.code,
        issues: required.issues,
      },
    };
  }
  const delivery = normalizeDeliveryConfig(config?.delivery);

  return {
    status: "pending",
    pending: {
      contractId: "app_result",
      trigger: triggerMetadata,
      trusted: required.value,
      retry: {
        attempts: 0,
        maxAttempts: normalizeMaxAttempts(config?.retry?.maxAttempts),
      },
      ...(delivery ? { delivery } : {}),
    },
  };
}
