# Structured Delivery Hooks

Structured delivery separates message content from message delivery.

The model produces structured content. OpenClaw validates that content, combines it with trusted runtime data, and calls an explicit delivery hook. This keeps transport details out of model output and prevents delivery from running with unvalidated or model-supplied routing data.

## Scope

Structured delivery is intended for messages that need a stricter contract than plain text replies.

Current contracts:

- `app_result`: delivers a validated application result message with a trusted action URL.
- `location_request`: asks the current user to share their location through a surface-specific delivery hook.

Each contract has its own configured hook. There is no default hook path and no fallback from one contract to another.

## Configuration

Structured delivery is enabled through `structuredDelivery`.

```json
{
  "structuredDelivery": {
    "enabled": true,
    "retry": {
      "maxAttempts": 2
    },
    "delivery": {
      "hooks": {
        "app_result": {
          "path": "hooks/structured-delivery/app_result.sh",
          "timeoutMs": 40000
        },
        "location_request": {
          "path": "hooks/structured-delivery/location_request.sh",
          "timeoutMs": 40000
        }
      }
    }
  }
}
```

When `structuredDelivery.enabled` is `true`, OpenClaw validates configured hook paths at config load time. Missing paths are configuration errors.

## App Result Contract

The `app_result` contract is used after a tool or MCP endpoint returns trusted delivery facts, such as an action URL. The model supplies only the user-facing copy.

The model-owned JSON is:

```json
{
  "title": "Result ready",
  "message": "Review the prepared result.",
  "items": [
    {
      "title": "First item",
      "subtitle": "Optional supporting text"
    }
  ],
  "primaryActionLabel": "Open"
}
```

Only `message` is required. `title`, `items`, and `primaryActionLabel` are optional.

The model must not supply URLs, transport payloads, shell commands, tokens, chat IDs, thread IDs, or other routing fields. If those fields appear in model output, OpenClaw ignores them for delivery.

OpenClaw builds the hook envelope from validated model-owned copy and trusted fields:

```ts
type AppResultDeliveryEnvelope = {
  kind: "app_result";
  title?: string;
  message: string;
  items?: Array<{
    title: string;
    subtitle?: string;
  }>;
  primaryAction: {
    label: string;
    url: string;
  };
  route: {
    surface?: string;
    target?: string;
    accountId?: string;
    threadId?: string | number;
  };
};
```

`primaryAction.url` and `route` come from trusted tool output or runtime context, not from the model.

## Location Request Contract

The `location_request` contract is used by the internal `request_user_location` tool. The model calls the tool when it needs the user's location.

Tool arguments:

```json
{
  "message": "Please share your location so I can continue.",
  "buttonLabel": "Share location"
}
```

OpenClaw validates the arguments, builds the envelope, and calls the configured `location_request` hook:

```ts
type LocationRequestEnvelope = {
  kind: "location_request";
  message: string;
  button: {
    label: string;
    requestLocation: true;
  };
  route?: {
    surface?: string;
    target?: string;
    accountId?: string;
    threadId?: string | number;
  };
};
```

Incoming location messages are not part of this delivery contract. They continue through the normal inbound pipeline for the active channel.

For Telegram, the hook can implement this contract by sending a reply keyboard button with `request_location: true`. Token handling, chat IDs, proxy settings, and Telegram-specific payload assembly belong in the hook or its environment, not in model output.

## Hook Invocation

OpenClaw starts the configured hook and writes the validated envelope to stdin as JSON.

```bash
bash <configured-hook-path>
```

The hook receives these environment variables:

```text
OPENCLAW_STRUCTURED_DELIVERY=1
OPENCLAW_STRUCTURED_DELIVERY_CONTRACT=<contract>
```

The hook must exit with code `0` only after delivery succeeds. A non-zero exit code is treated as delivery failure.

## Invariants

- Every contract uses an explicit `structuredDelivery.delivery.hooks.<contract>.path`.
- OpenClaw core does not provide user-specific hook paths.
- One contract never falls back to another contract's hook.
- Hook input is a validated envelope.
- Trusted delivery fields do not come from model output.
- Successful structured delivery suppresses the ordinary final reply when the hook already sent the user-visible message.
