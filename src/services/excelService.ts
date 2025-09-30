// src/services/excelService.ts - CSV만 사용

import * as XLSX from 'xlsx';
import { AnalyzedVideo } from '@/types/video';
import { calculateHybridScore } from './metricsService';
import { loadFeaturesFromCSV } from '@/utils/csvLoader';

export function exportToExcel(videos: AnalyzedVideo[]): void {
  const workbook = XLSX.utils.book_new();
  
  const mainData = createMainDataSheet(videos);
  XLSX.utils.book_append_sheet(workbook, mainData, '분석결과');
  
  const scoreData = createScoreDataSheet(videos);
  XLSX.utils.book_append_sheet(workbook, scoreData, '점수요약');
  
  const metaData = createMetaDataSheet(videos);
  XLSX.utils.book_append_sheet(workbook, metaData, '메타데이터');
  
  const fileName = `YouTube_분석결과_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
}

function createMainDataSheet(videos: AnalyzedVideo[]) {
  const VIDEO_FEATURES = loadFeaturesFromCSV(); // ✅ CSV에서 로드
  
  const headers = [
    '영상제목',
    '영상링크', 
    '비고',
    '분석상태',
    '생성시점',
    ...VIDEO_FEATURES.map(f => `${f.no}.${f.category}_${f.item}`)
  ];
  
  const rows = videos.map(video => {
    const row = [
      video.title,
      video.url,
      video.notes || '',
      video.status === 'completed' ? '완료' : 
      video.status === 'failed' ? '실패' : 
      video.status === 'incomplete' ? '불완전' : '분석중',
      new Date(video.createdAt).toLocaleString('ko-KR')
    ];
    
    VIDEO_FEATURES.forEach(feature => {
      const key = `feature_${feature.no}`;
      row.push(video.features?.[key] || 'N/A');
    });
    
    return row;
  });
  
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

function createScoreDataSheet(videos: AnalyzedVideo[]) {
  const headers = [
    '영상제목',
    '분석상태',
    '하이브리드점수',
    '정량지표_관심도',
    '정량지표_유지력', 
    '정량지표_성장력',
    '정량지표_종합',
    '정성지표_오프닝훅',
    '정성지표_브랜드전달',
    '정성지표_스토리구조',
    '정성지표_시각완성도',
    '정성지표_음향설득력',
    '정성지표_차별성독창성',
    '정성지표_메시지타겟적합도',
    '정성지표_CTA효율성',
    '정성지표_종합'
  ];
  
  const rows = videos.map(video => {
    if (video.status !== 'completed') {
      return [
        video.title,
        video.status === 'failed' ? '실패' : 
        video.status === 'incomplete' ? '불완전' : '분석중',
        'N/A', 'N/A', 'N/A', 'N/A', 'N/A',
        'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'
      ];
    }
    
    const score = video.hybridScore || calculateHybridScore(video);
    
    return [
      video.title,
      '완료',
      score.final.toFixed(2),
      score.quantitative.interestIndex.toFixed(2),
      score.quantitative.retentionIndex.toFixed(2),
      score.quantitative.growthIndex.toFixed(2),
      score.quantitative.finalScore.toFixed(2),
      score.qualitative.openingHookIndex.toFixed(2),
      score.qualitative.brandDeliveryIndex.toFixed(2),
      score.qualitative.storyStructureIndex.toFixed(2),
      score.qualitative.visualAestheticsIndex.toFixed(2),
      score.qualitative.audioPersuasionIndex.toFixed(2),
      score.qualitative.uniquenessIndex.toFixed(2),
      score.qualitative.messageTargetFitIndex.toFixed(2),
      score.qualitative.ctaEfficiencyIndex.toFixed(2),
      score.qualitative.qualityScore.toFixed(2)
    ];
  });
  
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

function createMetaDataSheet(videos: AnalyzedVideo[]) {
  const headers = [
    '영상제목',
    '채널명',
    '업로드일',
    '조회수',
    '좋아요',
    '댓글수',
    '영상길이',
    '스크립트언어'
  ];
  
  const rows = videos.map(video => {
    if (!video.youtubeData) {
      return [video.title, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'];
    }
    
    return [
      video.title,
      video.youtubeData.channelTitle,
      new Date(video.youtubeData.publishedAt).toLocaleDateString('ko-KR'),
      video.youtubeData.viewCount.toLocaleString(),
      video.youtubeData.likeCount.toLocaleString(),
      video.youtubeData.commentCount.toLocaleString(),
      video.youtubeData.duration,
      video.scriptLanguage || 'N/A'
    ];
  });
  
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

export function exportSingleVideo(video: AnalyzedVideo): void {
  exportToExcel([video]);
}

export function exportFilteredVideos(
  videos: AnalyzedVideo[],
  filter: (video: AnalyzedVideo) => boolean
): void {
  const filtered = videos.filter(filter);
  exportToExcel(filtered);
}
