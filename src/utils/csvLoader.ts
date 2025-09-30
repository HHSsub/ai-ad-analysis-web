// src/utils/csvLoader.ts - CSV에서 156개 특성 로드

import * as fs from 'fs';
import * as path from 'path';

export interface VideoFeature {
  no: string;
  category: string;
  item: string;
}

let cachedFeatures: VideoFeature[] | null = null;

export function loadFeaturesFromCSV(): VideoFeature[] {
  if (cachedFeatures && cachedFeatures.length === 156) {
    return cachedFeatures;
  }

  const csvPath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV 파일을 찾을 수 없습니다: ${csvPath}`);
  }

  let fileContent = fs.readFileSync(csvPath, 'utf-8');

  if (fileContent.charCodeAt(0) === 0xFEFF) {
    fileContent = fileContent.slice(1);
  }

  const lines = fileContent.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const features: VideoFeature[] = [];

  for (let i = 1; i < lines.length; i++) {
    const columns = parseCsvLine(lines[i]);

    if (columns.length >= 3) {
      const [no, category, item] = columns.map(col => col.trim());

      if (no && category && item && !isNaN(parseInt(no))) {
        features.push({
          no: no,
          category: category,
          item: item
        });
      }
    }
  }

  if (features.length !== 156) {
    console.warn(`⚠️ CSV 특성 개수 불일치: ${features.length}/156`);
  }

  cachedFeatures = features;
  console.log(`✅ CSV에서 ${features.length}개 특성 로드 완료`);

  return features;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function getFeaturesSync(): VideoFeature[] {
  if (typeof window !== 'undefined') {
    throw new Error('CSV는 서버 사이드에서만 로드 가능합니다');
  }
  return loadFeaturesFromCSV();
}
