# ແຜນຜັງການເຮັດວຽກລະບົບຈັດການຮ້ານ

ແບບສຳລັບທົບທວນຂອບເຂດກັບລູກຄ້າ ໂດຍອີງໃສ່ແພັກເກັດເລີ່ມຕົ້ນໃນ `customer-erp-web` ແລະ ຂັ້ນຕອນຜະລິດ–ຈັດສົ່ງໃນ `bgsport-panel-web`.

ລູກຄ້າຄົນທີ 1 ໃຊ້ 6 ໝວດຂອງແພັກເກັດເລີ່ມຕົ້ນ. ລູກຄ້າຄົນທີ 2 ໃຊ້ແພັກເກັດເດີມ ແລະ ເພີ່ມອີກ 5 ໝວດ.

ສີຟ້າ = ໜ້າໃນແພັກເກັດເລີ່ມຕົ້ນ; ສີຂຽວ = ໜ້າທີ່ເພີ່ມ; ສີເທົາ = ຂັ້ນຕອນ ຫຼື ເງື່ອນໄຂພາຍໃນໜ້າ. ລູກສອນເສັ້ນທຶບ = ລຳດັບວຽກ; ລູກສອນເສັ້ນປະ = ຂໍ້ມູນທີ່ເຊື່ອມໂຍງ. ກ່ອງທີ່ບໍ່ມີທີ່ຢູ່ໜ້າແມ່ນຂັ້ນຕອນວຽກ.

## 1. ແພັກເກັດເລີ່ມຕົ້ນ — 6 ໝວດ

```mermaid
flowchart TB
  subgraph SETTINGS["ຕັ້ງຄ່າລະບົບ"]
    COMPANY["ຂໍ້ມູນຮ້ານ<br/>/settings/company"]
    USERS["ຜູ້ໃຊ້ ແລະ ສິດການໃຊ້ງານ<br/>/users"]
    FABRIC["ຜ້າ ແລະ ລາຄາ<br/>/fabric"]
    CODE["ປະເພດລະຫັດອໍເດີ<br/>/order-code-types"]
    EXTRA["ລາຍການບວກເພີ່ມ<br/>/settings/upcharges"]
  end

  QUOTES["ໃບປະເມີນລາຄາ<br/>/quotations"]
  QUOTE_NEW["ສ້າງໃບປະເມີນລາຄາ<br/>/quotations/new"]
  ORDERS["ລາຍການອໍເດີ<br/>/orders"]
  ORDER_NEW["ສ້າງອໍເດີ<br/>/orders/new"]
  ORDER_EDIT["ເບິ່ງ ແລະ ແກ້ໄຂອໍເດີ<br/>/orders/:id/edit"]
  PRODUCED["ບັນທຶກຜະລິດສຳເລັດ<br/>ພາຍໃນໜ້າອໍເດີ"]
  DELIVERED["ຢືນຢັນສົ່ງມອບ<br/>ພາຍໃນໜ້າອໍເດີ"]
  FACTORY_PAY["ຈ່າຍໂຮງງານ<br/>/factory-payments"]
  FACTORY_REPORT["ລາຍງານຈ່າຍໂຮງງານ<br/>/reports/factory-payments"]
  PROFIT["ລາຍງານຍອດຂາຍ–ກຳໄລ<br/>/reports/sales-profit"]
  HOME["ໜ້າຫຼັກ: ພາບລວມບັນຊີ ແລະ ອໍເດີ<br/>/dashboard"]

  SETTINGS -. ຂໍ້ມູນຕັ້ງຕົ້ນ .-> QUOTE_NEW
  SETTINGS -. ຂໍ້ມູນຕັ້ງຕົ້ນ .-> ORDER_NEW
  QUOTES --> QUOTE_NEW
  QUOTE_NEW -->|ຢືນຢັນ ແລະ ສ້າງອໍເດີ| ORDER_EDIT
  ORDERS --> ORDER_NEW --> ORDER_EDIT
  ORDERS -->|ເລືອກອໍເດີ| ORDER_EDIT
  ORDER_EDIT --> PRODUCED
  PRODUCED --> FACTORY_PAY --> FACTORY_REPORT
  PRODUCED --> DELIVERED --> PROFIT
  ORDERS -. ສະຫຼຸບອໍເດີ .-> HOME
  FACTORY_PAY -. ສະຫຼຸບການຈ່າຍ .-> HOME
  PROFIT -. ສະຫຼຸບຍອດຂາຍ .-> HOME

  classDef base fill:#eff6ff,stroke:#2563eb,color:#172554;
  classDef action fill:#f1f5f9,stroke:#64748b,color:#0f172a;
  class COMPANY,USERS,FABRIC,CODE,EXTRA,QUOTES,QUOTE_NEW,ORDERS,ORDER_NEW,ORDER_EDIT,FACTORY_PAY,FACTORY_REPORT,PROFIT,HOME base;
  class PRODUCED,DELIVERED action;
```

