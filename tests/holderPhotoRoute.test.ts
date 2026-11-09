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

describe("POST /admin/holder-photo（上传 / 换照片）", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const OLD = "s-old/1600000000000.jpg";
  let fake: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    fake = createFakeSupabase(
      {
        resources: [
          { id: "s-1", holder_name: "a", holder_photo_path: null, deleted_at: null },
          { id: "s-old", holder_name: "b", holder_photo_path: OLD, deleted_at: null },
          { id: "s-gone", holder_name: "c", holder_photo_path: null, deleted_at: "2026-11-01T00:00:00Z" },
        ],
      },
      { [`holder-photos/${OLD}`]: new Blob([JPEG], { type: "image/jpeg" }) },
    );
    (globalThis as any).__fakeSupabase = fake.client;
  });

  const post = async (resourceId: string | null, file: Blob | null) => {
    const { POST } = await import("@/app/admin/holder-photo/route");
    const fd = new FormData();
    if (resourceId !== null) fd.set("resourceId", resourceId);
    if (file) fd.set("file", file, "photo.jpg");
    return POST(new NextRequest("http://x/admin/holder-photo", { method: "POST", body: fd }));
  };
  const row = (id: string) => fake.db.resources.find((s: any) => s.id === id);
  const files = () => [...fake.storage.keys()];

  it("传 jpg：存进桶、资源上记下路径", async () => {
    const res = await post("s-1", new Blob([JPEG], { type: "image/jpeg" }));
    expect(res.status).toBe(200);
    const { path } = await res.json();
    expect(path).toMatch(/^s-1\/\d+\.jpg$/);
    expect(row("s-1").holder_photo_path).toBe(path);
    expect(files()).toContain(`holder-photos/${path}`);
  });

  it("换照片：新的记上，旧文件删掉", async () => {
    const res = await post("s-old", new Blob([JPEG], { type: "image/jpeg" }));
    const { path } = await res.json();
    expect(row("s-old").holder_photo_path).toBe(path);
    expect(files()).not.toContain(`holder-photos/${OLD}`);
  });

  it("不是 jpg 的不收 —— 看文件头，Content-Type 写成 image/jpeg 也没用", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const res = await post("s-1", new Blob([png], { type: "image/jpeg" }));
    expect(res.status).toBe(400);
    expect(row("s-1").holder_photo_path).toBeNull();
    expect(fake.writes.filter((w) => w.op === "upload")).toEqual([]);
  });

  it("太大的不收", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(JPEG);
    expect((await post("s-1", new Blob([big]))).status).toBe(400);
    expect(fake.writes.filter((w) => w.op === "upload")).toEqual([]);
  });

  it("没有这个资源、资源已经删了、资源 id 里带 ../：都不收，桶里不多东西", async () => {
    for (const id of ["s-nope", "s-gone", "../x"]) {
      expect((await post(id, new Blob([JPEG]))).status, id).toBe(404);
    }
    expect((await post(null, new Blob([JPEG]))).status).toBe(400);
    expect((await post("s-1", null)).status).toBe(400);
    expect(fake.writes.filter((w) => w.op === "upload")).toEqual([]);
  });

  it("写库失败：刚传上去的文件删掉，不留孤儿；旧照片不动", async () => {
    fake.failNextWriteWith("boom", "resources");
    const res = await post("s-old", new Blob([JPEG]));
    expect(res.status).toBe(500);
    expect(row("s-old").holder_photo_path).toBe(OLD);
    expect(files()).toEqual([`holder-photos/${OLD}`]);
  });
});
