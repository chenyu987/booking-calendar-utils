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
/** 第三单：用来验「普通点击 = 重新开始」 */
const THIRD = "ord-earlier";

const overview = (qs = "") => `/admin/overview${qs}`;

/**
 * 「当前身份」存在 cookie 里（lib/admins.ts 的 ADMIN_COOKIE）。没选身份时建单是灰的，
 * 所以默认带上 Admin1 —— 别的测试要验的不是这个。传 null = 模拟一台还没选过的电脑
 */
async function gotoOverview(page: Page, qs = "", admin: string | null = "admin-admin1") {
  if (admin) {
    await page.context().addCookies([{ name: "admin_id", value: admin, url: "http://127.0.0.1:3100" }]);
  }
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
    // 「♀」这个锚点没了 —— 物主名字前面的性别符号去掉了（看名字就知道男女，
    // 那两个符号在一行里挺占地方）。那一段改用 [data-card] 钉住，见下面
    const CHARS = ["女", "$", "·"];
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
    // 物主名字那一段：两个状态都给第一个资源打了 data-card，量它的左边缘。
    // 不量整行容器 —— 容器是靠右锚的，右边缘天然对齐，量不出里面有没有错位
    const firstCard = block.querySelector("[data-card]");
    if (firstCard) put("资源", firstCard.getBoundingClientRect());
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

test.describe("一天的单子也放得下", () => {
  // 一天的色块内宽只有 136px。曾经为了腾地方，把状态下拉框在
  // @container (max-width:180px) 里整个藏掉 —— 等于一天的单子改不了状态。
  test("状态下拉框在一天的单子上也要在，而且显示得下完整标签", async ({ page }) => {
    await gotoOverview(page, `?assign=${SHORT_NAME}`);
    const sel = page.locator("#assign-active-block .assign-status select");
    await expect(sel).toBeVisible();

    const fit = await page.evaluate(() => {
      const s = document.querySelector<HTMLSelectElement>(
        "#assign-active-block .assign-status select"
      )!;
      // 这个 select 在 flex 里被挤过，量它本身只知道「挤成了多宽」。
      // 想知道「不挤时要多宽」得另起一个探针，摆到容器外面 width:auto 量。
      // **不写死像素**：CI 是 Linux，字体度量跟本地不一样，写死了必然飘
      const cs = getComputedStyle(s);
      const probe = s.cloneNode(true) as HTMLSelectElement;
      probe.style.cssText =
        `position:absolute;visibility:hidden;width:auto;min-width:0;` +
        `font-size:${cs.fontSize};padding:${cs.padding};height:${cs.height};` +
        `box-sizing:border-box;appearance:${cs.appearance};` +
        `-webkit-appearance:${cs.appearance}`;
      document.body.appendChild(probe);
      const need = probe.getBoundingClientRect().width;
      probe.remove();
      return {
        got: s.getBoundingClientRect().width,
        need,
        label: s.options[s.selectedIndex]?.text ?? "",
        blockWidth: document
          .getElementById("assign-active-block")!
          .getBoundingClientRect().width,
      };
    });

    expect(
      fit.got,
      `色块内宽 ${fit.blockWidth}px，状态框只分到 ${fit.got}px，` +
        `显示「${fit.label}」要 ${fit.need}px` +
        `（余量 ${(fit.got - fit.need).toFixed(2)}px）`
    ).toBeGreaterThanOrEqual(fit.need);
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
    // 点之前每个色块的内联阴影。**有的色块本来就有**（非主要管理员的单，边框里叠一层他的颜色，
    // lib/orderFrame.ts），所以判据是「跟点之前一样」，不是「没有」
    const shadowsBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-order-id]")).map((e) => (e as HTMLElement).style.boxShadow)
    );
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
    const leftovers = await page.evaluate((before) =>
      Array.from(document.querySelectorAll("[data-order-id]"))
        .filter((e, i) => {
          const cs = getComputedStyle(e);
          return (
            cs.outlineStyle !== "none" || (e as HTMLElement).style.boxShadow !== before[i]
          );
        })
        .map((e) => (e as HTMLElement).dataset.orderId),
      shadowsBefore
    );
    expect(leftovers, "Esc 之后还有色块留着选中/抢画/焦点的痕迹").toEqual([]);

    // 焦点本身也得放掉。上面那条查的是「看不看得见」，这条查的是根因：
    // 焦点还留在色块上的话，下次再敲键盘同一个圈就会再冒出来
    const focused = await page.evaluate(
      () => !!(document.activeElement as HTMLElement | null)?.closest?.("[data-order-id]")
    );
    expect(focused, "Esc 之后焦点还留在某个色块上").toBe(false);
  });


  // 普通点击（没按 ⌘/shift）的语义是**重新开始**，不是「跟多选无关」。
  // 原来写成后者，漏出两个洞，下面两条各钉一个。
  test("选着两单时普通点第三单：变成单选那一单，不是加进去", async ({ page }) => {
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

    // 不按任何修饰键点第三单
    await page.locator(`a[data-order-id="${THIRD}"]`).first().click();

    // 之前这儿会变成「已选 3 单」：普通点击不清选中，接着「把正在配的那一单
    // 折进选中」的 effect 一看还有选中，把第三单也收了进去
    await expect(page.getByText(/已选 \d+ 单/)).toHaveCount(0);
    // 普通点击该做的事照做：进那一单的分配态
    await expect(page).toHaveURL(new RegExp(`assign=${THIRD}`));
    const lit = await page.evaluate(
      () =>
        new Set(
          Array.from(document.querySelectorAll("[data-order-id]"))
            .filter((e) => getComputedStyle(e).outlineStyle !== "none")
            .map((e) => (e as HTMLElement).dataset.orderId)
        ).size
    );
    expect(lit, "普通点击之后还有别的单子亮着多选的框").toBeLessThanOrEqual(1);
  });

  test("选着两单时点空白处：多选取消掉", async ({ page }) => {
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

    // 挑一个真空白的点：标题那一行的最左边。不能直接点标题正中 ——
    // 多选操作条是 fixed 居中贴顶的，正好压在上面，点下去等于点了操作条
    const box = (await page.getByRole("heading", { name: "排期总览" }).boundingBox())!;
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.tagName ?? "?",
      [box.x + 2, box.y + box.height / 2] as [number, number]
    );
    expect(hit, "挑的这个点不是空白，被别的东西挡住了").toBe("H1");
    await page.mouse.click(box.x + 2, box.y + box.height / 2);

    // 原来空白处压根没人管：ClickOutsideDeselect 只在分配态里挂着，
    // 不在分配态的时候那批蓝框就一直赖着
    await expect(page.getByText(/已选 \d+ 单/)).toHaveCount(0);
  });

  test("操作条自己点不掉自己", async ({ page }) => {
    await gotoOverview(page);
    await page
      .locator(`a[data-order-id="${MAIN}"]`)
      .first()
      .click({ modifiers: ["ControlOrMeta"] });
    await page
      .locator(`a[data-order-id="${SHORT_NAME}"]`)
      .first()
      .click({ modifiers: ["ControlOrMeta"] });

    // 在操作条上点一下也是一次「点在订单以外」，要是照样清空，
    // 这条操作条会连同它自己一起消失，点了个寂寞。
    // **得是真的 click**：selectOption 走的是 DOM 赋值，压根不发 click 事件，
    // 那道护栏根本不会被碰到，这条断言就是死的（写的时候就这么错过一次）
    await page.locator("[data-bulk-bar]").getByText(/已选 2 单/).click();
    await expect(page.getByText(/已选 2 单/)).toBeVisible();

    // 顺带确认这条上的控件还能用
    await page.locator("[data-bulk-bar] select").selectOption({ index: 1 });
    await expect(page.getByText(/已选 2 单/)).toBeVisible();
  });
});

