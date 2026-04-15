import { connectDB } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getPropertyMarketEvents } from "@/lib/agent-tools/service";
import { enforceDateWindow, handleToolError, parseQuery, requireScopedSession, toObjectId } from "@/lib/agent-tools/utils";
import { propertyMarketEventsSchema } from "@/lib/agent-tools/schemas";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "GET /get-property-market-events";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "GET", Object.fromEntries(new URL(request.url).searchParams));

    const { orgId } = await requireScopedSession(request, EP);
    const { searchParams } = new URL(request.url);
    const query = parseQuery(propertyMarketEventsSchema, searchParams);
    log.validationOk(EP, { dateFrom: query.dateFrom, dateTo: query.dateTo, listingId: query.listingId || "all" });
    enforceDateWindow(query.dateFrom, query.dateTo);

    log.dbConnect(EP);
    await connectDB();

    const listingId = query.listingId ? toObjectId(query.listingId) : undefined;
    log.serviceCall(EP, "getPropertyMarketEvents");
    const data = await getPropertyMarketEvents(orgId, query.dateFrom, query.dateTo, listingId);
    log.serviceResult(EP, "getPropertyMarketEvents", {
      eventsFound: data.count,
    });

    const ms = Date.now() - start;
    log.resSuccess(EP, 200, ms, { eventsFound: data.count });
    return apiSuccess(data);
  } catch (error) {
    const ms = Date.now() - start;
    if (error instanceof Error && error.message === "LISTING_NOT_FOUND") {
      log.resError(EP, 404, "NOT_FOUND", "Listing not found", ms);
      return apiError("NOT_FOUND", "Listing not found in current organization", 404);
    }
    log.resError(EP, 500, "CATCH", String(error), ms);
    return handleToolError(error, EP);
  }
}
