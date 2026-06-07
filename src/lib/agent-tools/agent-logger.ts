/**
 * Re-export of the canonical agent logger so both import paths resolve to a
 * single implementation:
 *   - "@/lib/utils/agent-logger"        (used by chat / inference routes)
 *   - "@/lib/agent-tools/agent-logger"  (used by the agent-tools route)
 *
 * See ../utils/agent-logger.ts for the implementation and docs.
 */
export {
  newTraceId,
  agentLog,
  logChatInput,
  logChatResponse,
  logToolCall,
  logToolResponse,
} from "@/lib/utils/agent-logger";
</content>
