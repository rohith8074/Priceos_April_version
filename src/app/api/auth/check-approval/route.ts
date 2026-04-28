import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { connectToDatabase } from "@/lib/db/mongodb";
import { User } from "@/lib/db/models/User";
import { Organization } from "@/lib/db/models/Organization";

/**
 * Check approval status. Supports both:
 *  - New tokens: sub = MongoDB ObjectId (from monolith login)
 *  - Legacy tokens: sub = email (from Python backend)
 * Also handles both User and Organization subjects.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("priceos-session")?.value;
    if (!token) {
      return NextResponse.json({ approved: false, error: "Not authenticated" }, { status: 401 });
    }

    const payload = verifyToken(token) as any;
    if (!payload) {
      return NextResponse.json({ approved: false, error: "Invalid token" }, { status: 401 });
    }

    await connectToDatabase();

    const sub = payload.sub as string;
    const isObjectId = /^[a-f0-9]{24}$/.test(sub);

    let subject: any = null;

    // Try ObjectId lookup in both collections
    if (isObjectId) {
      subject = await User.findById(sub).lean();
      if (!subject) {
        subject = await Organization.findById(sub).lean();
      }
    }

    // Fallback: email lookup (legacy Python tokens or sub = email)
    if (!subject) {
      const email = payload.email || sub;
      subject = await User.findOne({ email }).lean();
      if (!subject) {
        subject = await Organization.findOne({ email }).lean();
      }
    }

    if (!subject) {
      return NextResponse.json({ approved: false }, { status: 404 });
    }

    return NextResponse.json({ approved: subject.isApproved !== false }, { status: 200 });
  } catch (err) {
    console.error("[auth/check-approval]", err);
    return NextResponse.json({ approved: false }, { status: 500 });
  }
}
