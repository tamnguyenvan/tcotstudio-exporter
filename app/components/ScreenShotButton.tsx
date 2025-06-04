'use client'
import React from 'react';
import { capturePageViaAPI } from '../utils/capture-screenshot-server-side';

const ScreenshotButtonServer: React.FC = () => {
  const handleCaptureCurrentPage = () => {
    if (typeof window !== 'undefined') {
      capturePageViaAPI({
        url: window.location.href, // Chụp trang hiện tại
        fullPage: true,
        type: 'png',
        // viewport: { width: 1920, height: 1080, deviceScaleFactor: 2 } // Tùy chọn viewport
        fileName: `current-page-${Date.now()}.png`
      });
    }
  };

  const handleCaptureExternalPage = () => {
    const externalUrl = prompt("Enter URL to capture:", "https://studio.tcot.vn/export?id=11&side=front");
    if (externalUrl) {
      capturePageViaAPI({
        url: externalUrl,
        fullPage: true,
        type: 'png',
        fileName: `external-page-${Date.now()}.png`
      });
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={handleCaptureCurrentPage}
        className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-800"
      >
        Capture Current Page (Server-side)
      </button>
      <button
        onClick={handleCaptureExternalPage}
        className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-800"
      >
        Capture External URL (Server-side)
      </button>
    </div>
  );
};

export default ScreenshotButtonServer;