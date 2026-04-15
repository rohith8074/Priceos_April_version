import { connectDB } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getPropertyBenchmark } from "@/lib/agent-tools/service";
import { enforceDateWindow, handleToolError, parseQuery, requireScopedSession, toObjectId } from "@/lib/agent-tools/utils";
import { propertyBenchmarkSchema } from "@/lib/agent-tools/schemas";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "GET /get-property-benchmark";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "GET", Object.fromEntries(new URL(request.url).searchParams));

    const { orgId } = await requireScopedSession(request, EP);
    const { searchParams } = new URL(request.url);
    const query = parseQuery(propertyBenchmarkSchema, searchParams);
    log.validationOk(EP, { listingId: query.listingId, dateFrom: query.dateFrom, dateTo: query.dateTo });
    enforceDateWindow(query.dateFrom, query.dateTo);

    log.dbConnect(EP);
    await connectDB();

    log.serviceCall(EP, "getPropertyBenchmark");
    const data = await getPropertyBenchmark(
      orgId,
      toObjectId(query.listingId),
      query.dateFrom,
      query.dateTo
    );
    log.serviceResult(EP, "getPropertyBenchmark", {
      verdict: data.verdict,
      p50: data.p50,
      percentile: data.percentile,
    });

    const ms = Date.now() - start;
    log.resSuccess(EP, 200, ms, { verdict: data.verdict });
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
