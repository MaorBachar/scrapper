import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({
    userId: sessionUser.userId,
    email: sessionUser.email,
    firstName: sessionUser.firstName,
    lastName: sessionUser.lastName,
    llcId: sessionUser.llcId,
    llcName: sessionUser.llcName,
    role: sessionUser.role,
    isSuperAdmin: sessionUser.isSuperAdmin,
  });
}
