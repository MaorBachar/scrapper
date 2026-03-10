import { NextResponse } from "next/server";
import { getSessionUser, unauthorizedResponse } from "@/lib/auth";

function normalizeE164(num: string): string {
  const digits = num.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

async function resolvePhoneNumberId(
  apiKey: string,
  fromNumber: string
): Promise<string | null> {
  const fromDigits = normalizeE164(fromNumber).replace(/\D/g, "");
  const res = await fetch("https://api.openphone.com/v1/phone-numbers", {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    data?: Array<{ id: string; number?: string; e164?: string }>;
  };
  const numbers = data.data ?? [];
  const match = numbers.find((p) => {
    const raw = p.number ?? p.e164 ?? "";
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 10 && digits.slice(-10) === fromDigits.slice(-10);
  });
  return match?.id ?? null;
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return unauthorizedResponse();

  try {
    // Prefer the user's stored OpenPhone API key, fall back to env
    const apiKey = sessionUser.openphoneApiKey || process.env.OPENPHONE_API_KEY;
    let phoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;
    const userId = process.env.OPENPHONE_USER_ID;
    const fromNumber = process.env.OPENPHONE_FROM_NUMBER;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENPHONE_API_KEY is not configured" },
        { status: 500 }
      );
    }
    if (!phoneNumberId && !fromNumber) {
      return NextResponse.json(
        { error: "OPENPHONE_PHONE_NUMBER_ID or OPENPHONE_FROM_NUMBER is required" },
        { status: 500 }
      );
    }

    if (!phoneNumberId && fromNumber) {
      const resolved = await resolvePhoneNumberId(apiKey, fromNumber);
      if (!resolved) {
        return NextResponse.json(
          {
            error:
              "Phone number not found in OpenPhone account. Add OPENPHONE_PHONE_NUMBER_ID with the ID from your OpenPhone dashboard, or ensure OPENPHONE_FROM_NUMBER matches a number in your account.",
          },
          { status: 400 }
        );
      }
      phoneNumberId = resolved;
    }

    const body = await request.json();
    const { to, content } = body;

    if (!to || typeof to !== "string" || !content || typeof content !== "string") {
      return NextResponse.json(
        { error: "to and content are required" },
        { status: 400 }
      );
    }

    const normalizedTo = to.replace(/\D/g, "");
    if (normalizedTo.length < 10) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    const toE164 = normalizedTo.length === 10 ? `+1${normalizedTo}` : `+${normalizedTo}`;
    const payload: Record<string, unknown> = {
      from: phoneNumberId,
      to: [toE164],
      content: content.trim(),
    };

    if (userId) payload.userId = userId;

    const res = await fetch("https://api.openphone.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.message || errData.error || `OpenPhone API error: ${res.status}` },
        { status: res.status >= 400 && res.status < 500 ? res.status : 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send SMS" },
      { status: 500 }
    );
  }
}
