import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { email, password, firstName, lastName, phoneNumber, openphoneApiKey, llcName } = body;

    if (!email || !password || !firstName || !lastName || !phoneNumber || !llcName) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    // 1. Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName, phone_number: phoneNumber },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Upsert user profile (trigger may have already created it)
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .upsert({
        id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        openphone_api_key: openphoneApiKey || null,
      }, { onConflict: "id" });

    if (profileError) {
      // Clean up auth user on failure
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // 3. Find or create LLC
    let llcId: string;

    const { data: existingLlc } = await supabaseAdmin
      .from("llcs")
      .select("id")
      .eq("name", llcName.trim())
      .single();

    if (existingLlc) {
      llcId = existingLlc.id;
    } else {
      const { data: newLlc, error: llcError } = await supabaseAdmin
        .from("llcs")
        .insert({ name: llcName.trim() })
        .select("id")
        .single();

      if (llcError || !newLlc) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: "Failed to create LLC." }, { status: 500 });
      }
      llcId = newLlc.id;
    }

    // 4. Create membership (pending approval)
    const { error: membershipError } = await supabaseAdmin
      .from("user_llc_memberships")
      .insert({
        user_id: userId,
        llc_id: llcId,
        role: "user",
        status: "pending",
      });

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, userId, llcId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
