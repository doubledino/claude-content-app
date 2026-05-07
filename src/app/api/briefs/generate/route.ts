import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { item } = await request.json();

    if (!item) {
      return NextResponse.json(
        { error: "Missing item in request body" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY not set in environment");
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    // Calculate word target based on duration
    const duration = item["videoMeta.duration"] || 20;
    const wordTarget = Math.max(8, Math.round(duration * 2.5));

    // Build the prompt exactly as in the artifact
    const prompt = `You are writing a brief for a personal trainer to film their own version of this TikTok.
Return ONLY plain text in this exact format. Use the section headers exactly as shown:

HOOK (3 lines max — what gets said in the first 2 seconds):
- ...
- ...
- ...

VOICEOVER SCRIPT (target ~${wordTarget} words, mark cut points with [BEAT]):
"..."

SHOT LIST (3-6 shots, numbered):
1. ...
2. ...

AUDIO: state "original voiceover" OR "trending sound" with one-line reason

CAPTION:
[caption text on one paragraph]

HASHTAGS:
#tag1 #tag2 #tag3 ... (3 mega + 5 medium + 7 niche, all on one line)

The trainer is a working PT serving general-fitness clients. Replicable means they can film with phone + standard gym equipment. Avoid niche bodybuilding-specific cues. Do NOT wrap your reply in JSON or markdown code fences — return raw text only.`;

    console.log(`[brief] Generating brief for item: ${item.id}`);

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    console.log(`[brief] Generated ${text.length} characters of brief text`);

    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("[brief] Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
