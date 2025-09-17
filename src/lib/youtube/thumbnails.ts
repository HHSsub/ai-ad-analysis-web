export function getThumbnailUrls(videoId: string): string[] {
  // 고해상도 → 저해상도 순 후보
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
}

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || '';
    const mimeType = ct.includes('png') ? 'image/png' : 'image/jpeg';
    return { data: buf.toString('base64'), mimeType };
  } catch {
    return null;
  }
}

/**
 * GoogleGenerativeAI SDK의 inlineData 파트 배열 생성
 */
export async function fetchInlineImageParts(urls: string[], maxCount = 2): Promise<any[]> {
  const parts: any[] = [];
  for (const url of urls) {
    if (parts.length >= maxCount) break;
    const res = await fetchAsBase64(url);
    if (res) {
      parts.push({
        inlineData: {
          data: res.data,
          mimeType: res.mimeType,
        },
      });
    }
  }
  return parts;
}