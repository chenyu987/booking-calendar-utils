import { test, expect, type Page } from "@playwright/test";

// 排期总览的浏览器测试。
//
// 这一份里的每一条，都对应一个**真出过、而且反复出过**的 bug。写下来是因为
// 这类问题靠眼睛验了三四轮，每轮都以为好了、下一轮又被发现。
//
// 数据是内存假库喂的固定种子（tests/e2e/seed.ts），不连真库。

/** 主角那一单：三行都满（姓名·地点·备注 / 两个资源 / 男女进度·金额） */
const MAIN = "ord-main";
const SHORT_NAME = "ord-short";

const overview = (qs = "") => `/admin/overview${qs}`;

async function gotoOverview(page: Page, qs = "") {
  await page.goto(overview(qs));
  await page.locator("[data-order-id]").first().waitFor();
}

/**
 * 量一个色块里几个「锚点」的横坐标。
 * 锚点挑的是两个状态里都以同样形态出现的东西：♀、女、$、以及可编辑的三个字段。
 * 字符锚点按**字符偏移**单独框出来量 —— 普通态「♂张三 ♀李四」是一整个文字节点，
 * 直接量整节点得到的是整串的左边缘，永远看不出 ♀ 挪了没有。
 */
async function anchors(page: Page, orderId: string) {
  return page.evaluate((id) => {
    const block = document.querySelector(`[data-order-id="${id}"]`);
    if (!block) throw new Error(`找不到色块 ${id}`);
    // 记宽度是为了认出「这个锚点这会儿根本没渲染」：色块窄到 180px 以下时
    // $ 会被容器查询藏掉（两个状态都藏），藏起来的元素 Range 量出来是 0×0 在原点。
    // 不排掉的话，一个状态量到真坐标、另一个量到 0，diff 就是整个 blockX 那么大
    const out: Record<string, { x: number; w: number }> = {};
    const put = (k: string, r: DOMRect) => {
      if (!(k in out)) out[k] = { x: +r.x.toFixed(1), w: +r.width.toFixed(1) };
    };
    const CHARS = ["♀", "女", "$", "·"];
    const walk = (el: Element) => {
      for (const c of Array.from(el.childNodes)) {
        if (c.nodeType === 3 && c.textContent?.trim()) {
          for (const ch of CHARS) {
            const i = c.textContent.indexOf(ch);
            if (i < 0) continue;
            const rg = document.createRange();
            rg.setStart(c, i);
            rg.setEnd(c, i + ch.length);
            put(ch, rg.getBoundingClientRect());
          }
        } else if (c.nodeType === 1) {
          const e = c as HTMLElement;
          if (e.tagName === "INPUT" && (e as HTMLInputElement).type !== "hidden") {
            const map: Record<string, string> = {
              customer_name: "姓名",
              location: "地点",
              amount: "金额",
            };
            const key = map[(e as HTMLInputElement).name];
            if (key) put(key, e.getBoundingClientRect());
          } else if (e.tagName !== "DATALIST" && e.tagName !== "SELECT") {
            walk(e);
          }
        }
      }
    };
    walk(block);
    const cs = getComputedStyle(block);
    return {
      anchors: out,
      blockX: +block.getBoundingClientRect().x.toFixed(1),
      box: { padding: cs.padding, fontSize: cs.fontSize, lineHeight: cs.lineHeight },
    };
  }, orderId);
}

