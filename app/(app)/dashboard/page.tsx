export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">ກຳໄລທັງໝົດ</div>
          <div className="text-xl font-bold">K 0</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">ຍອດລູກຄ້າຄ້າງຊຳລະ</div>
          <div className="text-xl font-bold">K 0</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">ຍອດຄ້າງຕ່າຍໂຮງງານ</div>
          <div className="text-xl font-bold">K 0</div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <div className="text-sm text-gray-500">ກຳລັງຜະລິດ</div>
          <div className="text-xl font-bold">0 Orders</div>
        </div>
      </div>
    </div>
  );
}
