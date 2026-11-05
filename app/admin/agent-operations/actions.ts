"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";

type Result = { ok: boolean; message: string };

export async function recordAgentStrike(formData: FormData): Promise<Result> {
  const { supabase } = await requireRole(["super_admin"]);
  const agent = String(formData.get("agent_id") ?? "");
  const order = String(formData.get("order_id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!agent || note.length < 3) return { ok: false, message: "Choose an agent and enter a clear reason." };
  const { data, error } = await supabase.rpc("record_agent_strike", {
    _agent: agent, _order: order || null, _kind: kind, _note: note,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/agent-operations");
  const result = data as { strike_number?: number; action?: string } | null;
  return { ok: true, message: `Strike ${result?.strike_number ?? ""} recorded. Action: ${String(result?.action ?? "saved").replaceAll("_", " ")}.` };
}

export async function recordAgentIncident(formData: FormData): Promise<Result> {
  const { supabase } = await requireRole(["super_admin"]);
  const order = String(formData.get("order_id") ?? "");
  const agent = String(formData.get("agent_id") ?? "");
  const leg = String(formData.get("custody_leg") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const amount = String(formData.get("estimated_value_naira") ?? "").trim();
  const amountKobo = amount ? Math.round(Number(amount) * 100) : null;
  if (!order || !agent || description.length < 3 || (amount && (!Number.isFinite(amountKobo) || Number(amountKobo) < 0))) {
    return { ok: false, message: "Complete the incident details with a valid estimated value, if known." };
  }
  const { error } = await supabase.rpc("record_agent_custody_incident", {
    _order: order, _agent: agent, _leg: leg, _kind: kind,
    _description: description, _estimated_value_kobo: amountKobo,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/agent-operations");
  return { ok: true, message: "Incident recorded for investigation. No commission deduction has been applied." };
}

export async function resolveAgentIncident(formData: FormData): Promise<Result> {
  const { supabase } = await requireRole(["super_admin"]);
  const id = String(formData.get("incident_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("decision_note") ?? "").trim();
  if (!id || note.length < 3) return { ok: false, message: "Enter the investigation decision and a note." };
  const { error } = await supabase.rpc("resolve_agent_custody_incident", {
    _incident: id, _decision: decision, _note: note,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/admin/agent-operations");
  return { ok: true, message: "Investigation decision saved. No deduction amount was assumed." };
}
