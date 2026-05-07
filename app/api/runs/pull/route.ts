import { ApifyClient } from "apify-client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { hashtags, perTag } = await request.json();

    if (!hashtags || !Array.isArray(hashtags) || hashtags.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid hashtags array" },
        { status: 400 }
      );
    }

    const perTagNum = parseInt(String(perTag)) || 10;
    const apiToken = process.env.APIFY_TOKEN;

    if (!apiToken) {
      console.error("APIFY_TOKEN not set in environment");
      return NextResponse.json(
        { error: "Apify API token not configured" },
        { status: 500 }
      );
    }

    const client = new ApifyClient({ token: apiToken });

    console.log(
      `[pull] Starting actor run: hashtags=${hashtags.join(",")}, perTag=${perTagNum}`
    );

    // Run the actor
    const run = await client.actor("clockworks/tiktok-scraper").call({
      hashtags,
      resultsPerPage: perTagNum,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadAvatars: false,
      shouldDownloadMusicCovers: false,
      shouldDownloadSlideshowImages: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
      excludePinnedPosts: true,
      proxyCountryCode: "None",
    });

    console.log(`[pull] Actor run finished: runId=${run.id}`);
    console.log(`[pull] Run object keys:`, Object.keys(run));
    console.log(`[pull] Run datasetId:`, run.datasetId);
    console.log(`[pull] Run defaultDatasetId:`, run.defaultDatasetId);

    // Get the dataset ID from the run
    const datasetId = run.datasetId || run.defaultDatasetId;
    if (!datasetId) {
      console.log("[pull] Full run object:", JSON.stringify(run, null, 2));
      throw new Error("No datasetId returned from actor run");
    }

    console.log(`[pull] Fetching dataset items: datasetId=${datasetId}`);

    // Fetch dataset items with specific fields
    const fields = [
      "id",
      "webVideoUrl",
      "text",
      "hashtags",
      "createTimeISO",
      "playCount",
      "diggCount",
      "shareCount",
      "commentCount",
      "collectCount",
      "videoMeta.duration",
      "videoMeta.coverUrl",
      "videoMeta.originalCoverUrl",
      "authorMeta.name",
      "authorMeta.nickName",
      "authorMeta.fans",
      "authorMeta.verified",
      "musicMeta.musicName",
      "musicMeta.musicAuthor",
      "musicMeta.musicOriginal",
    ];

    const items = await client
      .dataset(datasetId)
      .listItems({
        fields: fields,
        limit: hashtags.length * perTagNum + 5,
      });

    console.log(`[pull] Got ${items.items.length} items from dataset`);

    return NextResponse.json({ items: items.items });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("[pull] Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
