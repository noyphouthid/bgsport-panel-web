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

const postsMigration = await readFile(new URL('../supabase/migrations/20261016_create_storefront_posts.sql', import.meta.url), 'utf8');
await db.exec(postsMigration);await db.exec(postsMigration);checks++;
const admin='00000000-0000-4000-8000-000000000001';
const staff='00000000-0000-4000-8000-000000000002';
const accountant='00000000-0000-4000-8000-000000000003';
await db.query("insert into public.users(auth_user_id,role,is_active,permission_settings) values ($1,'admin',true,'{}'),($2,'staff',true,'{}'),($3,'accountant',true,'{}')",[admin,staff,accountant]);
async function as(role,subject,sql,params=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[subject||'']);await db.exec(`set role ${role}`);return db.query(sql,params);}
async function denied(role,subject,sql,params=[]){await assert.rejects(as(role,subject,sql,params));checks++;}
const images=JSON.stringify([{url:'https://assets.example.com/review.jpg',bucket:'shirt-catalog',path:'posts/review/protected.jpg',name:'private-filename.jpg',customer_id:'private-source'}]);
for(const [kind,title,published,order] of [['review','Real shirts',true,20],['review','Earlier review',true,10],['review','Draft review',false,0],['fabric','Mesh fabric',true,5],['fabric','Draft fabric',false,0]]){
 await as('authenticated',admin,'insert into public.storefront_posts(kind,title_lo,title_en,description_lo,images,is_published,sort_order) values($1,$2,$2,$3,$4,$5,$6)',[kind,title,'Details: '+title,images,published,order]);
}
const feed=async(kind,query='')=>(await as('anon',null,'select * from public.storefront_posts_feed($1,24,0,$2)',[kind,query])).rows;
check((await feed('review')).map(row=>row.title_lo),['Earlier review','Real shirts'],'Published reviews use configured order');
check((await feed('fabric')).map(row=>row.title_lo),['Mesh fabric'],'Fabric feed excludes reviews and drafts');
check((await feed('unknown')).length,0,'Unknown post kind exposes no rows');
check((await feed('review','real')).map(row=>row.title_lo),['Real shirts'],'Search matches titles regardless of case');
check((await feed('review','Details: Earlier')).map(row=>row.title_lo),['Earlier review'],'Search matches descriptions');
check((await feed('fabric',"' OR true --")).length,0,'Search input is data, not SQL');
const review=(await feed('review'))[0];
check(Object.keys(review).sort(),['id','kind','title_lo','title_en','description_lo','description_en','images'].sort(),'Public response has only display fields');
check(Object.keys(review.images[0]),['url'],'Photo paths, original filenames and source metadata stay private');
await denied('anon',null,'select * from public.storefront_posts');
await denied('anon',null,"insert into public.storefront_posts(kind,title_lo) values('review','Not allowed')");
await denied('anon',null,'update public.storefront_posts set is_published=true');
await denied('anon',null,'delete from public.storefront_posts');
check((await as('authenticated',staff,'select * from public.storefront_posts')).rows.length,0,'Staff have no publishing access by default');
await denied('authenticated',staff,"insert into public.storefront_posts(kind,title_lo) values('review','Not allowed')");
await as('postgres',null,"update public.users set permission_settings=$1 where auth_user_id=$2",[JSON.stringify({access:{'/shirt-catalog':'allow'}}),staff]);
check((await as('authenticated',staff,'select * from public.storefront_posts')).rows.length,5,'Existing catalog permission grants review/fabric management');
await as('postgres',null,"update public.users set permission_settings=$1 where auth_user_id=$2",[JSON.stringify({access:{'/shirt-catalog':'allow'},edit:{shirt_catalog:'deny'}}),staff]);
await denied('authenticated',staff,"insert into public.storefront_posts(kind,title_lo) values('fabric','Read only')");
check((await as('authenticated',staff,'select * from public.storefront_posts')).rows.length,5,'View-only access still sees drafts');
await denied('authenticated',accountant,"insert into public.storefront_posts(kind,title_lo) values('review','Not allowed')");
await as('postgres',null,"update public.users set is_active=false where auth_user_id=$1",[staff]);
check((await as('authenticated',staff,'select * from public.storefront_posts')).rows.length,0,'Inactive users cannot read posts');
await denied('authenticated',admin,"insert into public.storefront_posts(kind,title_lo,is_published) values('review','No photo',true)");
await denied('authenticated',admin,"insert into public.storefront_posts(kind,title_lo) values('bad','Invalid kind')");
await denied('authenticated',admin,"insert into public.storefront_posts(kind,title_lo) values('review','   ')");
await denied('authenticated',admin,"insert into public.storefront_posts(kind,title_lo,images) values('review','Bad media','[{\"url\":\"javascript:alert(1)\"}]')");
await denied('authenticated',admin,"insert into public.storefront_posts(kind,title_lo,images) values('review','Bad media','[\"https://example.com\"]')");
await denied('authenticated',admin,"insert into public.storefront_posts(kind,title_lo,images) select 'fabric','Too many images',jsonb_agg(jsonb_build_object('url','https://example.com/photo.jpg')) from generate_series(1,13)");
const id=(await as('authenticated',admin,"select id from public.storefront_posts where title_lo='Real shirts'")).rows[0].id;
await as('authenticated',admin,'update public.storefront_posts set is_published=false where id=$1',[id]);
check((await feed('review')).length,1,'Hiding a post removes it publicly');
await as('authenticated',admin,"update public.storefront_posts set title_lo='Updated review',is_published=true where id=$1",[id]);
check((await feed('review')).some(row=>row.title_lo==='Updated review'),true,'Edits reach the public feed');
await as('postgres',null,'select 1');await db.exec(postsMigration);
check((await feed('review')).length,2,'Repeating the migration keeps existing posts');
await as('authenticated',admin,"insert into public.storefront_posts(kind,title_lo,images) values('review','Private photo draft',$1)",[JSON.stringify([{url:'https://assets.example.com/draft.jpg',bucket:'shirt-catalog',path:'posts/draft-only.jpg'}])]);
await as('postgres',null,"insert into storage.objects(bucket_id,name) values ('shirt-catalog','posts/draft-only.jpg')");
check((await as('authenticated',admin,"delete from storage.objects where name='posts/draft-only.jpg' returning id")).rows.length,0,'Draft post photos are protected from cleanup');
await as('authenticated',admin,"delete from public.storefront_posts where title_lo='Private photo draft'");
check((await as('authenticated',admin,"delete from storage.objects where name='posts/draft-only.jpg' returning id")).rows.length,1,'Deleting an unshared post releases storage protection');
await as('authenticated',admin,"insert into public.storefront_posts(kind,title_lo,images,is_published,sort_order) select 'fabric','Fabric '||n,$1,true,100+n from generate_series(1,70)n",[images]);
check((await as('anon',null,"select * from public.storefront_posts_feed('fabric',999,0)")).rows.length,60,'Public responses cap page sizes');
check((await as('anon',null,"select * from public.storefront_posts_feed('fabric',0,-1)")).rows.length,1,'Invalid paging inputs remain bounded');
const first=(await as('anon',null,"select id from public.storefront_posts_feed('fabric',24,0)")).rows.map(row=>row.id);
const second=(await as('anon',null,"select id from public.storefront_posts_feed('fabric',24,24)")).rows.map(row=>row.id);
check(first.some(id=>second.includes(id)),false,'Stable pagination has no duplicated posts');
await db.close();console.log(`${checks} PostgreSQL storefront-post publishing, search, permissions and media checks passed.`);
