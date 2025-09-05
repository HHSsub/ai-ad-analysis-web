// /src/app/page.tsx
"use client";

import { useState, ClipboardEvent, ChangeEvent, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle, Download, Upload } from "lucide-react";

// --- 타입 정의 ---
type VideoRow = { title: string; url: string; notes: string; };
type AnalysisStatus = 'welcome' | 'input' | 'loading' | 'completed';
type FulfilledResult = { status: 'fulfilled'; value: { id: string; title: string; url: string; notes: string; status: 'completed'; analysis: { [category: string]: { [feature: string]: string } }; }; };
type RejectedResult = { status: 'rejected'; reason: { id: string; title: string; url: string; status: 'failed'; error: string; }; };
type AnalysisResult = FulfilledResult | RejectedResult;

const INITIAL_ROWS = 30;

export default function Home() {
  const [videos, setVideos] = useState<VideoRow[]>(() => Array(INITIAL_ROWS).fill({ title: '', url: '', notes: '' }));
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('welcome');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const pasteStartCell = useRef<{ rowIndex: number; colIndex: number } | null>(null);

  const completedVideos = results.filter((r): r is FulfilledResult => r.status === 'fulfilled');
  const failedVideos = results.filter((r): r is RejectedResult => r.status === 'rejected');

  // URL에서 Google OAuth 결과 확인
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const authStatus = urlParams.get('auth');

    if (accessToken && authStatus === 'success') {
      setGoogleAccessToken(accessToken);
      // URL에서 파라미터 제거
      window.history.replaceState({}, document.title, window.location.pathname);
      alert('Google 계정 인증이 완료되었습니다. 이제 Drive 업로드가 가능합니다.');
    } else if (authStatus === 'error') {
      alert('Google 인증 중 오류가 발생했습니다.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // [수정됨] 단일 입력 처리 로직
  const handleInputChange = (index: number, field: keyof VideoRow, value: string) => {
    setVideos(currentVideos => 
      currentVideos.map((video, i) => 
        i === index ? { ...video, [field]: value } : video
      )
    );
  };

  // [수정됨] 붙여넣기 처리 로직
  const handlePaste = (e: ClipboardEvent<HTMLTableSectionElement>) => {
    if (!pasteStartCell.current) return;
    e.preventDefault();

    const { rowIndex: startRow, colIndex: startCol } = pasteStartCell.current;
    const pasteData = e.clipboardData.getData('text');
    const pastedRows = pasteData.split('\n').filter(row => row.trim() !== '');
    
    setVideos(currentVideos => {
      const newVideos = [...currentVideos];
      pastedRows.forEach((row, r_idx) => {
        const currentRowIndex = startRow + r_idx;
        if (currentRowIndex >= newVideos.length) return;

        const pastedCells = row.split('\t');
        pastedCells.forEach((cell, c_idx) => {
          const currentColIndex = startCol + c_idx;
          const currentVideo = { ...newVideos[currentRowIndex] };

          if (currentColIndex === 0) currentVideo.title = cell;
          else if (currentColIndex === 1) currentVideo.url = cell;
          else if (currentColIndex === 2) currentVideo.notes = cell;
          
          newVideos[currentRowIndex] = currentVideo;
        });
      });
      return newVideos;
    });
  };

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalysisStatus('completed');
    }
  };

  const handleDownload = async () => {
    if (!selectedVideo || selectedVideo.status !== 'fulfilled') return;
    
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
      a.download = `${selectedVideo.value.title}_분석결과.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('다운로드 오류:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleDriveUpload = async () => {
    if (!selectedVideo || selectedVideo.status !== 'fulfilled') return;
    
    try {
      const response = await fetch('/api/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          video: selectedVideo.value,
          accessToken: googleAccessToken 
        }),
      });

      const data = await response.json();
      
      if (data.authRequired) {
        // Google 인증이 필요한 경우
        window.location.href = data.authUrl;
        return;
      }

      if (!response.ok) throw new Error(data.message || '업로드 실패');
      
      alert(`Google Drive에 성공적으로 업로드되었습니다!\n파일명: ${data.fileName}`);
    } catch (error) {
      console.error('업로드 오류:', error);
      alert('업로드 중 오류가 발생했습니다.');
    }
  };

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
    const categories = Object.keys(analysisData);

    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl font-bold mb-4">{selectedVideo.value.title}</CardTitle>
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
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDriveUpload}
              className="hover:bg-green-50 transition-colors"
            >
              <Upload className="mr-2 h-4 w-4" />
              드라이브 업로드
              {!googleAccessToken && <span className="ml-1 text-xs">(인증 필요)</span>}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* 탭과 테이블 사이 간격 추가 */}
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
            
            {/* 각 카테고리별 테이블 */}
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
                      {Object.entries(analysisData[category]).map(([feature, value], index) => (
                        <TableRow 
                          key={feature}
                          className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'} hover:bg-blue-50 transition-colors`}
                        >
                          <TableCell className="font-medium text-gray-800 py-3">
                            {feature}
                          </TableCell>
                          <TableCell className={`py-3 ${
                            value === '누락됨' || value === '분석 불가' || value === '판단 불가' || value === '판단불가'
                              ? 'text-red-500 font-medium' 
                              : 'text-gray-700'
                          }`}>
                            {value}
                          </TableCell>
                        </TableRow>
                      ))}
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
                      <TableHead className="w-[30%] font-semibold text-gray-700">제목</TableHead>
                      <TableHead className="w-[50%] font-semibold text-gray-700">영상 링크 (URL)</TableHead>
                      <TableHead className="w-[20%] font-semibold text-gray-700">비고</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody onPaste={handlePaste}>
                    {videos.map((video, rowIndex) => (
                      <TableRow key={rowIndex} className="hover:bg-gray-50 transition-colors">
                        <TableCell onFocus={() => pasteStartCell.current = { rowIndex, colIndex: 0 }}>
                          <Input 
                            value={video.title} 
                            onChange={(e) => handleInputChange(rowIndex, 'title', e.target.value)} 
                            placeholder="영상 제목"
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </TableCell>
                        <TableCell onFocus={() => pasteStartCell.current = { rowIndex, colIndex: 1 }}>
                          <Input 
                            value={video.url} 
                            onChange={(e) => handleInputChange(rowIndex, 'url', e.target.value)} 
                            placeholder="https://youtube.com/watch?v=..."
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </TableCell>
                        <TableCell onFocus={() => pasteStartCell.current = { rowIndex, colIndex: 2 }}>
                          <Input 
                            value={video.notes} 
                            onChange={(e) => handleInputChange(rowIndex, 'notes', e.target.value)} 
                            placeholder="메모"
                            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                      className={`p-3 rounded-lg cursor-pointer transition-all duration-200 hover:bg-blue-50 hover:shadow-md ${
                        selectedVideo?.status === 'fulfilled' && selectedVideo.value.id === item.value.id 
                          ? 'bg-blue-100 border-2 border-blue-300 shadow-md' 
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <p className="font-medium text-gray-800 truncate">{item.value.title}</p>
                      <p className="text-xs text-gray-500 mt-1">156개 피처 분석 완료</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            
            <Card className="shadow-lg border-0">
              <CardHeader className="bg-gradient-to-r from-red-50 to-pink-50">
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
                      className={`p-3 rounded-lg cursor-pointer transition-all duration-200 hover:bg-red-50 hover:shadow-md ${
                        selectedVideo?.status === 'rejected' && selectedVideo.reason.id === item.reason.id 
                          ? 'bg-red-100 border-2 border-red-300 shadow-md' 
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      <p className="font-medium text-gray-800 truncate">{item.reason.title}</p>
                      <p className="text-xs text-red-600 mt-1 truncate">{item.reason.error}</p>
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
    </main>
  );
}
