import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { niche, count } = await request.json();

    if (!niche || typeof niche !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid niche string" },
        { status: 400 }
      );
    }

    const numHashtags = Math.max(5, Math.min(50, count ? parseInt(count) : 20));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    // Calculate distribution: ~15% mega, ~35% mid-size, ~50% niche
    const numMega = Math.max(1, Math.floor(numHashtags * 0.15));
    const numMid = Math.max(1, Math.floor(numHashtags * 0.35));
    const numNiche = numHashtags - numMega - numMid;

    const prompt = `Generate exactly ${numHashtags} TikTok hashtags for the '${niche}' niche. Mix ${numMega} mega (>1B posts), ${numMid} mid-size, ${numNiche} niche/specific. Return ONLY a JSON array of strings without the # symbol, no explanation.

Example format: ["fitness", "fitnessmotivation", "personaltraining", ...]`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse the JSON array from the response
    let hashtags: string[] = [];
    try {
      // Extract JSON array from the response (it might have extra text)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        hashtags = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON array found in response");
      }
    } catch (e) {
      console.error("[hashtags] Failed to parse response:", text);
      return NextResponse.json(
        { error: "Failed to parse hashtag response" },
        { status: 500 }
      );
    }

    console.log(`[hashtags] Generated ${hashtags.length} hashtags for niche: ${niche}`);

    return NextResponse.json({ hashtags });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("[hashtags] Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
