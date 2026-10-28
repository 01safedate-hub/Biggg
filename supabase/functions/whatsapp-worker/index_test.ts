import { describe, it, expect } from "https://deno.land/std@0.224.0/testing/bdd.ts";

function normalizeNigerianPhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = "234" + d.slice(1);
  else if (d.length === 10) d = "234" + d;
  if (!/^234[789][01][0-9]{8}$/.test(d)) return null;
  return d;
}

function quietHours(hour: number) {
  return hour >= 21 || hour < 7;
}

function shouldCancelReminder(currentStatus: string, requiredStatus: string, acted: boolean) {
  return acted || currentStatus !== requiredStatus;
}

describe("WhatsApp notification foundations", () => {
  it("normalizes supported Nigerian phone formats to digits-only country code", () => {
    expect(normalizeNigerianPhone("08031234567")).toBe("2348031234567");
    expect(normalizeNigerianPhone("+2348031234567")).toBe("2348031234567");
    expect(normalizeNigerianPhone("2348031234567")).toBe("2348031234567");
  });

  it("rejects invalid phone numbers", () => {
    expect(normalizeNigerianPhone("123")).toBeNull();
    expect(normalizeNigerianPhone("08001234567")).toBeNull();
  });

  it("treats 21:00 through 06:59 Lagos time as quiet hours", () => {
    expect(quietHours(20)).toBe(false);
    expect(quietHours(21)).toBe(true);
    expect(quietHours(0)).toBe(true);
    expect(quietHours(6)).toBe(true);
    expect(quietHours(7)).toBe(false);
  });

  it("cancels a delayed reminder once the customer acts or the state changes", () => {
    expect(shouldCancelReminder("counted", "counted", false)).toBe(false);
    expect(shouldCancelReminder("count_confirmed", "counted", false)).toBe(true);
    expect(shouldCancelReminder("counted", "counted", true)).toBe(true);
  });
});
