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
  contract: "app_result";
  trustedFields?: StructuredDeliveryTrustedFieldPathsConfig;
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
