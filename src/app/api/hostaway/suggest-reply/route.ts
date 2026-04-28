import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Job } from "@/lib/db/models/Job";
import { callLyzrAgent } from "@/lib/services/lyzr";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages = [], guestName = "Guest", propertyName = "Property", orgId, threadId } = body;

    await connectToDatabase();

    const jobId = `job-draft-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Create the job immediately in "running" status
    await Job.create({
      jobId,
      status: "running",
      result: null,
      error: null,
    });

    // Fire-and-forget background execution directly via Lyzr
    (async () => {
      try {
        const agentId = process.env.LYZR_Chat_Response_Agent_ID || "699d8ab150b4c733eb376fd4";
        
        let history = "";
        for (const m of messages) {
          const sender = m.sender === "guest" || m.role === "guest" ? "Guest" : "Host";
          const text = m.text || m.content || "";
          history += `${sender}: ${text}\n`;
        }

        const prompt = `
Suggest a hospitality-focused reply to the guest: ${guestName}
Property: ${propertyName}

Conversation History:
${history}

Rules:
1. Be warm, empathetic, and professional.
2. Do NOT mention being an AI.
3. If there is a maintenance issue, mention that you'll look into it.
4. Provide the reply in a JSON format: {"reply": "..."}
`;

        const systemVars = {
          guest_name: guestName,
          property_name: propertyName,
          org_id: orgId || "69d776a671c7b939aaf49053",
          thread_id: threadId || jobId,
          today: new Date().toISOString().slice(0, 10),
        };

        const result = await callLyzrAgent(
          agentId,
          prompt,
          "priceos-user",
          jobId,
          systemVars
        );

        await connectToDatabase();
        const job = await Job.findOne({ jobId });
        if (job) {
          if (result.ok) {
            job.status = "complete";
            
            // Extract reply string safely from Lyzr's JSON output or fallback to raw text
            let finalMessage = result.response;
            if (result.parsedJson) {
              finalMessage = 
                result.parsedJson.suggested_reply?.content || 
                result.parsedJson.chat_response || 
                result.parsedJson.reply || 
                result.parsedJson.content || 
                result.parsedJson.message || 
                result.response;
            }

            job.result = {
              message: finalMessage,
              raw_json: result.parsedJson,
            };
          } else {
            job.status = "error";
            job.error = result.error || "Lyzr agent failure";
          }
          await job.save();
        }
      } catch (bgErr: any) {
        console.error(`[Background Job ${jobId}] Lyzr Direct Error:`, bgErr);
        try {
          await connectToDatabase();
          const job = await Job.findOne({ jobId });
          if (job) {
            job.status = "error";
            job.error = bgErr.message || "Execution error";
            await job.save();
          }
        } catch {}
      }
    })();

    return NextResponse.json({ jobId });
  } catch (err: any) {
    console.error("[POST /api/hostaway/suggest-reply]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
