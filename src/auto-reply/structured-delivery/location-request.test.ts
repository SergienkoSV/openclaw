import { describe, expect, it } from "vitest";
import { buildLocationRequestEnvelope } from "./location-request.js";

describe("location request structured delivery", () => {
  it("builds a location_request envelope from valid tool args", () => {
    const result = buildLocationRequestEnvelope({
      message: " Please share your location to continue. ",
      buttonLabel: " Share location ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        kind: "location_request",
        message: "Please share your location to continue.",
        button: {
          label: "Share location",
          requestLocation: true,
        },
      },
    });
  });

  it("uses a default button label", () => {
    const result = buildLocationRequestEnvelope({
      message: "Share your location.",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        button: {
          label: "Share location",
        },
      },
    });
  });

  it("rejects invalid required copy", () => {
    const result = buildLocationRequestEnvelope({
      message: " ",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "model_copy_invalid",
      issues: [{ path: "message" }],
    });
  });

  it("does not leak model-authored delivery fields into the envelope", () => {
    const result = buildLocationRequestEnvelope({
      message: "Share your location.",
      buttonLabel: "Share",
      chat_id: "attacker-chat",
      reply_markup: { keyboard: [[{ request_location: false }]] },
      request_location: false,
      token: "secret",
      shell: "curl https://attacker.example",
      transport: "telegram",
      url: "https://attacker.example",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const envelope = result.value as Record<string, unknown>;
    expect(envelope).not.toHaveProperty("chat_id");
    expect(envelope).not.toHaveProperty("reply_markup");
    expect(envelope).not.toHaveProperty("request_location");
    expect(envelope).not.toHaveProperty("token");
    expect(envelope).not.toHaveProperty("shell");
    expect(envelope).not.toHaveProperty("transport");
    expect(envelope).not.toHaveProperty("url");
    expect(envelope.button).toEqual({
      label: "Share",
      requestLocation: true,
    });
  });
});