- ສາມາດສ້າງອໍເດີໂດຍກົງ ຫຼື ສ້າງຈາກໃບປະເມີນລາຄາ.
- ໜ້າແກ້ໄຂອໍເດີໃຊ້ບັນທຶກຂໍ້ມູນລູກຄ້າ, ສິນຄ້າ, ເງິນມັດຈຳ, ການຮັບຊຳລະ, ຕົ້ນທຶນ ແລະ ການສົ່ງມອບ.
- ການຈ່າຍໂຮງງານ ແລະ ການສົ່ງມອບເປັນສອງສາຍວຽກ. ລູກສອນບໍ່ໄດ້ກຳນົດໃຫ້ຈ່າຍໂຮງງານຄົບກ່ອນຈຶ່ງຈັດສົ່ງໄດ້.
- ໜ້າຫຼັກສະແດງພາບລວມຈາກຂໍ້ມູນທີ່ບັນທຶກໃນລະບົບ.

## 2. ສ່ວນເພີ່ມສຳລັບລູກຄ້າຄົນທີ 2 — 5 ໝວດ

```mermaid
flowchart TB
  QUOTE["ໃບປະເມີນລາຄາ<br/>/quotations ແລະ /quotations/new"]

  subgraph DEPOSIT["1. ມັດຈຳສັ່ງຜະລິດ"]
    D_NEW["ສ້າງໃບມັດຈຳສັ່ງຜະລິດ<br/>/factory-deposit-orders/new"]
    D_LIST["ລາຍການໃບມັດຈຳສັ່ງຜະລິດ<br/>/factory-deposit-orders"]
    D_EDIT["ແກ້ໄຂໃບມັດຈຳສັ່ງຜະລິດ<br/>/factory-deposit-orders/edit"]
    D_NEW -->|ບັນທຶກ| D_LIST
    D_LIST -->|ເລືອກແກ້ໄຂ| D_EDIT -->|ບັນທຶກ| D_LIST
  end

  ORDERS["ອໍເດີ ແລະ ບັນຊີລູກຄ້າ<br/>/orders ແລະ /orders/:id/edit"]
  QUEUE["2. ຄິວວາງຜະລິດ<br/>/factory-production-queue<br/>ລໍຖ້າວາງ → ກຳລັງວາງຜະລິດ<br/>→ ລໍຖ້າສົ່ງໂຮງງານ → ສົ່ງໂຮງງານແລ້ວ"]
  FACTORY["ໂຮງງານຜະລິດ ແລະ ສົ່ງສິນຄ້າກັບຮ້ານ"]

  subgraph RECEIPTS["3. ຮັບສິນຄ້າເຂົ້າ"]
    RECEIVE["ສະແກນ ແລະ ຢືນຢັນຮັບສິນຄ້າ<br/>/factory-receipts"]
    RECEIVED["ລາຍການອໍເດີນຳເຂົ້າ<br/>/factory-receipts/orders"]
    RECEIVE --> RECEIVED
  end

  subgraph SHIPMENTS["4. ຈັດສົ່ງສິນຄ້າ"]
    SHIP["ຈັດສົ່ງສິນຄ້າ<br/>/shipments<br/>ເລືອກອໍເດີ, ວິທີສົ່ງ ແລະ ການຊຳລະ"]
    NOTES["ລາຍການໃບຝາກເຄື່ອງ<br/>/shipments/notes<br/>ພິມໃບຝາກ ແລະ ຢືນຢັນການພິມ"]
    SHIP -->|ຝາກຂົນສົ່ງ| NOTES
  end

  subgraph TRANSPORT["5. ຢືນຢັນຝາກ ແລະ ຕິດຕາມເງິນ COD"]
    SCAN["ສະແກນຢືນຢັນຝາກ<br/>/shipments/deposits/scan"]
    DEPOSITED["ລາຍການຝາກສຳເລັດ<br/>/shipments/deposits"]
    COD["ລາຍການ COD<br/>/shipments/cod<br/>ຕິດຕາມ ແລະ ຢືນຢັນຮັບເງິນຈາກຂົນສົ່ງ"]
    SCAN --> DEPOSITED
  end

  APPROVE["ອະນຸມັດສົ່ງມອບ<br/>ຂໍ້ສະເໜີ: ຮວມປຸ່ມໃນໜ້າຈັດສົ່ງ"]
  IS_COD{"ມີຍອດ COD ຄ້າງຮັບບໍ?"}
  PAY["ຈ່າຍໂຮງງານ<br/>/factory-payments"]
  PAY_REPORT["ລາຍງານຈ່າຍໂຮງງານ<br/>/reports/factory-payments"]
  PROFIT["ລາຍງານຍອດຂາຍ–ກຳໄລ<br/>/reports/sales-profit"]
  HOME["ໜ້າຫຼັກ: ພາບລວມບັນຊີ ແລະ ອໍເດີ<br/>/dashboard"]

  QUOTE -->|ນຳຂໍ້ມູນມາສ້າງໃບມັດຈຳ| D_NEW
  D_LIST -->|ສົ່ງໃບມັດຈຳເຂົ້າຄິວ| QUEUE
  D_LIST -->|ອະນຸມັດ ແລະ ບັນທຶກເປັນອໍເດີ| ORDERS
  QUEUE --> FACTORY --> RECEIVE
  ORDERS -. ຕ້ອງມີອໍເດີໃຫ້ກວດຮັບ .-> RECEIVE
  RECEIVE -. ອັບເດດຜະລິດສຳເລັດ .-> ORDERS
  RECEIVED --> SHIP
  RECEIVE -->|ສາຍວຽກຈ່າຍໂຮງງານ| PAY --> PAY_REPORT
  NOTES -->|ພິມ ແລະ ຢືນຢັນການພິມແລ້ວ| SCAN
  DEPOSITED --> APPROVE
  SHIP -->|ລູກຄ້າຮັບເອງທີ່ຮ້ານ| APPROVE
  APPROVE --> IS_COD
  IS_COD -->|ບໍ່ມີ| PROFIT
  IS_COD -->|ມີ| COD
  COD -->|ຢືນຢັນຮັບເງິນແລ້ວ| PROFIT
  COD -. ອັບເດດຍອດຄ້າງຊຳລະ .-> ORDERS
  PROFIT -. ສະຫຼຸບ .-> HOME
  PAY_REPORT -. ສະຫຼຸບ .-> HOME

  classDef base fill:#eff6ff,stroke:#2563eb,color:#172554;
  classDef added fill:#ecfdf5,stroke:#059669,color:#064e3b;
  classDef action fill:#f1f5f9,stroke:#64748b,color:#0f172a;
  class QUOTE,ORDERS,PAY,PAY_REPORT,PROFIT,HOME base;
  class D_NEW,D_LIST,D_EDIT,QUEUE,RECEIVE,RECEIVED,SHIP,NOTES,SCAN,DEPOSITED,COD added;
  class FACTORY,APPROVE,IS_COD action;
```

