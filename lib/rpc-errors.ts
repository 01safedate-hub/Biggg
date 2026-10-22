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
  reason_required: "Please give a reason (at least 3 characters).",
  not_allowed: "You do not have permission to do this.",
  not_pending: "This expense has already been decided.",
  cannot_decide_own_expense: "You cannot approve your own expense.",
  cannot_void: "This record can no longer be voided.",
  not_super_admin: "Only the super admin can do this.",
  cannot_edit_self: "You cannot change your own access or status. Ask another super admin.",
  last_super_admin: "There must always be at least one active super admin.",
  invalid_role: "Choose a valid role.",
  invalid_status: "Choose a valid status.",
  user_not_found: "That person could not be found.",
  invalid_email: "Enter a valid email address.",
  invalid_name: "Enter a full name (2 to 80 characters).",
  invalid_phone: "Enter a valid phone number, for example 08012345678.",
  already_accepted: "This person has already accepted their invitation.",
  basis_invalid: "Choose what you counted against.",
};

export function friendlyError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  for (const [k, v] of Object.entries(MESSAGES)) if (message.includes(k)) return v;
  return "Something went wrong. Please try again.";
}
