// src/utils/captureScreenshotServerSide.ts
export interface CaptureOptions {
  url: string;
  fullPage?: boolean;
  quality?: number; // 0-100 for jpeg/webp
  type?: 'png' | 'jpeg' | 'webp';
  viewport?: { width: number; height: number; deviceScaleFactor?: number };
  fileName?: string;
}

export const capturePageViaAPI = async (options: CaptureOptions): Promise<void> => {
  const {
    url,
    fullPage = true,
    quality = 80,
    type = 'png',
    viewport,
    fileName = `screenshot-${new Date().toISOString()}.${type}`,
  } = options;

  try {
    const response = await fetch('/api/capture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, fullPage, quality, type, viewport }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || `API Error: ${response.statusText}`);
    }

    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = objectURL;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectURL); // Clean up

    console.log('Screenshot captured via API and download initiated!');

  } catch (error) {
    console.error('Error capturing screenshot via API:', error);
    alert(`Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`);
  }
};