import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectToDatabase } from "@/lib/db/mongodb";
import { Organization } from "@/lib/db/models/Organization";
import { User } from "@/lib/db/models/User";
import { signToken } from "@/lib/auth/jwt";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { email, password, orgName, name } = body;

    if (!email || !password || !orgName || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const organization = await Organization.create({
      name: orgName,
      email,
      passwordHash,
      role: "owner",
      isApproved: true,
      fullName: name,
    });

    const user = await User.create({
      name,
      email,
      passwordHash,
      orgId: organization._id,
      role: "owner",
      isApproved: true,
      fullName: name,
    });

    const tokenPayload = {
      sub: user._id.toString(),
      email: user.email,
      orgId: organization._id.toString(),
      role: user.role,
      onboardingStep: "connect",
    };

    const accessToken = signToken(tokenPayload, "7d");
    const refreshToken = signToken(tokenPayload, "30d");

    user.refreshToken = refreshToken;
    await user.save();
    
    organization.refreshToken = refreshToken;
    await organization.save();

    const response = NextResponse.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        orgId: organization._id.toString()
      },
      accessToken,
      refreshToken
    }, { status: 200 });

    response.cookies.set("priceos-session", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });
    
    response.cookies.set("priceos-refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[auth/register]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