test.describe("建单弹窗的人数框", () => {
  // 这两个框原来是数字 state（value={male} + Number(e.target.value)），
  // 踩到了 React 对受控 <input type="number"> 的两个特殊处理，见 lib/party.ts 的
  // parseCount 注释。表现是：清不空、而且「01」擦不掉。
  async function openPopup(page: import("@playwright/test").Page, admin: string | null = "admin-admin1") {
    await gotoOverview(page, "", admin);
    const grid = page.locator('[title="拖动选日期，双击建新单"]').first();
    const box = (await grid.boundingBox())!;
    const vw = page.viewportSize()!.width;
    // 日历是横着滚的，这一段的 box.x 往往是负的（左边已经滚出去了），
    // 直接拿 box.x + 一点 会点到屏幕外面。取它和视口的交集
    const x = (Math.max(box.x, 0) + Math.min(box.x + box.width, vw)) / 2;
    // 往这一段最下面的空泳道里双击，避开上面那几个订单色块
    await page.mouse.dblclick(x, box.y + box.height - 20);
    await page.locator('[data-new-order-popup="true"]').waitFor();
  }

  test("打的是几就是几：不会变成「01」，也删得空", async ({ page }) => {
    await openPopup(page);
    const male = page.locator('[data-new-order-popup="true"] input[type="number"]').first();

    // 默认空着（占位符是 0），所以没有一个现成的 "0" 等着被打在前面
    await expect(male).toHaveValue("");

    await male.click();
    await male.type("1");
    // 原来这里是 "01"：Number("01") 得 1，state 对了，但 React 更新受控 number 框
    // 用的是宽松比较（"01" != 1 为假），就认为不用改 DOM，01 一直留在框里
    await expect(male).toHaveValue("1");

    // 删得空。原来清空会被立刻塞回 "0"（value===0 && node.value==='' 那个特例）
    await male.press("Backspace");
    await expect(male).toHaveValue("");
  });

  test("人数框上没有那个 ▾（datalist 的下拉箭头）", async ({ page }) => {
    await openPopup(page);
    const lists = await page
      .locator('[data-new-order-popup="true"] input[type="number"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("list")));
    expect(lists.filter(Boolean), "人数框还挂着 datalist，Chrome 会给它画一个 ▾").toEqual([]);
  });

  test("「创建」是灰的时候，要说出为什么", async ({ page }) => {
    await openPopup(page);
    const create = page.getByRole("button", { name: "创建" });
    await expect(create).toBeDisabled();
    // 不说理由的灰按钮，会让人把上一个动作（刚在人数框里打的字）当成原因
    await expect(page.getByText("填一下客人的昵称")).toBeVisible();

    await page.getByPlaceholder("客人昵称").fill("测试客户");
    await expect(page.getByText("填一下客人的昵称")).toHaveCount(0);
    await expect(create).toBeEnabled();
    // 能建的时候那个位置说「记到谁名下」—— 切错了身份，点「创建」之前还看得见
    await expect(page.getByText("客人记到 Admin1 名下")).toBeVisible();
  });

  test("**没选身份就不让建**，并且说出来", async ({ page }) => {
    // 一台还没选过身份的电脑：不知道这个客人该记在谁名下
    await openPopup(page, null);
    await page.getByPlaceholder("客人昵称").fill("测试客户");
    await expect(page.getByRole("button", { name: "创建" })).toBeDisabled();
    await expect(page.getByText("先在标题旁边选当前身份")).toBeVisible();
  });

  test("标题旁边切身份，建单弹窗跟着变", async ({ page }) => {
    await gotoOverview(page, "", null);
    await page.getByLabel("当前身份").selectOption({ label: "admin2" });
    // 切完是 router.refresh()，等下拉显示成 admin2 再往下走
    await expect(page.getByLabel("当前身份")).toHaveValue("admin-admin2");
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "admin_id")?.value).toBe("admin-admin2");

    const grid = page.locator('[title="拖动选日期，双击建新单"]').first();
    const box = (await grid.boundingBox())!;
    const vw = page.viewportSize()!.width;
    await page.mouse.dblclick((Math.max(box.x, 0) + Math.min(box.x + box.width, vw)) / 2, box.y + box.height - 20);
    await page.locator('[data-new-order-popup="true"]').waitFor();
    await page.getByPlaceholder("客人昵称").fill("测试客户");
    await expect(page.getByText("客人记到 admin2 名下")).toBeVisible();
  });
});

