import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeSupabase } from "./fakeSupabase";

// /admin/holder-photo（app/admin/holder-photo/route.ts）：从私有桶里取持有人照片。
// 登录由 middleware 管（tests/middleware.test.ts）；这里盯的是「只给桶里那一种文件」和缓存头。

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return (globalThis as any).__fakeSupabase;
  },
}));

const PHOTO = "s-1/1700000000000.jpg";

beforeEach(() => {
  const fake = createFakeSupabase(
    {},
    {
      [`holder-photos/${PHOTO}`]: new Blob(["jpeg"], { type: "image/jpeg" }),
      // 桶里假装还有一个别的东西：路径形状不对的一律不给，探不到它
      "holder-photos/secret.txt": new Blob(["secret"], { type: "text/plain" }),
    },
  );
  (globalThis as any).__fakeSupabase = fake.client;
});

const get = async (p: string | null) => {
  const { GET } = await import("@/app/admin/holder-photo/route");
  const url = new URL("http://x/admin/holder-photo");
  if (p !== null) url.searchParams.set("p", p);
  return GET(new NextRequest(url));
};

describe("/admin/holder-photo", () => {
  it("有这张照片：回图片，只许浏览器自己缓存", async () => {
    const res = await get(PHOTO);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(await res.text()).toBe("jpeg");
  });

  it("桶里没有：404", async () => {
    expect((await get("s-1/1.jpg")).status).toBe(404);
  });

  it("路径形状不对的（探桶里别的文件、../ 往外走）一律 404，不去桶里取", async () => {
    for (const p of ["secret.txt", "../holder-photos/secret.txt", `s-1/../${PHOTO}`, "", null]) {
      expect((await get(p)).status, String(p)).toBe(404);
    }
  });
});
