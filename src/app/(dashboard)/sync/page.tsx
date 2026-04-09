"use client";

import { useSearchParams } from "next/navigation";

export default function SyncPage() {
    const searchParams = useSearchParams();
    const tab = searchParams.get("tab") || "sources";

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2 capitalize">
                {tab} Configuration
            </h1>
            <p className="text-text-secondary">Pipeline management and data synchronization settings.</p>
            <div className="mt-8 flex h-64 items-center justify-center rounded-xl border border-white/5 bg-white/[0.02]">
                <p className="text-text-tertiary">Pipeline configuration is under construction.</p>
            </div>
        </div>
    );
}
