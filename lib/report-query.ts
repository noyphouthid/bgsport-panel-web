type BatchQueryResult<Row> = {
  data: Row[] | null;
  error: { message: string } | null;
};

// Keep UUID filters small enough to fit within the API's request URL limit.
const REPORT_ID_BATCH_SIZE = 100;

export async function fetchAllReportRows<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<BatchQueryResult<Row>>
): Promise<BatchQueryResult<Row>> {
  const pageSize = 500;
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

export async function fetchReportRowsByIds<Row>(
  ids: readonly string[],
  fetchBatch: (batchIds: string[]) => PromiseLike<BatchQueryResult<Row>>
): Promise<BatchQueryResult<Row>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const rows: Row[] = [];

  for (let offset = 0; offset < uniqueIds.length; offset += REPORT_ID_BATCH_SIZE) {
    const result = await fetchBatch(uniqueIds.slice(offset, offset + REPORT_ID_BATCH_SIZE));
    // Do not present a partial report if any batch fails.
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }

  return { data: rows, error: null };
}
