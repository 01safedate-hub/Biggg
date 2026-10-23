"use client";

export function PrintButton() {
  return <button type="button" className="btn-primary print:hidden" onClick={() => window.print()}>Print or save as PDF</button>;
}
