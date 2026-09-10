// 排期总览的色块：进出分配态有没有错位 —— 跑这个量，别靠眼睛看。
//
// 这一类 bug（进编辑态字挪了几像素、字号变了、多出一个叉占了位置）已经修过三轮，
// 每轮都是「看着好像对了」，然后又被发现。所以把量的过程固化下来。
//
// 用法：浏览器打开 /admin/overview，DevTools Console 整个粘进去，等两秒看结果。
// 它自己会点进分配态再量一遍（走客户端路由，不刷新，所以一次就能跑完）。
//
// 判断标准：同一个视觉锚点在两个状态里的 x / 右边缘应该一样。
// 差 ≤2px 是 field-sizing:content 给光标留的余量 —— 把文字变成可编辑的固有代价；
// 再多就是有人又写了第二份样式，去看 CLAUDE.md 里那条规矩。
(async () => {
  const TOLERANCE = 2;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 锚点只挑「两个状态里都以同样形态出现」的东西
  const probe = (block) => {
    const out = {};
    const put = (k, r) => {
      if (!(k in out)) out[k] = { x: +r.x.toFixed(1), right: +r.right.toFixed(1) };
    };
    // 锚点字符可能藏在一大串文字里（普通态「♂张三 ♀李四」是**一个**文字节点），
    // 所以按字符偏移量单独框出来量 —— 直接 selectNode 整个节点的话，
    // 量到的是整串的左边缘，永远看不出 ♀ 挪了没有
    const ANCHORS = ["♀", "女", "$"];
    const walk = (el) => {
      for (const c of el.childNodes) {
        if (c.nodeType === 3 && c.textContent.trim()) {
          for (const ch of ANCHORS) {
            const i = c.textContent.indexOf(ch);
            if (i < 0) continue;
            const rg = document.createRange();
            rg.setStart(c, i);
            rg.setEnd(c, i + ch.length);
            put(ch, rg.getBoundingClientRect());
          }
        } else if (c.nodeType === 1) {
          if (c.tagName === "INPUT" && c.type !== "hidden") {
            const map = { customer_name: "姓名", location: "地点", amount: "金额" };
            if (map[c.name]) put(map[c.name], c.getBoundingClientRect());
          } else if (c.tagName !== "DATALIST" && c.tagName !== "SELECT") walk(c);
        }
      }
    };
    walk(block);
    // 外层盒模型也一起比：内边距 / 字号 / 行高不一样的话，里面怎么调都白搭
    const cs = getComputedStyle(block);
    out.__box = { padding: cs.padding, fontSize: cs.fontSize, lineHeight: cs.lineHeight };
    return out;
  };

  // 挑内容最全的那个单子（有分配、有备注、有金额的最能暴露问题）
  const link = [...document.querySelectorAll("a[data-order-id]")].sort(
    (a, b) => b.innerText.length - a.innerText.length
  )[0];
  if (!link) return console.warn("没找到订单色块 —— 先建一个配了资源的单子");
  const id = link.dataset.orderId;

  const before = probe(link);
  link.click(); // 客户端路由，不刷新，所以下面还能接着量

  for (let i = 0; i < 40; i++) {
    await sleep(150);
    const el = document.querySelector(`[data-order-id="${id}"] input[name="customer_name"]`);
    if (el) break;
  }
  await sleep(300);
  const block = document.querySelector(`[data-order-id="${id}"]`);
  if (!block) return console.warn("没进到分配态，手动点一下再跑");
  const after = probe(block);

  const rows = [];
  if (JSON.stringify(before.__box) !== JSON.stringify(after.__box)) {
    rows.push({ 锚点: "外层盒模型", 普通态: JSON.stringify(before.__box), 分配态: JSON.stringify(after.__box), 差: "不一致" });
  }
  for (const k of Object.keys(before)) {
    if (k === "__box" || !after[k]) continue;
    const dx = +(after[k].x - before[k].x).toFixed(1);
    const dr = +(after[k].right - before[k].right).toFixed(1);
    if (Math.abs(dx) > TOLERANCE || Math.abs(dr) > TOLERANCE) {
      rows.push({ 锚点: k, 普通态: before[k].x, 分配态: after[k].x, 差: `x ${dx} / right ${dr}` });
    }
  }

  if (rows.length === 0) console.log("%c✓ 两个状态对得上（差都在 2px 以内）", "color:#1f5c33;font-weight:600");
  else {
    console.log("%c✗ 这些地方进出分配态会动：", "color:#c0392b;font-weight:600");
    console.table(rows);
  }
})();
