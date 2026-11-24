import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./fakeSupabase";

// 排期总览悬停名字看历史（app/admin/overview/customer-history）。只读，盯两件事：
// 坏参数在查库之前就拒；物主删掉的资源照样出现在历史里（当时就是配的它）。

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

const R = "11111111-1111-4111-8111-111111111111";
const NOW = "22222222-2222-4222-8222-222222222222";
const OLD = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.resetModules();
  const fake = createFakeSupabase({
    people: [{ id: "p-provider", chat_name: "Clara" }],
    providers: [{ id: "p-provider" }],
    resources: [
      { id: "s1", provider_id: "p-provider", holder_name: "Emma", holder_gender: "female", deleted_at: "2026-01-01T00:00:00Z" },
    ],
    orders: [
      { id: NOW, customer_id: R, demand_days: ["2026-12-20"], location: "locaa", status: "created", male_count: 0, female_count: 1 },
      { id: OLD, customer_id: R, demand_days: ["2025-01-18"], location: "akaad", status: "complete", male_count: 0, female_count: 1 },
      { id: "other", customer_id: "someone-else", demand_days: ["2025-01-18"], location: "locaa", status: "complete", male_count: 1, female_count: 0 },
    ],
    order_assignments: [{ order_id: OLD, resource_id: "s1" }],
  });
  (globalThis as any).__fakeSupabase = fake.client;
});

async function get(qs: string) {
  const { GET } = await import("@/app/admin/overview/customer-history/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(`http://x/admin/overview/customer-history?${qs}`));
  return { status: res.status, body: await res.json() };
}

describe("customer-history", () => {
  it("坏参数拒掉", async () => {
    expect((await get("customer=abc")).status).toBe(400);
    expect((await get(`customer=${R}&order=1,2`)).status).toBe(400);
    expect((await get("")).status).toBe(400);
  });

  it("只列这个人的别的单，删掉的资源照样带出持有人", async () => {
    const { status, body } = await get(`customer=${R}&order=${NOW}`);
    expect(status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.pastActive).toBe(1);
    expect(body.seasons[0].entries[0]).toMatchObject({
      orderId: OLD,
      label: "1/18 akaad",
      cards: [{ holder: "Emma", gender: "female" }],
    });
  });
});
