import { test, expect, type Page } from "@playwright/test";

// 后台在手机上（2026-11-11）。原来三栏横排：左边导航 + 右边「对外页面」把 400px 的屏吃光，
// 中间内容被挤成一个字一列，手指也拖不动那两根条。现在窄屏下导航是 ☰ 抽屉、对外页面藏掉。
// 样式在 lib/adminMobile.ts。

const BASE = "http://127.0.0.1:3100";

async function goto(page: Page, path: string) {
  await page.context().addCookies([{ name: "admin_id", value: "admin-admin1", url: BASE }]);
  // 侧边栏故意拖得很宽：抽屉宽度要压得过 cookie 里这个内联宽度
  await page.context().addCookies([{ name: "admin_nav_width", value: "300", url: BASE }]);
  await page.goto(BASE + path);
}

test.describe("手机窄屏", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const path of ["/admin/orders", "/admin/overview"]) {
    test(`${path}：内容占满宽度，导航收成抽屉，对外页面不占地方`, async ({ page }) => {
      await goto(page, path);
      const main = page.locator(".admin-main");
      await main.waitFor();
      const box = (await main.boundingBox())!;
      // 内容区的宽度就是整个屏宽（原来只剩二十来像素）
      expect(box.width).toBeGreaterThanOrEqual(388);
      await expect(page.locator(".admin-nav")).toBeHidden();
      for (const rail of await page.locator(".public-rail").all()) await expect(rail).toBeHidden();
      // 整页不横着滑：宽东西在内容区里自己滑
      const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(docWidth).toBeLessThanOrEqual(390);
    });
  }

  test("列表页的表格不被挤扁，留桌面宽度在内容区里横滑", async ({ page }) => {
    await goto(page, "/admin/orders");
    const inner = page.locator(".admin-main > main");
    await inner.waitFor();
    expect((await inner.boundingBox())!.width).toBeGreaterThanOrEqual(1000);
    const scrolls = await page.locator(".admin-main").evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);
  });

  test("点 ☰ 滑出导航，点链接换页后自己收起，点遮罩也能收", async ({ page }) => {
    await goto(page, "/admin/orders");
    const nav = page.locator(".admin-nav");
    await page.getByRole("button", { name: "打开导航" }).click();
    await expect(nav).toBeVisible();
    // 滑出来有 0.2s 动画，等它停在屏幕左边
    await expect.poll(async () => Math.round((await nav.boundingBox())!.x)).toBe(0);
    expect((await nav.boundingBox())!.width).toBeLessThanOrEqual(260);

    await nav.getByRole("link", { name: "Customer" }).click();
    await page.waitForURL(/\/admin\/customers/);
    await expect(nav).toBeHidden();

    await page.getByRole("button", { name: "打开导航" }).click();
    await expect(nav).toBeVisible();
    await page.locator(".admin-nav-backdrop").click({ position: { x: 370, y: 400 } });
    await expect(nav).toBeHidden();
  });
});

test("桌面宽屏：样子不变，没有顶栏，导航和对外页面照旧在两边", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await goto(page, "/admin/orders");
  await page.locator(".admin-main").waitFor();
  await expect(page.locator(".admin-topbar")).toBeHidden();
  const nav = (await page.locator(".admin-nav").boundingBox())!;
  expect(nav.x).toBe(0);
  expect(nav.width).toBe(300);
  await expect(page.locator(".public-rail")).toBeVisible();
});
