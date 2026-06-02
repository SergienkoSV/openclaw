import { normalizeOptionalString } from "../../shared/string-coerce.js";
import { validateDeliveryEnvelope } from "./schema.js";
import type {
  AppResultDeliveryEnvelope,
  DeliveryEnvelopeItem,
  ModelDeliveryCopy,
  PendingStructuredDelivery,
  StructuredDeliveryResult,
} from "./types.js";

const DEFAULT_PRIMARY_ACTION_LABEL = "Open";

function trustedItemsToEnvelopeItems(
  items: PendingStructuredDelivery["trusted"]["items"],
): DeliveryEnvelopeItem[] | undefined {
  const normalized = (items ?? [])
    .map((item) => {
      const title = normalizeOptionalString(item.title);
      const subtitle = normalizeOptionalString(item.subtitle);
      if (!title) {
        return null;
      }
      const normalizedItem: DeliveryEnvelopeItem = { title };
      if (subtitle) {
        normalizedItem.subtitle = subtitle;
      }
      return normalizedItem;
    })
    .filter((item): item is DeliveryEnvelopeItem => item !== null);
  return normalized.length > 0 ? normalized : undefined;
}

export function composeStructuredDeliveryEnvelope(params: {
  pending: PendingStructuredDelivery;
  copy: ModelDeliveryCopy;
  defaultPrimaryActionLabel?: string;
}): StructuredDeliveryResult<AppResultDeliveryEnvelope> {
  const primaryActionLabel =
    normalizeOptionalString(params.copy.primaryActionLabel) ??
    normalizeOptionalString(params.defaultPrimaryActionLabel) ??
    DEFAULT_PRIMARY_ACTION_LABEL;
  const envelope: AppResultDeliveryEnvelope = {
    kind: params.pending.contractId,
    ...(params.copy.title ? { title: params.copy.title } : {}),
    message: params.copy.message,
    items: params.copy.items ?? trustedItemsToEnvelopeItems(params.pending.trusted.items),
    primaryAction: {
      label: primaryActionLabel,
      url: params.pending.trusted.url ?? "",
    },
    route: {
      ...(params.pending.trusted.surface ? { surface: params.pending.trusted.surface } : {}),
      ...(params.pending.trusted.target ? { target: params.pending.trusted.target } : {}),
      ...(params.pending.trusted.accountId ? { accountId: params.pending.trusted.accountId } : {}),
      ...(params.pending.trusted.threadId != null
        ? { threadId: params.pending.trusted.threadId }
        : {}),
      ...(params.pending.trusted.delivery ? { delivery: params.pending.trusted.delivery } : {}),
    },
  };
  return validateDeliveryEnvelope(envelope);
}
