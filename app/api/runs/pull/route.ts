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
      shouldDownloadVideos: true,
      shouldDownloadCovers: true,
      shouldDownloadAvatars: false,
      shouldDownloadMusicCovers: false,
      shouldDownloadSlideshowImages: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
      excludePinnedPosts: true,
      proxyCountryCode: "None",
    });

    console.log(`[pull] Actor run finished: runId=${run.id}`);

    // Get the dataset ID from the run
    const datasetId = run.defaultDatasetId;
    if (!datasetId) {
      throw new Error("No defaultDatasetId returned from actor run");
    }

    console.log(`[pull] Fetching dataset items: datasetId=${datasetId}`);

    // Fetch dataset items - don't filter fields, get everything Apify returns
    const items = await client
      .dataset(datasetId)
      .listItems({
        limit: hashtags.length * perTagNum + 5,
      });

    console.log(`[pull] Got ${items.items.length} items from dataset`);

    // Debug: Log first item structure and all fields
    let debugInfo = { allFields: [] as string[], firstItemFull: {} as any };
    if (items.items.length > 0) {
      const firstItem = items.items[0];
      debugInfo.allFields = Object.keys(firstItem).sort();
      debugInfo.firstItemFull = firstItem;

      console.log('[pull] All fields in first item:', debugInfo.allFields);
      console.log('[pull] Full first item:', JSON.stringify(firstItem, null, 2));
    }

    return NextResponse.json({ items: items.items, debugInfo });
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
