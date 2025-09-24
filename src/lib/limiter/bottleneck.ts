import Bottleneck from 'bottleneck';

// Gemini API Rate Limiter
const geminiLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1000, // 1초당 1회 요청
  reservoir: 60, // 1분당 60회 제한
  reservoirRefreshAmount: 60,
  reservoirRefreshInterval: 60 * 1000, // 1분
});

// YouTube API Rate Limiter
const youtubeLimiter = new Bottleneck({
  maxConcurrent: 3,
  minTime: 100, // 초당 10회
  reservoir: 10000, // 일일 할당량
  reservoirRefreshAmount: 10000,
  reservoirRefreshInterval: 24 * 60 * 60 * 1000, // 24시간
});

// SerpAPI Rate Limiter
const serpLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1000, // 초당 1회
});

// Google Drive API Rate Limiter
const driveLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: 200, // 초당 5회
});

export {
  geminiLimiter,
  youtubeLimiter,
  serpLimiter,
  driveLimiter
};

// 기본 export (기존 코드와의 호환성을 위해)
export default geminiLimiter;
