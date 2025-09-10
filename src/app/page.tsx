// /src/app/page.tsx
"use client";

import { useState, ClipboardEvent, ChangeEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle, Download, Upload, Plus, Trash2, BarChart3 } from "lucide-react";
import toast from 'react-hot-toast';

// --- 타입 정의 ---
type VideoRow = { title: string; url: string; notes: string; };
type AnalysisStatus = 'welcome' | 'input' | 'loading' | 'completed';

type CompletionStats = {
  completed: number;
  incomplete: number;
  total: number;
  percentage: number;
};

type FulfilledResult = { 
  status: 'fulfilled'; 
  value: { 
    id: string; 
    title: string; 
    url: string; 
    notes: string; 
    status: 'completed'; 
    analysis: { [category: string]: { [feature: string]: string } };
    completionStats: CompletionStats;
    scriptLanguage: string;
  }; 
};

type RejectedResult = { 
  status: 'rejected'; 
  reason: { 
    id: string; 
    title: string; 
    url: string; 
    status: 'failed'; 
    error: string; 
  }; 
};

type AnalysisResult = FulfilledResult | RejectedResult;

const INITIAL_ROWS = 10; // 초기 행 수를 줄임

export default function Home() {
  const [videos, setVideos] = useState<VideoRow[]>(() => 
    Array(INITIAL_ROWS).fill({ title: '', url: '', notes: '' })
  );
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('welcome');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completedVideos = results.filter((r): r is FulfilledResult => r.status === 'fulfilled');
  const failedVideos = results.filter((r): r is RejectedResult => r.status === 'rejected');

  // 테이블 관련 함수들
  const handleInputChange = (index: number, field: keyof VideoRow, value: string) => {
    setVideos(currentVideos => 
      currentVideos.map((video, i) => 
        i === index ? { ...video, [field]: value } : video
      )
    );
  };

  const addNewRow = () => {
    setVideos(prevVideos => [...prevVideos, { title: '', url: '', notes: '' }]);
    toast.success('새 행이 추가되었습니다.');
  };

  const removeRow = (index: number) => {
    if (videos.length > 1) {
      setVideos(prevVideos => prevVideos.filter((_, i) => i !== index));
      toast.success('행이 삭제되었습니다.');
    } else {
      toast.error('최소 하나의 행은 유지되어야 합니다.');
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    e.preventDefault();

    const pasteData = e.clipboardData.getData('text');
    if (!pasteData) return;

    const pastedRows = pasteData.split('\n').filter(row => row.trim() !== '');
    
    setVideos(currentVideos => {
      const newVideos = [...currentVideos];
      
      pastedRows.forEach((row, r_idx) => {
        const currentRowIndex = rowIndex + r_idx;
        
        // 필요한 경우 행 자동 추가
        if (currentRowIndex >= newVideos.length) {
          const additionalRows = currentRowIndex - newVideos.length + 1;
          for (let i = 0; i < additionalRows; i++) {
            newVideos.push({ title: '', url: '', notes: '' });
          }
        }

        const pastedCells = row.split('\t');
        const currentVideo = { ...newVideos[currentRowIndex] };

        pastedCells.forEach((cell, cellIndex) => {
          const targetColIndex = colIndex + cellIndex;
          if (targetColIndex === 0) {
            currentVideo.title = cell.trim();
          } else if (targetColIndex === 1) {
            currentVideo.url = cell.trim();
          } else if (targetColIndex === 2) {
            currentVideo.notes = cell.trim();
          }
        });

        newVideos[currentRowIndex] = currentVideo;
      });
      
      return newVideos;
    });

    toast.success(`${pastedRows.length}행의 데이터가 붙여넣어졌습니다.`);
  };

  // 분석 시작
  const handleAnalyze = async () => {
    setAnalysisStatus('loading');
    setError(null);
    setResults([]);
    setSelectedVideo(null);

    const videosToAnalyze = videos.filter(v => v.url.trim() !== '');
    if (videosToAnalyze.length === 0) {
      setError("분석할 영상의 URL을 하나 이상 입력해주세요.");
      setAnalysisStatus('input');
      return;
    }

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videos: videosToAnalyze }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `서버 에러: ${response.status}`);
      
      setResults(data.results);
      
      // 분석 결과 통계
      const successCount = data.results.filter((r: AnalysisResult) => r.status === 'fulfilled').length;
      const failCount = data.results.filter((r: AnalysisResult) => r.status === 'rejected').length;
      
      toast.success(`분석 완료! 성공: ${successCount}개, 실패: ${failCount}개`);
    } catch (err: any) {
      setError(err.message);
      toast.error(`분석 중 오류 발생: ${err.message}`);
    } finally {
      setAnalysisStatus('completed');
    }
  };

  // 다운로드 기능
  const handleDownload = async () => {
    if (!selectedVideo || selectedVideo.status !== 'fulfilled') {
      toast.error('분석 완료된 영상을 선택해주세요.');
      return;
    }
    
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video: selectedVideo.value }),
      });

      if (!response.ok) throw new Error('다운로드 실패');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${selectedVideo.value.title}_분석결과.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('분석 결과가 다운로드되었습니다.');
    } catch (error) {
      console.error('다운로드 오류:', error);
      toast.error('다운로드 중 오류가 발생했습니다.');
    }
  };

  // 상세 분석 결과 렌더링
  const renderAnalysisDetail = () => {
    if (!selectedVideo) return (
      <div className="text-center text-gray-500 mt-10">
        <p className="text-lg">목록에서 영상을 선택하여 상세 분석 결과를 확인하세요.</p>
      </div>
    );
    
    if (selectedVideo.status === 'rejected') {
      return (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-red-600">분석 실패</CardTitle>
          </CardHeader>
          <CardContent>
            <p><strong>영상 제목:</strong> {selectedVideo.reason.title}</p>
            <p><strong>실패 원인:</strong> {selectedVideo.reason.error}</p>
          </CardContent>
        </Card>
      );
    }

    const analysisData = selectedVideo.value.analysis;
    const stats = selectedVideo.value.completionStats;
    const categories = Object.keys(analysisData);

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl font-bold mb-4">{selectedVideo.value.title}</CardTitle>
          
          {/* 완료도 통계 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-gray-600">완료</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.incomplete}</div>
              <div className="text-sm text-gray-600">미완성</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-gray-600">전체</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.percentage}%</div>
              <div className="text-sm text-gray-600">완료율</div>
            </div>
          </div>

          {/* 언어 정보 */}
          <div className="mb-4 text-sm text-gray-600">
            <span className="font-medium">자막 언어:</span> {selectedVideo.value.scriptLanguage || 'none'}
          </div>
          
          <div className="flex space-x-3 mb-6">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownload}
              className="hover:bg-blue-50 transition-colors"
            >
              <Download className="mr-2 h-4 w-4" />
              결과 다운로드
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={categories[0]} className="w-full">
            <TabsList className="grid w-full grid-cols-3 md:grid-cols-4 lg:grid-cols-5 mb-8">
              {categories.map(category => (
                <TabsTrigger 
                  key={category} 
                  value={category}
                  className="text-sm font-medium transition-all hover:bg-gray-100"
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {categories.map(category => (
              <TabsContent key={category} value={category} className="mt-6">
                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-[35%] font-semibold text-gray-700">피처</TableHead>
                        <TableHead className="font-semibold text-gray-700">분석 결과</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(analysisData[category]).map(([feature, value], index) => {
                        const isIncomplete = String(value).startsWith('분석불가/') || 
                                           String(value).startsWith('판단불가/') || 
                                           value === 'N/A' || 
                                           value === '미확인';
                        
                        return (
                          <TableRow 
                            key={feature}
                            className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'} hover:bg-blue-50 transition-colors`}
                          >
                            <TableCell className="font-medium text-gray-800 py-3">
                              {feature}
                            </TableCell>
                            <TableCell className={`py-3 ${
                              isIncomplete
                                ? 'text-red-500 font-medium' 
                                : 'text-gray-700'
                            }`}>
                              {value}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    );
  };

  return (
    <main className="container mx-auto p-4 md:p-8 min-h-screen bg-gray-50">
      <div className="flex justify-between items-center mb-8">
        <h1 
          className="text-4xl font-bold cursor-pointer text-gray-800 hover:text-blue-600 transition-colors" 
          onClick={() => setAnalysisStatus('welcome')}
        >
          AI 광고 영상 분석
        </h1>
        {analysisStatus === 'welcome' && (
          <div className="space-x-3">
            <Button 
              disabled 
              className="bg-gray-300 text-gray-500 cursor-not-allowed"
            >
              수집 자동화 (개발중)
            </Button>
            <Button 
              variant="default" 
              onClick={() => setAnalysisStatus('input')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2 transition-colors"
            >
              링크 수동 추가
            </Button>
          </div>
        )}
      </div>

      {analysisStatus === 'input' && (
        <>
          <Card className="shadow-lg border-0 mb-8">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardTitle className="text-xl font-bold text-gray-800">분석할 영상 링크 입력</CardTitle>
              <p className="text-sm text-gray-600 mt-2">
                엑셀/시트에서 데이터를 복사한 후, 아래 표의 시작할 셀을 클릭하고 붙여넣기 (Ctrl+V) 하세요.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-100">
                      <TableHead className="w-[25%] font-semibold text-gray-700">제목</TableHead>
                      <TableHead className="w-[40%] font-semibold text-gray-700">영상 링크 (URL)</TableHead>
                      <TableHead className="w-[25%] font-semibold text-gray-700">비고</TableHead>
                      <TableHead className="w-[10%] font-semibold text-gray-700 text-center">삭제</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {videos.map((video, rowIndex) => (
                      <TableRow key={rowIndex} className="hover:bg-gray-50 transition-colors">
                        <TableCell>
                          <Input 
                            value={video.title} 
                            onChange={(e) => handleInputChange(rowIndex, 'title', e.target.value)} 
                            onPaste={(e) => handlePaste(e, rowIndex, 0)}
                            placeholder="영상 제목"
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </TableCell>
                        <TableCell>
                          <Input 
                            value={video.url} 
                            onChange={(e) => handleInputChange(rowIndex, 'url', e.target.value)} 
                            onPaste={(e) => handlePaste(e, rowIndex, 1)}
                            placeholder="https://youtube.com/watch?v=..."
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </TableCell>
                        <TableCell>
                          <Input 
                            value={video.notes} 
                            onChange={(e) => handleInputChange(rowIndex, 'notes', e.target.value)} 
                            onPaste={(e) => handlePaste(e, rowIndex, 2)}
                            placeholder="메모"
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeRow(rowIndex)}
                            disabled={videos.length <= 1}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* 행 추가 버튼 */}
              <div className="mt-4 text-center">
                <Button
                  variant="outline"
                  onClick={addNewRow}
                  className="bg-green-50 text-green-700 border-green-300 hover:bg-green-100 hover:border-green-400"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  행 추가
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <div className="text-center my-8">
            <Button 
              onClick={handleAnalyze} 
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3 text-lg transition-colors shadow-lg"
            >
              분석 시작
            </Button>
          </div>
        </>
      )}

      {analysisStatus === 'loading' && (
        <div className="text-center my-20">
          <Loader2 className="mx-auto h-16 w-16 animate-spin text-blue-600" />
          <p className="mt-6 text-xl text-gray-700 font-medium">영상 데이터를 분석 중입니다. 잠시만 기다려주세요...</p>
          <p className="mt-2 text-sm text-gray-500">156가지 피처를 상세히 분석하고 있습니다.</p>
          <p className="mt-1 text-sm text-gray-500">다국어 영상도 지원됩니다.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg relative mb-8 shadow-sm" role="alert">
          <strong className="font-bold">오류 발생: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {analysisStatus === 'completed' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 flex flex-col gap-6">
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50">
                <CardTitle className="flex items-center text-lg font-bold text-gray-800">
                  <CheckCircle className="mr-3 text-green-500 h-5 w-5" /> 
                  분석 완료 ({completedVideos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto p-4">
                <ul className="space-y-3">
                  {completedVideos.map(item => (
                    <li 
                      key={item.value.id} 
                      onClick={() => setSelectedVideo(item)} 
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        selectedVideo?.value?.id === item.value.id 
                          ? 'bg-blue-100 text-blue-800 border-2 border-blue-200' 
                          : 'hover:bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <div className="font-medium mb-1">{item.value.title}</div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">완료도: {item.value.completionStats.percentage}%</span>
                        <span className="text-gray-500">
                          {item.value.completionStats.completed}/{item.value.completionStats.total}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full transition-all" 
                          style={{ width: `${item.value.completionStats.percentage}%` }}
                        />
                      </div>
                      {item.value.scriptLanguage && item.value.scriptLanguage !== 'none' && (
                        <div className="text-xs text-blue-600 mt-1">
                          언어: {item.value.scriptLanguage}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-red-50 to-rose-50">
                <CardTitle className="flex items-center text-lg font-bold text-gray-800">
                  <AlertCircle className="mr-3 text-red-500 h-5 w-5" /> 
                  분석 미완 ({failedVideos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto p-4">
                <ul className="space-y-3">
                  {failedVideos.map(item => (
                    <li 
                      key={item.reason.id} 
                      onClick={() => setSelectedVideo(item)} 
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        selectedVideo?.reason?.id === item.reason.id 
                          ? 'bg-red-100 text-red-800 border-2 border-red-200' 
                          : 'hover:bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <div className="font-medium text-red-700">{item.reason.title}</div>
                      <div className="text-sm text-red-500 mt-1">분석 실패: {item.reason.error}</div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {renderAnalysisDetail()}
          </div>
        </div>
      )}

      {analysisStatus === 'welcome' && (
        <div className="text-center my-20">
          <h2 className="text-3xl font-semibold text-gray-800 mb-4">AI 광고 영상 분석을 시작하세요</h2>
          <p className="text-lg text-gray-600 mb-4">YouTube 영상 링크를 입력하고 156가지 상세 피처를 분석해보세요.</p>
          <div className="flex justify-center items-center space-x-8 mb-8">
            <div className="text-center">
              <BarChart3 className="mx-auto h-12 w-12 text-blue-600 mb-2" />
              <p className="text-sm text-gray-600">156가지 상세 분석</p>
            </div>
            <div className="text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-green-600 mb-2" />
              <p className="text-sm text-gray-600">완료도 실시간 표시</p>
            </div>
            <div className="text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-purple-600 mb-2" />
              <p className="text-sm text-gray-600">분석불가 사유 제공</p>
            </div>
          </div>
          <Button 
            onClick={() => setAnalysisStatus('input')} 
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 text-lg transition-colors shadow-lg"
          >
            분석 시작하기
          </Button>
          <p className="text-sm text-gray-500 mt-4">한국어, 영어, 일본어, 중국어 등 다국어 영상 지원</p>
        </div>
      )}
    </main>
  );
}