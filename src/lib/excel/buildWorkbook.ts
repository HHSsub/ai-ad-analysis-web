import fs from "fs";
import path from "path";

// 서버 전용 유틸: exceljs는 Node 런타임에서만 사용
type AnalysisItem = {
  title: string;
  url: string;
  notes?: string;
  scriptLanguage?: string;
  completionStats?: { completed: number; incomplete: number; total: number; percentage: number };
  analysis: { [category: string]: { [feature: string]: string } };
};

function safeSheetName(name: string) {
  // Excel 시트 이름 제한: 31자, \ / ? * [ ] : 금지
  const cleaned = name.replace(/[\\\/\?\*\[\]\:]/g, " ").trim();
  return cleaned.slice(0, 31) || "Sheet";
}

// z+: output_features.csv 순서 읽기 (있으면 사용, 없으면 아이템에서 유도)
function readFeatureOrderFromCSV(): Array<{ category: string; feature: string }> | null {
  try {
    const filePath = path.join(process.cwd(), "src", "data", "output_features.csv");
    if (!fs.existsSync(filePath)) return null;
    let fileContent = fs.readFileSync(filePath, "utf-8");
    if (fileContent.charCodeAt(0) === 0xfeff) fileContent = fileContent.slice(1);
    const lines = fileContent.split("\n").filter((l) => l.trim());
    const rows = lines.slice(1).map((line) => {
      const cols: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQ = !inQ;
        else if (ch === "," && !inQ) {
          cols.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      cols.push(cur.trim());
      const [, Category, Feature] = cols.map((s) => s.replace(/"/g, "").trim());
      return { category: Category, feature: Feature };
    });
    // 유효성
    const valid = rows.filter((r) => r.category && r.feature);
    if (valid.length === 0) return null;
    return valid;
  } catch {
    return null;
  }
}

function deriveFeatureOrderFromItems(items: AnalysisItem[]): Array<{ category: string; feature: string }> {
  const set = new Set<string>();
  const list: Array<{ category: string; feature: string }> = [];
  for (const it of items) {
    const cats = Object.keys(it.analysis || {});
    for (const cat of cats) {
      const feats = Object.keys(it.analysis[cat] || {});
      for (const f of feats) {
        const key = `${cat}|||${f}`;
        if (!set.has(key)) {
          set.add(key);
          list.push({ category: cat, feature: f });
        }
      }
    }
  }
  // 안정적 정렬: 카테고리, 피처 이름 순
  list.sort((a, b) => (a.category.localeCompare(b.category) || a.feature.localeCompare(b.feature)));
  return list;
}

export async function buildWorkbookBuffer(items: AnalysisItem[], workbookTitle?: string) {
  // 동적 import로 클라이언트 번들 제외
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "ai-ad-analysis-web";
  workbook.created = new Date();

  // z+: AllFeatures (가로 확장 시트) — 모든 feature를 열로
  const orderFromCSV = readFeatureOrderFromCSV();
  const featureOrder = orderFromCSV ?? deriveFeatureOrderFromItems(items);

  const allFeatures = workbook.addWorksheet("AllFeatures");
  const baseHeaders = [
    { header: "Title", key: "title", width: 50 },
    { header: "URL", key: "url", width: 50 },
    { header: "Notes", key: "notes", width: 24 },
    { header: "Language", key: "lang", width: 12 },
    { header: "Completion (%)", key: "pct", width: 16 },
    { header: "Completed/Total", key: "ct", width: 18 },
  ];

  const featureHeaders = featureOrder.map((fo, idx) => ({
    header: `${fo.category} - ${fo.feature}`,
    key: `f_${idx}`,
    width: Math.min(60, Math.max(18, fo.feature.length + fo.category.length + 5)),
  }));

  allFeatures.columns = [...baseHeaders, ...featureHeaders];

  for (const it of items) {
    const pct = it?.completionStats?.percentage ?? "";
    const completed = it?.completionStats?.completed ?? "";
    const total = it?.completionStats?.total ?? "";
    const row: Record<string, any> = {
      title: it.title || "",
      url: it.url || "",
      notes: it.notes || "",
      lang: it.scriptLanguage || "",
      pct,
      ct: completed !== "" && total !== "" ? `${completed}/${total}` : "",
    };

    featureOrder.forEach((fo, idx) => {
      const v = it.analysis?.[fo.category]?.[fo.feature];
      row[`f_${idx}`] = v === undefined || v === null ? "" : String(v);
    });

    allFeatures.addRow(row);
  }

  // 기존 Summary 시트 유지
  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Title", key: "title", width: 50 },
    { header: "URL", key: "url", width: 50 },
    { header: "Completion (%)", key: "pct", width: 16 },
    { header: "Completed/Total", key: "ct", width: 18 },
    { header: "Language", key: "lang", width: 12 },
  ];

  items.forEach((it) => {
    const pct = it?.completionStats?.percentage ?? "";
    const completed = it?.completionStats?.completed ?? "";
    const total = it?.completionStats?.total ?? "";
    summary.addRow({
      title: it.title,
      url: it.url,
      pct,
      ct: completed !== "" && total !== "" ? `${completed}/${total}` : "",
      lang: it.scriptLanguage || "",
    });
  });

  // 기존: 각 영상별 상세 시트 유지 (카테고리/피처/값 테이블)
  for (const it of items) {
    const ws = workbook.addWorksheet(safeSheetName(it.title || "Video"));
    ws.properties.outlineLevelCol = 1;

    ws.addRow([workbookTitle || "AI Ad Analysis"]);
    ws.mergeCells(1, 1, 1, 3);
    ws.getRow(1).font = { bold: true, size: 14 };

    ws.addRow([]);
    ws.addRow(["Title", it.title || ""]);
    ws.addRow(["URL", it.url || ""]);
    ws.addRow(["Notes", it.notes || ""]);
    ws.addRow(["Language", it.scriptLanguage || ""]);
    const pct = it?.completionStats?.percentage ?? "";
    const ct =
      it?.completionStats?.completed !== undefined && it?.completionStats?.total !== undefined
        ? `${it.completionStats.completed}/${it.completionStats.total}`
        : "";
    ws.addRow(["Completion", pct !== "" ? `${pct}% (${ct})` : ""]);
    ws.addRow([]);

    ws.addRow(["Category", "Feature", "Value"]).font = { bold: true };

    const categories = Object.keys(it.analysis || {});
    for (const cat of categories) {
      const row = ws.addRow([cat, "", ""]);
      row.font = { bold: true };
      const features = it.analysis[cat] || {};
      for (const [feature, value] of Object.entries(features)) {
        ws.addRow(["", feature, String(value)]);
      }
      ws.addRow([]);
    }

    ws.columns = [{ width: 28 }, { width: 40 }, { width: 60 }];
  }

  const buffer: ArrayBuffer = await (workbook as any).xlsx.writeBuffer();
  return Buffer.from(buffer);
}