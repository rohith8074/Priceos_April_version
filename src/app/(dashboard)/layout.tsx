import { AppSidebar } from "@/components/layout/app-sidebar";
import { AgentCacheProvider } from "@/lib/cache/agent-cache-provider";
import { InactivityMonitor } from "@/components/auth/inactivity-wrapper";
import { ApprovalGuard } from "@/components/auth/approval-guard";
import { ThemeToggleFloating } from "@/components/layout/theme-toggle-floating";
import { Suspense } from "react";
import { GlobalTour } from "@/components/tour/global-tour";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full bg-surface-0 overflow-hidden text-text-primary">
      <InactivityMonitor />
      <ApprovalGuard />
      
      {/* Column 1: Sidebar (232px) */}
      <Suspense fallback={<div className="w-[232px] border-r border-border-default bg-surface-1 shrink-0 z-50"></div>}>
        <AppSidebar />
      </Suspense>

      {/* Column 2: Main Content (flex-1) */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden relative">
        <AgentCacheProvider>
          <div className="flex h-full w-full overflow-hidden">
            <main className="flex-1 overflow-y-auto custom-scrollbar bg-surface-0">
              {children}
            </main>

          </div>
        </AgentCacheProvider>
      </div>

      {/* Floating Theme Toggle */}
      <ThemeToggleFloating />

      {/* Global Onboarding Tour */}
      <GlobalTour />
    </div>
  );
}