## 3. ລາຍລະອຽດແຕ່ລະໝວດທີ່ເພີ່ມ

| ໝວດ | ໜ້າ | ໜ້າທີ່ ແລະ ຂໍ້ມູນທີ່ສົ່ງຕໍ່ |
| --- | --- | --- |
| ມັດຈຳສັ່ງຜະລິດ | `/factory-deposit-orders`, `/new`, `/edit` | ສ້າງ ແລະ ແກ້ໄຂໃບມັດຈຳ, ແນບຫຼັກຖານ, ສົ່ງເຂົ້າຄິວ, ອະນຸມັດ ແລະ ບັນທຶກເປັນອໍເດີ. |
| ຄິວວາງຜະລິດ | `/factory-production-queue` | ຈັດລຳດັບຄິວ, ມອບໝາຍຜູ້ຮັບຜິດຊອບ ແລະ ຕິດຕາມຂັ້ນຕອນຈົນສົ່ງໂຮງງານ. |
| ຮັບສິນຄ້າເຂົ້າ | `/factory-receipts`, `/factory-receipts/orders` | ສະແກນລະຫັດບິນໂຮງງານ, ຢືນຢັນຮັບເຂົ້າ ແລະ ສະແດງອໍເດີທີ່ຮັບແລ້ວເພື່ອແຈ້ງລູກຄ້າ ແລະ ກຽມຈັດສົ່ງ. |
| ຈັດສົ່ງສິນຄ້າ | `/shipments`, `/shipments/notes` | ບັນທຶກຜູ້ຮັບ, ຂົນສົ່ງ, ການຊຳລະ ແລະ ຍອດ COD; ຈັດການ ແລະ ພິມໃບຝາກເຄື່ອງ. |
| ຢືນຢັນຝາກ ແລະ COD | `/shipments/deposits/scan`, `/shipments/deposits`, `/shipments/cod` | ສະແກນໃບຝາກ, ບັນທຶກຜູ້ຝາກ ແລະ ເວລາ, ກວດລາຍການຝາກສຳເລັດ ແລະ ຕິດຕາມເງິນ COD ຈົນຮັບເງິນ. |

## 4. ຂໍ້ກຳນົດສຳລັບອອກແບບລະບົບລູກຄ້າຄົນທີ 2

