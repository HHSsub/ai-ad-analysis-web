declare module 'youtube-captions-scraper' {
  interface Subtitle {
    text: string;
    start: number;
    dur: number;
  }
  export function getSubtitles(options: { videoID: string; lang?: string }): Promise<Subtitle[]>;
}
