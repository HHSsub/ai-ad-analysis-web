'use client';

import React, { useState, useRef } from 'react';
import { Plus, Trash2, Play } from 'lucide-react';
import { VideoInput } from '@/types/video';
import { useVideoStore } from '@/store/videoStore';
import toast from 'react-hot-toast';

const VideoInputTable: React.FC = () => {
  const [inputs, setInputs] = useState<VideoInput[]>(
    Array.from({ length: 30 }, () => ({ title: '', url: '', note: '' }))
  );
  const { setVideoInputs, setIsAnalyzing } = useVideoStore();
  const tableRef = useRef<HTMLTableElement>(null);

  // 테이블 데이터 변경 처리
  const handleInputChange = (index: number, field: keyof VideoInput, value: string) => {
    const newInputs = [...inputs];
    newInputs[index] = { ...newInputs[index], [field]: value };
    setInputs(newInputs);
  };

  // 행 추가
  const addRow = () => {
    setInputs([...inputs, { title: '', url: '', note: '' }]);
  };

  // 행 삭제
  const removeRow = (index: number) => {
    if (inputs.length > 1) {
      const newInputs = inputs.filter((_, i) => i !== index);
      setInputs(newInputs);
    }
  };

  // 전체 초기화
  const clearAll = () => {
    setInputs(Array.from({ length: 30 }, () => ({ title: '', url: '', note: '' })));
  };

  // 클립보드에서 데이터 붙여넣기 처리
  const handlePaste = (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain');
    const rows = pastedData.split('\n').filter(row => row.trim());
    
    const newInputs = [...inputs];
    
    rows.forEach((row, i) => {
      const targetRowIndex = rowIndex + i;
      if (targetRowIndex >= newInputs.length) {
        // 필요한 경우 행 추가
        while (newInputs.length <= targetRowIndex) {
          newInputs.push({ title: '', url: '', note: '' });
        }
      }
      
      const columns = row.split('\t');
      const fields: (keyof VideoInput)[] = ['title', 'url', 'note'];
      
      columns.forEach((col, j) => {
        const targetColIndex = colIndex + j;
        if (targetColIndex < fields.length && targetRowIndex < newInputs.length) {
          newInputs[targetRowIndex][fields[targetColIndex]] = col.trim();
        }
      });
    });
    
    setInputs(newInputs);
    toast.success('데이터가 붙여넣어졌습니다.');
  };

  // YouTube URL 유효성 검사
  const isValidYouTubeUrl = (url: string): boolean => {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
    return regex.test(url);
  };

  // 분석 시작
  const startAnalysis = async () => {
    // 유효한 입력값만 필터링
    const validInputs = inputs.filter(input => 
      input.title.trim() && input.url.trim()
    );

    if (validInputs.length === 0) {
      toast.error('분석할 영상이 없습니다. 제목과 URL을 입력해주세요.');
      return;
    }

    // YouTube URL 유효성 검사
    const invalidUrls = validInputs.filter(input => !isValidYouTubeUrl(input.url));
    if (invalidUrls.length > 0) {
      toast.error(`유효하지 않은 YouTube URL이 ${invalidUrls.length}개 있습니다.`);
      return;
    }

    setVideoInputs(validInputs);
    setIsAnalyzing(true);
    toast.success(`${validInputs.length}개 영상 분석을 시작합니다.`);

    // API 호출로 분석 시작
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videos: validInputs }),
      });

      if (!response.ok) {
        throw new Error('분석 시작에 실패했습니다.');
      }

      const data = await response.json();
      toast.success('분석이 시작되었습니다.');
    } catch (error) {
      console.error('Analysis start error:', error);
      toast.error('분석 시작에 실패했습니다.');
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">영상 정보 입력</h2>
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            행 추가
          </button>
          <button
            onClick={clearAll}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            전체 초기화
          </button>
        </div>
      </div>

      <div className="mb-4 text-sm text-gray-600">
        <p>• Excel이나 Google Sheets에서 복사한 데이터를 직접 붙여넣을 수 있습니다.</p>
        <p>• 제목과 영상링크는 필수 입력 항목입니다.</p>
      </div>

      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900 w-8">
                #
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900 w-1/3">
                제목 <span className="text-red-500">*</span>
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900 w-1/3">
                영상링크 <span className="text-red-500">*</span>
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900 w-1/4">
                비고
              </th>
              <th className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900 w-16">
                삭제
              </th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((input, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2 text-center text-gray-600">
                  {index + 1}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  <input
                    type="text"
                    value={input.title}
                    onChange={(e) => handleInputChange(index, 'title', e.target.value)}
                    onPaste={(e) => handlePaste(e, index, 0)}
                    className="w-full px-2 py-1 border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="영상 제목을 입력하세요"
                  />
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  <input
                    type="url"
                    value={input.url}
                    onChange={(e) => handleInputChange(index, 'url', e.target.value)}
                    onPaste={(e) => handlePaste(e, index, 1)}
                    className={`w-full px-2 py-1 border-0 focus:ring-2 focus:outline-none ${
                      input.url && !isValidYouTubeUrl(input.url) 
                        ? 'focus:ring-red-500 bg-red-50' 
                        : 'focus:ring-blue-500'
                    }`}
                    placeholder="https://youtu.be/... 또는 https://youtube.com/watch?v=..."
                  />
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  <input
                    type="text"
                    value={input.note}
                    onChange={(e) => handleInputChange(index, 'note', e.target.value)}
                    onPaste={(e) => handlePaste(e, index, 2)}
                    className="w-full px-2 py-1 border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="메모 (선택사항)"
                  />
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center">
                  <button
                    onClick={() => removeRow(index)}
                    disabled={inputs.length <= 1}
                    className="text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={startAnalysis}
          className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          <Play className="w-5 h-5" />
          분석 시작
        </button>
      </div>
    </div>
  );
};

export default VideoInputTable;