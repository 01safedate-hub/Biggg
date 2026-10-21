const MESSAGES: Record<string, string> = {
  evidence_required: "Add at least one receipt or bank debit screenshot.",
  evidence_path_invalid: "That file could not be linked. Please upload it again.",
  evidence_file_not_uploaded: "The file did not finish uploading. Please try again.",
  evidence_file_already_used: "This file is already attached to another record.",
  too_many_evidence_files: "You can attach up to 8 files.",
  amount_invalid: "Enter an amount greater than zero.",
  date_invalid: "The date cannot be in the future.",
  label_required: "Describe what this was for (at least 3 characters).",
  category_required: "Choose a category.",
  money_point_required: "Choose where the money was paid from.",
  kind_invalid: "Choose a type.",
  reason_required: "Please give a reason (at least 5 characters).",
  not_allowed: "You do not have permission to do this.",
  not_pending: "This expense has already been decided.",
  cannot_decide_own_expense: "You cannot approve your own expense.",
  cannot_void: "This record can no longer be voided.",
  basis_invalid: "Choose what you counted against.",
};

export function friendlyError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  for (const [k, v] of Object.entries(MESSAGES)) if (message.includes(k)) return v;
  return "Something went wrong. Please try again.";
}
