import { getSession } from "@/lib/auth/server";
import { OperationsClient } from "./operations-client";
import { Suspense } from "react";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Operations | PriceOS",
  description: "Manage maintenance, housekeeping, and guest escalation tickets.",
};

export default async function OperationsPage() {
  const session = await getSession();
  if (!session?.orgId) {
    redirect("/login");
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background transition-colors duration-300">
      <Suspense fallback={<div className="p-8 text-foreground">Loading operations tower...</div>}>
        <OperationsClient orgId={session.orgId} />
      </Suspense>
    </div>
  );
}
