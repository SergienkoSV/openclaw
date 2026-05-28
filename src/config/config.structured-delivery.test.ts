import { describe, expect, it } from "vitest";
import { validateConfigObject } from "./validation.js";

describe("config: structuredDelivery", () => {
  it("accepts structured delivery trigger config", () => {
    const res = validateConfigObject({
      structuredDelivery: {
        enabled: true,
        delivery: {
          hooks: {
            app_result: {
              path: "hooks/structured-delivery/app_result.sh",
              timeoutMs: 10_000,
            },
            location_request: {
              path: "hooks/structured-delivery/location_request.sh",
              timeoutMs: 20_000,
            },
          },
        },
        retry: {
          maxAttempts: 1,
        },
        triggers: [
          {
            tool: "demo__build_app_result",
            contract: "app_result",
            trustedFields: {
              urlPath: "details.structuredContent.action_url",
              itemsPath: "details.structuredContent.items",
            },
            requiredTrustedFields: ["url"],
          },
        ],
      },
    });

    expect(res.ok).toBe(true);
  });

  it("rejects unknown structured delivery contracts", () => {
    const res = validateConfigObject({
      structuredDelivery: {
        enabled: true,
        triggers: [
          {
            tool: "demo__build_app_result",
            contract: "unknown",
          },
        ],
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path.includes("structuredDelivery"))).toBe(true);
    }
  });

  it("rejects shared structured delivery hooks", () => {
    const res = validateConfigObject({
      structuredDelivery: {
        enabled: true,
        delivery: {
          hook: {
            path: "hooks/structured-delivery/app_result.sh",
          },
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path.includes("structuredDelivery"))).toBe(true);
    }
  });

  it("accepts MCP endpoint selectors without a tool selector", () => {
    const res = validateConfigObject({
      structuredDelivery: {
        enabled: true,
        delivery: {
          hooks: {
            app_result: {
              path: "hooks/structured-delivery/app_result.sh",
            },
            location_request: {
              path: "hooks/structured-delivery/location_request.sh",
            },
          },
        },
        triggers: [
          {
            mcpServer: "demo-server",
            mcpTool: "build_app_result",
            contract: "app_result",
            trustedFields: {
              urlPath: "details.structuredContent.action_url",
            },
          },
        ],
      },
    });

    expect(res.ok).toBe(true);
  });

  it("rejects enabled structured delivery without app result hook path", () => {
    const res = validateConfigObject({
      structuredDelivery: {
        enabled: true,
        delivery: {
          hooks: {
            location_request: {
              path: "hooks/structured-delivery/location_request.sh",
            },
          },
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(
        res.issues.some((issue) =>
          issue.path.includes("structuredDelivery.delivery.hooks.app_result.path"),
        ),
      ).toBe(true);
    }
  });

  it("rejects enabled structured delivery without location request hook path", () => {
    const res = validateConfigObject({
      structuredDelivery: {
        enabled: true,
        delivery: {
          hooks: {
            app_result: {
              path: "hooks/structured-delivery/app_result.sh",
            },
          },
        },
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(
        res.issues.some((issue) =>
          issue.path.includes("structuredDelivery.delivery.hooks.location_request.path"),
        ),
      ).toBe(true);
    }
  });

  it("requires at least one trigger selector", () => {
    const res = validateConfigObject({
      structuredDelivery: {
        enabled: true,
        delivery: {
          hooks: {
            app_result: {
              path: "hooks/structured-delivery/app_result.sh",
            },
            location_request: {
              path: "hooks/structured-delivery/location_request.sh",
            },
          },
        },
        triggers: [
          {
            contract: "app_result",
          },
        ],
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((issue) => issue.path.includes("structuredDelivery"))).toBe(true);
    }
  });
});
