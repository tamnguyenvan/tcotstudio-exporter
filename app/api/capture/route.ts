import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
// import fs from 'fs/promises'; // Để đọc file font
import path from 'path';     // Để xử lý đường dẫn file

const DEFAULT_DEVICE_SCALE_FACTOR = 1.2;

const getExecutablePath = async () => {
  if (process.env.NODE_ENV === 'production') {
    return await chromium.executablePath();
  }
  // Đường dẫn cho local dev, điều chỉnh nếu cần
  // Ví dụ cho macOS: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  // Ví dụ cho Linux: '/usr/bin/google-chrome'
  // Ví dụ cho Windows: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  // Hãy đảm bảo đường dẫn này đúng với máy của bạn
  return '/usr/bin/google-chrome'; // Hoặc đường dẫn phù hợp cho local
};

// Biến global để cache font data, tránh đọc file nhiều lần
const fontDataUrl: string | null = null;

const getFontDataUrl = async () => {
  if (fontDataUrl) {
    return fontDataUrl;
  }
  try {
    // Font phải nằm trong thư mục public/fonts của project Next.js của bạn
    // process.cwd() sẽ trỏ đến thư mục gốc của project khi chạy trên Vercel
    const fontPath = path.join(process.cwd(), 'fonts', 'NotoColorEmoji-Regular.ttf');
    // const fontBuffer = await fs.readFile(fontPath);
    // const fontBase64 = fontBuffer.toString('base64');
    // fontDataUrl = `data:font/ttf;base64,${fontBase64}`;
    // return fontDataUrl;
    return fontPath;
  } catch (error) {
    console.error('Error loading font for Data URI:', error);
    // Fallback hoặc throw error nếu font là bắt buộc
    return null;
  }
};


const capturePage = async (url: string, fullPage: boolean, quality: number, type: string, viewport: { width: number; height: number; deviceScaleFactor: number } | null) => {
  console.debug('Capturing page:', url, fullPage, quality, type, viewport);

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let browser = null;

  try {
    const executablePath = await getExecutablePath();
    const currentFontDataUrl = await getFontDataUrl(); // Lấy Data URI của font

    const launchArgs = [
      ...chromium.args,
      '--font-render-hinting=none', // Cải thiện render font trên một số môi trường Linux
      '--disable-font-subpixel-positioning',
      // '--force-color-profile=srgb', // Bạn có thể thử thêm cờ này
      // '--force-color-emoji', // Đã có, tốt!
      // '--disable-features=VizDisplayCompositor', // Có thể gây vấn đề trên một số phiên bản, cân nhắc
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Quan trọng cho môi trường hạn chế tài nguyên như Lambda
      // '--single-process', // Cân nhắc nếu có vấn đề về process
    ];
    
    // Xóa cờ không tương thích nếu có
    const incompatibleFlags = ['--disable-gpu', '--disable-software-rasterizer'];
    const finalArgs = launchArgs.filter(arg => !incompatibleFlags.some(badFlag => arg.startsWith(badFlag)));
    finalArgs.push(...chromium.args.filter(arg => incompatibleFlags.some(badFlag => arg.startsWith(badFlag) && arg.includes('headless')))); // giữ lại các flag headless của chromium


    browser = await puppeteer.launch({
      args: finalArgs,
      defaultViewport: viewport || chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless, // Nên là true trên serverless
    });

    const page = await browser.newPage();

    if (viewport) {
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor || DEFAULT_DEVICE_SCALE_FACTOR
      });
    } else {
      await page.setViewport({
        width: 2000,
        height: 2000,
        deviceScaleFactor: DEFAULT_DEVICE_SCALE_FACTOR // Giảm deviceScaleFactor mặc định nếu quá lớn gây nặng
      });
    }
    
    // QUAN TRỌNG: Load emoji fonts bằng Data URI
    if (currentFontDataUrl) {
      // await page.evaluateOnNewDocument((fontUrl: string) => {
      //   const style = document.createElement('style');
      //   style.textContent = `
      //     @font-face {
      //       font-family: 'NotoColorEmoji';
      //       src: url('${fontUrl}') format('truetype');
      //       font-display: swap; /* Hoặc block nếu muốn đợi font load xong hẳn */
      //     }
          
      //     /* Áp dụng font cho tất cả các element, hoặc cụ thể hơn nếu muốn */
      //     * {
      //       /* Thêm các font fallback phổ biến và system-ui */
      //       font-family: "NotoColorEmoji", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Sans JP", system-ui, sans-serif !important;
      //     }
      //   `;
      //   document.head.appendChild(style);
      // }, currentFontDataUrl); // Truyền Data URI vào

      console.log('Loading emoji font:', currentFontDataUrl);
      await chromium.font(currentFontDataUrl);
    } else {
      console.log('No emoji font data URL provided');
    }


    await page.goto(url, {
      waitUntil: 'networkidle0', // Đợi network yên tĩnh
      timeout: 30000
    });

    // Đợi font render (có thể cần thiết)
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    
    // Thêm một chút delay nhỏ để đảm bảo mọi thứ đã render xong, đặc biệt là emoji
    // await new Promise(resolve => setTimeout(resolve, 500)); // 500ms, điều chỉnh nếu cần

    // Bạn có thể thử đợi một selector cụ thể chứa emoji nếu biết
    // try {
    //   await page.waitForSelector('body', { timeout: 5000 }); // Đợi body render
    // } catch (e) {
    //   console.warn('Timeout waiting for body, continuing...');
    // }

    await page.evaluate(() => document.body.style.background = 'transparent');

    const screenshotBuffer = await page.screenshot({
      type: type as 'png' | 'jpeg' | undefined,
      quality: (type === 'jpeg' || type === 'webp') ? Number(quality) : undefined,
      // fullPage: fullPage, // Bạn có dùng fullPage không? Hiện tại đang clip
      clip: { // Đảm bảo clip này đúng và nội dung có emoji nằm trong vùng clip
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
  const fullPage = searchParams.get('fullPage') !== 'false'; // Biến này chưa được dùng trong capturePage
  const quality = parseInt(searchParams.get('quality') || '80', 10);
  const type = searchParams.get('type') || 'png';
  const viewportWidth = Number(searchParams.get('viewportWidth')) || 2000;
  const viewportHeight = Number(searchParams.get('viewportHeight')) || 2000;
  const deviceScaleFactor = parseFloat(searchParams.get('deviceScaleFactor') || DEFAULT_DEVICE_SCALE_FACTOR.toString()); // Giảm mặc định

  return capturePage(url, fullPage, quality, type, { width: viewportWidth, height: viewportHeight, deviceScaleFactor });
}

export async function POST(req: NextRequest) {
  const { url, fullPage = true, quality = 80, type = 'png', viewport } = await req.json();
  return capturePage(url, fullPage, quality, type, viewport);
}
