import { NextRequest, NextResponse } from "next/server";
import { auth } from '@/lib/auth/server'
import { startBackgroundSync } from "@/lib/sync/background-sync";

export async function POST(req: NextRequest) {
  try {
    const { context, propertyId } = await req.json();

    if (!context) {
      return NextResponse.json(
        { success: false, error: "Missing context parameter" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const { data: session, error } = await auth.getSession()

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = startBackgroundSync();
    if (!result.started) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      message: result.message,
      requestedContext: context,
      requestedPropertyId: propertyId || null,
    }, { status: 202 })

  } catch (error) {
    console.error("Sync error:", error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
