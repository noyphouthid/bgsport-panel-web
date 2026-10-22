// Execute the actual route handlers with an isolated backend/auth adapter.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { NextRequest } = require("next/server");
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const a = id(1), b = id(2);
let actor = { profileId:a,role:"production" }, syncError = null, rpcCalls = [], reads = [];
const rows = Array.from({length:1100},(_,i)=>({id:id(i+10),planner_user_id:i%2?a:b,status:["queued","pattern_laid","ready_for_print","sent_to_factory"][i%4],deposit:{status:"submitted"}}));
rows.push({id:id(9999),planner_user_id:a,status:"queued",deposit:{status:"draft"}});
const users = [{id:a,role:"production",full_name:"A"},{id:b,role:"production",full_name:"B"}];
class Query {
  constructor(table) {this.table=table;this.filters=[];this.offset=0;this.limit=1000;this.singleRow=false;}
  select(){return this;} order(){return this;}
  eq(key,value){this.filters.push(row=>row[key]===value);return this;}
  in(key,values){this.filters.push(row=>values.includes(key==="deposit.status"?row.deposit.status:row[key]));return this;}
  range(start,end){this.offset=start;this.limit=end-start+1;return this;}
  single(){this.singleRow=true;return this;} maybeSingle(){return this.single();}
  then(resolve,reject){
    reads.push({table:this.table,offset:this.offset});
    const source=this.table==="users"?users:rows;
    const result=source.filter(row=>this.filters.every(f=>f(row))).slice(this.offset,this.offset+this.limit);
    return Promise.resolve({data:this.singleRow?result[0]??null:result,error:null}).then(resolve,reject);
  }
}
const client={from:table=>new Query(table),rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:1,error:syncError};}};
const deps={
  "@/lib/admin-api-auth":{getActorFromAuthHeader:async()=>actor},
  "@/lib/supabase-admin":{getSupabaseAdmin:()=>client},
  "@/lib/factory-production-queue-server":{FACTORY_PRODUCTION_QUEUE_FULL_SELECT:"test-select",FACTORY_PRODUCTION_VISIBLE_STATUS_SET:new Set(["queued","pattern_laid","ready_for_print","sent_to_factory"])},
};
async function load(path) {
  const code=ts.transpileModule(await readFile(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  new Function("require","module","exports",code)(name=>deps[name]||require(name),module,module.exports);
  return module.exports;
}
const list=await load("../app/api/factory-production/queue/route.ts");
const detail=await load("../app/api/factory-production/queue/[id]/route.ts");
const req=(path="",body)=>new NextRequest(`http://localhost/api/factory-production/queue${path}`,body?{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{});
let result=await list.GET(req()); assert.equal(result.status,200);
let data=await result.json(); assert.equal(data.rows.length,550); assert.ok(data.rows.every(row=>row.planner_user_id===a&&row.deposit.status==="submitted"));
assert.ok(reads.some(read=>read.table==="factory_production_queue_entries"&&read.offset===500));
for(const other of rows.filter(row=>row.planner_user_id===b).slice(0,4)) {
  assert.equal((await detail.GET(req(),{params:Promise.resolve({id:other.id})})).status,404);
}
assert.equal((await detail.GET(req(),{params:Promise.resolve({id:rows[1].id})})).status,200);
actor={profileId:a,role:"superadmin"};
data=await (await list.GET(req())).json(); assert.equal(data.rows.length,1100); assert.equal(data.profile.role,"superadmin");
assert.equal((await detail.GET(req(),{params:Promise.resolve({id:rows[0].id})})).status,200);
actor={profileId:a,role:"production"};
assert.equal((await list.PATCH(req("",{action:"claim",id:rows[0].id}))).status,400);
assert.equal((await list.PATCH(req("",{action:"update_actor_assignments",id:rows[0].id,plannerUserId:a}))).status,400);
assert.equal((await list.PATCH(req("",{action:"update_status",id:"invalid",targetStatus:"queued"}))).status,400);
assert.equal((await list.PATCH(req("",{action:"update_status",id:rows[1].id,targetStatus:"invalid"}))).status,400);
assert.equal((await list.PATCH(req("",{action:"bulk_status",ids:[rows[1].id,rows[1].id],targetStatus:"pattern_laid",p_actor_user_id:b}))).status,200);
assert.deepEqual(rpcCalls.at(-1).args,{p_ids:[rows[1].id],p_target_status:"pattern_laid",p_actor_user_id:a});
syncError={message:"forbidden"};
assert.equal((await list.PATCH(req("",{action:"update_status",id:rows[0].id,targetStatus:"queued"}))).status,403);
assert.equal((await list.GET(req("?sync=1"))).status,500,"Sync failures must not be silently ignored");
actor=null;
assert.equal((await list.GET(req())).status,403); assert.equal((await list.PATCH(req("",{action:"bulk_status"}))).status,403);
assert.equal((await detail.GET(req(),{params:Promise.resolve({id:rows[0].id})})).status,403);
console.log("Production queue API passed: owner-only lists/details at every stage, pagination, superadmin access, denied manual claims/assignments, validated mutations, trusted actor identity and propagated sync errors.");
