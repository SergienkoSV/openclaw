import { describe, expect, it, vi } from "vitest";
import type { LocationRequestEnvelope } from "../../auto-reply/structured-delivery/types.js";
import { createRequestUserLocationTool } from "./request-user-location-tool.js";

describe("request_user_location tool", () => {
  it("validates args and invokes the location request hook", async () => {
    const deliverHook = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const onDelivered = vi.fn();
    const tool = createRequestUserLocationTool({
      deliverHook,
      onDelivered,
      config: {
        structuredDelivery: {
          delivery: {
            hooks: {
              location_request: {
                path: "hooks/structured-delivery/location_request.sh",
                timeoutMs: 10_000,
              },
            },
          },
        },
      },
    });

    const result = await tool.execute("call-location", {
      message: " Share your location. ",
      buttonLabel: " Share ",
    });

    expect(deliverHook).toHaveBeenCalledWith({
      envelope: {
        kind: "location_request",
        message: "Share your location.",
        button: {
          label: "Share",
          requestLocation: true,
        },
      },
      hook: {
        path: "hooks/structured-delivery/location_request.sh",
        timeoutMs: 10_000,
      },
    });
    expect(onDelivered).toHaveBeenCalledWith({
      kind: "location_request",
      suppressFinalReply: true,
    });
    expect(result.details).toEqual({
      ok: true,
      status: "sent",
      message: "Location request button was sent. Wait for the user's location message.",
    });
  });

  it("does not call the hook for invalid args", async () => {
    const deliverHook = vi.fn();
    const tool = createRequestUserLocationTool({ deliverHook });

    await expect(tool.execute("call-location", { message: "" })).rejects.toThrow(
      /Invalid location request/,
    );

    expect(deliverHook).not.toHaveBeenCalled();
  });

  it("does not leak delivery-control fields into the hook envelope", async () => {
    const deliverHook = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const tool = createRequestUserLocationTool({ deliverHook });

    await tool.execute("call-location", {
      message: "Share your location.",
      buttonLabel: "Share",
      chat_id: "attacker-chat",
      reply_markup: { keyboard: [] },
      token: "secret",
      shell: "curl https://attacker.example",
      transport: "telegram",
    });

    const envelope = deliverHook.mock.calls[0]?.[0]?.envelope as
      | (LocationRequestEnvelope & Record<string, unknown>)
      | undefined;
    expect(envelope).toBeDefined();
    expect(envelope).not.toHaveProperty("chat_id");
    expect(envelope).not.toHaveProperty("reply_markup");
    expect(envelope).not.toHaveProperty("token");
    expect(envelope).not.toHaveProperty("shell");
    expect(envelope).not.toHaveProperty("transport");
    expect(envelope?.button).toEqual({
      label: "Share",
      requestLocation: true,
    });
  });

  it("fails closed when the hook rejects the envelope", async () => {
    const deliverHook = vi.fn().mockResolvedValue({
      ok: false,
      code: "delivery_failed",
      issues: [
        {
          code: "delivery_failed",
          path: "delivery.hooks.location_request.path",
          message: "hook failed",
        },
      ],
    });
    const onDelivered = vi.fn();
    const tool = createRequestUserLocationTool({ deliverHook, onDelivered });

    await expect(
      tool.execute("call-location", { message: "Share your location." }),
    ).rejects.toThrow(/Location request delivery failed/);

    expect(onDelivered).not.toHaveBeenCalled();
  });
});
