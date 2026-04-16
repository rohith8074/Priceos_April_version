import { NextResponse } from "next/server";
import { startBackgroundSync } from "@/lib/sync/background-sync";

export async function POST() {
    const result = startBackgroundSync();

    if (!result.started) {
        return NextResponse.json({
            success: false,
            status: result.status,
            message: result.message,
        }, { status: 409 });
    }

    return NextResponse.json({
        success: true,
        status: result.status,
        message: result.message,
    }, { status: 202 });
}
