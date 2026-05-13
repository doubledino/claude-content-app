import { ApifyClient } from "apify-client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { videoUrl } = await request.json();

    if (!videoUrl || typeof videoUrl !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid videoUrl string" },
        { status: 400 }
      );
    }

    const apiToken = process.env.APIFY_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { error: "Apify API token not configured" },
        { status: 500 }
      );
    }

    const client = new ApifyClient({ token: apiToken });

    console.log(`[scrape-url] Downloading video: ${videoUrl}`);

    // Run the TikTok downloader without watermark
    const run = await client.actor("wilcode/fast-tiktok-downloader-without-watermark").call({
      url: videoUrl,
      apiVersion: "v1",
    });

    console.log(`[scrape-url] Actor run finished: runId=${run.id}`);

    // Get the dataset ID from the run
    const datasetId = run.defaultDatasetId;
    if (!datasetId) {
      throw new Error("No defaultDatasetId returned from actor run");
    }

    console.log(`[scrape-url] Fetching dataset items: datasetId=${datasetId}`);

    // Fetch dataset items
    const items = await client
      .dataset(datasetId)
      .listItems({
        limit: 1,
      });

    console.log(`[scrape-url] Got ${items.items.length} items from dataset`);

    if (items.items.length === 0) {
      throw new Error("No data returned from scraper");
    }

    const videoData = items.items[0];
    const allKeys = Object.keys(videoData);
    console.log(`[scrape-url] Video data keys:`, allKeys);
    console.log(`[scrape-url] Full video data:`, JSON.stringify(videoData, null, 2));

    // Look for download URL - wilcode returns video download URLs
    const downloadUrl =
      (videoData as any)["downloadUrl"] ||
      (videoData as any)["download_url"] ||
      (videoData as any)["videoDownloadUrl"] ||
      (videoData as any)["video_download_url"] ||
      (videoData as any)["video"] ||
      (videoData as any)["url"] ||
      (videoData as any)["downloadLink"] ||
      (videoData as any)["download_link"];

    console.log(
      `[scrape-url] Download URL found:`,
      downloadUrl ? "YES" : "NO"
    );
    if (downloadUrl) {
      console.log(`[scrape-url] URL: ${downloadUrl.substring(0, 100)}...`);
    }

    return NextResponse.json({ videoData, downloadUrl, allKeys });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    console.error("[scrape-url] Error:", message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
