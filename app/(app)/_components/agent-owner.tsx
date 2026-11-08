"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import type { AppRole } from "@/lib/access-control";
import { supabase } from "@/lib/supabase";

// Marks which sales agent owns a record, so BG SPORT staff never mix agent work with their own.
export type OwnerFilter = "all" | "internal" | `agent:${string}`;

export type AgentDirectory = {
  viewerRole: AppRole | null;
  agentNames: ReadonlyMap<string, string>;
  agents: Array<{ id: string; name: string }>;
};

export function useAgentDirectory(): AgentDirectory {
  const [directory, setDirectory] = useState<AgentDirectory>({ viewerRole: null, agentNames: new Map(), agents: [] });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) return;
      const [{ data: viewer }, { data: agentRows }] = await Promise.all([
        supabase.from("users").select("role").eq("auth_user_id", authUserId).maybeSingle(),
        // Inactive agents are included so older records still show their owner.
        supabase.from("users").select("id,full_name").eq("role", "agent"),
      ]);
      if (cancelled) return;
      const agents = ((agentRows ?? []) as Array<{ id: string; full_name: string | null }>)
        .map((row) => ({ id: row.id, name: row.full_name?.trim() || "ຕົວແທນ" }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setDirectory({
        viewerRole: (viewer?.role as AppRole | undefined) ?? null,
        agentNames: new Map(agents.map((agent) => [agent.id, agent.name])),
        agents,
      });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return directory;
}

// Agents only ever see their own records, so the owner markers are for BG SPORT staff.
export function showsAgentOwnership(directory: AgentDirectory) {
  return directory.viewerRole !== null && directory.viewerRole !== "agent";
}

export function matchesOwnerFilter(agentUserId: string | null | undefined, filter: OwnerFilter) {
  if (filter === "all") return true;
  if (filter === "internal") return !agentUserId;
  return agentUserId === filter.slice("agent:".length);
}

export function AgentOwnerBadge({
  agentUserId,
  directory,
  showInternal = false,
  className = "",
}: {
  agentUserId: string | null | undefined;
  directory: AgentDirectory;
  showInternal?: boolean;
  className?: string;
}) {
  if (!showsAgentOwnership(directory)) return null;
  if (!agentUserId) {
    return showInternal ? (
      <span className={`inline-flex items-center whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-black text-slate-500 ${className}`}>
        BG SPORT
      </span>
    ) : null;
  }
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black text-indigo-700 ${className}`}>
      <UserRound size={10} />
      ຕົວແທນ: {directory.agentNames.get(agentUserId) || "ຕົວແທນ"}
    </span>
  );
}

export function OwnerFilterSelect({
  value,
  onChange,
  directory,
  className = "",
}: {
  value: OwnerFilter;
  onChange: (value: OwnerFilter) => void;
  directory: AgentDirectory;
  className?: string;
}) {
  if (!showsAgentOwnership(directory)) return null;
  return (
    <select
      aria-label="ກັ່ນຕອງຕາມເຈົ້າຂອງງານ"
      value={value}
      onChange={(event) => onChange(event.target.value as OwnerFilter)}
      className={`w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 ${className}`}
    >
      <option value="all">ທຸກເຈົ້າຂອງງານ</option>
      <option value="internal">BG SPORT</option>
      {directory.agents.length > 0 ? (
        <optgroup label="ຕົວແທນ">
          {directory.agents.map((agent) => (
            <option key={agent.id} value={`agent:${agent.id}`}>{agent.name}</option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
