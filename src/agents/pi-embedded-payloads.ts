import type { InteractiveReply } from "../interactive/payload.js";

export type BlockReplyPayload = {
  text?: string;
  mediaUrls?: string[];
  interactive?: InteractiveReply;
  audioAsVoice?: boolean;
  trustedLocalMedia?: boolean;
  sensitiveMedia?: boolean;
  isReasoning?: boolean;
  replyToId?: string;
  replyToTag?: boolean;
  replyToCurrent?: boolean;
};
