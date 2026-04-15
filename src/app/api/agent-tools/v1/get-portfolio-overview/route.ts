import { connectDB } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import { portfolioOverviewSchema } from "@/lib/agent-tools/schemas";
import { enforceDateWindow, handleToolError, parseQuery, requireScopedSession } from "@/lib/agent-tools/utils";
import { getPortfolioOverview } from "@/lib/agent-tools/service";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "GET /get-portfolio-overview";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "GET", Object.fromEntries(new URL(request.url).searchParams));

    const { orgId } = await requireScopedSession(request, EP);
    const { searchParams } = new URL(request.url);
    const query = parseQuery(portfolioOverviewSchema, searchParams);
    log.validationOk(EP, { dateFrom: query.dateFrom, dateTo: query.dateTo });
    enforceDateWindow(query.dateFrom, query.dateTo);

    log.dbConnect(EP);
    await connectDB();

    log.serviceCall(EP, "getPortfolioOverview");
    const data = await getPortfolioOverview(orgId, query.dateFrom, query.dateTo);
    log.serviceResult(EP, "getPortfolioOverview", {
      totalProperties: data.totalProperties,
      totalRevenue: data.totalRevenue,
      avgOccupancyPct: data.avgOccupancyPct,
    });

    const ms = Date.now() - start;
    log.resSuccess(EP, 200, ms, { totalProperties: data.totalProperties });
    return apiSuccess(data);
  } catch (error) {
    const ms = Date.now() - start;
    log.resError(EP, 500, "CATCH", String(error), ms);
    return handleToolError(error, EP);
  }
}
