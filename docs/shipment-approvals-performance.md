# Shipment approvals loading

Measured on 2026-10-28 using read-only queries against the configured Supabase
project. There were 977 delivery requests and no submitted requests at measurement
time. The original request query transferred 2,069,870 bytes before related data
was fetched, even though the page opened with the submitted filter selected.

The original handler also fetched all active users, queried transport notes for
pickup requests, and awaited each 100-ID transport/order batch sequentially.

The API now defaults to `status=submitted`. Changing the status selector fetches
that status; `status=all` explicitly loads history. Unsupported statuses return
400 after authentication and role checks. Search still covers all returned rows
in the selected status, including order codes, factory bill codes and names.

Only transport requests need transport notes. Only visible requests need related
orders/users, and an empty queue needs no related-table queries. Related batches
run up to four at a time per table; order/user lookups run in parallel. Request
rows are read in 500-row pages with an ID tie breaker to avoid silently stopping
at the database's default response limit. This is internal batching, not UI
pagination: selecting all history still transfers the full history dataset.

The browser cancels previous loads when the status changes, ignores their results
and clears old rows while fetching. Completed approval/rejection actions reload
the current status.

## Sample measurements

These are single local measurements of the handler's data phase, excluding token
verification, profile lookup, Next.js compilation, browser rendering and layout
requests. They are not a guaranteed production page-load time.

| Data phase | Time | Database queries | JSON response bytes | Visible requests |
| --- | ---: | ---: | ---: | ---: |
| Original handler | 5,288 ms | 22 | 1,803,294 | 552 |
| Updated default submitted queue | 152 ms | 1 | 136 | 0 |
| Updated all-history view | 2,355 ms | 18 | 1,649,221 | 552 |

The all-history comparison preserved the same 552 visible request IDs. History
size and database/network latency still affect its load time. If history grows
substantially, server-side search with UI pagination is a further improvement.

## Validation

```sh
node --test tests/shipment-approvals-auth.test.mjs
npx tsc --noEmit --incremental false
npx eslint 'app/(app)/shipments/approvals/page.tsx' app/api/shipments/approvals/route.ts tests/shipment-approvals-auth.test.mjs scripts/verify-browser-shipment-approvals.mjs
node scripts/verify-browser-shipment-approvals.mjs /path/to/playwright/index.mjs
```

The browser verification requires the local dev server on port 3000. It mocks
Supabase and API traffic and checks status filters, history search, cancellation
of stale loads and refresh after rejecting a request. It makes no production
writes.