1. **ໃຊ້ຂໍ້ມູນອໍເດີຮ່ວມກັນ:** ໃບປະເມີນລາຄາ → ໃບມັດຈຳ → ອໍເດີ → ຮັບສິນຄ້າ → ຈັດສົ່ງ. ຂໍ້ມູນທີ່ມີແລ້ວຄວນນຳມາໃຊ້ຕໍ່ ແລະ ເຊື່ອມກັນດ້ວຍລະຫັດອ້າງອີງ.
2. **ຄິວຜະລິດ ແລະ ການສ້າງອໍເດີ:** ໂຄດເດີມໃຫ້ໃບມັດຈຳທີ່ສົ່ງແລ້ວເຂົ້າຄິວໄດ້; ການບັນທຶກເປັນອໍເດີຕ້ອງຜ່ານການອະນຸມັດ. ຈຶ່ງແຍກເປັນສອງສາຍໃນແຜນຜັງ ແລະ ຕ້ອງມີອໍເດີກ່ອນກວດຮັບສິນຄ້າ.
3. **ຂອບເຂດໜ້າຄິວ:** ແຜນຜັງນີ້ສະແດງ 4 ສະຖານະພາຍໃນໝວດ `/factory-production-queue`. ໜ້າລາຍງານຄິວ ແລະ ໜ້າຍ່ອຍອື່ນຂອງລະບົບເດີມຍັງບໍ່ໄດ້ລວມເຂົ້າໃນແພັກເກັດນີ້.
4. **ອະນຸມັດສົ່ງມອບ:** ໂຄດເດີມໃຊ້ `/shipments/approvals` ຫຼັງຢືນຢັນຝາກ. ເນື່ອງຈາກໜ້ານີ້ບໍ່ຢູ່ໃນລາຍການທີ່ລູກຄ້າເລືອກ, ແບບທີ່ສະເໜີແມ່ນຮວມປຸ່ມອະນຸມັດໄວ້ໃນ `/shipments` ໂດຍໃຫ້ຜູ້ມີສິດເປັນຜູ້ຢືນຢັນ. ນີ້ແມ່ນຂໍ້ສະເໜີການອອກແບບ; ຍັງບໍ່ໄດ້ປັບໂຄດຈິງ.
5. **ສະຖານະຝາກ ແລະ ສະຖານະເງິນ:** ການຢືນຢັນຝາກສຳເລັດບໍ່ແມ່ນການຢືນຢັນຮັບເງິນ COD. ອໍເດີທີ່ມີ COD ຄ້າງຮັບຕ້ອງຕິດຕາມຕໍ່ໃນ `/shipments/cod`; ການຮັບຮູ້ກຳໄລໃຊ້ເງື່ອນໄຂສົ່ງມອບສຳເລັດ ແລະ ຮັບເງິນ COD ຄົບ.
6. **ຊື່ໜ້າແກ້ໄຂ:** `/orders/edit` ໃນລາຍການໝາຍເຖິງໜ້າແກ້ໄຂອໍເດີ; ໂຄດຈິງໃຊ້ `/orders/:id/edit`. ໜ້າ `/factory-deposit-orders/edit` ໃນແຜນຜັງແມ່ນຊື່ຕາມຂອບເຂດທີ່ຂໍ; ໂຄດເດີມໃຊ້ `/factory-deposit-orders/new?id=...` ເພື່ອແກ້ໄຂ.

## 5. ແຫຼ່ງອ້າງອີງໃນໂຄດ

- ເມນູແພັກເກັດເລີ່ມຕົ້ນ: `../customer-erp-web/lib/app-navigation.ts`
- ສ້າງອໍເດີຈາກໃບປະເມີນລາຄາ: `../customer-erp-web/app/(app)/quotations/new/page.tsx`
- ບັນທຶກຜະລິດ ແລະ ສົ່ງມອບໃນແພັກເກັດເລີ່ມຕົ້ນ: `../customer-erp-web/app/(app)/orders/[id]/edit/page.tsx`
- ອະນຸມັດໃບມັດຈຳ ແລະ ສ້າງອໍເດີ: `app/(app)/factory-deposit-orders/page.tsx`
- ສະຖານະຄິວຜະລິດ: `lib/factory-production-queue.ts`
- ການເຂົ້າຄິວ: `supabase/migrations/20260624_create_factory_production_queue_entries.sql`
- ຮັບສິນຄ້າ: `app/(app)/factory-receipts/page.tsx`
- ສ້າງລາຍການຈັດສົ່ງ ແລະ ໃບຝາກ: `app/(app)/shipments/page.tsx`
- ຢືນຢັນຝາກ: `app/(app)/shipments/deposits/scan/page.tsx`
- ຢືນຢັນຮັບເງິນ COD: `app/(app)/shipments/cod/page.tsx`
- ລາຍງານກຳໄລ: `app/(app)/reports/sales-profit/page.tsx`
