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
