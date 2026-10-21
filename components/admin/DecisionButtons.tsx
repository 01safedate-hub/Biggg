"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/rpc-errors";
import { inputCls } from "./ui";

type Props = { id: string; kind: "expense" | "capital"; status: string };

export function DecisionButtons({ id, kind, status }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"reject" | "void" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve" | "reject" | "void") {
    setError(null);
    if (action !== "approve" && reason.trim().length < 5) return setError("Please give a reason (at least 5 characters).");
    setBusy(true);
    const supabase = createClient();
    const { error: err } =
      action === "void"
        ? kind === "expense" ? await supabase.rpc("void_expense", { _id: id, _reason: reason }) : await supabase.rpc("void_capital_entry", { _id: id, _reason: reason })
        : await supabase.rpc("decide_expense", { _id: id, _approve: action === "approve", _note: reason });
    setBusy(false);
    if (err) return setError(friendlyError(err.message));
    setMode(null); setReason(""); router.refresh();
  }

  const canDecide = kind === "expense" && status === "pending";
  const canVoid = (kind === "expense" && (status === "pending" || status === "approved")) || (kind === "capital" && status === "approved");
  if (!canDecide && !canVoid) return null;

  return (
    <div className="mt-3">
      {!mode && (
        <div className="flex flex-wrap gap-2">
          {canDecide && <button className="btn-primary" disabled={busy} onClick={() => run("approve")}>Approve</button>}
          {canDecide && <button className="btn-secondary" onClick={() => setMode("reject")}>Reject</button>}
          {canVoid && <button className="btn-secondary" onClick={() => setMode("void")}>Void</button>}
        </div>
      )}
      {mode && (
        <div className="space-y-2">
          <label htmlFor={`reason-${id}`} className="block text-sm font-medium">{mode === "reject" ? "Reason for rejecting" : "Reason for voiding"}</label>
          <textarea id={`reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={inputCls} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={() => run(mode)}>{busy ? "Saving" : mode === "reject" ? "Confirm rejection" : "Confirm void"}</button>
            <button className="btn-secondary" onClick={() => { setMode(null); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
