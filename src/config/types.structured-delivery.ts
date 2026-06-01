export type StructuredDeliveryTrustedField =
  | "url"
  | "target"
  | "surface"
  | "accountId"
  | "threadId"
  | "items"
  | "metadata";

export type StructuredDeliveryTrustedFieldPathsConfig = {
  urlPath?: string;
  targetPath?: string;
  surfacePath?: string;
  accountIdPath?: string;
  threadIdPath?: string;
  itemsPath?: string;
  metadataPath?: string;
};

export type StructuredDeliveryTriggerConfig = {
  tool?: string;
  mcpServer?: string;
  mcpTool?: string;
  delivery?: "app_result";
  contract?: "app_result";
  copy?: "message_only" | "with_items" | "app_result.message_only" | "app_result.with_items";
  trusted?: {
    url?: string;
    target?: string;
    surface?: string;
    accountId?: string;
    threadId?: string;
    items?: string;
    metadata?: string;
  };
  trustedFields?: StructuredDeliveryTrustedFieldPathsConfig;
  requiredTrusted?: StructuredDeliveryTrustedField[];
  requiredTrustedFields?: StructuredDeliveryTrustedField[];
};

export type StructuredDeliveryConfig = {
  enabled?: boolean;
  delivery?: {
    hooks?: Partial<
      Record<
        "app_result" | "location_request",
        {
          path: string;
          timeoutMs?: number;
        }
      >
    >;
  };
  retry?: {
    maxAttempts?: number;
  };
  triggers?: StructuredDeliveryTriggerConfig[];
};
