import { create } from 'zustand';
import { VideoInput, AnalyzedVideo, AnalysisProgress } from '@/types/video';

interface VideoStore {
  // 상태
  videoInputs: VideoInput[];
  analyzedVideos: AnalyzedVideo[];
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  selectedVideo: AnalyzedVideo | null;
  
  // 액션
  setVideoInputs: (inputs: VideoInput[]) => void;
  addAnalyzedVideo: (video: AnalyzedVideo) => void;
  updateAnalyzedVideo: (id: string, updates: Partial<AnalyzedVideo>) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setProgress: (progress: AnalysisProgress | null) => void;
  setSelectedVideo: (video: AnalyzedVideo | null) => void;
  clearAll: () => void;
}

export const useVideoStore = create<VideoStore>((set, get) => ({
  // 초기 상태
  videoInputs: [],
  analyzedVideos: [],
  isAnalyzing: false,
  progress: null,
  selectedVideo: null,

  // 액션 구현
  setVideoInputs: (inputs) => set({ videoInputs: inputs }),
  
  addAnalyzedVideo: (video) => set((state) => ({
    analyzedVideos: [...state.analyzedVideos, video]
  })),
  
  updateAnalyzedVideo: (id, updates) => set((state) => ({
    analyzedVideos: state.analyzedVideos.map(video => 
      video.id === id ? { ...video, ...updates } : video
    )
  })),
  
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  
  setProgress: (progress) => set({ progress }),
  
  setSelectedVideo: (video) => set({ selectedVideo: video }),
  
  clearAll: () => set({
    videoInputs: [],
    analyzedVideos: [],
    isAnalyzing: false,
    progress: null,
    selectedVideo: null
  })
}));