test.describe("按管理员筛 / 管理员的边框颜色", () => {
  // 种子：主要管理员是 admin2；只有 ord-main 写了是 Admin1 的，别的单都没写（= 算 admin2 的）
  const ids = (page: Page) =>
    page
      .locator("[data-order-id]")
      .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-order-id")))]);

  test("筛 Admin1 只剩他的单；筛 admin2 是其余的（没写是谁的也算她的）", async ({ page }) => {
    await gotoOverview(page);
    const all = await ids(page);
    expect(all.length).toBeGreaterThan(1);

    await gotoOverview(page, "?oadmin=admin-admin1");
    expect(await ids(page)).toEqual([MAIN]);

    await gotoOverview(page, "?oadmin=admin-admin2");
    const admin2 = await ids(page);
    expect(admin2).not.toContain(MAIN);
    expect(admin2.length).toBe(all.length - 1);
  });

  test("设了主要管理员就没有「没标」这个选项", async ({ page }) => {
    await gotoOverview(page);
    const labels = await page.locator('select[name="oadmin"] option').allTextContents();
    expect(labels).toEqual(["全部管理员", "Admin1", "admin2"]);
  });

  test("下拉里选了，地址栏跟着变（刷新、收藏都还在）", async ({ page }) => {
    await gotoOverview(page);
    await page.locator('select[name="oadmin"]').selectOption({ label: "Admin1" });
    await expect(page).toHaveURL(/oadmin=admin-admin1/);
    await expect(page.locator('select[name="oadmin"]')).toHaveValue("admin-admin1");
  });

  test("**只有非主要管理员的单带颜色边框**，选中时加重", async ({ page }) => {
    await gotoOverview(page);
    const frame = (id: string) =>
      page.locator(`[data-order-id="${id}"]`).first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return { border: cs.borderTopColor, shadow: cs.boxShadow };
      });
    const admin1Color = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--admin-1").trim()
    );
    const toRgb = (hex: string) =>
      `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

    // Admin1 的单：边框是他的颜色，里面叠了一层
    const admin1 = await frame(MAIN);
    expect(admin1.border).toBe(toRgb(admin1Color));
    expect(admin1.shadow).toContain("inset");

    // 没写是谁的（= admin2 的）：保持原样，没有那层
    const plain = await frame(SHORT_NAME);
    expect(plain.border).not.toBe(toRgb(admin1Color));
    expect(plain.shadow).not.toContain("inset");

    // 图例只列 Admin1，再说一句其余是谁的
    await expect(page.locator("[data-admin-legend]")).toHaveText(["Admin1 的单"]);
    await expect(page.getByText("其余是 admin2 的")).toBeVisible();

    // 选中 Admin1 的单：颜色还在，而且加重了（里面那层变 2px）
    await gotoOverview(page, `?assign=${MAIN}`);
    const selected = await frame(MAIN);
    expect(selected.border).toBe(toRgb(admin1Color));
    expect(selected.shadow).toMatch(/2px inset|inset 0px 0px 0px 2px/);
  });
});

test.describe("资源卡片要扁", () => {
  // 资源有一百多张，卡片高度直接决定一屏能看到几张。原来是三行
  // （名字+类型 / 年龄·生日 / 已排），把生日那一行并进第一行之后是两行，
  // 实测 72px → 54px。这条盯的是「别又变回三行」。
  test("名字和「年龄·生日」在同一行，整个资源只有两行", async ({ page }) => {
    await gotoOverview(page);
    const card = page.locator("#resource-panel [data-resource-id]").first();
    await card.waitFor();

    const shape = await card.evaluate((el) => {
      const body = el.querySelector("a")!;
      const rows = Array.from(body.children) as HTMLElement[];
      // 找到写着「N岁」的那个元素，和名字那个元素
      const all = Array.from(body.querySelectorAll("span")) as HTMLElement[];
      // 卡片上写的是生日，不是年龄 —— 两个都写是同一份信息写两遍
      const age = all.find((e) => /^\d{4}-\d{2}-\d{2}$/.test((e.textContent || "").trim()));
      const name = all.find(
        (e) => getComputedStyle(e).textOverflow === "ellipsis" && e.textContent?.trim()
      );
      const top = (e?: HTMLElement) => (e ? +e.getBoundingClientRect().top.toFixed(1) : null);
      return {
        rowCount: rows.length,
        ageText: age?.textContent?.trim() ?? null,
        nameTop: top(name),
        ageTop: top(age),
      };
    });

    expect(shape.ageText, "卡片上找不到生日").toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(shape.rowCount, "卡片又变回三行了，一屏能看到的资源会变少").toBe(2);
    // 同一行 —— 不比像素高度（字体在别的平台会不一样），比两段文字的上边缘是不是齐的
    expect(
      Math.abs((shape.nameTop ?? 0) - (shape.ageTop ?? 999)),
      `名字和年龄不在同一行（名字 top=${shape.nameTop}、年龄 top=${shape.ageTop}）`
    ).toBeLessThanOrEqual(3);
  });
});

test.describe("滚动条「不动就看不见」", () => {
  // 这套在日历那边修过三轮（transition 是死的、:hover 会让它常驻、颜色太深），
  // 而资源面板那份各写各的、一轮都没跟上 —— 正是 CLAUDE.md 记的那个老毛病：
  // 同一件事两份实现，改了一边忘了另一边。现在合成一份（ScrollbarFade），
  // 这两条盯着别再分家。
  test("日历和资源面板用的是同一份滚动条样式", async ({ page }) => {
    await gotoOverview(page);
    const css = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("style"))
        .map((s) => s.textContent || "")
        .join("\n");
      const grab = (cls: string) => {
        const m = all.match(
          new RegExp("\\." + cls + "::-webkit-scrollbar-thumb\\s*\\{([^}]*)\\}")
        );
        return m ? m[1].replace(/\s+/g, " ").trim() : null;
      };
      return {
        cal: grab("cal-scroll"),
        panel: grab("panel-scroll"),
        // :hover 那条会让滚动条常驻 —— 鼠标本来就一直在这些区域上
        hover: /\.(cal|panel)-scroll:hover/.test(all),
      };
    });
    expect(css.cal, "日历的滚动条样式没找到").toBeTruthy();
    expect(css.panel, "资源面板的滚动条样式没找到").toBeTruthy();
    expect(css.panel, "两边的滚动条样式又分家了").toBe(css.cal);
    expect(css.hover, "加了 :hover，滚动条会一直显示着").toBe(false);
    // 颜色走 token，不是写死的 rgba —— 写死的黑在暗色模式下是黑压黑
    expect(css.cal).toContain("var(--scrollbar-thumb)");
  });

  test("资源面板滚完会自己淡掉", async ({ page }) => {
    // 把视口压矮，让这几个资源真的撑出滚动条（种子里只有三张）
    await page.setViewportSize({ width: 1280, height: 420 });
    await gotoOverview(page);
    const panel = page.locator(".panel-scroll");
    await panel.waitFor();

    const scrollable = await panel.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(scrollable, "面板没溢出，这条测不到东西（视口再压矮点）").toBe(true);

    await panel.evaluate((el) => { el.scrollTop = 40; });
    const peak = await panel.evaluate((el) =>
      Number(el.style.getPropertyValue("--cal-thumb-a"))
    );
    expect(peak, "滚了之后滚动条没显出来").toBeGreaterThan(0);

    // 停手 1.4 秒之后开始淡，这里等到淡出区间里再看一眼
    await page.waitForTimeout(2600);
    const later = await panel.evaluate((el) =>
      Number(el.style.getPropertyValue("--cal-thumb-a"))
    );
    expect(later, `停手之后没有在淡（一直是 ${peak}）`).toBeLessThan(peak);
  });
});

test.describe("男女进度不许被挤掉", () => {
  // 真出过：一天的单子配了两个资源，「男1/1 女1/1」被压成「男1/1 女…」——
  // 而「要几个资源、配了几张」正是这一格里最该先看见的东西。
  // 挤不下该让的是右边的物主名字。
  // 不去造一个刚好溢出的色块来测（那要靠字体宽度，换个平台就不准），
  // 直接钉住这个决定本身：两个状态都不许收缩。
  for (const [name, qs] of [["普通态", ""], ["分配态", `?assign=${MAIN}`]] as const) {
    test(`${name}：男女那一格 flex-shrink 是 0`, async ({ page }) => {
      await gotoOverview(page, qs);
      const el = page.locator(`[data-order-id="${MAIN}"] [data-need]`).first();
      await expect(el).toBeVisible();
      await expect(el).toHaveCSS("flex-shrink", "0");
    });
  }
});

test.describe("色块里的物主名字", () => {
  // 撞名怎么补字母由 lib/holderName.test.ts 管（12 条）。这条只管**接线**：
  // 页面真的用上了那张表，而不是还在写全名
  test("只写 first name，不写全名", async ({ page }) => {
    await gotoOverview(page);
    const row = page.locator(`[data-order-id="${MAIN}"] [data-card]`).first();
    await expect(row).toHaveText("sara");

    // 性别符号也去掉了 —— 看名字就知道男女，一行里两个符号挺占地方
    const block = page.locator(`[data-order-id="${MAIN}"]`).first();
    await expect(block).not.toContainText("♀");
    await expect(block).not.toContainText("♂");
  });
});

test.describe("日期带和订单色块一样高", () => {
  // 两边都是两行，高度就该一样 —— 对不上看着像没对齐。
  // 一度是 46 对 42：日期带的上下内边距是 4，色块是 2。
  // 现在 HEADER_ROW_HEIGHT 直接就是 ROW_HEIGHT，这条盯着别再分开。
  test("两个的高度是同一个数", async ({ page }) => {
    await gotoOverview(page);
    const h = await page.evaluate(() => {
      const head = document.querySelector("[data-today]") as HTMLElement | null;
      const blk = document.querySelector("a[data-order-id]") as HTMLElement | null;
      if (!head || !blk) throw new Error("日期带或订单色块没找到");
      const need = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        const rows = Array.from(el.children).map(
          (c) => (c as HTMLElement).getBoundingClientRect().height
        );
        const gap = parseFloat(cs.rowGap || "0") || 0;
        return +(
          rows.reduce((a, x) => a + x, 0) +
          gap * (rows.length - 1) +
          parseFloat(cs.paddingTop) +
          parseFloat(cs.paddingBottom) +
          parseFloat(cs.borderTopWidth) +
          parseFloat(cs.borderBottomWidth)
        ).toFixed(2);
      };
      return {
        head: +head.getBoundingClientRect().height.toFixed(2),
        blk: +blk.getBoundingClientRect().height.toFixed(2),
        // 各自装不装得下 —— 高度一样但有一边不够装，也不算对。
        // **不能用 scrollHeight 判断**：这两个盒子 overflow 不是 scroll，
        // 装不下的时候 scrollHeight 不一定大于 clientHeight，那样写出来是条
        // 永远绿的死断言（试过，压到 38px 都照样通过）。直接把行高加起来比。
        headNeed: need(head),
        blkNeed: need(blk),
      };
    });
    expect(h.head, `日期带 ${h.head}px、订单色块 ${h.blk}px，两边都是两行，高度该一样`).toBe(h.blk);
    expect(h.head, `日期带只有 ${h.head}px，装下两行要 ${h.headNeed}px`).toBeGreaterThanOrEqual(h.headNeed);
    expect(h.blk, `订单色块只有 ${h.blk}px，装下两行要 ${h.blkNeed}px`).toBeGreaterThanOrEqual(h.blkNeed);
  });
});

test.describe("资源清单的排序", () => {
  // 库里那条 .order("date_range_start") 排的是「资源什么时候开始生效」，
  // 跟挑资源这件事没关系。挑资源时脑子里的顺序要么是年龄、要么是出借频率。
  // 排法本身由 lib/resourceSort.test.ts 管（12 条），这三条管**接线**：
  // 默认真的按年龄排、菜单点得动、选中的记在 URL 上刷新还在。
  const maleNames = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      // 男资源那一组：第一个 ResourceGroup
      const cards = Array.from(
        document.querySelectorAll("#resource-panel [data-resource-id]")
      ) as HTMLElement[];
      return cards
        .map((c) => c.querySelector("a")!.children[0].textContent || "")
        .map((t) => t.replace(/\d{4}-\d{2}-\d{2}|生日没填/g, "").trim());
    });

  test("默认按年龄从小到大", async ({ page }) => {
    await gotoOverview(page);
    const names = await maleNames(page);
    // 种子：zolan 1999-04-16（年轻）、jordan doe 1995-10-10、sara lee 1995-09-10
    expect(names.indexOf("zolan")).toBeLessThan(names.indexOf("jordan doe"));
  });

  test("菜单里选「年龄 大 → 小」，顺序真的反过来", async ({ page }) => {
    await gotoOverview(page);
    await page.locator('button[aria-label="排序方式"]').click();
    // 当前那档要打勾
    await expect(
      page.locator('[role="menuitemradio"][aria-checked="true"]')
    ).toHaveText(/年龄 小 → 大/);

    await page.getByRole("menuitemradio", { name: /年龄 大 → 小/ }).click();
    await expect(page).toHaveURL(/ssort=age-desc/);

    const names = await maleNames(page);
    expect(names.indexOf("jordan doe")).toBeLessThan(names.indexOf("zolan"));
  });

  test("排序记在 URL 上 —— 刷新还在", async ({ page }) => {
    await gotoOverview(page, "?ssort=freq-desc");
    await page.locator('button[aria-label="排序方式"]').click();
    await expect(
      page.locator('[role="menuitemradio"][aria-checked="true"]')
    ).toHaveText(/排得多的在前/);
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
