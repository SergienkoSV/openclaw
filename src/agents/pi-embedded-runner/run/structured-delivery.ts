import {
  consumeStructuredDeliveryAssistantText,
  type StructuredDeliveryAssistantOutcome,
} from "../../../auto-reply/structured-delivery/consume.js";
import {
  deliverStructuredDeliveryWithHook,
  resolveStructuredDeliveryHookConfig,
} from "../../../auto-reply/structured-delivery/hook.js";
import { buildStructuredDeliveryCopyInstruction } from "../../../auto-reply/structured-delivery/reprompt.js";
import type {
  DeliveryEnvelope,
  PendingStructuredDelivery,
  StructuredDeliveryCaptureFailure,
  StructuredDeliveryFailureCode,
  StructuredDeliveryResult,
  StructuredDeliveryValidationIssue,
} from "../../../auto-reply/structured-delivery/types.js";

export type StructuredDeliveryRunnerResult = {
  delivered?: boolean;
  failure?: {
    code: StructuredDeliveryFailureCode;
    issues: StructuredDeliveryValidationIssue[];
  };
};

function buildStructuredDeliveryFailure(
  outcome: Extract<StructuredDeliveryAssistantOutcome, { status: "failed" }>,
): NonNullable<StructuredDeliveryRunnerResult["failure"]> {
  return {
    code: outcome.code,
    issues: outcome.issues,
  };
}

function buildDeliveryHookFailure(
  result: Extract<StructuredDeliveryResult<void>, { ok: false }>,
): NonNullable<StructuredDeliveryRunnerResult["failure"]> {
  return {
    code: result.code,
    issues: result.issues,
  };
}

export async function runStructuredDeliveryValidation(params: {
  pending?: PendingStructuredDelivery;
  captureFailure?: StructuredDeliveryCaptureFailure;
  assistantTexts: string[];
  promptModel: (prompt: string) => Promise<void>;
  deliverHook?: (params: {
    envelope: DeliveryEnvelope;
    pending: PendingStructuredDelivery;
  }) => Promise<StructuredDeliveryResult<void>>;
  log: {
    debug: (message: string) => void;
    warn: (message: string) => void;
  };
  runId: string;
  sessionId: string;
  shouldContinue?: () => boolean;
}): Promise<StructuredDeliveryRunnerResult | undefined> {
  if (params.captureFailure) {
    params.log.warn(
      `structured delivery skipped after capture failure: runId=${params.runId} ` +
        `sessionId=${params.sessionId} tool=${params.captureFailure.trigger.toolName} code=${params.captureFailure.code}`,
    );
    return {
      failure: {
        code: params.captureFailure.code,
        issues: params.captureFailure.issues,
      },
    };
  }

  let pending = params.pending;
  let copyInstructionSent = false;
  const shouldContinue = params.shouldContinue ?? (() => true);
  while (pending && shouldContinue()) {
    if (!copyInstructionSent && pending.retry.attempts === 0) {
      copyInstructionSent = true;
      params.log.debug(
        `structured delivery copy instruction prompt: runId=${params.runId} ` +
          `sessionId=${params.sessionId} tool=${pending.trigger.toolName}`,
      );
      await params.promptModel(buildStructuredDeliveryCopyInstruction(pending));
      continue;
    }

    const outcome = consumeStructuredDeliveryAssistantText({
      pending,
      assistantText: params.assistantTexts.at(-1),
    });
    if (outcome.status === "delivered") {
      const delivery = params.deliverHook
        ? await params.deliverHook({ envelope: outcome.rendered.envelope, pending })
        : await deliverStructuredDeliveryWithHook({
            envelope: outcome.rendered.envelope,
            hook: resolveStructuredDeliveryHookConfig({
              delivery: pending.delivery,
              kind: outcome.rendered.envelope.kind,
            }),
          });
      if (!delivery.ok) {
        params.log.warn(
          `structured delivery hook failed: runId=${params.runId} ` +
            `sessionId=${params.sessionId} code=${delivery.code}`,
        );
        return {
          failure: buildDeliveryHookFailure(delivery),
        };
      }
      return {
        delivered: true,
      };
    }
    if (outcome.status === "failed") {
      params.log.warn(
        `structured delivery validation failed: runId=${params.runId} ` +
          `sessionId=${params.sessionId} code=${outcome.code}`,
      );
      return {
        failure: buildStructuredDeliveryFailure(outcome),
      };
    }

    pending = outcome.pending;
    params.log.warn(
      `structured delivery model copy invalid; reprompting: runId=${params.runId} ` +
        `sessionId=${params.sessionId} attempt=${pending.retry.attempts}/${pending.retry.maxAttempts}`,
    );
    await params.promptModel(outcome.prompt);
  }
  return undefined;
}
