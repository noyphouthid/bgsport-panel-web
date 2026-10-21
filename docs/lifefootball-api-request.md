# ຂໍ້ຄວາມສຳລັບຂໍ API ຈາກໂຮງງານ

ເອກະສານຮ່າງສຳລັບໃຫ້ BG SPORT ສົ່ງເອງ; ຍັງບໍ່ໄດ້ສົ່ງໃຫ້ໂຮງງານ.

---

ສະບາຍດີທີມ LifeFootball,

BG SPORT ຕ້ອງການເຊື່ອມສະຖານະການຜະລິດຈາກລະບົບຂອງທ່ານມາສະແດງໃນລະບົບຈັດການຮ້ານ ແລະ ໜ້າຕິດຕາມຂອງລູກຄ້າເຮົາ.

ຮຸ່ນທຳອິດຕ້ອງການສິດອ່ານຂໍ້ມູນເທົ່ານັ້ນ: ພະນັກງານຈະກອກລະຫັດບິນໂຮງງານ, ລະບົບຄົ້ນຫາແລະຈັບຄູ່ອໍເດີ້, ຈາກນັ້ນອັບເດດສະຖານະອັດຕະໂນມັດ. ຍັງບໍ່ຕ້ອງສ້າງ ຫຼື ແກ້ໄຂອໍເດີ້ຜ່ານ API.

ຂໍລາຍລະອຽດດັ່ງນີ້:

1. **API ທີ່ຮອງຮັບການເຊື່ອມພາຍນອກ:** base URL, version, ເອກະສານ API/OpenAPI ຫຼື Postman ແລະ ຕົວຢ່າງ request/response. ສາມາດໃຊ້ API ປັດຈຸບັນດ້ວຍ service token ຫຼື ມີ API ສຳລັບ integration ອີກຊຸດ?
2. **ການຢືນຢັນຕົວຕົນ:** API key/OAuth/service account ທີ່ອ່ານໄດ້ສະເພາະອໍເດີ້ BG SPORT, ວິທີຕໍ່ອາຍຸ/ປ່ຽນ token ແລະ ເງື່ອນໄຂ IP allowlist ຖ້າມີ. ກະລຸນາແຈ້ງຊ່ອງທາງຮັບ credentials ທີ່ປອດໄພ.
3. **ຄົ້ນຫາແລະຈັບຄູ່:** API ຄົ້ນຫາບິນ `customerOrderCode` ແບບ exact match ທີ່ຄອບຄຸມທັງລໍຖ້າ, ກຳລັງຜະລິດ, ສຳເລັດ, ເຂົ້າຄັງ ແລະ ສົ່ງແລ້ວ; ພ້ອມ `customerOrderId`, PO ID/code ທີ່ໃຊ້ດຶງສະຖານະຕໍ່ໄປ. ບິນໜຶ່ງສາມາດມີຫຼາຍ PO ໄດ້ຫຼືບໍ່? IDs ແລະ ເລກບິນປ່ຽນໄດ້ຫຼືບໍ່?
4. **ຂໍ້ມູນສະຖານະ:** lifecycle status, current stage ID/code/name, stages ຂອງ PO ພ້ອມລຳດັບແລະສະຖານະ, ຈຳນວນສັ່ງ/ຜະລິດສຳເລັດ, ກຳນົດສົ່ງ ແລະ `updated_at`/version ທີ່ປ່ຽນເມື່ອຂັ້ນຕອນຜະລິດປ່ຽນ. ຂໍເວລາແບບ ISO 8601 ພ້ອມ timezone.
5. **ຄວາມໝາຍສະຖານະ:** enum ແລະ ຄວາມໝາຍຂອງ lifecycle/stage states, ການຈັດກຸ່ມ `completed`/`ready_to_stock`/`in_stock`, ຜະລິດບາງສ່ວນ, rework, ຍົກເລີກ ແລະ ລຶບບິນ. ຂໍແຍກຜະລິດເສັດ, ໂຮງງານສົ່ງອອກ, ຮ້ານຮັບແລ້ວ ແລະ ລູກຄ້າຮັບແລ້ວໃຫ້ຊັດເຈນ.
6. **ການ sync:** rate limit, pagination/max page size, errors ແລະ retry policy; ມີ bulk lookup ຫຼາຍ IDs/ບິນ ຫຼື `updated_since`/cursor ຫຼືບໍ່? ຮອບ polling ທຸກ 5–10 ນາທີເໝາະສົມກັບຂໍ້ຈຳກັດຂອງທ່ານຫຼືບໍ່?
7. **ຖ້າມີ webhook:** ຂໍ events ທີ່ຮອງຮັບ, payload, signature verification, event ID/version, retries ແລະ replay ເພື່ອອັບເດດໄວ ແລະ ກັນຂໍ້ມູນຊ້ຳ/ຜິດລຳດັບ.
8. **ຂໍ້ມູນເພີ່ມຖ້າມີ:** status history, ຮູບແບບສິນຄ້າທີ່ອະນຸຍາດໃຫ້ສະແດງຕໍ່ລູກຄ້າ/ອາຍຸ image URL, ແລະ ຂໍ້ມູນສົ່ງຈາກໂຮງງານມາຮ້ານ (ຈຳນວນ, ວັນສົ່ງ, ຂົນສົ່ງ, tracking number).
9. **ການທົດລອງ/ຕິດຕໍ່:** sandbox ຫຼື test orders, ຕົວຢ່າງຄົບທຸກ lifecycle, ຜູ້ຕິດຕໍ່ດ້ານເຕັກນິກ ແລະ ວິທີແຈ້ງການປ່ຽນ API.

ທີມເຮົາພົບວ່າໜ້າເວັບປັດຈຸບັນໃຊ້ `GET /api/agent-portal/production/queue`, `GET /api/agent-portal/production/stages` ແລະ `GET /api/agent-portal/orders/{id}` ຫຼັງ login. ຂໍໃຫ້ທ່ານຢືນຢັນ endpoint ແລະ authentication ທີ່ຮອງຮັບສຳລັບ server-to-server integration ຢ່າງເປັນທາງການ.

ຂອບໃຈ.
