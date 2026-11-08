import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTs(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", outputText)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, compiled, compiled.exports);
  return compiled.exports;
}
const permissions = loadTs("../lib/user-permissions.ts", { "@/lib/app-navigation": loadTs("../lib/app-navigation.ts") });
const access = loadTs("../lib/access-control.ts", { "@/lib/user-permissions": permissions });
const deposits = loadTs("../lib/factory-deposit-orders.ts");

test("only a superadmin can open the agent deposit review page", () => {
  assert.equal(access.canAccessPath("/factory-deposit-orders/agents", "superadmin"), true);
  for (const role of ["admin", "manager", "staff", "accountant", "agent"]) {
    assert.equal(access.canAccessPath("/factory-deposit-orders/agents", role), false, role);
  }
  // Permission overrides cannot open it for other roles.
  assert.equal(access.canAccessPath("/factory-deposit-orders/agents", "accountant", { access: { "/factory-deposit-orders": "allow" } }), false);
  assert.equal(access.canAccessPath("/factory-deposit-orders", "accountant"), true);
  assert.equal(access.canAccessPath("/factory-deposit-orders", "agent"), true);
});

test("agent deposits are approved by a superadmin, and only a superadmin converts or sends back", () => {
  const agentDeposit = { agent_user_id: "agent-1" };
  const internalDeposit = { agent_user_id: null };
  assert.equal(deposits.canApproveFactoryDepositOrder("superadmin", agentDeposit), true);
  assert.equal(deposits.canApproveFactoryDepositOrder("accountant", agentDeposit), false);
  assert.equal(deposits.canApproveFactoryDepositOrder("accountant", internalDeposit), true);
  for (const role of ["admin", "manager", "staff", "accountant", "agent"]) {
    assert.equal(deposits.canConvertFactoryDepositOrder(role), false, role);
    assert.equal(deposits.canReturnFactoryDepositOrder(role), false, role);
  }
  assert.equal(deposits.canConvertFactoryDepositOrder("superadmin"), true);
  assert.equal(deposits.canReturnFactoryDepositOrder("superadmin"), true);
});

test("agents edit only drafts; staff keep editing sent deposits", () => {
  assert.equal(deposits.canEditFactoryDepositOrder("draft", "agent"), true);
  assert.equal(deposits.canEditFactoryDepositOrder("submitted", "agent"), false);
  assert.equal(deposits.canEditFactoryDepositOrder("submitted", "staff"), true);
});

test("an agent can take back a sent deposit until it becomes an order", () => {
  assert.equal(deposits.canAgentWithdrawFactoryDepositOrder("agent", { status: "submitted", order_id: null }), true);
  assert.equal(deposits.canAgentWithdrawFactoryDepositOrder("agent", { status: "approved", order_id: null }), true);
  assert.equal(deposits.canAgentWithdrawFactoryDepositOrder("agent", { status: "draft", order_id: null }), false);
  assert.equal(deposits.canAgentWithdrawFactoryDepositOrder("agent", { status: "converted", order_id: "o1" }), false);
  assert.equal(deposits.canAgentWithdrawFactoryDepositOrder("agent", { status: "approved", order_id: "o1" }), false);
  assert.equal(deposits.canAgentWithdrawFactoryDepositOrder("staff", { status: "submitted", order_id: null }), false);
  assert.match(deposits.agentWithdrawErrorMessage("Production has already started"), /Pattern/);
  assert.match(deposits.agentWithdrawErrorMessage("Could not find the function public.agent_withdraw_factory_deposit in the schema cache"), /20261117_agent_withdraw_deposit\.sql/);
});
