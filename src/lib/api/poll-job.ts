/**
 * poll-job.ts
 *
 * Replaces SSE streaming for all Lyzr agent calls.
 * Flow:
 *   1. POST to agent endpoint → { jobId }
 *   2. Poll GET /api/jobs/{jobId} every `intervalMs` until status = "complete" | "error"
 *   3. Resolve with result or reject with error string
 */

export interface JobResult<T = Record<string, unknown>> {
  status: "running" | "complete" | "error";
  result: T | null;
  error: string | null;
  created_at: string;
}

export async function pollJob<T = Record<string, unknown>>(
  jobId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onPoll?: (elapsedMs: number) => void;
  } = {}
): Promise<T> {
  const { intervalMs = 5000, timeoutMs = 540_000, onPoll } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, intervalMs));

    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) throw new Error(`Poll failed with status ${res.status}`);

    const job: JobResult<T> = await res.json();

    if (job.status === "complete") {
      if (!job.result) throw new Error("Job completed but result is empty");
      return job.result;
    }

    if (job.status === "error") {
      throw new Error(job.error ?? "Agent job failed");
    }

    onPoll?.(Date.now() - (deadline - timeoutMs));
  }

  throw new Error("Analysis is taking longer than expected (9 min limit). The agent may still be running — please try again in a moment.");
}
