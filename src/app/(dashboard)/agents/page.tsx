import { AgentStatusPanel } from "@/components/agents/agent-status-panel";

export default function AgentsPage() {
  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-1">Agent Status</h1>
        <p className="text-text-secondary text-sm">
          Monitor the health and activity of all 9 AI agents powering the revenue engine.
        </p>
      </div>
      <AgentStatusPanel />
    </div>
  );
}
