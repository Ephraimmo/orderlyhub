import { describe, it, expect } from "vitest";
import {
  belongsToRestaurant,
  coerceTicket,
  relativeTime,
  sortTicketsNewestFirst,
  ticketSortKey,
  type SupportChannel,
  type SupportPriority,
  type SupportStatus,
} from "@/lib/support.firebase";
import {
  encodePermissionKeyForRtdb,
  getDefaultPermissionsForRole,
} from "@/lib/restaurant-permissions";

describe("coerceTicket", () => {
  it("applies Super Admin defaults for legacy/partial records", () => {
    const t = coerceTicket("tkt_legacy", { subject: "Help" });
    expect(t.id).toBe("tkt_legacy");
    expect(t.status).toBe("open");
    expect(t.priority).toBe("medium");
    expect(t.channel).toStrictEqual("chat");
    expect(t.customer_name).toBe("Customer");
    expect(t.unread_for_agent).toBe(0);
    expect(t.unread_for_customer).toBe(0);
    expect(typeof t.created_at).toBe("string");
  });

  it("keeps valid values and normalizes counters", () => {
    const t = coerceTicket("tkt_2", {
      status: "in_progress",
      priority: "urgent",
      channel: "email",
      customer_name: "  Thabo  ",
      unread_for_agent: "3" as unknown as number,
      unread_for_customer: -5,
      restaurant_id: "rest_1",
    });
    expect(t.status).toBe("in_progress");
    expect(t.priority).toBe("urgent");
    expect(t.channel).toBe("email");
    expect(t.customer_name).toBe("Thabo");
    expect(t.unread_for_agent).toBe(3);
    expect(t.unread_for_customer).toBe(0);
  });

  it("falls back to defaults for invalid enum values", () => {
    const t = coerceTicket("tkt_3", {
      status: "bogus" as unknown as SupportStatus,
      priority: "bogus" as unknown as SupportPriority,
      channel: "carrier_pigeon" as unknown as SupportChannel,
    });
    expect(t.status).toBe("open");
    expect(t.priority).toBe("medium");
    expect(t.channel).toBe("chat");
  });
});

describe("restaurant scoping", () => {
  it("matches only exact restaurant_id equality", () => {
    expect(belongsToRestaurant({ restaurant_id: "rest_1" }, "rest_1")).toBe(true);
    expect(belongsToRestaurant({ restaurant_id: "rest_2" }, "rest_1")).toBe(false);
  });

  it("hides platform-level tickets with a null restaurant_id", () => {
    expect(belongsToRestaurant({ restaurant_id: null }, "rest_1")).toBe(false);
    expect(belongsToRestaurant({}, "rest_1")).toBe(false);
    expect(belongsToRestaurant(null, "rest_1")).toBe(false);
  });
});

describe("inbox ordering", () => {
  it("sorts by last_message_at ?? created_at descending using string comparison", () => {
    const tickets = [
      coerceTicket("a", { created_at: "2026-08-20T10:00:00Z" }),
      coerceTicket("b", { created_at: "2026-08-24T09:00:00Z", last_message_at: "2026-08-24T09:30:00.000Z" }),
      coerceTicket("c", { created_at: "2026-08-23T12:00:00Z", last_message_at: null }),
    ];
    expect(sortTicketsNewestFirst(tickets).map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(ticketSortKey(tickets[1])).toBe("2026-08-24T09:30:00.000Z");
  });
});

describe("relativeTime", () => {
  it("formats like the Super Admin inbox", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime(new Date().toISOString())).toBe("just now");
    expect(relativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m");
    expect(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe("3h");
    expect(relativeTime(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe("2d");
  });
});

describe("support permissions", () => {
  it("grants support view+manage to restaurant managers and view-only to branch managers", () => {
    expect(getDefaultPermissionsForRole("restaurant_manager")).toContain("rm.support.view");
    expect(getDefaultPermissionsForRole("restaurant_manager")).toContain("rm.support.manage");
    expect(getDefaultPermissionsForRole("branch_manager")).toContain("rm.support.view");
    expect(getDefaultPermissionsForRole("branch_manager")).not.toContain("rm.support.manage");
  });

  it("never grants support permissions to kitchen, cashier or inventory roles", () => {
    for (const role of ["kitchen_manager", "kitchen_staff", "cashier", "inventory_manager"] as const) {
      const perms = getDefaultPermissionsForRole(role);
      expect(perms).not.toContain("rm.support.view");
      expect(perms).not.toContain("rm.support.manage");
    }
  });

  it("includes both codes in the owner catch-all and encodes keys for RTDB", () => {
    const ownerPerms = getDefaultPermissionsForRole("restaurant_owner");
    expect(ownerPerms).toContain("rm.support.view");
    expect(ownerPerms).toContain("rm.support.manage");
    expect(encodePermissionKeyForRtdb("rm.support.view")).toBe("rm_support_view");
    expect(encodePermissionKeyForRtdb("rm.support.manage")).toBe("rm_support_manage");
  });
});
