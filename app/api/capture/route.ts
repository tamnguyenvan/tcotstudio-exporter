import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const getExecutablePath = async () => {
  if (process.env.NODE_ENV === 'production') {
    return await chromium.executablePath();
  }
  return '/usr/bin/google-chrome'
};

const capturePage = async (url: string, fullPage: boolean, quality: number, type: string, viewport: { width: number; height: number; deviceScaleFactor: number } | null) => {
  console.debug('Capturing page:', url, fullPage, quality, type, viewport);

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let browser = null;

  try {
    const executablePath = await getExecutablePath();

    // Chromium args tối ưu cho Vercel + Emoji
    const launchArgs = [
      ...chromium.args,
      '--force-color-emoji',
      '--font-render-hinting=none',
      '--disable-font-subpixel-positioning',
      '--disable-features=VizDisplayCompositor',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ];

    browser = await puppeteer.launch({
      args: launchArgs,
      defaultViewport: viewport || chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Set viewport
    if (viewport) {
      await page.setViewport({ 
        width: viewport.width, 
        height: viewport.height, 
        deviceScaleFactor: viewport.deviceScaleFactor || 3 
      });
    } else {
      await page.setViewport({ 
        width: 2000, 
        height: 2000, 
        deviceScaleFactor: 6.6 
      });
    }

    // QUAN TRỌNG: Load emoji fonts từ CDN trước khi navigate
    await page.evaluateOnNewDocument(() => {
      // Inject emoji fonts CSS ngay khi page load
      const style = document.createElement('style');
      style.textContent = `
        @font-face {
          font-family: 'NotoColorEmoji';
          src: url('/fonts/NotoColorEmoji-Regular.ttf') format('truetype');
          font-display: swap;
        }
        
        * {
          font-family: "NotoColorEmoji", "Apple Color Emoji", system-ui, sans-serif !important;
        }
      `;
      document.head.appendChild(style);
    });

    // Navigate đến trang
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });

    // Đợi Google Fonts load xong
    await page.evaluate(() => {
      return new Promise((resolve) => {
        if (document.fonts) {
          document.fonts.ready.then(resolve);
        } else {
          // Fallback nếu không có document.fonts
          setTimeout(resolve, 3000);
        }
      });
    });

    // Thêm thời gian chờ bổ sung cho emoji
    try {
      await page.waitForSelector('#my-specific-content', { timeout: 2000 });
    } catch {
      console.error('Finished waiting for emoji to load');
    }

    // Force re-render emoji nếu cần
    // await page.evaluate(() => {
    //   // Trigger repaint cho emoji elements
    //   const emojiElements = document.querySelectorAll('*');
    //   emojiElements.forEach(el => {
    //     const text = el.textContent || '';
    //     // Check if contains emoji (basic check)
    //     if (/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(text)) {
    //       // Force repaint
    //       el.style.opacity = '0.99';
    //       setTimeout(() => {
    //         el.style.opacity = '1';
    //       }, 10);
    //     }
    //   });
    // });

    // Wait for specific selector if needed
    try {
      await page.waitForSelector('#my-specific-content', { timeout: 10000 });
    } catch {
      console.error('Finished waiting');
    }

    await page.evaluate(() => document.body.style.background = 'transparent');
    
    const screenshotBuffer = await page.screenshot({
      type: type as 'png' | 'jpeg' | undefined,
      quality: type === 'jpeg' || type === 'webp' ? Number(quality) : undefined,
      clip: {
        x: 548,
        y: 575,
        width: 890,
        height: 1000,
      },
      omitBackground: true,
    });

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
    const errorMessage = error instanceof Error ? error.message : 'Failed to capture screenshot';
    return NextResponse.json({ 
      error: 'Failed to capture screenshot', 
      details: errorMessage 
    }, { status: 500 });
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url') ? decodeURIComponent(searchParams.get('url')!) : '';
  const fullPage = searchParams.get('fullPage') !== 'false';
  const quality = parseInt(searchParams.get('quality') || '80', 10);
  const type = searchParams.get('type') || 'png';
  const viewportWidth = Number(searchParams.get('viewportWidth')) || 2000;
  const viewportHeight = Number(searchParams.get('viewportHeight')) || 2000;
  const deviceScaleFactor = parseFloat(searchParams.get('deviceScaleFactor') || '6.6');

  return capturePage(url, fullPage, quality, type, { width: viewportWidth, height: viewportHeight, deviceScaleFactor });
}

export async function POST(req: NextRequest) {
  const { url, fullPage = true, quality = 80, type = 'png', viewport } = await req.json();
  return capturePage(url, fullPage, quality, type, viewport);
}