import { Type } from "typebox";
import {
  buildLocationRequestEnvelope,
  deliverStructuredDeliveryWithHook,
  resolveStructuredDeliveryHookConfig,
  validateLocationRequestEnvelope,
  type StructuredDeliveryResult,
} from "../../auto-reply/structured-delivery/index.js";
import type { LocationRequestEnvelope } from "../../auto-reply/structured-delivery/types.js";
import type { StructuredDeliveryRoute } from "../../auto-reply/structured-delivery/types.js";
import type { OpenClawConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, ToolInputError } from "./common.js";

export type RequestUserLocationDeliveredEffect = {
  kind: "location_request";
  suppressFinalReply: true;
};

type DeliverLocationRequestHook = (params: {
  envelope: LocationRequestEnvelope;
  hook?: Parameters<typeof deliverStructuredDeliveryWithHook>[0]["hook"];
}) => Promise<StructuredDeliveryResult<void>>;

function firstIssueMessage(result: Extract<StructuredDeliveryResult<unknown>, { ok: false }>) {
  return result.issues[0]?.message ?? result.code;
}

export function createRequestUserLocationTool(options?: {
  config?: OpenClawConfig;
  deliveryRoute?: StructuredDeliveryRoute;
  deliverHook?: DeliverLocationRequestHook;
  onDelivered?: (effect: RequestUserLocationDeliveredEffect) => void;
}): AnyAgentTool {
  return {
    label: "Request User Location",
    name: "request_user_location",
    displaySummary: "Ask the current user to share their location.",
    description:
      "Send a validated location-request button to the current conversation. " +
      "Use this when the task requires the user's location. Provide only message and buttonLabel; " +
      "do not include chat ids, reply_markup, request_location, tokens, shell commands, URLs, or transport details.",
    parameters: Type.Object({
      message: Type.String({
        description: "User-facing text shown above the location request button.",
      }),
      buttonLabel: Type.Optional(
        Type.String({
          description: "Button text. Defaults to a concise location sharing label.",
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const envelope = buildLocationRequestEnvelope(args);
      if (!envelope.ok) {
        throw new ToolInputError(`Invalid location request: ${firstIssueMessage(envelope)}`);
      }

      const routedEnvelope: LocationRequestEnvelope = options?.deliveryRoute
        ? { ...envelope.value, route: options.deliveryRoute }
        : envelope.value;
      const validatedEnvelope = validateLocationRequestEnvelope(routedEnvelope);
      if (!validatedEnvelope.ok) {
        throw new ToolInputError(
          `Location request delivery failed: ${firstIssueMessage(validatedEnvelope)}`,
        );
      }
      const deliver = options?.deliverHook ?? deliverStructuredDeliveryWithHook;
      const delivered = await deliver({
        envelope: validatedEnvelope.value,
        hook: resolveStructuredDeliveryHookConfig({
          delivery: options?.config?.structuredDelivery?.delivery,
          kind: "location_request",
        }),
      });
      if (!delivered.ok) {
        throw new ToolInputError(
          `Location request delivery failed: ${firstIssueMessage(delivered)}`,
        );
      }

      options?.onDelivered?.({
        kind: "location_request",
        suppressFinalReply: true,
      });

      return jsonResult({
        ok: true,
        status: "sent",
        message: "Location request button was sent. Wait for the user's location message.",
      });
    },
  };
}
