export type FactoryImportRow = {
  orderId: string;
  orderCode: string;
  factoryBillCode: string | null;
  receivedAt: string;
  receivedBy: string;
  shirts: number;
  netTotal: number;
};

export type FactoryImportSummary = {
  employeeKey: string;
  employeeName: string;
  ordersTotal: number;
  shirtsTotal: number;
  valueTotal: number;
};

export const UNNAMED_IMPORTER_LABEL = "ບໍ່ໄດ້ລະບຸຜູ້ນຳເຂົ້າ";

// `received_by` is free text, so spacing or letter case must not split one employee's total.
export function getImporterKey(receivedBy: string | null | undefined) {
  return String(receivedBy || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Calendar months follow the viewer's local time, as the factory receipt pages do.
export function getLocalPeriodRange(year: number, month: number | "ALL") {
  const start = month === "ALL" ? new Date(year, 0, 1) : new Date(year, month - 1, 1);
  const endExclusive = month === "ALL" ? new Date(year + 1, 0, 1) : new Date(year, month, 1);
  return { start: start.toISOString(), endExclusive: endExclusive.toISOString() };
}

// An order earns credit once, for its earliest receipt, even if it has several QR labels or receipts.
export function dedupeImportsByOrder(rows: readonly FactoryImportRow[]) {
  const earliestByOrder = new Map<string, FactoryImportRow>();
  for (const row of rows) {
    const current = earliestByOrder.get(row.orderId);
    if (!current || new Date(row.receivedAt).getTime() < new Date(current.receivedAt).getTime()) {
      earliestByOrder.set(row.orderId, row);
    }
  }
  return [...earliestByOrder.values()].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
}

export function summarizeImportsByEmployee(rows: readonly FactoryImportRow[]) {
  const grouped = new Map<string, FactoryImportSummary>();
  for (const row of rows) {
    const employeeKey = getImporterKey(row.receivedBy);
    const current = grouped.get(employeeKey) ?? {
      employeeKey,
      employeeName: row.receivedBy.trim().replace(/\s+/g, " ") || UNNAMED_IMPORTER_LABEL,
      ordersTotal: 0,
      shirtsTotal: 0,
      valueTotal: 0,
    };
    current.ordersTotal += 1;
    current.shirtsTotal += row.shirts;
    current.valueTotal += row.netTotal;
    grouped.set(employeeKey, current);
  }
  return [...grouped.values()].sort((a, b) => b.ordersTotal - a.ordersTotal || a.employeeName.localeCompare(b.employeeName));
}
