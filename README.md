This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## BG SPORT STORE publishing

### Storefront tracking and collar styles (2026-10-19)

The customer tracking screen now lives at
`https://bg-sport-store.famousmaple1.chatgpt.site/track/`. Deploy this panel to
redirect `/track` (including an optional `?q=`), the root page and the login-page
tracking link. Set `NEXT_PUBLIC_STOREFRONT_URL` before building to use a different
HTTPS storefront origin. Keep `/api/public/order-tracking` and its design-image
API running here: the shop Worker uses these existing APIs without panel login.
Production currently uses `https://bgsportaccounting.com` as the ERP API origin.

Apply **only** `supabase/migrations/20261019_create_storefront_collars.sql` in the
existing Supabase SQL Editor after `20261016_create_storefront_posts.sql`.
Then deploy the panel to enable `/shirt-catalog/collars`: upload photos, choose
normal collars or extra-charge collars, enter a positive surcharge in LAK/shirt,
and publish. The storefront `/collars/` page filters both groups. Existing
review/fabric posts, permissions and media protections remain in place. This
catalog does not change order-entry collar pricing. Tracking needs no migration.

Verify the migration with `node scripts/verify-storefront-collars.mjs /path/to/pglite/dist/index.js`
and admin/public flows with `node scripts/verify-browser-storefront-posts.mjs /path/to/playwright/test.mjs`.

### Existing catalog setup

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

### Customer-photo reviews and fabric posts

Apply only `supabase/migrations/20261016_create_storefront_posts.sql` after
`20261013_storefront_management.sql`, then deploy the updated panel. This migration
is independent of the multiple-category-tag migration. App API keys cannot apply
schema migrations; run the SQL in the existing project's Supabase SQL Editor.

Use `/shirt-catalog/reviews` for **ລີວິວສິນຄ້າຈິງ** and
`/shirt-catalog/fabrics` for **ລາຍການຜ້າ**. Both pages are linked in the sidebar
and catalog navigation and inherit the catalog's access/edit permission. Upload
up to 12 JPG/PNG/WebP photos per post (15 MB per source), order photos to select the
cover, add Lao/English titles and details, choose display order, and save as a draft
or publish. Published posts require at least one photo. Each page supports title
search, published/draft filters, pagination, editing, hiding and deletion.

The storefront's `/reviews/` and `/fabrics/` use the narrow `storefront_posts_feed`
RPC with kind, search and pagination. The public feed omits drafts, original file
names and storage metadata. A gallery shows each post's photos and translated
details; absent English text falls back to Lao. No example customer reviews or
fabric claims are seeded. Post deletion keeps source images; linked photos remain
protected by the existing storage cleanup policies while any post uses them.
The existing `/fabric` pricing settings are managed independently.

### Multiple shirt category tags

Apply only `supabase/migrations/20261016_add_shirt_catalog_category_tags.sql` after
the category migration below, then deploy the panel. A design can select multiple
**Tag ປະເພດເສື້ອ**, for example Teamwear + Polo, in both the individual form and
batch publisher. Existing designs retain their category. Admin and public
Catalog/Store filters match any assigned tag, while each design appears once in
the full list. Cards and details display all selected category names.

