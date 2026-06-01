import { describe, expect, it } from "vitest";
import { captureStructuredDeliveryFromToolResult } from "./index.js";

const triggerConfig = {
  structuredDelivery: {
    enabled: true,
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
};

describe("structured delivery capture", () => {
  it("stays idle when structured delivery is disabled", () => {
    const captured = captureStructuredDeliveryFromToolResult({
      config: {
        structuredDelivery: { enabled: false, triggers: triggerConfig.structuredDelivery.triggers },
      },
      toolName: "demo__build_app_result",
      toolCallId: "call-1",
      result: {},
      isToolError: false,
    });

    expect(captured).toEqual({ status: "idle" });
  });

  it("captures trusted fields from a matching successful tool result", () => {
    const captured = captureStructuredDeliveryFromToolResult({
      config: triggerConfig,
      toolName: "Demo__Build_App_Result",
      toolCallId: "call-1",
      result: {
        details: {
          structuredContent: {
            action_url: " https://example.test/app/42 ",
            items: [{ id: "item-1", title: "Milk" }],
          },
        },
      },
      isToolError: false,
    });

    expect(captured).toEqual({
      status: "pending",
      pending: {
        contractId: "app_result",
        trigger: {
          toolName: "Demo__Build_App_Result",
          toolCallId: "call-1",
        },
        trusted: {
          url: "https://example.test/app/42",
          items: [{ id: "item-1", title: "Milk" }],
        },
        retry: {
          attempts: 0,
          maxAttempts: 1,
        },
        copy: {
          preset: "with_items",
        },
      },
    });
  });

  it("captures trusted fields from the simplified trigger format", () => {
    const captured = captureStructuredDeliveryFromToolResult({
      config: {
        structuredDelivery: {
          enabled: true,
          triggers: [
            {
              mcpServer: "demo-server",
              mcpTool: "render_widget",
              delivery: "app_result",
              copy: "message_only",
              trusted: {
                url: "details.structuredContent.widget_url",
              },
              requiredTrusted: ["url"],
            },
          ],
        },
      },
      toolName: "mcp",
      toolCallId: "call-simple",
      result: {
        details: {
          mcpServer: "demo-server",
          mcpTool: "render_widget",
          structuredContent: {
            widget_url: "https://example.test/widget",
          },
        },
      },
      isToolError: false,
    });

    expect(captured).toMatchObject({
      status: "pending",
      pending: {
        copy: {
          preset: "message_only",
        },
        trusted: {
          url: "https://example.test/widget",
        },
      },
    });
  });

  it("captures trusted fields from a matching MCP endpoint", () => {
    const captured = captureStructuredDeliveryFromToolResult({
      config: {
        structuredDelivery: {
          enabled: true,
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
      },
      toolName: "mcp",
      toolCallId: "call-mcp",
      result: {
        details: {
          mcpServer: "demo-server",
          mcpTool: "build_app_result",
          structuredContent: {
            action_url: "https://example.test/mcp",
          },
        },
      },
      isToolError: false,
    });

    expect(captured).toMatchObject({
      status: "pending",
      pending: {
        trigger: {
          toolName: "mcp",
          toolCallId: "call-mcp",
          mcpServer: "demo-server",
          mcpTool: "build_app_result",
        },
        trusted: {
          url: "https://example.test/mcp",
        },
      },
    });
  });

  it("stays idle for non-trigger tools and tool errors", () => {
    expect(
      captureStructuredDeliveryFromToolResult({
        config: triggerConfig,
        toolName: "read",
        result: {},
        isToolError: false,
      }),
    ).toEqual({ status: "idle" });

    expect(
      captureStructuredDeliveryFromToolResult({
        config: triggerConfig,
        toolName: "demo__build_app_result",
        result: {},
        isToolError: true,
      }),
    ).toEqual({ status: "idle" });
  });

  it("records a fail-closed capture error when required trusted data is absent", () => {
    const captured = captureStructuredDeliveryFromToolResult({
      config: triggerConfig,
      toolName: "demo__build_app_result",
      toolCallId: "call-1",
      result: {
        details: {
          structuredContent: {},
        },
      },
      isToolError: false,
    });

    expect(captured).toMatchObject({
      status: "failed",
      failure: {
        code: "trusted_field_missing",
        trigger: {
          toolName: "demo__build_app_result",
          toolCallId: "call-1",
        },
        issues: [{ path: "url" }],
      },
    });
  });
});
