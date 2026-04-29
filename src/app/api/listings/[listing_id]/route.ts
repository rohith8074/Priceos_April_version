import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Listing } from "@/lib/db/models/Listing";
import { Types } from "mongoose";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listing_id: string }> }
) {
  try {
    const { listing_id } = await params;
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const listing = await Listing.findOne({ 
      _id: new Types.ObjectId(listing_id),
      orgId: new Types.ObjectId(orgId)
    }).lean() as any;

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: listing._id.toString(),
      ...listing,
      _id: undefined
    });
  } catch (err) {
    console.error("[GET /api/listings/[listing_id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ listing_id: string }> }
) {
  try {
    const { listing_id } = await params;
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    const body = await req.json();

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const listing = await Listing.findOneAndUpdate(
      { 
        _id: new Types.ObjectId(listing_id),
        orgId: new Types.ObjectId(orgId)
      },
      { $set: body },
      { returnDocument: "after" }
    ).lean();

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Listing updated" });
  } catch (err) {
    console.error("[PUT /api/listings/[listing_id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listing_id: string }> }
) {
  try {
    const { listing_id } = await params;
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");

    if (!orgId) {
      return NextResponse.json({ error: "orgId is required" }, { status: 400 });
    }

    const listing = await Listing.findOneAndDelete({ 
      _id: new Types.ObjectId(listing_id),
      orgId: new Types.ObjectId(orgId)
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/listings/[listing_id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
