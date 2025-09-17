function decodeEntities(s: string) {
  if (!s) return "";
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

async function fetchTimedtext(videoId: string, lang: string, asr = false): Promise<string> {
  const params = new URLSearchParams({ v: videoId, lang });
  if (asr) params.set('kind', 'asr');
  const url = `https://www.youtube.com/api/timedtext?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    // 유튜브는 쿠키 없이도 대부분 접근 가능. 필요시 헤더 최소화.
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) {
    return '';
  }
  const xml = await res.text();
  if (!xml || !xml.includes('<text')) return '';

  // <text ...> ... </text> 추출
  const lines: string[] = [];
  const regex = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const raw = m[1]
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const decoded = decodeEntities(raw);
    if (decoded) lines.push(decoded);
  }
  return lines.join(' ').trim();
}

export async function getSubtitlesWithFallback(videoId: string): Promise<{ text: string; language: string }> {
  const langCandidates = [
    'en', 'en-US', 'en-GB',
    'ko', 'ko-KR',
    'ja', 'zh', 'zh-CN', 'zh-TW',
    'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar',
  ];

  // 1) 표준 캡션 우선
  for (const lang of langCandidates) {
    try {
      const text = await fetchTimedtext(videoId, lang, false);
      if (text && text.length > 30) {
        return { text, language: lang };
      }
    } catch {}
  }

  // 2) 자동 생성 자막(asr)
  for (const lang of langCandidates) {
    try {
      const text = await fetchTimedtext(videoId, lang, true);
      if (text && text.length > 30) {
        return { text, language: `${lang}-asr` };
      }
    } catch {}
  }

  return { text: '', language: 'none' };
}