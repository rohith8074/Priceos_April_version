import { connectDB } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import { getPortfolioRevenueSnapshot } from "@/lib/agent-tools/service";
import { enforceDateWindow, handleToolError, parseQuery, requireScopedSession } from "@/lib/agent-tools/utils";
import { portfolioRevenueSnapshotSchema } from "@/lib/agent-tools/schemas";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "GET /get-portfolio-revenue-snapshot";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "GET", Object.fromEntries(new URL(request.url).searchParams));

    const { orgId } = await requireScopedSession(request, EP);
    const { searchParams } = new URL(request.url);
    const query = parseQuery(portfolioRevenueSnapshotSchema, searchParams);
    log.validationOk(EP, { dateFrom: query.dateFrom, dateTo: query.dateTo, groupBy: query.groupBy });
    enforceDateWindow(query.dateFrom, query.dateTo);

    log.dbConnect(EP);
    await connectDB();

    log.serviceCall(EP, "getPortfolioRevenueSnapshot");
    const data = await getPortfolioRevenueSnapshot(orgId, query.dateFrom, query.dateTo, query.groupBy);
    log.serviceResult(EP, "getPortfolioRevenueSnapshot", {
      revenue: data.totals.revenue,
      bookings: data.totals.bookings,
      breakdownRows: data.breakdown.length,
    });

    const ms = Date.now() - start;
    log.resSuccess(EP, 200, ms, { bookings: data.totals.bookings, breakdownRows: data.breakdown.length });
    return apiSuccess(data);
  } catch (error) {
    const ms = Date.now() - start;
    log.resError(EP, 500, "CATCH", String(error), ms);
    return handleToolError(error, EP);
  }
}
