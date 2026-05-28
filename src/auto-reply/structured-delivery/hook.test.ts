import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deliverStructuredDeliveryWithHook,
  resolveStructuredDeliveryHookConfig,
  resolveStructuredDeliveryHookPath,
} from "./hook.js";
import type {
  AppResultDeliveryEnvelope,
  LocationRequestEnvelope,
  StructuredDeliveryDeliveryConfig,
} from "./types.js";

const fixtureHookPath = fileURLToPath(new URL("./fixtures/app-result-hook.sh", import.meta.url));
const locationFixtureHookPath = fileURLToPath(
  new URL("./fixtures/location-request-hook.sh", import.meta.url),
);

function makeEnvelope(overrides?: Partial<AppResultDeliveryEnvelope>): AppResultDeliveryEnvelope {
  return {
    kind: "app_result",
    title: "Ready",
    message: "Open the prepared result.",
    items: [{ title: "Place", subtitle: "100 m" }],
    primaryAction: {
      label: "Open",
      url: "https://example.test/action/123",
    },
    route: {
      surface: "telegram",
      target: "user-1",
    },
    ...overrides,
  };
}

function makeLocationEnvelope(
  overrides?: Partial<LocationRequestEnvelope>,
): LocationRequestEnvelope {
  return {
    kind: "location_request",
    message: "Share your location.",
    button: {
      label: "Share location",
      requestLocation: true,
    },
    ...overrides,
  };
}

describe("structured delivery hook", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-structured-delivery-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("does not infer a hook path when no explicit hook is configured", () => {
    expect(resolveStructuredDeliveryHookPath({ stateDir: tempDir })).toBeUndefined();
  });

  it("resolves an explicit relative hook path under the OpenClaw state dir", () => {
    expect(
      resolveStructuredDeliveryHookPath({
        stateDir: tempDir,
        hook: { path: "hooks/structured-delivery/app_result.sh" },
      }),
    ).toBe(path.join(tempDir, "hooks", "structured-delivery", "app_result.sh"));
  });

  it("resolves only the contract-specific hook", () => {
    expect(
      resolveStructuredDeliveryHookConfig({
        kind: "location_request",
        delivery: {
          hooks: {
            location_request: { path: "hooks/structured-delivery/location_request.sh" },
          },
        },
      }),
    ).toEqual({ path: "hooks/structured-delivery/location_request.sh" });
  });

  it("does not use a shared hook for location requests", () => {
    expect(
      resolveStructuredDeliveryHookConfig({
        kind: "location_request",
        delivery: {
          hook: { path: "hooks/structured-delivery/app_result.sh" },
        } as unknown as StructuredDeliveryDeliveryConfig,
      }),
    ).toBeUndefined();
  });

  it("does not use a shared hook for app result delivery", () => {
    expect(
      resolveStructuredDeliveryHookConfig({
        kind: "app_result",
        delivery: {
          hook: { path: "hooks/structured-delivery/app_result.sh" },
        } as unknown as StructuredDeliveryDeliveryConfig,
      }),
    ).toBeUndefined();
  });

  it("passes only the validated envelope JSON to the hook stdin", async () => {
    const outputPath = path.join(tempDir, "envelope.json");

    const result = await deliverStructuredDeliveryWithHook({
      envelope: makeEnvelope(),
      hook: { path: fixtureHookPath },
      env: {
        OPENCLAW_STRUCTURED_DELIVERY_TEST_OUTPUT: outputPath,
      },
    });

    expect(result).toEqual({ ok: true, value: undefined });
    await expect(fs.readFile(outputPath, "utf8").then(JSON.parse)).resolves.toEqual(makeEnvelope());
  });

  it("passes a validated location request envelope to the hook stdin", async () => {
    const outputPath = path.join(tempDir, "location-envelope.json");

    const result = await deliverStructuredDeliveryWithHook({
      envelope: makeLocationEnvelope(),
      hook: { path: locationFixtureHookPath },
      env: {
        OPENCLAW_STRUCTURED_DELIVERY_TEST_OUTPUT: outputPath,
      },
    });

    expect(result).toEqual({ ok: true, value: undefined });
    await expect(fs.readFile(outputPath, "utf8").then(JSON.parse)).resolves.toEqual(
      makeLocationEnvelope(),
    );
  });

  it("fails closed when the hook exits non-zero", async () => {
    const result = await deliverStructuredDeliveryWithHook({
      envelope: makeEnvelope(),
      hook: { path: fixtureHookPath },
      env: {
        OPENCLAW_STRUCTURED_DELIVERY_TEST_MODE: "fail",
        OPENCLAW_STRUCTURED_DELIVERY_TEST_OUTPUT: path.join(tempDir, "unused.json"),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "delivery_failed",
      issues: [
        {
          path: "delivery.hooks.app_result.path",
          message: expect.stringContaining("fixture delivery failed"),
        },
      ],
    });
  });

  it("fails closed when the hook is missing", async () => {
    const result = await deliverStructuredDeliveryWithHook({
      envelope: makeEnvelope(),
      hook: { path: path.join(tempDir, "missing.sh") },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "delivery_failed",
      issues: [{ path: "delivery.hooks.app_result.path" }],
    });
  });

  it("fails closed when the contract hook is not configured", async () => {
    const result = await deliverStructuredDeliveryWithHook({
      envelope: makeLocationEnvelope(),
    });

    expect(result).toMatchObject({
      ok: false,
      code: "delivery_failed",
      issues: [
        {
          path: "delivery.hooks.location_request.path",
          message: expect.stringContaining("not configured"),
        },
      ],
    });
  });

  it("fails closed when the hook times out", async () => {
    const result = await deliverStructuredDeliveryWithHook({
      envelope: makeEnvelope(),
      hook: { path: fixtureHookPath, timeoutMs: 50 },
      env: {
        OPENCLAW_STRUCTURED_DELIVERY_TEST_MODE: "sleep",
        OPENCLAW_STRUCTURED_DELIVERY_TEST_OUTPUT: path.join(tempDir, "unused.json"),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "delivery_failed",
      issues: [
        {
          path: "delivery.hooks.app_result.path",
          message: expect.stringContaining("timed out"),
        },
      ],
    });
  });
});
