import { connectDB } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/api/response";
import { saveGuestReply, suggestGuestReply } from "@/lib/agent-tools/service";
import { handleToolError, parseBody, requireScopedSession } from "@/lib/agent-tools/utils";
import { suggestAndSaveGuestReplySchema } from "@/lib/agent-tools/schemas";
import { toolLogger as log } from "@/lib/agent-tools/logger";

const EP = "POST /suggest-and-save-guest-reply";

export async function POST(request: Request) {
  const start = Date.now();
  try {
    log.reqStart(EP, "POST", {});

    const { orgId } = await requireScopedSession(request, EP);
    const body = await request.json();
    log.validationOk(EP, {
      conversationId: body.conversationId,
      guestName: body.guestName,
      autoSave: body.autoSave,
      messageLength: body.guestMessage?.length || 0,
    });
    const query = parseBody(suggestAndSaveGuestReplySchema, body);

    log.dbConnect(EP);
    await connectDB();

    log.serviceCall(EP, "suggestGuestReply");
    const suggestion = await suggestGuestReply({
      guestMessage: query.guestMessage,
      guestName: query.guestName,
      propertyName: query.propertyName,
    });
    log.serviceResult(EP, "suggestGuestReply", {
      source: suggestion.source,
      replyLength: suggestion.reply.length,
    });

    let saved = false;
    if (query.autoSave) {
      log.serviceCall(EP, "saveGuestReply");
      const saveResult = await saveGuestReply(orgId, query.conversationId, suggestion.reply);
      saved = saveResult.saved;
      log.serviceResult(EP, "saveGuestReply", { saved });
    }

    const ms = Date.now() - start;
    log.resSuccess(EP, 200, ms, { source: suggestion.source, saved });
    return apiSuccess({ suggestion, saved });
  } catch (error) {
    const ms = Date.now() - start;
    if (error instanceof Error && error.message === "CONVERSATION_NOT_FOUND") {
      log.resError(EP, 404, "NOT_FOUND", "Conversation not found", ms);
      return apiError("NOT_FOUND", "Conversation not found in current organization", 404);
    }
    log.resError(EP, 500, "CATCH", String(error), ms);
    return handleToolError(error, EP);
  }
}
