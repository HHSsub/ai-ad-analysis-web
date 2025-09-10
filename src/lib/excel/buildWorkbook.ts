// 서버 전용 유틸: exceljs는 Node 런타임에서만 사용
type AnalysisItem = {
  title: string;
  url: string;
  scriptLanguage?: string;
  completionStats?: { completed: number; incomplete: number; total: number; percentage: number };
  analysis: { [category: string]: { [feature: string]: string } };
};

function safeSheetName(name: string) {
  // Excel 시트 이름 제한: 31자, \ / ? * [ ] : 금지
  const cleaned = name.replace(/[\\\/\?\*\[\]\:]/g, " ").trim();
  return cleaned.slice(0, 31) || "Sheet";
}

export async function buildWorkbookBuffer(items: AnalysisItem[], workbookTitle?: string) {
  // 동적 import로 클라이언트 번들 제외
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "ai-ad-analysis-web";
  workbook.created = new Date();

  // Summary 시트
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

  // 각 영상별 시트
  for (const it of items) {
    const ws = workbook.addWorksheet(safeSheetName(it.title || "Video"));
    ws.properties.outlineLevelCol = 1;

    ws.addRow([workbookTitle || "AI Ad Analysis"]);
    ws.mergeCells(1, 1, 1, 3);
    ws.getRow(1).font = { bold: true, size: 14 };

    ws.addRow([]);
    ws.addRow(["Title", it.title || ""]);
    ws.addRow(["URL", it.url || ""]);
    ws.addRow(["Language", it.scriptLanguage || ""]);
    const pct = it?.completionStats?.percentage ?? "";
    const ct =
      it?.completionStats?.completed !== undefined && it?.completionStats?.total !== undefined
        ? `${it.completionStats.completed}/${it.completionStats.total}`
        : "";
    ws.addRow(["Completion", pct !== "" ? `${pct}% (${ct})` : ""]);
    ws.addRow([]);

    ws.addRow(["Category", "Feature", "Value"]).font = { bold: true };

    // 카테고리/피처 렌더
    const categories = Object.keys(it.analysis || {});
    for (const cat of categories) {
      // 카테고리 헤더
      const row = ws.addRow([cat, "", ""]);
      row.font = { bold: true };
      // 해당 카테고리의 피처들
      const features = it.analysis[cat] || {};
      for (const [feature, value] of Object.entries(features)) {
        ws.addRow(["", feature, String(value)]);
      }
      ws.addRow([]);
    }

    // 열 넓이 대충 자동화
    ws.columns = [
      { width: 28 },
      { width: 40 },
      { width: 60 },
    ];
  }

  // 버퍼 생성
  const buffer: ArrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
