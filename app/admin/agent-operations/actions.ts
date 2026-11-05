"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/roles";
import { friendlyError } from "@/lib/rpc-errors";


export async function recordAgentStrike(formData: FormData): Promise<void> {
  const { supabase: client } = await requireRole(["super_admin"]);
  const supabase = client as any;
  const agent = String(formData.get("agent_id") ?? "");
  const order = String(formData.get("order_id") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!agent || note.length < 3) redirect("/admin/agent-operations?error=Choose%20an%20agent%20and%20enter%20a%20clear%20reason");
  const { data, error } = await supabase.rpc("record_agent_strike", {
    _agent: agent, _order: order || null, _kind: kind, _note: note,
  });
  if (error) redirect("/admin/agent-operations?error=" + encodeURIComponent(friendlyError(error.message)));
  revalidatePath("/admin/agent-operations");
  const result = data as { strike_number?: number; action?: string } | null;
  redirect("/admin/agent-operations?notice=" + encodeURIComponent(`Strike ${result?.strike_number ?? ""} recorded. Action: ${String(result?.action ?? "saved").replaceAll("_", " ")}.`));
}

export async function recordAgentIncident(formData: FormData): Promise<void> {
  const { supabase: client } = await requireRole(["super_admin"]);
  const supabase = client as any;
  const order = String(formData.get("order_id") ?? "");
  const agent = String(formData.get("agent_id") ?? "");
  const leg = String(formData.get("custody_leg") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const amount = String(formData.get("estimated_value_naira") ?? "").trim();
  const amountKobo = amount ? Math.round(Number(amount) * 100) : null;
  if (!order || !agent || description.length < 3 || (amount && (!Number.isFinite(amountKobo) || Number(amountKobo) < 0))) {
    redirect("/admin/agent-operations?error=Complete%20the%20incident%20details%20with%20a%20valid%20estimated%20value");
  }
  const { error } = await supabase.rpc("record_agent_custody_incident", {
    _order: order, _agent: agent, _leg: leg, _kind: kind,
    _description: description, _estimated_value_kobo: amountKobo,
  });
  if (error) redirect("/admin/agent-operations?error=" + encodeURIComponent(friendlyError(error.message)));
  revalidatePath("/admin/agent-operations");
  redirect("/admin/agent-operations?notice=Incident%20recorded%20for%20investigation.%20No%20commission%20deduction%20has%20been%20applied");
}

export async function resolveAgentIncident(formData: FormData): Promise<void> {
  const { supabase: client } = await requireRole(["super_admin"]);
  const supabase = client as any;
  const id = String(formData.get("incident_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("decision_note") ?? "").trim();
  if (!id || note.length < 3) redirect("/admin/agent-operations?error=Enter%20the%20investigation%20decision%20and%20a%20note");
  const { error } = await supabase.rpc("resolve_agent_custody_incident", {
    _incident: id, _decision: decision, _note: note,
  });
  if (error) redirect("/admin/agent-operations?error=" + encodeURIComponent(friendlyError(error.message)));
  revalidatePath("/admin/agent-operations");
  redirect("/admin/agent-operations?notice=Investigation%20decision%20saved.%20No%20deduction%20amount%20was%20assumed");
}
