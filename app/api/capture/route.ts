import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Helper function to get executable path
const getExecutablePath = async () => {
  if (process.env.NODE_ENV === 'production') {
    return await chromium.executablePath();
  }
  // For local development, you'll need to have Chrome installed.
  // You can also specify a path to a Chrome/Chromium executable.
  // On MacOS: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
  // On Linux: /usr/bin/google-chrome or similar
  // On Windows: C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
  // Or, install puppeteer full package locally: `npm i puppeteer` and use its bundled chromium
  // For simplicity, this example expects Chrome to be in a common location or `puppeteer` full to be installed.
  // const puppeteerFull = require('puppeteer');
  // return puppeteerFull.executablePath();
  return '/usr/bin/google-chrome'
};

export async function GET(req: NextRequest) {
  if (req.method !== 'GET') {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url') ? decodeURIComponent(searchParams.get('url')!) : '';
  const fullPage = searchParams.get('fullPage') !== 'false'; // Default true
  const quality = parseInt(searchParams.get('quality') || '80', 10);
  const type = searchParams.get('type') || 'png';
  const viewportWidth = Number(searchParams.get('viewportWidth')) || 2000;
  const viewportHeight = Number(searchParams.get('viewportHeight')) || 2000;
  const deviceScaleFactor = parseFloat(searchParams.get('deviceScaleFactor') || '3');

  return capturePage(url, fullPage, quality, type, { width: Number(viewportWidth), height: Number(viewportHeight), deviceScaleFactor });
}


export async function POST(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const { url, fullPage = true, quality = 80, type = 'png', viewport } = await req.json();
  console.log('url', url)

  return capturePage(url, fullPage, quality, type, viewport)
}


const capturePage = async (url: string, fullPage: boolean, quality: number, type: string, viewport: { width: number; height: number; deviceScaleFactor: number } | null) => {

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }
  console.log('url', url)

  let browser = null;

  try {
    const executablePath = await getExecutablePath();
    console.log(executablePath)

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: viewport || chromium.defaultViewport, // Use provided viewport or default
      executablePath: executablePath,
      headless: chromium.headless, // 'new' is recommended for newer puppeteer versions
    });

    const page = await browser.newPage();

    if (viewport) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.deviceScaleFactor || 3 });
    } else {
      // Set a default large viewport to help with full page capture,
      // though fullPage: true should handle scrolling.
      await page.setViewport({ width: 2000, height: 2000, deviceScaleFactor: 3 });
    }


    // await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }); // Wait until network is idle, timeout after 60s
    await page.goto(url)

    // Optional: Wait for a specific selector if needed
    console.log('Waiting for selector...');
    try {
      await page.waitForSelector('#my-specific-content', { timeout: 10000 });
      console.log('Selector found!');
    } catch (error) {
      console.error('Selector not found:', error);
    }

    // Optional: Inject styles to hide elements like cookie banners
    // await page.addStyleTag({ content: '.cookie-banner { display: none !important; }' });

    const screenshotBuffer = await page.screenshot({
      type: type as 'png' | 'jpeg' | undefined, // Cast for type safety
      quality: type === 'jpeg' || type === 'webp' ? Number(quality) : undefined, // Quality only for jpeg/webp
      fullPage: Boolean(fullPage),
      omitBackground: true, // If you want transparent background for PNG
    });

    // return new NextResponse(screenshotBuffer, {
    //   headers: {
    //     'Content-Type': `image/${type}`,
    //     'Content-Disposition': `attachment; filename="screenshot.${type}"`,
    //   },
    // });
    if (!screenshotBuffer) {
      return NextResponse.json({ error: 'Failed to capture screenshot' }, { status: 500 });
    }
    return new NextResponse(screenshotBuffer, {
      headers: {
        'Content-Type': `image/${type}`,
        'Content-Disposition': `attachment; filename="screenshot.${type}"`,
      },
    });

  } catch (error: unknown) {
    console.error('Error capturing screenshot:', error);
    // Send a more detailed error message if possible
    const errorMessage = error instanceof Error ? error.message : 'Failed to capture screenshot';
    const errorStack = process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined;
    return NextResponse.json({ error: 'Failed to capture screenshot', details: errorMessage, stack: errorStack }, { status: 500 });
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
}