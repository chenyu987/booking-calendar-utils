import { describe, expect, it } from "vitest";
import { holderPhotoPath, holderPhotoUrl, isHolderPhotoPath } from "./holderPhoto";

const ID = "3f2b8c1e-0a4d-4e5f-9b6a-1c2d3e4f5a6b";

describe("持有人照片路径", () => {
  it("新路径是 <资源 id>/<版本>.jpg，换版本就换路径", () => {
    expect(holderPhotoPath(ID, 1794211838828)).toBe(`${ID}/1794211838828.jpg`);
    expect(holderPhotoPath(ID, 1)).not.toBe(holderPhotoPath(ID, 2));
  });

  it("资源 id 里有 / 或 . 就不给生成路径", () => {
    expect(() => holderPhotoPath("../x", 1)).toThrow();
    expect(() => holderPhotoPath("a/b", 1)).toThrow();
  });

  it("只认桶里那一种形状 —— 拿 ../ 或别的文件名探桶里其他东西，一律不认", () => {
    expect(isHolderPhotoPath(`${ID}/1.jpg`)).toBe(true);
    for (const bad of [
      `../${ID}/1.jpg`,
      `${ID}/../1.jpg`,
      `${ID}/1.png`,
      `${ID}/a.jpg`,
      `${ID}/1.jpg?x`,
      `/${ID}/1.jpg`,
      "secret.txt",
      "",
      null,
      undefined,
      123,
    ]) {
      expect(isHolderPhotoPath(bad), String(bad)).toBe(false);
    }
  });

  it("页面上的网址不以 .jpg 结尾 —— middleware 跳过 .jpg 结尾的路径，那样就不验登录了", () => {
    const url = holderPhotoUrl(`${ID}/1.jpg`)!;
    expect(url.startsWith("/admin/")).toBe(true);
    expect(new URL(url, "http://x").pathname).toBe("/admin/holder-photo");
    expect(holderPhotoUrl(null)).toBeNull();
    expect(holderPhotoUrl("../etc")).toBeNull();
  });
});
