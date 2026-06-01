import { composeStructuredDeliveryEnvelope } from "./compose.js";
import { renderStructuredDeliveryReplyPayload } from "./deliver.js";
import { buildStructuredDeliveryValidationReprompt } from "./reprompt.js";
import { parseModelDeliveryCopyJson } from "./schema.js";
import type {
  PendingStructuredDelivery,
  StructuredDeliveryFailureCode,
  StructuredDeliveryRenderResult,
  StructuredDeliveryValidationIssue,
} from "./types.js";

export type StructuredDeliveryAssistantOutcome =
  | {
      status: "delivered";
      rendered: StructuredDeliveryRenderResult;
    }
  | {
      status: "reprompt";
      prompt: string;
      pending: PendingStructuredDelivery;
      issues: StructuredDeliveryValidationIssue[];
    }
  | {
      status: "failed";
      code: StructuredDeliveryFailureCode;
      issues: StructuredDeliveryValidationIssue[];
    };

function incrementAttempts(pending: PendingStructuredDelivery): PendingStructuredDelivery {
  return {
    ...pending,
    retry: {
      ...pending.retry,
      attempts: pending.retry.attempts + 1,
    },
  };
}

function retryExhaustedIssue(
  issues: StructuredDeliveryValidationIssue[],
): StructuredDeliveryValidationIssue[] {
  return issues.length > 0
    ? issues.map((issue) => ({ ...issue, code: "retry_exhausted" }))
    : [
        {
          code: "retry_exhausted",
          path: "$",
          message: "structured delivery validation retries were exhausted",
        },
      ];
}

export function consumeStructuredDeliveryAssistantText(params: {
  pending: PendingStructuredDelivery;
  assistantText: string | undefined;
}): StructuredDeliveryAssistantOutcome {
  const parsed = parseModelDeliveryCopyJson(params.assistantText ?? "", {
    preset: params.pending.copy?.preset,
  });
  if (!parsed.ok) {
    if (params.pending.retry.attempts >= params.pending.retry.maxAttempts) {
      return {
        status: "failed",
        code: "retry_exhausted",
        issues: retryExhaustedIssue(parsed.issues),
      };
    }
    return {
      status: "reprompt",
      prompt: buildStructuredDeliveryValidationReprompt(parsed.issues, params.pending.copy?.preset),
      pending: incrementAttempts(params.pending),
      issues: parsed.issues,
    };
  }

  const envelope = composeStructuredDeliveryEnvelope({
    pending: params.pending,
    copy: parsed.value,
  });
  if (!envelope.ok) {
    return {
      status: "failed",
      code: envelope.code,
      issues: envelope.issues,
    };
  }

  return {
    status: "delivered",
    rendered: renderStructuredDeliveryReplyPayload(envelope.value),
  };
}
