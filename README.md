This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## BG SPORT STORE publishing

The independent storefront lives in `../bgsport-store-web` and shares this project's
Supabase database and media. Apply `supabase/migrations/20261012_create_shirt_catalog.sql`
once in the existing database, then manage posts at `/shirt-catalog`.
Existing gallery images have an “ເພີ່ມໃສ່ໜ້າຮ້ານ” link to create a catalog entry.
Library posts automatically use the queue's order code (for example `RK26-10048`);
their code is read-only. Images from the same order can be grouped in one entry.
Directly uploaded designs have a manually editable code. This behavior needs no
additional database migration.
Admins/managers can publish by default; additional staff/designers need the
`/shirt-catalog` access permission. Prices appear only in the storefront's Store page.
Public reads use `storefront_catalog`; drafts, media metadata and customer/order data
are excluded. Shared source images cannot be deleted until removed from catalog entries.

### Store text, promotions, and batch publishing

Apply `supabase/migrations/20261013_storefront_management.sql` after the original
catalog migration. It adds caption/slogan fields, shop text settings, promotion
CRUD, the public `storefront_content` RPC, and atomic bulk publishing. The current
production database already has the original catalog migration; apply only the new
migration for this update. The available app API keys cannot apply schema migrations.

At `/shirt-catalog`, use **ຂໍ້ຄວາມຮ້ານ** for Lao/English shop names, slogans, and
home/about copy; empty text retains the storefront default. Use
**ສະໄລດ໌ໂປຣໂມຊັນ** to create, edit, order, publish, or delete promotional slides.
Upload a promotion image or select an existing library image. Draft promotions are
private. Published slides advance every six seconds, with arrows, dots, pause,
keyboard, and touch controls; reduced-motion preferences disable initial autoplay.

**ເລືອກຈາກຄັງເປັນກຸ່ມ** selects images across orders and groups them by order code.
Review each group's name, category, and channel before publishing. Existing entries
keep their descriptions, captions, slogans, prices, and images; selected media is
added without duplication, with a limit of 12 images per design. The entire batch
rolls back if any entry is invalid. List checkboxes support bulk publish, hide, and
delete; category checkboxes filter multiple categories. Deleting a post or promotion
keeps its source image in the library. Both catalog and promotion references protect
shared storage objects against deletion.

### Manage work categories

Apply `supabase/migrations/20261014_create_storefront_categories.sql` after the
storefront management migration. `/shirt-catalog` now has a **ປະເພດງານ** tab:
create categories with a stable slug, Lao/English names, a preset icon, and display
order. Edit names/icons/order and delete unused categories. Foreign keys prevent
deleting categories used by any design, including drafts; reassign those designs
before deletion. Existing five categories and design assignments are preserved.

Single design forms, batch publishing, admin filters, storefront category cards,
and Catalog/Store filters all use the managed category list. The public content
RPC exposes only display fields. Old databases keep the original five categories
until this migration is applied. Category writes share the catalog's edit permission.

Rebuild/deploy the panel separately from the Sites storefront after the migration.

The isolated PostgreSQL checks can be run with a locally installed PGlite module:
`node scripts/verify-shirt-catalog.mjs /path/to/@electric-sql/pglite/dist/index.js`.

## Delivery marketing analysis

Apply `supabase/migrations/20261016_add_order_work_category.sql` before enabling
the updated order creation/conversion flows. The available application API keys
cannot run schema migrations. The migration adds a nullable `orders.work_category`
with the seven requested shirt uses plus Other; it preserves every existing order
as unclassified and is safe to run again.

New orders require a category, and both factory-deposit conversion flows ask for
one before creating the order. Existing orders can be classified at their edit page;
legacy orders can still be edited without assigning a category. These categories
are independent of the order code TYPE and storefront design categories.
Excel imports accept an optional `work_category` column containing a category
code or its exact Lao display name. Invalid values fail preview validation;
older spreadsheets without the column retain existing categories on upsert.

