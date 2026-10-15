// Check storage before writing a shipment and its linked note, so an unapplied
// migration cannot leave a request saved without its branch-code snapshot.
type BranchCodeClient = {
  from(table: string): {
    select(columns: string): {
      limit(
        count: number,
      ): PromiseLike<{ error: { code?: string; message: string } | null }>;
    };
  };
};
export async function ensureTransportBranchCodeStorage(
  client: BranchCodeClient,
  includeShipmentRequest = false,
) {
  const checks = [
    client.from("transport_notes").select("branch_code").limit(0),
  ];
  if (includeShipmentRequest)
    checks.push(
      client
        .from("shipment_delivery_requests")
        .select("transport_branch_code")
        .limit(0),
    );
  const results = await Promise.all(checks);
  for (const { error } of results) {
    if (!error) continue;
    if (error.code === "42703" || error.code === "PGRST204") {
      throw new Error(
        "ກະລຸນາອັບເດດຖານຂໍ້ມູນສຳລັບລະຫັດສາຂາກ່ອນ (20261017_add_transport_branch_code.sql)",
      );
    }
    throw new Error(error.message);
  }
}
