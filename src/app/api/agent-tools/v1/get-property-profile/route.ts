import { connectDB } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/api/response";
import { getPropertyProfile } from "@/lib/agent-tools/service";
import { handleToolError, parseQuery, requireScopedSession, toObjectId } from "@/lib/agent-tools/utils";
import { propertyProfileSchema } from "@/lib/agent-tools/schemas";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "GET /get-property-profile";

export async function GET(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "GET", Object.fromEntries(new URL(request.url).searchParams));

    const { orgId } = await requireScopedSession(request, EP);
    const { searchParams } = new URL(request.url);
    const query = parseQuery(propertyProfileSchema, searchParams);
    log.validationOk(EP, { listingId: query.listingId });

    log.dbConnect(EP);
    await connectDB();

    log.serviceCall(EP, "getPropertyProfile");
    const data = await getPropertyProfile(orgId, toObjectId(query.listingId));
    log.serviceResult(EP, "getPropertyProfile", {
      name: data.name,
      city: data.city,
      basePrice: data.basePrice,
    });

    const ms = Date.now() - start;
    log.resSuccess(EP, 200, ms, { property: data.name });
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
