import type { ReplyPayload } from "../types.js";
import type { AppResultDeliveryEnvelope, StructuredDeliveryRenderResult } from "./types.js";

function formatEnvelopeItems(envelope: AppResultDeliveryEnvelope): string | undefined {
  const items = envelope.items ?? [];
  if (items.length === 0) {
    return undefined;
  }
  return items
    .map((item, index) => {
      const suffix = item.subtitle ? ` - ${item.subtitle}` : "";
      return `${index + 1}. ${item.title}${suffix}`;
    })
    .join("\n");
}

export function renderStructuredDeliveryReplyPayload(
  envelope: AppResultDeliveryEnvelope,
): StructuredDeliveryRenderResult {
  const itemText = formatEnvelopeItems(envelope);
  const text = [envelope.title, envelope.message, itemText].filter(Boolean).join("\n\n");
  const payload: ReplyPayload = {
    text,
    interactive: {
      blocks: [
        {
          type: "buttons",
          buttons: [
            {
              label: envelope.primaryAction.label,
              value: "open",
              webApp: { url: envelope.primaryAction.url },
            },
          ],
        },
      ],
    },
  };
  return { envelope, payload };
}
