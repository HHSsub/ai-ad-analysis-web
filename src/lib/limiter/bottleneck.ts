import Bottleneck from "bottleneck";

const maxConcurrent = parseInt(process.env.GEMINI_MAX_CONCURRENCY || "2", 10);
const rps = parseInt(process.env.GEMINI_RPS || "0", 10);

// reservoir(RPS) 제한은 선택적으로 적용
const limiter = new Bottleneck({
  maxConcurrent,
  ...(rps > 0
    ? {
        reservoir: rps,
        reservoirRefreshAmount: rps,
        reservoirRefreshInterval: 1000, // 1초 주기 보충
      }
    : {}),
});

export default limiter;
