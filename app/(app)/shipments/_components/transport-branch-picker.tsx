"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  addressForTransportBranch,
  branchProviderForTransporter,
  BRANCH_PROVIDERS,
  type TransportAddress,
  type TransportBranchDirectory,
} from "@/lib/transport-branches";
import { TRANSPORTERS } from "@/lib/transport-notes";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-slate-100";
export function TransportBranchPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: TransportAddress;
  onChange: (value: TransportAddress) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const carrier =
    value.transporters.length === 1
      ? value.transporters[0]
      : value.transporters.length > 1
        ? "legacy-multiple"
        : "";
  const provider = branchProviderForTransporter(carrier);
  const [directory, setDirectory] = useState<TransportBranchDirectory | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  useEffect(() => {
    let cancelled = false;
    setDirectory(null);
    setError("");
    setSearch("");
    setProvince("");
    setDistrict("");
    if (!provider || disabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await authenticatedFetch(
          `/api/transport-branches?provider=${provider}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "ໂຫຼດສາຂາບໍ່ສຳເລັດ");
        if (data.provider !== provider || !Array.isArray(data.branches))
          throw new Error("ໂຫຼດສາຂາບໍ່ສຳເລັດ");
        if (!cancelled) setDirectory(data);
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : "ໂຫຼດສາຂາບໍ່ສຳເລັດ",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [provider, attempt, disabled]);
  const branches = useMemo(
    () => (directory?.provider === provider ? directory.branches : []),
    [directory, provider],
  );
  const provinces = useMemo(
    () =>
      [...new Set(branches.map((b) => b.province).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "lo"),
      ),
    [branches],
  );
  const districts = useMemo(
    () =>
      [
        ...new Set(
          branches
            .filter((b) => !province || b.province === province)
            .map((b) => b.district)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "lo")),
    [branches, province],
  );
  const results = branches.filter(
    (b) =>
      (!province || b.province === province) &&
      (!district || b.district === district) &&
      `${b.name} ${b.code} ${b.district} ${b.province}`
        .normalize("NFC")
        .toLowerCase()
        .includes(search.trim().normalize("NFC").toLowerCase()),
  );
  const selected =
    results.find(
      (b) =>
        b.name === value.branch &&
        b.code === value.branchCode &&
        b.district === value.city &&
        b.province === value.province,
    )?.id || "";
  return (
    <div className="space-y-3" data-transport-branch-picker>
      <div>
        <label
          className="block text-sm font-bold text-slate-700"
          htmlFor={`${id}-carrier`}
        >
          ຝາກຂົນສົ່ງ
        </label>
        <select
          id={`${id}-carrier`}
          className={inputClass}
          value={carrier}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              branch: "",
              branchCode: "",
              city: "",
              province: "",
              transporters: event.target.value ? [event.target.value] : [],
            })
          }
        >
          <option value="">ເລືອກຂົນສົ່ງ</option>
          {TRANSPORTERS.map((name) => (
            <option key={name} value={name}>
              {name === "HAL Logistic" ? "HAL Express" : name}
            </option>
          ))}
          {carrier === "legacy-multiple" ? (
            <option value={carrier}>
              {value.transporters.join(", ")} (ບິນເກົ່າ)
            </option>
          ) : carrier &&
            !TRANSPORTERS.includes(carrier as (typeof TRANSPORTERS)[number]) ? (
            <option value={carrier}>{carrier}</option>
          ) : null}
        </select>
      </div>
      {provider && !disabled ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>ເລືອກສາຂາເພື່ອເຕີມເມືອງ ແລະແຂວງອັດຕະໂນມັດ</span>
            <a
              href={BRANCH_PROVIDERS[provider].sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-orange-700 underline"
            >
              ເບິ່ງສາຂາ {BRANCH_PROVIDERS[provider].name}
            </a>
          </div>
          {loading ? (
            <p className="mt-3 text-sm text-slate-600" role="status">
              ກຳລັງໂຫຼດສາຂາ…
            </p>
          ) : error ? (
            <div className="mt-3 text-sm text-red-700" role="alert">
              {error}{" "}
              <button
                type="button"
                className="ml-2 font-bold underline"
                onClick={() => setAttempt((n) => n + 1)}
              >
                ລອງໃໝ່
              </button>
            </div>
          ) : directory ? (
            <>
              {directory.stale ? (
                <p className="mt-2 text-xs text-amber-800" role="status">
                  ຂົນສົ່ງຂັດຂ້ອງ ກຳລັງໃຊ້ລາຍຊື່ສາຂາຈາກ{" "}
                  {new Date(directory.fetchedAt).toLocaleString("en-GB")}
                </p>
              ) : null}
              <div
                className="mt-3 grid gap-2 sm:grid-cols-2"
                data-unsaved-ignore="true"
              >
                <div>
                  <label
                    className="text-xs font-bold text-slate-700"
                    htmlFor={`${id}-province-filter`}
                  >
                    ກັ່ນຕອງແຂວງ
                  </label>
                  <select
                    id={`${id}-province-filter`}
                    className={inputClass}
                    value={province}
                    onChange={(e) => {
                      setProvince(e.target.value);
                      setDistrict("");
                    }}
                  >
                    <option value="">ທຸກແຂວງ</option>
                    {provinces.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="text-xs font-bold text-slate-700"
                    htmlFor={`${id}-district-filter`}
                  >
                    ກັ່ນຕອງເມືອງ
                  </label>
                  <select
                    id={`${id}-district-filter`}
                    className={inputClass}
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                  >
                    <option value="">ທຸກເມືອງ</option>
                    {districts.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <label
                  className="text-xs font-bold text-slate-700 sm:col-span-2"
                  htmlFor={`${id}-search`}
                >
                  ຄົ້ນຫາຊື່ ຫຼືລະຫັດສາຂາ
                  <input
                    id={`${id}-search`}
                    className={inputClass}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ພິມຊື່ສາຂາ / ລະຫັດ"
                  />
                </label>
              </div>
              <div className="mt-3">
                <label
                  className="block text-sm font-bold text-slate-700"
                  htmlFor={`${id}-branch-select`}
                >
                  ສາຂາຂົນສົ່ງ ({results.length.toLocaleString()})
                </label>
                <select
                  id={`${id}-branch-select`}
                  className={inputClass}
                  value={selected}
                  onChange={(e) => {
                    const branch = branches.find(
                      (b) => b.id === e.target.value,
                    );
                    if (branch)
                      onChange(addressForTransportBranch(provider, branch));
                  }}
                >
                  <option value="">
                    {results.length ? "ເລືອກສາຂາ" : "ບໍ່ພົບສາຂາຕາມທີ່ຄົ້ນຫາ"}
                  </option>
                  {results.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.code ? ` · ${b.code}` : ""} · {b.district} ·{" "}
                      {b.province}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["branch", "ຝາກສາຂາ"],
            ["branchCode", "ລະຫັດສາຂາ"],
            ["city", "ເມືອງ"],
            ["province", "ແຂວງ"],
          ] as const
        ).map(([field, label]) => (
          <label
            key={field}
            htmlFor={`${id}-${field}`}
            className={`block text-sm font-bold text-slate-700 ${field === "branch" || field === "branchCode" ? "sm:col-span-2" : ""}`}
          >
            {label}
            <input
              id={`${id}-${field}`}
              className={inputClass}
              value={value[field]}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  [field]: e.target.value,
                  ...(field === "branch" ? { branchCode: "" } : {}),
                })
              }
            />
          </label>
        ))}
      </div>
      {!disabled ? (
        <p className="text-xs text-slate-500">
          ສາມາດແກ້ໄຂທີ່ຢູ່ ຫຼືປ້ອນເອງໄດ້ ຫາກບໍ່ພົບສາຂາ.
        </p>
      ) : null}
    </div>
  );
}
