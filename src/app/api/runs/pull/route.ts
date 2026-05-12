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
      "videoMeta.videoDownloadUrl",
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
        limit: hashtags.length * perTagNum + 5,
      });

    console.log(`[pull] Got ${items.items.length} items from dataset`);

    // Log the first item to see the structure
    let debugInfo = {};
    if (items.items.length > 0) {
      debugInfo = {
        firstItemKeys: Object.keys(items.items[0]),
        firstItemSample: {
          id: items.items[0].id,
          'videoMeta.coverUrl': items.items[0]['videoMeta.coverUrl'],
          'videoMeta.videoDownloadUrl': items.items[0]['videoMeta.videoDownloadUrl'],
          'videoMeta.duration': items.items[0]['videoMeta.duration'],
          webVideoUrl: items.items[0].webVideoUrl,
        }
      };
      console.log('[pull] First item sample:', JSON.stringify(debugInfo, null, 2));
    }

    return NextResponse.json({ items: items.items, debug: debugInfo });
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
