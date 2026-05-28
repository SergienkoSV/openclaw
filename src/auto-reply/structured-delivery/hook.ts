import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { resolveHomeRelativePath } from "../../infra/home-dir.js";
import { normalizeOptionalString } from "../../shared/string-coerce.js";
import type {
  DeliveryEnvelope,
  StructuredDeliveryContractId,
  StructuredDeliveryDeliveryConfig,
  StructuredDeliveryHookConfig,
  StructuredDeliveryResult,
} from "./types.js";

const DEFAULT_HOOK_TIMEOUT_MS = 40_000;
const MAX_CAPTURED_OUTPUT_CHARS = 2000;

function issue(path: string, message: string) {
  return { code: "delivery_failed" as const, path, message };
}

function fail(message: string, path = "delivery.hooks"): StructuredDeliveryResult<void> {
  return {
    ok: false,
    code: "delivery_failed",
    issues: [issue(path, message)],
  };
}

function trimOutput(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > MAX_CAPTURED_OUTPUT_CHARS
    ? `${trimmed.slice(0, MAX_CAPTURED_OUTPUT_CHARS)}...`
    : trimmed;
}

export function resolveStructuredDeliveryHookPath(params?: {
  hook?: StructuredDeliveryHookConfig;
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
}): string | undefined {
  const hookPath = normalizeOptionalString(params?.hook?.path);
  if (!hookPath) {
    return undefined;
  }
  if (path.isAbsolute(hookPath) || hookPath.startsWith("~")) {
    return resolveHomeRelativePath(hookPath, { env: params?.env });
  }
  return path.resolve(params?.stateDir ?? resolveStateDir(params?.env), hookPath);
}

export function resolveStructuredDeliveryHookConfig(params: {
  delivery?: StructuredDeliveryDeliveryConfig;
  kind: StructuredDeliveryContractId;
}): StructuredDeliveryHookConfig | undefined {
  return params.delivery?.hooks?.[params.kind];
}

export async function deliverStructuredDeliveryWithHook(params: {
  envelope: DeliveryEnvelope;
  hook?: StructuredDeliveryHookConfig;
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
}): Promise<StructuredDeliveryResult<void>> {
  const hookPath = resolveStructuredDeliveryHookPath({
    hook: params.hook,
    env: params.env,
    stateDir: params.stateDir,
  });
  const issuePath = `delivery.hooks.${params.envelope.kind}.path`;
  if (!hookPath) {
    return fail(
      `structured delivery hook is not configured for ${params.envelope.kind}`,
      issuePath,
    );
  }
  try {
    const stat = await fs.stat(hookPath);
    if (!stat.isFile()) {
      return fail(`structured delivery hook is not a file: ${hookPath}`, issuePath);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(`structured delivery hook is not available: ${hookPath}: ${message}`, issuePath);
  }

  const timeoutMs =
    typeof params.hook?.timeoutMs === "number" && Number.isFinite(params.hook.timeoutMs)
      ? Math.max(1, Math.trunc(params.hook.timeoutMs))
      : DEFAULT_HOOK_TIMEOUT_MS;
  const input = `${JSON.stringify(params.envelope)}\n`;

  return await new Promise<StructuredDeliveryResult<void>>((resolve) => {
    const child = spawn("bash", [hookPath], {
      env: {
        ...process.env,
        ...params.env,
        OPENCLAW_STRUCTURED_DELIVERY: "1",
        OPENCLAW_STRUCTURED_DELIVERY_CONTRACT: params.envelope.kind,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let didTimeOut = false;
    let settled = false;
    const finish = (result: StructuredDeliveryResult<void>) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      didTimeOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      finish(fail(`structured delivery hook failed to start: ${err.message}`, issuePath));
    });
    child.on("close", (code, signal) => {
      if (didTimeOut) {
        finish(fail(`structured delivery hook timed out after ${timeoutMs}ms`, issuePath));
        return;
      }
      if (code === 0) {
        finish({ ok: true, value: undefined });
        return;
      }
      const output = trimOutput(stderr) || trimOutput(stdout);
      const suffix = output ? `: ${output}` : "";
      finish(
        fail(
          `structured delivery hook exited with ${code == null ? `signal ${signal}` : `code ${code}`}${suffix}`,
          issuePath,
        ),
      );
    });
    child.stdin.end(input);
  });
}