test.describe("进出分配态：几何不许变", () => {
  // 这一组盯的是「一进编辑所有东西错开几像素」。修过四轮：外层盒模型两份、
  // 地点字号 12→11、撤销叉占位、人数框宽度、min-width 把短名字撑开。
  for (const [name, orderId] of [
    ["三行都满的单子", MAIN],
    ["短名字的单子（min-width 撑开过这一个）", SHORT_NAME],
  ] as const) {
    test(`${name}：每个锚点两态坐标一致`, async ({ page }) => {
      await gotoOverview(page);
      const before = await anchors(page, orderId);

      await page.locator(`a[data-order-id="${orderId}"]`).first().click();
      await page.locator(`[data-order-id="${orderId}"] input[name="customer_name"]`).waitFor();
      const after = await anchors(page, orderId);

      // 外层盒模型必须一模一样 —— 内边距/字号/行高不同的话，里面怎么调都白搭
      expect(after.box).toEqual(before.box);

      const compared: string[] = [];
      for (const key of Object.keys(before.anchors)) {
        if (!(key in after.anchors)) continue;
        // 有一边没渲染出来就跳过（见 anchors() 里那段注释）
        if (before.anchors[key].w === 0 || after.anchors[key].w === 0) continue;
        compared.push(key);
        // 比「相对色块左边缘的偏移」，这样即使页面滚动过也公平
        const b = before.anchors[key].x - before.blockX;
        const a = after.anchors[key].x - after.blockX;
        expect(
          Math.abs(a - b),
          `锚点「${key}」进出编辑态挪了 ${(a - b).toFixed(1)}px（应该是 0）`
        ).toBeLessThanOrEqual(0.5);
      }
      // 万一哪天选择器全失配、一个锚点都没比到，测试会「静静地通过」——
      // 那比挂掉还糟，所以兜一下
      expect(compared.length, "一个锚点都没量到，这条测试等于没跑").toBeGreaterThan(1);
    });
  }

  test("撤销叉平时不占位置，鼠标移到那个资源上才出现", async ({ page }) => {
    await gotoOverview(page, `?assign=${MAIN}`);
    const x = page.locator(`[data-order-id="${MAIN}"] .assign-card-x`).first();
    await expect(x).toHaveCSS("position", "absolute");
    await expect(x).toHaveCSS("opacity", "0");
    await expect(x).toHaveCSS("pointer-events", "none");

    await page.locator(`[data-order-id="${MAIN}"] .assign-card`).first().hover();
    await expect(x).toHaveCSS("opacity", "1");
  });
});

test.describe("点下去要立刻有反应", () => {
  // 整页重渲染要 400ms 上下，那段时间里必须先把「点到了」画出来。
  // 出过两次：一次是压根没画；一次是在分配态里换单时，被上一单的浮动条骗得
  // 立刻把假状态撤了。
  async function pressAndRead(page: Page, orderId: string) {
    return page.evaluate((id) => {
      const link = document.querySelector<HTMLElement>(`a[data-order-id="${id}"]`)!;
      link.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 })
      );
      // 同一帧内读 —— 这就是「跟不跟手」的定义
      const block = document.querySelector(`[data-order-id="${id}"]`)!;
      const bar = document.querySelector('div[aria-hidden="true"] input');
      return {
        ring: getComputedStyle(block).boxShadow !== "none",
        bar: !!bar,
      };
    }, orderId);
  }

  test("从普通态点一单：同一帧就有光圈和浮动条", async ({ page }) => {
    await gotoOverview(page);
    expect(await pressAndRead(page, MAIN)).toEqual({ ring: true, bar: true });
  });

  test("**已经在分配态里再点另一单**：同样立刻有反应，而且不会闪一下就没", async ({
    page,
  }) => {
    await gotoOverview(page, `?assign=${SHORT_NAME}`);
    expect(await pressAndRead(page, MAIN)).toEqual({ ring: true, bar: true });
    // 上一单的真浮动条还挂着，早先的实现会在这里把假状态立刻撤掉
    await page.waitForTimeout(200);
    const still = await page.evaluate((id) => {
      const block = document.querySelector(`[data-order-id="${id}"]`)!;
      return {
        ring: getComputedStyle(block).boxShadow !== "none",
        bar: !!document.querySelector('div[aria-hidden="true"] input'),
      };
    }, MAIN);
    expect(still).toEqual({ ring: true, bar: true });
  });

  test("落定之后光圈还在，而且是服务端渲染那一份", async ({ page }) => {
    await gotoOverview(page);
    await page.locator(`a[data-order-id="${MAIN}"]`).first().click();
    await page.locator(`[data-order-id="${MAIN}"] input[name="customer_name"]`).waitFor();
    // 抢画的规则撤掉之后，圈得由 React 自己的内联样式接住 ——
    // 早先有一版把 React 那份也擦了，分配态反而没有圈
    const block = page.locator(`[data-order-id="${MAIN}"]`).first();
    await expect(block).not.toHaveCSS("box-shadow", "none");
  });
});

