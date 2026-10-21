// Storefront posts: run with: node scripts/verify-shirt-catalog.mjs <path-to-pglite-dist/index.js>
// Uses isolated in-memory PostgreSQL. Never connects to the production database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.argv[2] || '@electric-sql/pglite');
const db = new PGlite();
let checks = 0;
const check = (value, expected, message) => { assert.deepEqual(value, expected, message); checks++; };
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create function auth.uid() returns uuid language sql stable as
    'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
  grant usage on schema auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.users(id uuid default gen_random_uuid(), auth_user_id uuid, role text, is_active boolean, permission_settings jsonb);
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant select, insert, delete on storage.objects to anon, authenticated;
  create policy original_media_access on storage.objects for all using (bucket_id = 'order-media') with check (bucket_id = 'order-media');
`);
const migration = await readFile(new URL('../supabase/migrations/20261012_create_shirt_catalog.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration); // migration is safely repeatable
checks++;
const managementMigration = await readFile(new URL('../supabase/migrations/20261013_storefront_management.sql', import.meta.url), 'utf8');
await db.exec(managementMigration);
await db.exec(managementMigration);
checks++;
const categoriesMigration = await readFile(new URL('../supabase/migrations/20261014_create_storefront_categories.sql', import.meta.url), 'utf8');
await db.exec(categoriesMigration);
await db.exec(categoriesMigration);
checks++;

const postsMigration=await readFile(new URL('../supabase/migrations/20261016_create_storefront_posts.sql',import.meta.url),'utf8');
await db.exec(postsMigration);
await db.exec("insert into public.storefront_posts(kind,title_lo) values('review','Existing review'),('fabric','Existing fabric')");
const collarMigration=await readFile(new URL('../supabase/migrations/20261019_create_storefront_collars.sql',import.meta.url),'utf8');
await db.exec(collarMigration);await db.exec(collarMigration);
check((await db.query('select collar_pricing,surcharge_lak from public.storefront_posts')).rows.map(x=>[x.collar_pricing,Number(x.surcharge_lak)]),[['standard',0],['standard',0]],'Existing posts remain valid');
const admin='00000000-0000-4000-8000-000000000001';
await db.query("insert into public.users(auth_user_id,role,is_active,permission_settings) values($1,'admin',true,'{}')",[admin]);
async function as(role,subject,sql,params=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[subject||'']);await db.exec(`set role ${role}`);return db.query(sql,params);}
const image=JSON.stringify([{url:'https://assets.example.com/collar.jpg',bucket:'shirt-catalog',path:'private/path.jpg',customer_id:'private'}]);
for(const [title,pricing,amount,published]of [['Normal','standard',0,true],['Premium','extra',20000,true],['Draft','extra',30000,false]])await as('authenticated',admin,"insert into public.storefront_posts(kind,title_lo,images,collar_pricing,surcharge_lak,is_published) values('collar',$1,$2,$3,$4,$5)",[title,image,pricing,amount,published]);
const feed=async(pricing='all')=>(await as('anon',null,"select * from public.storefront_posts_feed('collar',24,0,'',$1)",[pricing])).rows;
check((await feed()).map(x=>x.title_lo).sort(),['Normal','Premium'],'Feed hides drafts');
check((await feed('standard')).map(x=>x.title_lo),['Normal'],'Normal filter');
check((await feed('extra')).map(x=>x.title_lo),['Premium'],'Extra filter');
check(Number((await feed('extra'))[0].surcharge_lak),20000,'Actual surcharge is public');
check(Object.keys((await feed())[0].images[0]),['url'],'Private media metadata omitted');
check((await feed('unknown')).length,0,'Unknown filter returns no records');
check((await as('anon',null,"select * from public.storefront_posts_feed('review',24,0,'')")).rows.length,0,'Original four argument signature remains callable');
for(const [kind,pricing,amount]of [['collar','extra',0],['collar','standard',1],['collar','extra',-1],['collar','wrong',0],['fabric','extra',20000],['collar','extra','NaN']]){
 await assert.rejects(as('authenticated',admin,"insert into public.storefront_posts(kind,title_lo,collar_pricing,surcharge_lak) values($1,'Invalid',$2,$3)",[kind,pricing,amount]));checks++;
}
await assert.rejects(as('anon',null,'select * from public.storefront_posts'));checks++;
await assert.rejects(as('anon',null,"insert into public.storefront_posts(kind,title_lo) values('collar','Unauthorized')"));checks++;
await as('postgres',null,'select 1');await db.exec(collarMigration);
check((await feed()).length,2,'Repeating upgrade preserves collar posts');
await db.close();console.log(`${checks} PostgreSQL collar migration, filters, constraints and permission checks passed.`);