The migration updates the public RPC and atomic batch publisher, validates all
category memberships with foreign keys, and prevents deleting secondary categories
that are in use. Existing clients that send only `category` remain compatible and
preserve secondary tags. Deploying the storefront before the migration is safe;
it also accepts the old single-category public response. Apply the migration using
Supabase SQL Editor; app API keys cannot execute database schema changes.

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
[HAL Express](https://halexpress.la/branch),
[Anousith Express](https://app.anousith.express/branches), and
[Unitel Logistic](https://unilogistic.besgroup.vn/lo/offices). Selecting a branch fills
its name, district and canonical province into the existing address fields and
bill preview. A bill uses one selected carrier; legacy records with multiple
carriers remain intact until the operator explicitly chooses a carrier. Switching
carriers clears the previous address. Existing saved addresses are never replaced
just because the directory loads. Mixay and unlisted branches allow manual entry.

The authenticated `/api/transport-branches?provider=hal|anousith|unitel` route
loads all three carriers from `public.shipping_branches` using the server
service-role client, filtering by `company` (`HAL`, `ANOUSITH`, or `UNITEL`) and
`is_active = true`. It paginates the whole
directory in stable ID order, validates row counts and duplicate source IDs,
and returns no partial list if any page fails. There are no calls or fallbacks to
carrier branch APIs, including when the table is missing or empty. Database
reads are uncached, so imported edits appear on the next picker load. Existing
bill/address/code snapshots are preserved.

For a fresh database, apply
`supabase/migrations/20261018_import_anousith_branches.sql` with a PostgreSQL
migration runner or direct database connection. This **single transaction creates the table and imports all 825 Anousith
records from the user's `shipping_branches_import_partial.sql`**. It does not
import the 20 partial Unitel rows or any HAL data. `(company, source_id)` is the
unique import key: branch codes repeat and one record has no code. Re-running
updates the same source records without duplicating them, changing their IDs or
created dates, reactivating disabled rows, or deleting other branches. Address
contact text, village metadata and raw source JSON are preserved as supplied;
the picker receives only name/code/district/province. Raw table access is denied
to browser roles with RLS enabled; the authenticated endpoint returns only the
picker fields. The available app keys cannot create a missing database table.
Until a carrier has been imported, its picker displays an import instruction and allows
manual address entry. A previously imported table with duplicate source IDs must
be corrected before the unique index can be installed; the import never deletes
those records to force uniqueness.

`supabase/migrations/20261019_import_hal_unitel_branches.sql` adds **832 HAL** and
**895 Unitel** offices using the same repeatable source-ID key. It requires the
table from the Anousith migration and never changes Anousith or saved bills.
The user-provided `HAL Logistic.json` contains only 22 provinces, 151 districts,
and 857 villages; actual active office records were obtained once from HAL's
public directory. `Unitel Logistic.json` contains only 20/895 offices. Those 20
uploaded records were preserved and matched the public source; all remaining
pages were fetched once to complete the 895-office snapshot. Unitel district
names were matched within each province using its geography directory; one
source office has an unverifiable district and retains a blank for manual entry.
Only source-verified locations were stored. No branch APIs are used at runtime.

The remaining import was applied to the existing Supabase table with one atomic
REST upsert. `node scripts/apply-remaining-shipping-branches.mjs` checks the
reviewed snapshot against the database without writing. Add `--apply` to reimport
that HAL/Unitel snapshot in one transaction, preserving existing IDs, creation
dates and manual active flags. It verifies all imported fields and that Anousith
is unchanged. It does not create tables or delete other records. The full SQL
snapshots can exceed the SQL Editor query-size limit; use a migration runner or
direct database connection for them. The existing database already contains all
2,552 imported offices, so there is no need to paste either snapshot into SQL
Editor again. To check counts in SQL Editor, run only:

```sql
select company, count(*) as branch_count
from public.shipping_branches
group by company
order by company;
```

Long branch names use tighter spacing in the preview and printed label to keep
the footer/barcode inside the existing 80×100 mm paper size.
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

The `ລົດໂດຍສານ` option supports passenger-bus delivery in both shipment
requests and standalone notes. It uses manual `ຝາກລົງ` (drop-off), district and
province fields and requires all three before saving. Recipient name/phone and
origin/destination shipping-charge choices use the existing fields. Bus labels
show the drop-off instead of a branch, omit branch-code/carrier rows, and print
the selected charge mode. Switching from a carrier clears its old code/address.
The drop-off is stored in `branch`/`transport_branch`; existing reports and
province analysis continue using the recorded district/province. No carrier API
or new schema migration is required for this option.

All imported directories are read directly from Supabase on each picker load;
there is no six-hour external API cache or API fallback. Database errors leave
manual address entry available. Submitted requests retain their editing lock.

Run `node --test tests/transport-branches.test.mjs tests/shipping-branches.test.mjs`
for normalization, company scoping, pagination, failure and authentication checks.
With the development server
running, use `node scripts/verify-browser-transport-branches.mjs /path/to/playwright/index.mjs`
for mocked saving and browser checks; it makes no production writes. Code and
print checks: `node --test tests/transport-branch-code.test.mjs`.
Validate the branch-code migration in isolated PostgreSQL with
`node scripts/verify-transport-branch-code.mjs /path/to/@electric-sql/pglite/dist/index.js`.

Imported Anousith reader checks: `node --test tests/shipping-branches.test.mjs`.
Validate the SQL and all 825 rows in isolated PostgreSQL with
`node scripts/verify-shipping-branch-import.mjs /path/to/@electric-sql/pglite/dist/index.js`.
This checks both import snapshots, repeat imports, ID stability, source-field
preservation, disabled rows, database permissions and isolation between carriers.

## Queue customers, quotations, and factory deposits

Apply `supabase/migrations/20261020_link_queue_customer_documents.sql` before
deploying this workflow. The available application API keys cannot apply schema
migrations; run the file through Supabase SQL Editor or a database migration runner.
It adds customer/order links and categories without rewriting existing documents.

`/design-queue` stores the customer name, phone and work category alongside each
queue order. New queues require a category from the existing order category list;
old unclassified queues can still be edited. TYPE and urgent/normal priority remain
separate fields. Use **ສ້າງໃບປະເມີນ** on a queue, or search by customer name,
phone, queue number or full order code at `/quotations/new`. Searches include
pending and completed queues, normalize phone spacing, return up to 25 matches,
and respect existing queue visibility permissions. Select the specific order when
a phone has multiple queues. Selection fills the customer, category and full code
(for example `PK26-10001`) and stores the queue UUID. Customer edits in a quotation
do not update the original queue; later queue edits do not change saved documents.

New quotations receive `QT26-10-000`, `QT26-10-001`, etc.; factory deposits receive
`DPF26-10-000`, `DPF26-10-001`, etc. Each series starts at zero independently for
each calendar month/year based on its document date. Database counters allocate
numbers atomically when saved. The form shows a prefix hint until then. Printing
a quotation saves it first so that its printed number is persisted. Subsequent
saves, printing and date edits preserve the number; deleted numbers are not reused.
Legacy document numbers remain unchanged.

**ສ້າງໃບມັດຈຳ** saves the quotation and opens the deposit form with the queue's
order code, the quotation's own number, customer details and category. These are
distinct identifiers. The category also carries into order conversion; old
unclassified deposits retain the existing category prompt.

Validate SQL behavior and RLS with
`node scripts/verify-queue-customer-documents.mjs /path/to/@electric-sql/pglite/dist/index.js`.
With the development server running, use
`node scripts/verify-browser-queue-customer-documents.mjs /path/to/playwright/index.mjs`
to check the form flow with mocked backend calls and no production writes.

### Design queue deposits

Apply `supabase/migrations/20261021_add_queue_design_deposits.sql` after
`20261020_link_queue_customer_documents.sql`. New queues offer free design or a
received design deposit. Choosing a deposit requires a positive amount in kip;
choosing free clears and hides the amount. Queue edits restore the saved choice
and amount, and the list displays the recorded payment separately from notes.
Existing queues retain an unspecified payment choice; no amount is inferred from
notes, including notes containing numbers.

Selecting a queue by customer search or its quotation link fills **ຫັກຄ່າແບບ**
from the recorded deposit. Free or unrecorded deposits leave the input blank and
contribute zero to calculations. Linked quotation amounts are read-only; update
the queue and reselect it to use a revised amount. Switching to a free queue or
unlinking clears a previously selected fee. Saved quotations retain their monetary
snapshot on ordinary edits even if the original queue payment changes. Existing
quotation amounts are not backfilled or rewritten. The amount continues into
factory deposits through the existing quotation flow.

Run `node scripts/verify-queue-design-deposits.mjs /path/to/@electric-sql/pglite/dist/index.js`
for payment validation, inheritance, historical preservation and RLS checks. The
browser workflow script above also checks paid/free switching, blank free fees,
queue editing and saved quotation amounts.

### Repeat-order codes

Apply `supabase/migrations/20261022_allow_order_code_suffixes.sql` after
`20261021_add_queue_design_deposits.sql` through Supabase SQL Editor or the database
migration runner. Application API keys cannot apply this schema change.

Order codes in quotations and factory deposits remain editable when linked to a
design queue. Codes such as `RK26-9124+2` and `RK26-9124+A` persist through quotation
creation, deposit creation, subsequent edits and conversion to an order. The order
create/edit forms already support letters and `+` in ORDER No. Search fields use
the complete code. List pages continue to show 20 results per page.

The link trigger preserves explicitly supplied order codes and inherits the source
code when none is supplied. Changing only a document's source link inherits the
new source code. Customer/category links and recorded design deposits continue to
follow the existing workflow. No historical codes, document numbers or queue
sequences are rewritten.

Run `node scripts/verify-order-code-suffixes.mjs /path/to/@electric-sql/pglite/dist/index.js`
for code round trips and database inheritance/reselection checks. The browser
workflow script also exercises editable linked codes, quotation printing and
deposit save/reopen with numeric and alphabetic suffixes.

## Automatic production queue

Apply `supabase/migrations/20261023_automate_production_queue.sql` before deploying
these queue changes. This migration requires the existing deposit, pants-item,
production queue and queue actor migrations. It adds automatic enqueueing on
submitted deposits, piece-based monthly assignment, owner-only RLS and the
atomic server status RPC. The public/anon queue-management RPC grants are removed.
The API needs the existing `SUPABASE_SERVICE_ROLE_KEY` server configuration.

Whole orders go to the active production account with the lowest assigned piece
total in the queue's production month, then the lowest order count and stable
user ID. Completed orders count toward that month's total. Shirts, free pieces,
extra sizes and pants are included. Superadmins oversee the queue and are excluded
from automatic assignment. Exact equality depends on order sizes because orders
are kept together. Existing valid owners remain assigned; unassigned work and
queued work belonging to unavailable accounts are allocated during sync. When no
production account is active, work waits unassigned and is visible to superadmins.

Production users can read and update only their own jobs at every stage. Status
reverts preserve ownership. The queue displays one planner at a time; superadmins
can switch active planners and review their combined monthly summaries at
`/factory-production-queue/activity`. Status-stage totals in that summary are
cumulative within the selected queue month. Disabled accounts are hidden from
planner selection and summaries, including their summary totals. Historical jobs
remain stored. The queue month remains fixed when
editing source details so historical workload is not silently moved between months.

Verification uses isolated SQL and mocked API/browser data:

```bash
node scripts/verify-production-queue.mjs /path/to/@electric-sql/pglite/dist/index.js
node scripts/verify-production-queue-api.mjs
node scripts/verify-browser-production-queue.mjs /path/to/playwright/test.mjs
npm run build
```

The browser check uses the local development server and Chrome; set
`TEST_BASE_URL` or `CHROME_PATH` when needed. No live database writes are performed
by these checks.

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
