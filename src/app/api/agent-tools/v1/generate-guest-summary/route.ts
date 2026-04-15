import { connectDB } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/api/response";
import { generateAndPersistGuestSummary } from "@/lib/agent-tools/service";
import { enforceDateWindow, handleToolError, parseBody, requireScopedSession, toObjectId } from "@/lib/agent-tools/utils";
import { generateGuestSummarySchema } from "@/lib/agent-tools/schemas";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "POST /generate-guest-summary";

export async function POST(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "POST", {});

    const { orgId } = await requireScopedSession(request, EP);
    const body = await request.json();
    log.validationOk(EP, { listingId: body.listingId, dateFrom: body.dateFrom, dateTo: body.dateTo });
    const query = parseBody(generateGuestSummarySchema, body);
    enforceDateWindow(query.dateFrom, query.dateTo);

    log.dbConnect(EP);
    await connectDB();

    log.serviceCall(EP, "generateAndPersistGuestSummary");
    const data = await generateAndPersistGuestSummary(
      orgId,
      toObjectId(query.listingId),
      query.dateFrom,
      query.dateTo
    );
    log.serviceResult(EP, "generateAndPersistGuestSummary", {
      conversationsAnalyzed: data.conversationsAnalyzed,
      sentiment: data.summary.sentiment,
    });

    const ms = Date.now() - start;
    log.resSuccess(EP, 201, ms, { conversationsAnalyzed: data.conversationsAnalyzed });
    return apiSuccess(data, undefined, 201);
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
