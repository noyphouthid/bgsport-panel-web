import {
  BRANCH_PROVIDERS,
  normalizeTransportBranches,
  type BranchProvider,
  type TransportBranchDirectory,
} from "@/lib/transport-branches";

// Keep fields on separate lines: the carrier's GraphQL resolver rejects compact queries.
export const ANOUSITH_BRANCH_QUERY = `query Branches($limit: Int, $skip: Int, $where: BranchWhereInput) {
  branches(limit: $limit, skip: $skip, where: $where) {
    total
    data {
      id_branch
      branch_name
      branch_code
      districtName
      public
      provinceID {
        provinceName
      }
    }
  }
}`;
const CACHE_MS = 6 * 60 * 60 * 1000;
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
type Entry = { directory: TransportBranchDirectory; nextAttempt: number };
export function createTransportBranchLoader(
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  const cache = new Map<BranchProvider, Entry>();
  const pending = new Map<BranchProvider, Promise<TransportBranchDirectory>>();
  async function load(
    provider: BranchProvider,
  ): Promise<TransportBranchDirectory> {
    const saved = cache.get(provider);
    if (saved && saved.nextAttempt > now()) return saved.directory;
    const inFlight = pending.get(provider);
    if (inFlight) return inFlight;
    const request = (async () => {
      try {
        const deadline = AbortSignal.timeout(45000);
        let raw: unknown[] = [];
        const requestJson = async (url: string, init?: RequestInit) => {
          const response = await fetcher(url, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.any([deadline, AbortSignal.timeout(12000)]),
          });
          if (!response.ok)
            throw new Error(`Carrier returned HTTP ${response.status}`);
          return response.json();
        };
        if (provider === "hal") {
          const data: unknown = await requestJson(
            "https://hal.hal-logistics.la/api/v1/listing/branches?is_active=true",
          );
          if (!Array.isArray(data)) throw new Error("Invalid HAL directory");
          raw = data;
        } else {
          const seen = new Set<string>();
          const limit = 200;
          let complete = false;
          for (let page = 0; page < 25; page++) {
            const data = await requestJson(
              "https://pro.api.anousith.express/graphql",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Origin: "https://app.anousith.express",
                  Referer: "https://app.anousith.express/",
                },
                body: JSON.stringify({
                  operationName: "Branches",
                  variables: {
                    where: { public: 1, isDeleted: 0 },
                    limit,
                    skip: page * limit,
                  },
                  query: ANOUSITH_BRANCH_QUERY,
                }),
              },
            );
            const result = data?.data?.branches;
            if (
              data?.errors?.length ||
              !Array.isArray(result?.data) ||
              !Number.isSafeInteger(result.total) ||
              result.total < 0
            )
              throw new Error("Invalid Anousith directory");
            for (const branch of result.data) {
              if (
                typeof branch?.id_branch !== "string" ||
                seen.has(branch.id_branch)
              )
                throw new Error("Anousith pagination changed; retry later");
              seen.add(branch.id_branch);
            }
            raw.push(...result.data);
            if (raw.length === result.total) {
              complete = true;
              break;
            }
            if (result.data.length < limit || raw.length > result.total)
              throw new Error("Incomplete Anousith directory");
          }
          if (!complete)
            throw new Error("Anousith directory exceeded page limit");
        }
        const branches = normalizeTransportBranches(provider, raw);
        if (!branches.length) throw new Error("Carrier directory is empty");
        const directory: TransportBranchDirectory = {
          provider,
          branches,
          fetchedAt: new Date(now()).toISOString(),
          stale: false,
          sourceUrl: BRANCH_PROVIDERS[provider].sourceUrl,
        };
        cache.set(provider, { directory, nextAttempt: now() + CACHE_MS });
        return directory;
      } catch (error) {
        if (saved && now() - Date.parse(saved.directory.fetchedAt) < STALE_MS) {
          const directory = { ...saved.directory, stale: true };
          cache.set(provider, { directory, nextAttempt: now() + RETRY_MS });
          return directory;
        }
        throw error;
      } finally {
        pending.delete(provider);
      }
    })();
    pending.set(provider, request);
    return request;
  }
  return load;
}
export const loadTransportBranchDirectory = createTransportBranchLoader();
