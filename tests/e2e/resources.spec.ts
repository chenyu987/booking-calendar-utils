import { test, expect, type Page } from "@playwright/test";

// Resource 管理（/admin/resources）。
//
// 编辑态 2026-11-09 改成在浏览器里切：原来「编辑」是 ?edit= 链接，点一下服务端重画整张表 2~6 秒，
// 每个链接还被预取，打开页面就是两百多个请求。这几条盯住：点「编辑」不发导航请求、不留可预取的链接，
// 「取消」当场回去，「保存」存完自己退出编辑态，排期浮层点开才去拿明细。

const URL_ = "http://127.0.0.1:3100/admin/resources";

// 这张表十一列、宽度大多写死，1280 宽的时候 Provider / 物主姓名 / 排期这几列（flex 的）被挤成 0 宽，
// 元素在但看不见、点不着。后台是在大屏上用的，按真实的屏宽跑（playwright.config 里的
// devices["Desktop Chrome"] 会把视口盖回 1280×720）
test.use({ viewport: { width: 1800, height: 900 } });

async function gotoResources(page: Page, qs = "") {
  await page.context().addCookies([{ name: "admin_id", value: "admin-admin1", url: "http://127.0.0.1:3100" }]);
  await page.goto(URL_ + qs);
  await page.getByRole("button", { name: "编辑" }).first().waitFor();
}

/**
 * 点下去之后有没有向服务端要这一页（Resource 管理自己的 RSC 导航 / 整页请求）。
 * 只看 /admin/resources：左边导航栏的链接会在后台预取别的页（/admin/history、/provider …），跟这里无关
 */
function countNavRequests(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/admin/resources") seen.push(r.url());
  });
  return seen;
}

test("点「编辑」当场换成表单，不向服务端要页面；「取消」当场换回来", async ({ page }) => {
  await gotoResources(page);
  expect(await page.locator('a[href*="edit="]').count(), "不该还有能被预取的编辑链接").toBe(0);

  const nav = countNavRequests(page);
  await page.getByRole("button", { name: "编辑" }).first().click();
  const form = page.locator("[data-editing-resource]");
  await expect(form).toHaveCount(1);
  await expect(page).toHaveURL(/edit=/);
  expect(nav).toEqual([]);

  await form.getByRole("button", { name: "取消" }).click();
  await expect(form).toHaveCount(0);
  await expect(page).not.toHaveURL(/edit=/);
  expect(nav).toEqual([]);
});

test("「保存」存完自己退出编辑态，列表上是新的名字", async ({ page }) => {
  await gotoResources(page);
  await page.getByRole("button", { name: "编辑" }).first().click();
  const form = page.locator("[data-editing-resource]");
  const name = `改过的名字 ${Date.now()}`;
  await form.locator('input[name="holder_name"]').fill(name);
  await form.getByRole("button", { name: "保存" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText(name)).toBeVisible();
});

test("带 ?edit=<id> 打开（排期总览双击卡片跳过来）直接是编辑态", async ({ page }) => {
  await gotoResources(page, "?edit=s-later");
  await expect(page.locator('[data-editing-resource="s-later"]')).toHaveCount(1);
});

test("排期浮层：点开才去拿这个资源的明细", async ({ page }) => {
  await gotoResources(page);
  const fetched: string[] = [];
  page.on("request", (r) => r.url().includes("/admin/resources/bookings") && fetched.push(r.url()));
  expect(fetched).toEqual([]);
  const d = page.locator("details.bk").first();
  await d.locator("summary").click();
  await expect(d.locator(".bk-pop-row").first()).toBeVisible();
  expect(fetched.length).toBe(1);
});
