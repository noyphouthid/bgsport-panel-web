// Live production progress from the LifeFootball factory's public status API, keyed by factory bill code (26-xxxxxx).
const FACTORY_ORDER_STATUS_BASE_URL = "https://admin.lifefootball.la/api/public/customer-orders";

export type FactoryOrderStage = {
  name: string;
  code: string;
  status: string;
  statusLabel: string;
  current: boolean;
  assignedQuantity: number;
  completedQuantity: number;
  completedAt: string | null;
};

export type FactoryOrderStatus = {
  status: string;
  statusLabel: string;
  totalSteps: number;
  completedSteps: number;
  currentStage: FactoryOrderStage | null;
  stages: FactoryOrderStage[];
};

export type FactoryOrderStatusResult =
  | { state: "loading" }
  | { state: "not_found" }
  | { state: "error" }
  | { state: "ready"; data: FactoryOrderStatus };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function parseFactoryOrderStatus(raw: unknown): FactoryOrderStatus | null {
  const root = asRecord(raw);
  const status = asText(root.status);
  if (!status) return null;

  const tracking = asRecord(root.productionTracking);
  const stages = (Array.isArray(tracking.stages) ? tracking.stages : [])
    .map((entry) => asRecord(entry))
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map((stage) => ({
        name: asText(stage.stageName),
        code: asText(stage.stageCode),
        status: asText(stage.status),
        statusLabel: asText(stage.statusLabel),
        current: stage.current === true,
        assignedQuantity: asCount(stage.assignedQuantity),
        completedQuantity: asCount(stage.completedQuantity),
        completedAt: asText(stage.completedAt) || null,
    }))
    .filter((stage) => stage.name);

  const completedFromStages = stages.filter((stage) => stage.status === "completed").length;
  return {
    status,
    statusLabel: asText(root.statusLabel) || status,
    totalSteps: asCount(tracking.totalSteps) || stages.length,
    completedSteps: Number.isFinite(Number(tracking.completedSteps)) ? asCount(tracking.completedSteps) : completedFromStages,
    currentStage: stages.find((stage) => stage.current) ?? null,
    stages,
  };
}

export async function fetchFactoryOrderStatus(billCode: string, signal?: AbortSignal): Promise<FactoryOrderStatusResult> {
  try {
    const response = await fetch(`${FACTORY_ORDER_STATUS_BASE_URL}/${encodeURIComponent(billCode)}/status`, {
      cache: "no-store",
      signal,
    });
    if (response.status === 404) return { state: "not_found" };
    if (!response.ok) return { state: "error" };
    const data = parseFactoryOrderStatus(await response.json());
    return data ? { state: "ready", data } : { state: "error" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { state: "error" };
  }
}

// A few parallel requests keep the page quick without flooding the factory API.
export async function fetchFactoryOrderStatuses(
  billCodes: string[],
  onResult: (billCode: string, result: FactoryOrderStatusResult) => void,
  signal?: AbortSignal,
  concurrency = 6
) {
  const queue = [...new Set(billCodes.map((code) => code.trim()).filter(Boolean))];
  const worker = async () => {
    for (let code = queue.shift(); code !== undefined; code = queue.shift()) {
      if (signal?.aborted) return;
      const result = await fetchFactoryOrderStatus(code, signal);
      if (!signal?.aborted) onResult(code, result);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}
