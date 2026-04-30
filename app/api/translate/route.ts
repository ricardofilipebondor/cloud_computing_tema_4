import { NextRequest, NextResponse } from "next/server";
import { translateTextsWithAzure } from "@/lib/azure-translation";
import { trackException } from "@/lib/application-insights";

export const runtime = "nodejs";

type TranslateBody = {
  texts?: string[];
  to?: string;
  from?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TranslateBody;
    const texts = Array.isArray(body.texts) ? body.texts : [];
    const to = (body.to ?? "").trim();
    const from = (body.from ?? "").trim() || undefined;

    if (!to) {
      return NextResponse.json({ error: "Target language is required." }, { status: 400 });
    }

    if (texts.length === 0) {
      return NextResponse.json({ translations: [] });
    }

    const translations = await translateTextsWithAzure(texts, to, from);
    return NextResponse.json({ translations });
  } catch (error) {
    trackException(error, { route: "POST /api/translate" });
    console.error("POST /api/translate failed:", error);
    return NextResponse.json({ error: "Failed to translate text." }, { status: 500 });
  }
}
