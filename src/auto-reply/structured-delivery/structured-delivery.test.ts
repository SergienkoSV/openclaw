import { describe, expect, it } from "vitest";
import {
  buildStructuredDeliveryValidationReprompt,
  buildStructuredDeliveryCopyInstruction,
  consumeStructuredDeliveryAssistantText,
  composeStructuredDeliveryEnvelope,
  extractStructuredDeliveryTrustedFields,
  parseModelDeliveryCopyJson,
  renderStructuredDeliveryReplyPayload,
  validateRequiredTrustedFields,
  type PendingStructuredDelivery,
} from "./index.js";

function makePending(overrides?: Partial<PendingStructuredDelivery>): PendingStructuredDelivery {
  return {
    contractId: "app_result",
    trigger: {
      toolName: "demo__build_app_result",
      toolCallId: "call-1",
    },
    trusted: {
      url: "https://example.test/action/123",
      target: "user-1",
      surface: "demo",
    },
    retry: {
      attempts: 0,
      maxAttempts: 2,
    },
    ...overrides,
  };
}

describe("structured delivery", () => {
  it("extracts trusted fields by configured paths", () => {
    const extracted = extractStructuredDeliveryTrustedFields({
      source: {
        structuredContent: {
          action_url: " https://example.test/app ",
          items: [{ id: "1", title: "Milk", subtitle: "1 L" }],
        },
      },
      paths: {
        urlPath: "structuredContent.action_url",
        itemsPath: "structuredContent.items",
      },
    });

    expect(extracted).toEqual({
      ok: true,
      value: {
        url: "https://example.test/app",
        items: [{ id: "1", title: "Milk", subtitle: "1 L" }],
      },
    });
  });

  it("requires trusted URL without asking the model to invent it", () => {
    const required = validateRequiredTrustedFields({
      trusted: {},
      required: ["url"],
    });

    expect(required).toMatchObject({
      ok: false,
      code: "trusted_field_missing",
      issues: [{ path: "url" }],
    });
  });

  it("ignores model-provided delivery facts while composing the envelope", () => {
    const parsed = parseModelDeliveryCopyJson(
      JSON.stringify({
        title: "Ready",
        message: "Open the prepared result.",
        primaryActionLabel: "Open result",
        url: "https://attacker.test/ignored",
        target: "attacker",
        channel: "attacker",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const envelope = composeStructuredDeliveryEnvelope({
      pending: makePending(),
      copy: parsed.value,
    });

    expect(envelope).toMatchObject({
      ok: true,
      value: {
        primaryAction: {
          label: "Open result",
          url: "https://example.test/action/123",
        },
        route: {
          target: "user-1",
          surface: "demo",
        },
      },
    });
  });

  it("rejects invalid model JSON with a closed error code", () => {
    const parsed = parseModelDeliveryCopyJson("{not json");

    expect(parsed).toMatchObject({
      ok: false,
      code: "model_json_invalid",
    });
  });

  it("rejects model copy without message", () => {
    const parsed = parseModelDeliveryCopyJson(JSON.stringify({ title: "No message" }));

    expect(parsed).toMatchObject({
      ok: false,
      code: "model_copy_invalid",
      issues: [{ path: "message" }],
    });
  });

  it("fails closed before rendering when trusted URL is missing", () => {
    const parsed = parseModelDeliveryCopyJson(JSON.stringify({ message: "Ready." }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const envelope = composeStructuredDeliveryEnvelope({
      pending: makePending({ trusted: {} }),
      copy: parsed.value,
    });

    expect(envelope).toMatchObject({
      ok: false,
      code: "envelope_invalid",
      issues: [{ path: "primaryAction.url" }],
    });
  });

  it("renders a valid envelope into a generic ReplyPayload", () => {
    const parsed = parseModelDeliveryCopyJson(
      JSON.stringify({
        title: "Cart ready",
        message: "Review the items and continue.",
        items: [{ title: "Eggs", subtitle: "10 pcs" }],
        primaryActionLabel: "Open cart",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const envelope = composeStructuredDeliveryEnvelope({
      pending: makePending(),
      copy: parsed.value,
    });
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) {
      return;
    }

    const rendered = renderStructuredDeliveryReplyPayload(envelope.value);

    expect(rendered.payload.text).toContain("Cart ready");
    expect(rendered.payload.text).toContain("1. Eggs - 10 pcs");
    expect(rendered.payload.interactive?.blocks[0]).toEqual({
      type: "buttons",
      buttons: [
        {
          label: "Open cart",
          value: "open",
          webApp: { url: "https://example.test/action/123" },
        },
      ],
    });
  });

  it("rejects items for message-only copy presets", () => {
    const parsed = parseModelDeliveryCopyJson(
      JSON.stringify({
        message: "Open the prepared result.",
        items: [{ title: "Unexpected" }],
      }),
      { preset: "message_only" },
    );

    expect(parsed).toMatchObject({
      ok: false,
      code: "model_copy_invalid",
      issues: [{ path: "items" }],
    });
  });

  it("prints the active copy preset shape in model prompts", () => {
    const prompt = buildStructuredDeliveryCopyInstruction(
      makePending({ copy: { preset: "message_only" } }),
    );

    expect(prompt).toContain("Expected JSON shape:");
    expect(prompt).toContain('"message": "required user-facing message"');
    expect(prompt).toContain("Do not include items for this tool.");
  });

  it("builds a narrow validation reprompt", () => {
    const parsed = parseModelDeliveryCopyJson(JSON.stringify({ title: "No message" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    const reprompt = buildStructuredDeliveryValidationReprompt(parsed.issues, "with_items");

    expect(reprompt).toContain("Return only valid JSON");
    expect(reprompt).toContain("Expected JSON shape:");
    expect(reprompt).toContain("Do not include URL");
    expect(reprompt).toContain("message");
  });

  it("reprompts invalid model copy before delivering validated payload", () => {
    const invalid = consumeStructuredDeliveryAssistantText({
      pending: makePending({ retry: { attempts: 0, maxAttempts: 1 } }),
      assistantText: JSON.stringify({ title: "Missing message" }),
    });

    expect(invalid).toMatchObject({
      status: "reprompt",
      pending: {
        retry: {
          attempts: 1,
          maxAttempts: 1,
        },
      },
    });

    const delivered = consumeStructuredDeliveryAssistantText({
      pending:
        invalid.status === "reprompt"
          ? invalid.pending
          : makePending({ retry: { attempts: 1, maxAttempts: 1 } }),
      assistantText: JSON.stringify({
        title: "Ready",
        message: "Open the prepared result.",
        primaryActionLabel: "Open",
      }),
    });

    expect(delivered).toMatchObject({
      status: "delivered",
      rendered: {
        payload: {
          interactive: {
            blocks: [
              {
                buttons: [{ webApp: { url: "https://example.test/action/123" } }],
              },
            ],
          },
        },
      },
    });
  });

  it("fails closed when structured delivery validation retries are exhausted", () => {
    const exhausted = consumeStructuredDeliveryAssistantText({
      pending: makePending({ retry: { attempts: 1, maxAttempts: 1 } }),
      assistantText: JSON.stringify({ title: "Still missing message" }),
    });

    expect(exhausted).toMatchObject({
      status: "failed",
      code: "retry_exhausted",
      issues: [{ code: "retry_exhausted" }],
    });
  });
});
