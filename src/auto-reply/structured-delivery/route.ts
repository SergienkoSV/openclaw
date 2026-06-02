import { normalizeOptionalString } from "../../shared/string-coerce.js";
import type { StructuredDeliveryRoute } from "./types.js";

export function normalizeTelegramChatId(value: unknown): number | string | undefined {
  const raw = normalizeOptionalString(value);
  if (!raw) {
    return undefined;
  }
  const targetMatch = /^telegram(?::(?:direct|group|supergroup|channel))?:(-?\d+)$/i.exec(raw);
  const numeric = targetMatch?.[1] ?? (/^-?\d+$/.test(raw) ? raw : undefined);
  if (numeric != null) {
    const parsed = Number(numeric);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return /^@[A-Za-z0-9_]{5,}$/.test(raw) ? raw : undefined;
}

export function buildStructuredDeliverySurfaceDeliveryFacts(params: {
  surface?: string;
  target?: string;
}): StructuredDeliveryRoute["delivery"] | undefined {
  const surface = normalizeOptionalString(params.surface)?.toLowerCase();
  const target = normalizeOptionalString(params.target);
  if (surface !== "telegram" && !target?.toLowerCase().startsWith("telegram:")) {
    return undefined;
  }
  const chatId = normalizeTelegramChatId(target);
  return chatId == null ? undefined : { telegram: { chatId } };
}
