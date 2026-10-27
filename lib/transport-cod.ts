type CodStorageClient = {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<{ error: { code?: string; message: string } | null }>;
    };
  };
};

export function validateTransportCod(enabled: boolean, amount: number, remainingBalance?: number) {
  if (!enabled) return null;
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 9999999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.001) {
    return "ກະລຸນາປ້ອນຈຳນວນເງິນ COD ໃຫ້ຖືກຕ້ອງ";
  }
  if (remainingBalance !== undefined && amount > remainingBalance) {
    return "ຈຳນວນເງິນ COD ເກີນຍອດຄ້າງຫຼັງຫັກເງິນທີ່ຮັບຕອນນີ້";
  }
  return null;
}

// Check every required column before uploading files or writing either snapshot.
export async function ensureTransportCodStorage(client: CodStorageClient, includeShipmentRequest = false) {
  const checks = [client.from("transport_notes").select("cod_enabled,cod_amount").limit(0)];
  if (includeShipmentRequest) {
    checks.push(client.from("shipment_delivery_requests").select("transport_cod_enabled,transport_cod_amount").limit(0));
  }
  for (const { error } of await Promise.all(checks)) {
    if (!error) continue;
    if (error.code === "42703" || error.code === "PGRST204") {
      throw new Error("ກະລຸນາອັບເດດຖານຂໍ້ມູນ COD ກ່ອນ (20261102_add_transport_cod.sql)");
    }
    throw new Error(error.message);
  }
}
