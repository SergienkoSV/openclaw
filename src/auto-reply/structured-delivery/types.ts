import type { ReplyPayload } from "../types.js";

export type StructuredDeliveryContractId = "app_result" | "location_request";

export type StructuredDeliveryFailureCode =
  | "disabled"
  | "trigger_no_match"
  | "trusted_field_missing"
  | "trusted_field_invalid"
  | "model_json_invalid"
  | "model_copy_invalid"
  | "retry_exhausted"
  | "envelope_invalid"
  | "delivery_failed";

export type StructuredDeliveryValidationIssue = {
  code: StructuredDeliveryFailureCode;
  path: string;
  message: string;
};

export type StructuredDeliveryResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      code: StructuredDeliveryFailureCode;
      issues: StructuredDeliveryValidationIssue[];
    };

export type StructuredDeliveryTrustedItem = {
  id?: string;
  title?: string;
  subtitle?: string;
};

export type StructuredDeliveryTrustedFields = {
  url?: string;
  target?: string;
  surface?: string;
  accountId?: string;
  threadId?: string | number;
  items?: StructuredDeliveryTrustedItem[];
  metadata?: Record<string, unknown>;
};

export type PendingStructuredDelivery = {
  contractId: "app_result";
  trigger: {
    toolName: string;
    toolCallId?: string;
    mcpServer?: string;
    mcpTool?: string;
  };
  trusted: StructuredDeliveryTrustedFields;
  retry: {
    attempts: number;
    maxAttempts: number;
  };
  delivery?: StructuredDeliveryDeliveryConfig;
};

export type StructuredDeliveryCaptureFailure = {
  trigger: {
    toolName: string;
    toolCallId?: string;
    mcpServer?: string;
    mcpTool?: string;
  };
  code: StructuredDeliveryFailureCode;
  issues: StructuredDeliveryValidationIssue[];
};

export type ModelDeliveryCopyItem = {
  title: string;
  subtitle?: string;
};

export type ModelDeliveryCopy = {
  title?: string;
  message: string;
  items?: ModelDeliveryCopyItem[];
  primaryActionLabel?: string;
};

export type DeliveryEnvelopeItem = {
  title: string;
  subtitle?: string;
};

export type AppResultDeliveryEnvelope = {
  kind: "app_result";
  title?: string;
  message: string;
  items?: DeliveryEnvelopeItem[];
  primaryAction: {
    label: string;
    url: string;
  };
  route: {
    surface?: string;
    target?: string;
    accountId?: string;
    threadId?: string | number;
  };
};

export type LocationRequestEnvelope = {
  kind: "location_request";
  message: string;
  button: {
    label: string;
    requestLocation: true;
  };
  route?: {
    surface?: string;
    target?: string;
    accountId?: string;
    threadId?: string | number;
  };
};

export type DeliveryEnvelope = AppResultDeliveryEnvelope | LocationRequestEnvelope;

export type StructuredDeliveryTrustedFieldPaths = {
  urlPath?: string;
  targetPath?: string;
  surfacePath?: string;
  accountIdPath?: string;
  threadIdPath?: string;
  itemsPath?: string;
  metadataPath?: string;
};

export type StructuredDeliveryTriggerConfig = {
  tool?: string;
  mcpServer?: string;
  mcpTool?: string;
  contract: "app_result";
  trustedFields?: StructuredDeliveryTrustedFieldPaths;
  requiredTrustedFields?: Array<keyof StructuredDeliveryTrustedFields>;
};

export type StructuredDeliveryHookConfig = {
  path: string;
  timeoutMs?: number;
};

export type StructuredDeliveryDeliveryConfig = {
  hooks?: Partial<Record<StructuredDeliveryContractId, StructuredDeliveryHookConfig>>;
};

export type StructuredDeliveryRenderResult = {
  envelope: AppResultDeliveryEnvelope;
  payload: ReplyPayload;
};
