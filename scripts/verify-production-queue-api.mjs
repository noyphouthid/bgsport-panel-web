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
const rows = Array.from({length:1100},(_,i)=>({id:id(i+10),planner_user_id:i%2?a:b,pattern_user_id:i%2?a:b,print_user_id:i%2?a:b,dispatch_user_id:i%2?a:b,workload_piece_qty:10,production_completed_at:"2026-10-25T10:00:00Z",queue_year:2026,queue_month:10,status:["queued","in_production","awaiting_factory","sent_to_factory"][i%4],deposit:{status:"submitted",production_queue_legacy:false,production_queue_entered_at:"2026-10-23T00:00:00Z"}}));
rows.push({id:id(9999),planner_user_id:a,status:"queued",deposit:{status:"draft"}});
rows.push({id:id(9998),planner_user_id:a,status:"queued",deposit:{status:"submitted",production_queue_legacy:true,production_queue_entered_at:null}});
const get = (row,key) => key.split(".").reduce((value,part)=>value?.[part],row);
const users = [{id:a,role:"production",is_active:true,full_name:"A"},{id:b,role:"production",is_active:true,full_name:"B"}];
class Query {
  constructor(table) {this.table=table;this.filters=[];this.offset=0;this.limit=1000;this.singleRow=false;}
  select(columns){this.columns=columns;return this;} order(){return this;}
  eq(key,value){this.filters.push(row=>get(row,key)===value);return this;}
  in(key,values){this.filters.push(row=>values.includes(key==="deposit.status"?row.deposit.status:row[key]));return this;}
  not(key,op,value){this.filters.push(row=>get(row,key)!==value);return this;}
  or(filter){const parts=filter.split(",").map(part=>part.split(".eq."));this.filters.push(row=>parts.some(([key,value])=>get(row,key)===value));return this;}
  gte(key,value){this.filters.push(row=>Date.parse(get(row,key))>=Date.parse(value));return this;}
  lt(key,value){this.filters.push(row=>Date.parse(get(row,key))<Date.parse(value));return this;}
  range(start,end){this.offset=start;this.limit=end-start+1;return this;}
  single(){this.singleRow=true;return this;} maybeSingle(){return this.single();}
  then(resolve,reject){
    reads.push({table:this.table,offset:this.offset,columns:this.columns});
    const source=this.table==="users"?users:this.table==="factory_production_queue_settings"?[{started_at:"2026-10-23T00:00:00Z"}]:rows;
    const result=source.filter(row=>this.filters.every(f=>f(row))).slice(this.offset,this.offset+this.limit);
    return Promise.resolve({data:this.singleRow?result[0]??null:result,error:null}).then(resolve,reject);
  }
}
const client={from:table=>new Query(table),rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:1,error:syncError};}};
const deps={
  "@/lib/admin-api-auth":{getActorFromAuthHeader:async()=>actor},
  "@/lib/supabase-admin":{getSupabaseAdmin:()=>client},
  "@/lib/factory-production-queue-server":{FACTORY_PRODUCTION_QUEUE_FULL_SELECT:"test-select",FACTORY_PRODUCTION_VISIBLE_STATUS_SET:new Set(["queued","in_production","awaiting_factory","sent_to_factory"])},
};
async function load(path) {
  const code=ts.transpileModule(await readFile(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  new Function("require","module","exports",code)(name=>deps[name]||require(name),module,module.exports);
  return module.exports;
}
deps["@/lib/factory-production-queue"] = await load("../lib/factory-production-queue.ts");
deps["@/lib/factory-production-queue-server"] = await load("../lib/factory-production-queue-server.ts");
const list=await load("../app/api/factory-production/queue/route.ts");
const detail=await load("../app/api/factory-production/queue/[id]/route.ts");
const req=(path="",body)=>new NextRequest(`http://localhost/api/factory-production/queue${path}`,body?{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{});
let result=await list.GET(req()); assert.equal(result.status,200);
let data=await result.json(); assert.equal(data.rows.length,550); assert.ok(data.rows.every(row=>row.planner_user_id===a&&row.deposit.status==="submitted"));
assert.ok(reads.some(read=>read.table==="factory_production_queue_entries"&&read.offset===500));
assert.ok(reads.filter(read=>read.table==="factory_production_queue_entries").every(read=>!read.columns.includes("production_items")&&!read.columns.includes("pants_items")),"Queue lists never request heavy production JSON");
assert.equal(rpcCalls.length,0,"Opening a queue must not synchronously rescan all deposits");
await detail.GET(req("?view=record"),{params:Promise.resolve({id:rows[1].id})});
assert.ok(!reads.filter(read=>read.table==="factory_production_queue_entries").at(-1).columns.includes("production_items"));
await detail.GET(req(),{params:Promise.resolve({id:rows[1].id})});
assert.ok(reads.filter(read=>read.table==="factory_production_queue_entries").at(-1).columns.includes("production_items"),"Factory review still loads the original full sheet");
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
assert.equal((await list.PATCH(req("",{action:"bulk_status",ids:[rows[1].id,rows[1].id],targetStatus:"in_production",p_actor_user_id:b}))).status,200);
assert.deepEqual(rpcCalls.at(-1).args,{p_ids:[rows[1].id],p_target_status:"in_production",p_actor_user_id:a});
syncError={message:"forbidden"};
assert.equal((await list.PATCH(req("",{action:"update_status",id:rows[0].id,targetStatus:"queued"}))).status,403);
assert.equal((await list.GET(req("?sync=1"))).status,500,"Sync failures must not be silently ignored");
syncError=null;
assert.equal((await list.PATCH(req("",{action:"reassign",id:rows[0].id,plannerUserId:b,expectedPlannerUserId:a}))).status,403);
actor={profileId:a,role:"superadmin"};
assert.equal((await list.PATCH(req("",{action:"reassign",id:rows[0].id,plannerUserId:b,expectedPlannerUserId:a}))).status,200);
assert.deepEqual(rpcCalls.at(-1),{name:"reassign_factory_production_queue_entry",args:{p_id:rows[0].id,p_planner_user_id:b,p_actor_user_id:a,p_expected_planner_user_id:a}});
assert.equal((await list.PATCH(req("",{action:"reassign",id:rows[0].id,plannerUserId:"invalid",expectedPlannerUserId:a}))).status,400);
assert.equal((await list.PATCH(req("",{action:"reassign",id:rows[0].id,plannerUserId:b}))).status,400);
syncError={message:"assignment_changed"};
assert.equal((await list.PATCH(req("",{action:"reassign",id:rows[0].id,plannerUserId:b,expectedPlannerUserId:a}))).status,409);
assert.equal((await detail.GET(req(),{params:Promise.resolve({id:id(9998)})})).status,404);
// Shared-stage mutations and summary isolation execute the actual handlers.
const summary=await load("../app/api/factory-production/queue/summary/route.ts");
const summaryReq=extra=>new NextRequest(`http://localhost/api/factory-production/queue/summary?year=2026&month=10${extra||""}`);
const assignment={patternUserId:a,printUserId:b,dispatchUserId:b};
syncError=null;actor={profileId:a,role:"production"};
assert.equal((await list.PATCH(req("",{action:"assign_stages",id:rows[1].id,assignments:assignment,expectedAssignments:assignment}))).status,403);
actor={profileId:a,role:"superadmin"};
assert.equal((await list.PATCH(req("",{action:"assign_stages",id:rows[1].id,assignments:assignment,expectedAssignments:assignment}))).status,200);
assert.equal(rpcCalls.at(-1).name,"assign_factory_production_stages");assert.equal(rpcCalls.at(-1).args.p_actor_user_id,a);
actor={profileId:a,role:"production"};
assert.equal((await list.PATCH(req("",{action:"complete_pattern",id:rows[1].id,p_actor_user_id:b}))).status,200);
assert.equal(rpcCalls.at(-1).args.p_actor_user_id,a);
assert.equal((await summary.GET(summaryReq(`&planner=${b}`))).status,403);
assert.equal((await summary.GET(summaryReq("&planner=ALL"))).status,403);
const shared={id:id(20000),planner_user_id:b,pattern_user_id:a,print_user_id:b,dispatch_user_id:b,workload_piece_qty:10,production_completed_at:"2026-10-25T10:00:00Z",queue_year:2026,queue_month:10,status:"awaiting_factory",deposit:{status:"submitted",production_queue_legacy:false,production_queue_entered_at:"2026-10-25T00:00:00Z"}};
rows.push(shared);
const ownSummary=await(await summary.GET(summaryReq())).json();
assert.deepEqual(ownSummary.summaries.map(row=>row.userId),[a]);assert.deepEqual(ownSummary.users.map(row=>row.id),[a]);
assert.ok(ownSummary.completed.every(row=>row.userId===a));
assert.equal(ownSummary.completed.find(row=>row.id===shared.id).creditedPieceQty,5);
assert.equal(ownSummary.completed.find(row=>row.id===shared.id).participantCount,2);
assert.equal(ownSummary.summaries[0].completedPieceQty,2755,"Only completed work, credited once per distinct participant, enters the private total");
assert.equal((await detail.GET(req("?view=record"),{params:Promise.resolve({id:shared.id})})).status,200,"Helpers can read their shared order");
actor={profileId:b,role:"production"};
const bSummary=await(await summary.GET(summaryReq())).json();assert.deepEqual(bSummary.summaries.map(row=>row.userId),[b]);assert.equal(bSummary.completed.find(row=>row.id===shared.id).creditedPieceQty,5);
actor={profileId:a,role:"superadmin"};
const allSummary=await(await summary.GET(summaryReq())).json();assert.equal(allSummary.summaries.length,2);
assert.equal(allSummary.completed.filter(row=>row.id===shared.id).reduce((sum,row)=>sum+row.creditedPieceQty,0),10);
const c=id(3);users.push({id:c,role:"production",is_active:true,full_name:"C"});
const triple={...shared,id:id(20001),pattern_user_id:a,print_user_id:b,dispatch_user_id:c};rows.push(triple);
const tripleSummary=await(await summary.GET(summaryReq())).json();
assert.equal(tripleSummary.completed.filter(row=>row.id===triple.id).length,2);
assert.ok(tripleSummary.completed.filter(row=>row.id===triple.id).every(row=>row.creditedPieceQty===5&&row.participantCount===2));
assert.ok(!tripleSummary.completed.some(row=>row.id===triple.id&&row.userId===c));
assert.ok(Math.abs(tripleSummary.completed.filter(row=>row.id===triple.id).reduce((sum,row)=>sum+row.creditedPieceQty,0)-10)<1e-9);
assert.equal((await summary.GET(new NextRequest("http://localhost/api/factory-production/queue/summary?month=99"))).status,400);
const soloWithDispatcher={...shared,id:id(20002),pattern_user_id:a,print_user_id:a,dispatch_user_id:c};rows.push(soloWithDispatcher);
const soloCredit=await(await summary.GET(summaryReq())).json();
assert.equal(soloCredit.completed.find(row=>row.id===soloWithDispatcher.id&&row.userId===a).creditedPieceQty,10);
actor={profileId:c,role:"production"};
const dispatchSummary=await(await summary.GET(summaryReq())).json();
assert.equal(dispatchSummary.summaries[0].completedOrderCount,0);
assert.equal(dispatchSummary.summaries[0].completedPieceQty,0);
assert.deepEqual(dispatchSummary.completed,[]);
for(const dispatchJob of [triple,soloWithDispatcher]) {
  assert.ok((await(await list.GET(req())).json()).rows.some(row=>row.id===dispatchJob.id),"Dispatch-only users keep their task table access");
  assert.equal((await detail.GET(req("?view=record"),{params:Promise.resolve({id:dispatchJob.id})})).status,200);
}
// Reading after a committed reassignment follows the new stage IDs everywhere.
const previousAssignments={planner_user_id:shared.planner_user_id,pattern_user_id:shared.pattern_user_id,print_user_id:shared.print_user_id,dispatch_user_id:shared.dispatch_user_id};
Object.assign(shared,{planner_user_id:c,pattern_user_id:c,print_user_id:c,dispatch_user_id:c});
actor={profileId:a,role:"production"};
assert.ok(!(await(await list.GET(req())).json()).rows.some(row=>row.id===shared.id),"A fully transferred order leaves the old worker's table");
assert.equal((await detail.GET(req("?view=record"),{params:Promise.resolve({id:shared.id})})).status,404);
assert.ok(!(await(await summary.GET(summaryReq())).json()).completed.some(row=>row.id===shared.id));
actor={profileId:c,role:"production"};
assert.ok((await(await list.GET(req())).json()).rows.some(row=>row.id===shared.id),"The transferred order enters the recipient's table");
assert.equal((await detail.GET(req("?view=record"),{params:Promise.resolve({id:shared.id})})).status,200);
assert.equal((await(await summary.GET(summaryReq())).json()).completed.find(row=>row.id===shared.id).creditedPieceQty,10);
shared.pattern_user_id=a;
for(const worker of [a,c]) {
  actor={profileId:worker,role:"production"};
  assert.ok((await(await list.GET(req())).json()).rows.some(row=>row.id===shared.id),"An order with a retained role remains in both participants' tables");
  assert.equal((await(await summary.GET(summaryReq())).json()).completed.find(row=>row.id===shared.id).creditedPieceQty,5);
}
Object.assign(shared,previousAssignments);
const superId=id(4),disabledSuperId=id(5);
users.push({id:superId,role:"superadmin",is_active:true,full_name:"Superadmin helper"},{id:disabledSuperId,role:"superadmin",is_active:false,full_name:"Disabled superadmin"});
const superShared={...shared,id:id(20003),planner_user_id:superId,pattern_user_id:superId,print_user_id:a,dispatch_user_id:superId};
const superSolo={...superShared,id:id(20004),print_user_id:superId};
const superDispatchOnly={...superShared,id:id(20005),planner_user_id:a,pattern_user_id:a,print_user_id:a};
rows.push(superShared,superSolo,superDispatchOnly);
actor={profileId:superId,role:"superadmin"};
const superSummary=await(await summary.GET(summaryReq(`&planner=${superId}`))).json();
assert.equal(superSummary.selectedPlanner,superId);
assert.ok(superSummary.users.some(user=>user.id===superId));
assert.ok(!superSummary.users.some(user=>user.id===disabledSuperId));
assert.equal(superSummary.summaries[0].completedPieceQty,15);
assert.equal(superSummary.summaries[0].completedOrderCount,2);
assert.equal(superSummary.completed.find(row=>row.id===superShared.id).creditedPieceQty,5);
assert.equal(superSummary.completed.find(row=>row.id===superSolo.id).creditedPieceQty,10);
assert.ok(!superSummary.completed.some(row=>row.id===superDispatchOnly.id));
assert.equal((await summary.GET(summaryReq(`&planner=${disabledSuperId}`))).status,403);
actor={profileId:a,role:"production"};
assert.equal((await summary.GET(summaryReq(`&planner=${superId}`))).status,403,"Staff cannot view a superadmin's private credit");
const staffWithSuper=await(await summary.GET(summaryReq())).json();
assert.equal(staffWithSuper.completed.find(row=>row.id===superShared.id).creditedPieceQty,5);
assert.ok(!staffWithSuper.users.some(user=>user.id===superId));
// Reports follow completion time in Laos, not the order's queue month or factory dispatch date.
actor={profileId:a,role:"production"};
const completedRow=(n,time,qty)=>({...shared,id:id(n),planner_user_id:a,pattern_user_id:a,print_user_id:a,dispatch_user_id:a,
  workload_piece_qty:qty,production_completed_at:time,queue_year:2026,queue_month:10});
const carried={...completedRow(21000,"2026-11-05T00:00:00Z",10),print_user_id:b,dispatch_user_id:b,status:"sent_to_factory",sent_to_factory_at:"2026-12-07T00:00:00Z"};
const lastOctober=completedRow(21001,"2026-10-31T16:59:59.999Z",6);
const firstNovember=completedRow(21002,"2026-10-31T17:00:00Z",4);
const lastNovember=completedRow(21003,"2026-11-30T16:59:59.999Z",9);
const firstDecember=completedRow(21004,"2026-11-30T17:00:00Z",12);
const firstNewYear=completedRow(21005,"2026-12-31T17:00:00Z",8);
const missingDate=completedRow(21006,null,999);
const reverted={...completedRow(21007,"2026-11-05T00:00:00Z",999),status:"in_production"};
const olderYear=completedRow(21008,"2025-11-05T00:00:00Z",3);
rows.push(carried,lastOctober,firstNovember,lastNovember,firstDecember,firstNewYear,missingDate,reverted,olderYear);
const report=async(year,month)=>(await summary.GET(new NextRequest(`http://localhost/api/factory-production/queue/summary?year=${year}&month=${month}`))).json();
const october=await report("2026","10");
assert.ok(october.completed.some(row=>row.id===lastOctober.id));
assert.ok(!october.completed.some(row=>row.id===carried.id||row.id===firstNovember.id));
const november=await report("2026","11");
assert.equal(november.summaries[0].completedPieceQty,18);
assert.deepEqual(new Set(november.completed.map(row=>row.id)),new Set([carried.id,firstNovember.id,lastNovember.id]));
assert.equal(november.completed.find(row=>row.id===carried.id).creditedPieceQty,5);
const december=await report("2026","12");assert.deepEqual(december.completed.map(row=>row.id),[firstDecember.id]);
const january=await report("2027","1");assert.equal(january.summaries[0].completedPieceQty,8);assert.deepEqual(january.completed.map(row=>row.id),[firstNewYear.id]);
const allNovembers=await report("ALL","11");assert.equal(allNovembers.summaries[0].completedPieceQty,21);
const wholeYear=await report("2026","ALL");assert.ok(!wholeYear.completed.some(row=>row.id===firstNewYear.id||row.id===olderYear.id));
const allTime=await report("ALL","ALL");assert.ok(!allTime.completed.some(row=>row.id===missingDate.id||row.id===reverted.id));
actor=null;
assert.equal((await summary.GET(summaryReq())).status,403);
assert.equal((await list.GET(req())).status,403); assert.equal((await list.PATCH(req("",{action:"bulk_status"}))).status,403);
assert.equal((await detail.GET(req(),{params:Promise.resolve({id:rows[0].id})})).status,403);
console.log("Production queue API passed: completion-month/year reporting in UTC+7, cross-month/year carryover and boundary checks, owner-only lists/details at every stage, pagination, superadmin access, superadmin-only reassignment, transferred queue/detail/summary visibility and credits, active superadmin shared/solo credits with staff isolation, Pattern/print-only credit with dispatch access preserved, excluded legacy records, denied manual claims, validated mutations, trusted actor identity and propagated sync errors.");