The report also includes an interactive Laos map with all 18 province-level areas,
Lao labels, density colors, province rankings, selected-province work categories,
zoom controls, province filter drill-down and standalone SVG export. It follows
the same date, destination and category filters as the report. Customers are
distinct normalized order phone/WhatsApp contacts per destination province;
repeat orders do not add customers. A contact with deliveries in multiple
provinces is counted in each destination but once in the nationwide total.
Missing/invalid contacts remain order counts and are explicitly shown separately.
Province aliases are normalized for reporting without changing stored addresses;
unknown or ambiguous locations are kept visible outside the map.
This map requires no additional migration or external map API key. Geometry
source and license are documented in `lib/maps/SOURCES.md`.

`/reports/customer-delivery` uses the recorded transport district/province.
Store pickup is grouped under Vientiane Capital without inventing a district.
Transport requests require both destination fields when saved. No village field
or separate customer residential address is introduced.

The report includes destination/category filters, a choice of delivery or order
date filtering, and a current-year shortcut. Marketing tables count delivered
orders once, use the latest delivered request per order in the selected report,
and group work categories by **order month**. Shirt counts include free shirts;
sales use the order's net total, which can include pants, rather than money
collected at handoff. These are order counts, not unique customer counts.
Unknown locations/categories stay visible. XLSX analysis exports contain province,
district and monthly-category sheets; regular XLSX/PDF/print exports include
destination and category. The report paginates shipment requests and batches
order lookups, and keeps reading older databases without the category column.

Run `node --test tests/delivery-marketing.test.mjs tests/report-query.test.mjs`.
Map and contact aggregation checks: `node --test tests/customer-province-map.test.mjs`.
Validate the migration in isolated PostgreSQL with
`node scripts/verify-delivery-marketing.mjs /path/to/@electric-sql/pglite/dist/index.js`.
With the development server running, mocked browser checks can be run using
`node scripts/verify-browser-delivery-marketing.mjs /path/to/playwright/index.mjs`.

## Carrier branch directories

`/shipments` and `/shipments/transport-note` share a searchable branch picker for
[HAL Express](https://halexpress.la/branch) and
[Anousith Express](https://app.anousith.express/branches). Selecting a branch fills
its name, district and canonical province into the existing address fields and
bill preview. A bill uses one selected carrier; legacy records with multiple
carriers remain intact until the operator explicitly chooses a carrier. Switching
carriers clears the previous address. Existing saved addresses are never replaced
just because the directory loads. Mixay and unlisted branches allow manual entry.

The authenticated `/api/transport-branches?provider=hal|anousith` route reads only
fixed public carrier endpoints. HAL uses `is_active=true` and excludes hidden,
closed and deleted branches. Anousith paginates all public, undeleted branches;
GraphQL errors or incomplete pages cannot become a partially successful directory.
Only branch IDs, names, codes, districts and provinces are returned to the browser.
No carrier account or API key is needed. Existing text fields store address
snapshots for requests and transport notes. For branch-code snapshots, apply
`supabase/migrations/20261017_add_transport_branch_code.sql`; it adds nullable
`transport_notes.branch_code` and `shipment_delivery_requests.transport_branch_code`
columns without changing legacy addresses. The app API keys cannot apply this
schema migration. Branch selection fills the code, manual entry is supported,
and changing the branch name or carrier clears the previous code. Saved codes
appear immediately below the branch in both preview and printed labels. Legacy
notes without codes show a dash. Code-bearing saves check column availability
before any write, and display the migration filename if storage is unavailable.
Legacy saves with no code still work before the migration.

Each server process caches a successful directory for six hours and shares
concurrent requests. During an upstream outage it can serve last-good data up to
seven days old, displaying its timestamp, with retries limited to once per minute.
A process restart clears this memory cache. Without cached data, the form displays
a retry button and keeps manual address entry available. Submitted shipment
requests retain their editing lock.

Run `node --test tests/transport-branches.test.mjs` for normalization, pagination,
caching, failure and route authentication checks. Add `VERIFY_LIVE_BRANCHES=1`
to verify both public APIs using read-only calls. With the development server
running, use `node scripts/verify-browser-transport-branches.mjs /path/to/playwright/index.mjs`
for mocked saving and browser checks; it makes no production writes. Code and
print checks: `node --test tests/transport-branch-code.test.mjs`.
Validate the branch-code migration in isolated PostgreSQL with
`node scripts/verify-transport-branch-code.mjs /path/to/@electric-sql/pglite/dist/index.js`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
