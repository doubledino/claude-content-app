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

    console.log(`[scrape-url] Scraping video URL: ${videoUrl}`);

    // Run the URL-based video scraper
    const run = await client.actor("clockworks/tiktok-video-scraper").call({
      urls: [videoUrl],
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
    console.log(`[scrape-url] Video data keys:`, Object.keys(videoData));

    // Look for download URL in various possible field names
    const downloadUrl =
      (videoData as any)["videoDownloadUrl"] ||
      (videoData as any)["downloadUrl"] ||
      (videoData as any)["videoUrl"] ||
      (videoData as any)["video"] ||
      (videoData as any)["videoMeta"]?.["videoDownloadUrl"] ||
      (videoData as any)["videoMeta"]?.["downloadUrl"];

    console.log(
      `[scrape-url] Download URL found:`,
      downloadUrl ? "YES" : "NO"
    );
    if (downloadUrl) {
      console.log(`[scrape-url] URL: ${downloadUrl.substring(0, 100)}...`);
    }

    return NextResponse.json({ videoData, downloadUrl });
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
