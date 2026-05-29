import { describe, expect, it, vi } from "vitest";
import type {
  PendingStructuredDelivery,
  StructuredDeliveryCaptureFailure,
} from "../../../auto-reply/structured-delivery/types.js";
import { runStructuredDeliveryValidation } from "./structured-delivery.js";

function makePending(overrides?: Partial<PendingStructuredDelivery>): PendingStructuredDelivery {
  return {
    contractId: "app_result",
    trigger: {
      toolName: "mcp",
      toolCallId: "tool-structured",
      mcpServer: "demo-server",
      mcpTool: "build_app_result",
    },
    trusted: {
      url: "https://example.test/app",
      target: "trusted-user",
      surface: "telegram",
    },
    retry: {
      attempts: 0,
      maxAttempts: 1,
    },
    ...overrides,
  };
}

function makeCaptureFailure(
  overrides?: Partial<StructuredDeliveryCaptureFailure>,
): StructuredDeliveryCaptureFailure {
  return {
    trigger: {
      toolName: "mcp",
      toolCallId: "tool-structured",
      mcpServer: "demo-server",
      mcpTool: "build_app_result",
    },
    code: "trusted_field_missing",
    issues: [
      {
        code: "trusted_field_missing",
        path: "url",
        message: "url is required",
      },
    ],
    ...overrides,
  };
}

describe("runStructuredDeliveryValidation", () => {
  it("asks for copy JSON before validation and invokes the delivery hook", async () => {
    const assistantTexts = ["I prepared it."];
    const promptCalls: string[] = [];
    const deliverHook = vi.fn().mockResolvedValue({ ok: true, value: undefined });

    const result = await runStructuredDeliveryValidation({
      pending: makePending(),
      assistantTexts,
      promptModel: async (prompt) => {
        promptCalls.push(prompt);
        assistantTexts.push(
          prompt.includes("Structured delivery is pending")
            ? JSON.stringify({ title: "Missing message" })
            : JSON.stringify({
                message: "Open the prepared result.",
                primaryActionLabel: "Open",
              }),
        );
      },
      deliverHook,
      log: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
      runId: "run-structured",
      sessionId: "session-structured",
    });

    expect(promptCalls[0]).toContain("Structured delivery is pending");
    expect(promptCalls[0]).toContain("Do not include URL");
    expect(promptCalls[1]).toContain("Validation errors:");
    expect(deliverHook).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          message: "Open the prepared result.",
          primaryAction: {
            label: "Open",
            url: "https://example.test/app",
          },
        }),
      }),
    );
    expect(result).toEqual({
      delivered: true,
    });
  });

  it("validates the response from the structured delivery prompt instead of stale assistant text", async () => {
    const assistantTexts = ["Вот ближайшие места обычным текстом."];
    const deliverHook = vi.fn().mockResolvedValue({ ok: true, value: undefined });

    const result = await runStructuredDeliveryValidation({
      pending: makePending(),
      assistantTexts,
      promptModel: async () =>
        JSON.stringify({
          message: "Open the prepared result.",
          items: [{ title: "Place", subtitle: "100 m" }],
          primaryActionLabel: "Open",
        }),
      deliverHook,
      log: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
      runId: "run-structured",
      sessionId: "session-structured",
    });

    expect(result).toEqual({ delivered: true });
    expect(deliverHook).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the delivery hook rejects the validated envelope", async () => {
    const result = await runStructuredDeliveryValidation({
      pending: makePending({ retry: { attempts: 1, maxAttempts: 1 } }),
      assistantTexts: [JSON.stringify({ message: "Open it." })],
      promptModel: vi.fn(),
      deliverHook: vi.fn().mockResolvedValue({
        ok: false,
        code: "delivery_failed",
        issues: [
          {
            code: "delivery_failed",
            path: "delivery.hooks.app_result.path",
            message: "hook failed",
          },
        ],
      }),
      log: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
      runId: "run-structured",
      sessionId: "session-structured",
    });

    expect(result).toMatchObject({
      failure: {
        code: "delivery_failed",
        issues: [{ path: "delivery.hooks.app_result.path" }],
      },
    });
  });

  it("does not call the delivery hook when model JSON remains invalid", async () => {
    const assistantTexts = ["not json"];
    const promptCalls: string[] = [];
    const deliverHook = vi.fn();

    const result = await runStructuredDeliveryValidation({
      pending: makePending(),
      assistantTexts,
      promptModel: async (prompt) => {
        promptCalls.push(prompt);
        assistantTexts.push("{still not json");
      },
      deliverHook,
      log: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
      runId: "run-structured",
      sessionId: "session-structured",
    });

    expect(promptCalls).toHaveLength(2);
    expect(deliverHook).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failure: {
        code: "retry_exhausted",
      },
    });
  });

  it("does not reprompt or call delivery when trusted capture already failed", async () => {
    const promptModel = vi.fn();
    const deliverHook = vi.fn();

    const result = await runStructuredDeliveryValidation({
      captureFailure: makeCaptureFailure(),
      assistantTexts: [JSON.stringify({ message: "Open it.", url: "https://attacker.test" })],
      promptModel,
      deliverHook,
      log: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
      runId: "run-structured",
      sessionId: "session-structured",
    });

    expect(promptModel).not.toHaveBeenCalled();
    expect(deliverHook).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failure: {
        code: "trusted_field_missing",
        issues: [{ path: "url" }],
      },
    });
  });

  it("does not leak model-authored delivery fields into the hook envelope", async () => {
    const deliverHook = vi.fn().mockResolvedValue({ ok: true, value: undefined });

    const result = await runStructuredDeliveryValidation({
      pending: makePending({
        trusted: {
          url: "https://trusted.example/app",
          target: "trusted-chat",
          surface: "telegram",
        },
        retry: {
          attempts: 1,
          maxAttempts: 1,
        },
      }),
      assistantTexts: [
        JSON.stringify({
          title: "Ready",
          message: "Open the trusted result.",
          primaryActionLabel: "Open trusted",
          url: "https://attacker.example/app",
          target: "attacker-chat",
          chat_id: "attacker-chat",
          reply_markup: { inline_keyboard: [] },
          command: "curl https://attacker.example",
          shell: "curl https://attacker.example",
          transport: "telegram",
        }),
      ],
      promptModel: vi.fn(),
      deliverHook,
      log: {
        debug: vi.fn(),
        warn: vi.fn(),
      },
      runId: "run-structured",
      sessionId: "session-structured",
    });

    expect(result).toEqual({ delivered: true });
    expect(deliverHook).toHaveBeenCalledTimes(1);
    const envelope = deliverHook.mock.calls[0]?.[0]?.envelope as Record<string, unknown>;
    expect(envelope).not.toHaveProperty("url");
    expect(envelope).not.toHaveProperty("target");
    expect(envelope).not.toHaveProperty("chat_id");
    expect(envelope).not.toHaveProperty("reply_markup");
    expect(envelope).not.toHaveProperty("command");
    expect(envelope).not.toHaveProperty("shell");
    expect(envelope).not.toHaveProperty("transport");
    expect(envelope.primaryAction).toEqual({
      label: "Open trusted",
      url: "https://trusted.example/app",
    });
    expect(envelope.route).toEqual({
      surface: "telegram",
      target: "trusted-chat",
    });
  });
});
