import { connectDB } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getPropertyReservations } from "@/lib/agent-tools/service";
import { enforceDateWindow, handleToolError, parseQuery, requireScopedSession, toObjectId } from "@/lib/agent-tools/utils";
import { propertyReservationsSchema } from "@/lib/agent-tools/schemas";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "GET /get-property-reservations";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "GET", Object.fromEntries(new URL(request.url).searchParams));

    const { orgId } = await requireScopedSession(request, EP);
    const { searchParams } = new URL(request.url);
    const query = parseQuery(propertyReservationsSchema, searchParams);
    log.validationOk(EP, { listingId: query.listingId, dateFrom: query.dateFrom, dateTo: query.dateTo, limit: query.limit });
    enforceDateWindow(query.dateFrom, query.dateTo);

    log.dbConnect(EP);
    await connectDB();

    log.serviceCall(EP, "getPropertyReservations");
    const data = await getPropertyReservations(
      orgId,
      toObjectId(query.listingId),
      query.dateFrom,
      query.dateTo,
      query.limit
    );
    log.serviceResult(EP, "getPropertyReservations", {
      count: data.count,
    });

    const ms = Date.now() - start;
    log.resSuccess(EP, 200, ms, { reservationsReturned: data.count });
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
