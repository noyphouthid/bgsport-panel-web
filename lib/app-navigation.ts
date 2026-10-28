// Shared by the sidebar and the employee page-permission catalog.
export type NavigationIcon =
  | "LayoutDashboard"
  | "ClipboardList"
  | "BellRing"
  | "Palette"
  | "Globe"
  | "Images"
  | "ReceiptText"
  | "Factory"
  | "FileSpreadsheet"
  | "Wallet"
  | "HandCoins"
  | "Banknote"
  | "Settings2"
  | "Users"
  | "QrCode"
  | "PackagePlus"
  | "Truck"
  | "ScanLine"
  | "PackageCheck"
  | "CheckCheck"
  | "ClipboardCheck"
  | "Clock3";

export type NavLinkItem = {
  type: "link";
  href: `/${string}`;
  label: string;
  icon: NavigationIcon;
};

export type NavGroupItem = {
  type: "group";
  label: string;
  icon: NavigationIcon;
  items: NavLinkItem[];
};

export type NavItem = NavLinkItem | NavGroupItem;

export const APP_NAVIGATION: NavItem[] = [
  { type: "link", href: "/dashboard", label: "ໜ້າຫຼັກ", icon: "LayoutDashboard" },
  { type: "link", href: "/orders", label: "ລາຍການອໍເດີ", icon: "ClipboardList" },
  { type: "link", href: "/order-alerts", label: "ແຈ້ງເຕືອນອໍເດີ", icon: "BellRing" },
  { type: "link", href: "/design-queue", label: "ຄິວອອກແບບ", icon: "Palette" },
  {
    type: "group",
    label: "ຈັດການໜ້າເວັບໄຊ໌",
    icon: "Globe",
    items: [
      { type: "link", href: "/design-queue/assets", label: "ຄັງຮູບເສື້ອ", icon: "Images" },
      { type: "link", href: "/shirt-catalog", label: "ເຜີຍແຜ່ແບບເສື້ອ", icon: "Images" },
      { type: "link", href: "/shirt-catalog/reviews", label: "ລີວິວສິນຄ້າຈິງ", icon: "Images" },
      { type: "link", href: "/shirt-catalog/fabrics", label: "ລາຍການຜ້າໜ້າຮ້ານ", icon: "Images" },
      { type: "link", href: "/shirt-catalog/collars", label: "ປະເພດຄໍເສື້ອ", icon: "Images" },
    ],
  },
  { type: "link", href: "/quotations", label: "ໃບປະເມີນລາຄາ", icon: "ReceiptText" },
  { type: "link", href: "/factory-deposit-orders", label: "ມັດຈຳສັ່ງຜະລິດ", icon: "ReceiptText" },
  { type: "link", href: "/factory-production-queue", label: "ຄິວວາງຜະລິດ", icon: "Factory" },
  { type: "link", href: "/factory-production-queue/records", label: "ລາຍການວາງຜະລິດ", icon: "ClipboardList" },
  { type: "link", href: "/factory-production-queue/activity", label: "ສະຫຼຸບການວາງຜະລິດ", icon: "FileSpreadsheet" },
  {
    type: "group",
    label: "ໜ້າລາຍງານ",
    icon: "FileSpreadsheet",
    items: [
      { type: "link", href: "/reports/sales-profit", label: "ລາຍງານຍອດຂາຍ-ກຳໄລ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/income-expense", label: "ບັນຊີລາຍຮັບ-ລາຍຈ່າຍ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/monthly-close", label: "ປິດຍອດຂາຍ-ກຳໄລປະຈໍາເດືອນ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/order-status-payments", label: "ລາຍງານຕິດຕາມອໍເດີ-ການຊຳລະ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/orders", label: "ລາຍງານອໍເດີ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/order-alerts", label: "ລາຍງານອໍເດີ້ເກີນກຳນົດ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/order-activity", label: "Statement ການແກ້ໄຂອໍເດີ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/customer-delivery", label: "ລາຍງານຈັດສົ່ງລູກຄ້າ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/transport-bills", label: "ລາຍງານໃບບິນຂົນສົ່ງ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/factory-payments", label: "ລາຍງານຈ່າຍໂຮງງານ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/payroll", label: "ລາຍງານເງິນເດືອນພະນັກງານ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/data-export", label: "ລາຍງານດຶງຂໍ້ມູນ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/admin-sales", label: "ລາຍງານຍອດຂາຍແອັດມິນ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/graphic-work", label: "ລາຍງານກຣາຟິກ", icon: "FileSpreadsheet" },
      { type: "link", href: "/reports/design-phone-status", label: "ລາຍງານເບີຄິວອອກແບບ", icon: "FileSpreadsheet" },
    ],
  },
  { type: "link", href: "/payments", label: "ບັນຊີການຊຳລະເງິນ", icon: "Wallet" },
  { type: "link", href: "/payroll", label: "ລະບົບເງິນເດືອນພະນັກງານ", icon: "HandCoins" },
  { type: "link", href: "/factory-payments", label: "ຊຳລະຄ່າໂຮງງານແບບກຸ່ມ", icon: "Wallet" },
  { type: "link", href: "/payroll/monthly-close", label: "ປິດຍອດເງິນເດືອນພະນັກງານ", icon: "Banknote" },
  {
    type: "group",
    label: "ຕັ້ງຄ່າ",
    icon: "Settings2",
    items: [
      { type: "link", href: "/imports", label: "ນຳເຂົ້າ Excel", icon: "FileSpreadsheet" },
      { type: "link", href: "/users", label: "ຕັ້ງຄ່າຜູ້ໃຊ້", icon: "Users" },
      { type: "link", href: "/fabric", label: "ລາຄາຜ້າ", icon: "Banknote" },
      { type: "link", href: "/order-code-types", label: "ປະເພດລະຫັດ", icon: "Settings2" },
    ],
  },
  { type: "link", href: "/inventory-qr", label: "ສ້າງ QR", icon: "QrCode" },
  { type: "link", href: "/factory-receipts", label: "ຮັບສິນຄ້າເຂົ້າ", icon: "PackagePlus" },
  { type: "link", href: "/factory-receipts/orders", label: "ລາຍການອໍເດີນຳເຂົ້າ", icon: "ClipboardList" },
  { type: "link", href: "/shipments", label: "ຈັດສົ່ງສິນຄ້າ", icon: "Truck" },
  { type: "link", href: "/shipments/notes", label: "ລາຍການໃບຝາກເຄື່ອງ", icon: "ReceiptText" },
  { type: "link", href: "/shipments/deposits/scan", label: "ສະແກນຢືນຢັນຝາກ", icon: "ScanLine" },
  { type: "link", href: "/shipments/deposits", label: "ລາຍການຝາກສຳເລັດ", icon: "PackageCheck" },
  { type: "link", href: "/shipments/approvals", label: "ອະນຸມັດສົ່ງມອບ", icon: "CheckCheck" },
  { type: "link", href: "/shipments/orders", label: "ລາຍການອໍເດີຈັດສົ່ງ", icon: "ClipboardCheck" },
  { type: "link", href: "/change-requests", label: "ຄຳຂໍລໍຖ້າອະນຸມັດ", icon: "Clock3" },
];

