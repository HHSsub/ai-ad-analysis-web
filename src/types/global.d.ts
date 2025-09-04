// 전역 타입 정의
declare global {
  var analysisProgress: {
    total: number;
    completed: number;
    current: string;
    stage: 'youtube' | 'gemini' | 'complete';
    videos: any[];
  } | undefined;
}

export {};