type ShirtQtySource = {
  short_qty?: number | null;
  long_qty?: number | null;
  free_qty?: number | null;
};

export function getTotalShirtQty(row: ShirtQtySource | null | undefined) {
  return (
    (Number(row?.short_qty) || 0) +
    (Number(row?.long_qty) || 0) +
    (Number(row?.free_qty) || 0)
  );
}
