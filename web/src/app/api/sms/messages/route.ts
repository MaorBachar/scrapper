import { NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.OPENPHONE_API_KEY;
    let phoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;
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
          { error: "Could not resolve phoneNumberId from OpenPhone account" },
          { status: 400 }
        );
      }
      phoneNumberId = resolved;
    }

    const phone = request.nextUrl.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json(
        { error: "phone query parameter is required" },
        { status: 400 }
      );
    }

    const participantE164 = normalizeE164(phone);
    const url = new URL("https://api.openphone.com/v1/messages");
    url.searchParams.set("phoneNumberId", phoneNumberId!);
    url.searchParams.append("participants[]", participantE164);
    url.searchParams.set("maxResults", "50");

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.message || `OpenPhone API error: ${res.status}` },
        { status: res.status >= 400 && res.status < 500 ? res.status : 500 }
      );
    }

    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        text: string;
        direction: string;
        createdAt: string;
        from: string;
        to: string[];
      }>;
    };

    const messages = (json.data ?? []).map((m) => ({
      id: m.id,
      text: m.text,
      direction: m.direction,
      createdAt: m.createdAt,
      from: m.from,
      to: m.to,
    }));

    return NextResponse.json(messages);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
