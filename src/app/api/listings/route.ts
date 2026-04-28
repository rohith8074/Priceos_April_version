import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models/Listing";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const listings = await Listing.find({ orgId: new Types.ObjectId(orgId) }).lean();
    
    return NextResponse.json({
      listings: listings.map((ls: any) => ({
        id: ls._id.toString(),
        ...ls,
        _id: undefined
      }))
    });
  } catch (err) {
    console.error("[GET /api/listings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();

    if (!body.orgId || !body.name || body.price === undefined) {
      return NextResponse.json({ error: "orgId, name, and price are required" }, { status: 400 });
    }

    const listing = await Listing.create({
      ...body,
      orgId: new Types.ObjectId(body.orgId),
    });

    return NextResponse.json({
      id: listing._id.toString(),
      ...listing.toObject()
    }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/listings]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