test.describe("多选改状态", () => {
  test("⌘+点两单：出现「已选 N 单」，分配浮动条让位", async ({ page }) => {
    await gotoOverview(page, `?assign=${MAIN}`);
    await expect(page.locator("[data-assign-bar]")).toBeVisible();

    await page
      .locator(`a[data-order-id="${SHORT_NAME}"]`)
      .first()
      .click({ modifiers: ["ControlOrMeta"] });

    // 正在配的那一单也要算进选中 —— 人的理解里「点开」就是选中了
    await expect(page.getByText(/已选 2 单/)).toBeVisible();
    await expect(page.locator("[data-assign-bar]")).toHaveCount(0);
  });

  test("按 Esc 清空选中，不留任何残余的边框", async ({ page }) => {
    await gotoOverview(page);
    await page
      .locator(`a[data-order-id="${MAIN}"]`)
      .first()
      .click({ modifiers: ["ControlOrMeta"] });
    await page
      .locator(`a[data-order-id="${SHORT_NAME}"]`)
      .first()
      .click({ modifiers: ["ControlOrMeta"] });
    await expect(page.getByText(/已选 2 单/)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText(/已选 2 单/)).toHaveCount(0);

    // 「还有一单看着是选中的」有三个来源，这条测试要一次盖全 —— 前两个各修过一轮，
    // 第三个连着漏了三次，就是因为这里只查了 outline-style === "solid"：
    //   1. 抢画的光圈直接改内联样式，退出之后赖着不走
    //   2. 多选的描边（outline: 2px solid）没跟着清
    //   3. **浏览器自己的焦点圈**：点色块让那个 <a> 拿了焦点，一按 Esc，Chrome 的
    //      :focus-visible 判定翻转，给它画一圈默认焦点圈 —— 计算出来是
    //      `outline-style: auto`，不是 solid，所以从这儿溜过去了
    const leftovers = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-order-id]"))
        .filter((e) => {
          const cs = getComputedStyle(e);
          return (
            cs.outlineStyle !== "none" || (e as HTMLElement).style.boxShadow !== ""
          );
        })
        .map((e) => (e as HTMLElement).dataset.orderId)
    );
    expect(leftovers, "Esc 之后还有色块留着选中/抢画/焦点的痕迹").toEqual([]);

    // 焦点本身也得放掉。上面那条查的是「看不看得见」，这条查的是根因：
    // 焦点还留在色块上的话，下次再敲键盘同一个圈就会再冒出来
    const focused = await page.evaluate(
      () => !!(document.activeElement as HTMLElement | null)?.closest?.("[data-order-id]")
    );
    expect(focused, "Esc 之后焦点还留在某个色块上").toBe(false);
  });
});

test.describe("推荐分配", () => {
  test("只看**这一单之前**那一次去的区域", async ({ page }) => {
    await gotoOverview(page, `?assign=${MAIN}`);
    const panel = page.locator("#resource-panel");

    // jordan 在本单之前去过 locbn（B 区），本单是 locbl（B 区）→ 推荐
    await expect(
      panel.locator('[data-resource-name="jordan doe"]').getByText("★ 推荐")
    ).toBeVisible();

    // zolan 只在本单**之后**去过 locbl —— 拿未来倒推现在，不算
    await expect(
      panel.locator('[data-resource-name="zolan"]').getByText("★ 推荐")
    ).toHaveCount(0);
  });
});
