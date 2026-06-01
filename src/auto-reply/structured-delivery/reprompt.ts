import type {
  PendingStructuredDelivery,
  StructuredDeliveryCopyPreset,
  StructuredDeliveryValidationIssue,
} from "./types.js";

function renderCopyShape(preset: StructuredDeliveryCopyPreset | undefined): string {
  if (preset === "message_only") {
    return [
      "Expected JSON shape:",
      "{",
      '  "title": "optional short heading",',
      '  "message": "required user-facing message",',
      '  "primaryActionLabel": "optional button label"',
      "}",
      "Do not include items for this tool.",
    ].join("\n");
  }
  return [
    "Expected JSON shape:",
    "{",
    '  "title": "optional short heading",',
    '  "message": "required user-facing message",',
    '  "items": [',
    "    {",
    '      "title": "required item title",',
    '      "subtitle": "optional item details"',
    "    }",
    "  ],",
    '  "primaryActionLabel": "optional button label"',
    "}",
    "If items is present, it must be an array of objects with title and optional subtitle.",
  ].join("\n");
}

export function buildStructuredDeliveryCopyInstruction(pending: PendingStructuredDelivery): string {
  const trustedItems = pending.trusted.items?.length
    ? `\nTrusted item count: ${pending.trusted.items.length}.`
    : "";
  return [
    "Structured delivery is pending.",
    `Return only valid JSON for the ${pending.contractId} copy contract.`,
    renderCopyShape(pending.copy?.preset),
    "Do not include URL, target, channel, account, thread, transport, shell, or delivery fields.",
    "The harness already owns trusted delivery facts and will ignore model-provided delivery facts.",
    trustedItems,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStructuredDeliveryValidationReprompt(
  issues: readonly StructuredDeliveryValidationIssue[],
  preset?: StructuredDeliveryCopyPreset,
): string {
  const lines = issues.map((issue) => `- ${issue.path}: ${issue.message}`);
  return [
    "Return only valid JSON for the app_result copy contract.",
    renderCopyShape(preset),
    "Do not include URL, target, channel, account, thread, transport, shell, or delivery fields.",
    "Validation errors:",
    ...lines,
  ].join("\n");
}
