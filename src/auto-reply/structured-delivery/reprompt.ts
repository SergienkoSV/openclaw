import type { PendingStructuredDelivery, StructuredDeliveryValidationIssue } from "./types.js";

export function buildStructuredDeliveryCopyInstruction(pending: PendingStructuredDelivery): string {
  const trustedItems = pending.trusted.items?.length
    ? `\nTrusted item count: ${pending.trusted.items.length}.`
    : "";
  return [
    "Structured delivery is pending.",
    `Return only valid JSON for the ${pending.contractId} copy contract.`,
    "The JSON may include only: title, message, items, primaryActionLabel.",
    "Do not include URL, target, channel, account, thread, transport, shell, or delivery fields.",
    "The harness already owns trusted delivery facts and will ignore model-provided delivery facts.",
    trustedItems,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStructuredDeliveryValidationReprompt(
  issues: readonly StructuredDeliveryValidationIssue[],
): string {
  const lines = issues.map((issue) => `- ${issue.path}: ${issue.message}`);
  return [
    "Return only valid JSON for the app_result copy contract.",
    "Do not include URL, target, channel, account, thread, transport, shell, or delivery fields.",
    "Validation errors:",
    ...lines,
  ].join("\n");
}
