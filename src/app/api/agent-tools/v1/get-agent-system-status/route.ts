import { connectDB } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import { getAgentSystemStatus } from "@/lib/agent-tools/service";
import { handleToolError, requireScopedSession } from "@/lib/agent-tools/utils";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "GET /get-agent-system-status";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "GET", Object.fromEntries(new URL(request.url).searchParams));

    const { orgId } = await requireScopedSession(request, EP);

    log.dbConnect(EP);
    await connectDB();

    log.serviceCall(EP, "getAgentSystemStatus");
    const data = await getAgentSystemStatus(orgId);
    log.serviceResult(EP, "getAgentSystemStatus", {
      systemState: data.systemState,
      activeAgents: data.summary.activeCount,
      warningAgents: data.summary.warningCount,
      errorAgents: data.summary.errorCount,
      pendingProposals: data.summary.pendingProposals,
    });

    const ms = Date.now() - start;
    log.resSuccess(EP, 200, ms, { systemState: data.systemState });
    return apiSuccess(data);
  } catch (error) {
    const ms = Date.now() - start;
    log.resError(EP, 500, "CATCH", String(error), ms);
    return handleToolError(error, EP);
  }
}
