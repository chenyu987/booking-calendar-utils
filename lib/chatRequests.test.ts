import { describe, expect, it } from "vitest";
import {
  estimateTotal,
  inferSentTime,
  sentOffsetMinutes,
  parseBulkIds,
  formatRequestDates,
  formatRequestParty,
  keepRequest,
  matchRequestPerson,
  parseGroupForm,
  parseRequestFilters,
  parseRequestStatus,
  requestFiltersQuery,
  requestItem,
  sortRequests,
  type FilterableRequest,
} from "./chatRequests";

describe("parseRequestStatus", () => {
  it("只认库里 check 的那四个", () => {
    expect(parseRequestStatus("contacted")).toBe("contacted");
    expect(parseRequestStatus("done")).toBeNull();
    expect(parseRequestStatus(undefined)).toBeNull();
    expect(parseRequestStatus("all")).toBeNull();
  });
});

describe("matchRequestPerson", () => {
  const people = [
    { id: "a", chat_name: "Alex Wang", chat_id: "alexw" },
    { id: "b", chat_name: "婷婷", chat_id: null },
    { id: "c", chat_name: "Sam", chat_id: null },
    { id: "d", chat_name: "Sam", chat_id: null },
  ];

  it("昵称精确对上，只去两头空白", () => {
    expect(matchRequestPerson("Alex Wang", people)?.id).toBe("a");
    expect(matchRequestPerson(" 婷婷 ", people)?.id).toBe("b");
  });

  it("空格、大小写不一样就不算对上", () => {
    expect(matchRequestPerson("alexwang", people)).toBeNull();
    expect(matchRequestPerson("alex wang", people)).toBeNull();
  });

  it("昵称对不上再看账号", () => {
    expect(matchRequestPerson("alexw", people)?.id).toBe("a");
    expect(matchRequestPerson("AlexW", people)).toBeNull();
  });

  it("对上两个人就当没对上，不猜", () => {
    expect(matchRequestPerson("Sam", people)).toBeNull();
  });

  it("对不上、空名字都是 null", () => {
    expect(matchRequestPerson("新来的", people)).toBeNull();
    expect(matchRequestPerson("", people)).toBeNull();
  });
});

describe("显示", () => {
  it("日期去掉前导 0，认不出的原样留着", () => {
    expect(formatRequestDates(["03-14", "03-15"])).toBe("3/14、3/15");
    expect(formatRequestDates(["周末"])).toBe("周末");
    expect(formatRequestDates(null)).toBe("");
  });

  it("男女分开写，都没有是 —", () => {
    expect(formatRequestParty(1, 1)).toBe("男1 女1");
    expect(formatRequestParty(0, 2)).toBe("女2");
    expect(formatRequestParty(0, 0)).toBe("—");
  });
});

describe("requestItem：没写类型就按地点推", () => {
  it("Loccx 只收 Beta", () => {
    expect(requestItem("unknown", "loccx")).toEqual({ item: "beta", inferred: true, conflict: null });
  });

  it("别名也认（locaj = Akaad，Alpha）", () => {
    expect(requestItem("unknown", "locaj").item).toBe("alpha");
  });

  it("几个地点都是同一边的，照样推", () => {
    expect(requestItem("unknown", "loccw, loccx").item).toBe("beta");
  });

  it("几个地点两边都有，不猜", () => {
    expect(requestItem("unknown", "loccx / locaf")).toEqual({ item: null, inferred: false, conflict: null });
  });

  it("地点认不出、没写地点，都不猜", () => {
    expect(requestItem("unknown", "某个小雨场").item).toBeNull();
    expect(requestItem("unknown", null).item).toBeNull();
  });

  it("写了类型、跟地点一致，就是写的那种", () => {
    expect(requestItem("beta", "loccx")).toEqual({ item: "beta", inferred: false, conflict: null });
  });

  it("写了类型、跟地点对不上：按地点，但记下他说的是什么", () => {
    expect(requestItem("alpha", "loccx")).toEqual({ item: "beta", inferred: true, conflict: "alpha" });
  });

  it("写了类型、地点认不出来：照他说的", () => {
    expect(requestItem("alpha", "某个小雨场")).toEqual({ item: "alpha", inferred: false, conflict: null });
  });
});

describe("筛选", () => {
  const G = "11111111-1111-4111-8111-111111111111";
  const row = (over: Partial<FilterableRequest> = {}): FilterableRequest => ({
    status: "new", group_id: G, sender: "Nora Wang", item_type: "unknown", location: "loccx",
    dates: ["02-24", "02-25"], male: 1, female: 0, captured_at: "2026-10-24T06:43:00Z", created_at: "2026-10-24T06:43:05Z",
    ...over,
  });
  const f = (sp: Record<string, string>) => parseRequestFilters(sp);

  it("认不出来的参数当没筛，默认状态是「新的」", () => {
    expect(f({ status: "x", group: "abc", item: "season", day: "2/24", party: "kids" })).toEqual({
      status: "new", group: "", sender: "", item: "", location: "", day: "", party: "", from: "", to: "",
      sort: "captured", dir: "desc",
    });
  });

  it("拼回 URL：默认值和空的不写", () => {
    expect(requestFiltersQuery(f({}))).toBe("");
    expect(requestFiltersQuery(f({ status: "all", sender: "Nik" }))).toBe("?status=all&sender=Nik");
  });

  it("群：按 id；none = 没挂到群上的", () => {
    expect(keepRequest(row(), f({ group: G }))).toBe(true);
    expect(keepRequest(row({ group_id: null }), f({ group: G }))).toBe(false);
    expect(keepRequest(row({ group_id: null }), f({ group: "none" }))).toBe(true);
    expect(keepRequest(row(), f({ group: "none" }))).toBe(false);
  });

  it("发言人：包含就算，不管大小写空格", () => {
    expect(keepRequest(row(), f({ sender: "noraw" }))).toBe(true);
    expect(keepRequest(row(), f({ sender: "Sam" }))).toBe(false);
  });

  it("类型：按地点推的也算", () => {
    expect(keepRequest(row(), f({ item: "beta" }))).toBe(true);
    expect(keepRequest(row(), f({ item: "alpha" }))).toBe(false);
  });

  it("地点：别名、几个地点里有一个对上都算", () => {
    expect(keepRequest(row({ location: "akaad" }), f({ location: "locaj" }))).toBe(true);
    expect(keepRequest(row({ location: "loccw, loccx" }), f({ location: "loccx" }))).toBe(true);
    expect(keepRequest(row(), f({ location: "locaa" }))).toBe(false);
    expect(keepRequest(row({ location: null }), f({ location: "locaa" }))).toBe(false);
  });

  it("活动日：只比月日", () => {
    expect(keepRequest(row(), f({ day: "2027-02-25" }))).toBe(true);
    expect(keepRequest(row(), f({ day: "2027-02-26" }))).toBe(false);
  });

  it("人数：要男资源 / 要女资源 / 都要", () => {
    expect(keepRequest(row(), f({ party: "male" }))).toBe(true);
    expect(keepRequest(row(), f({ party: "female" }))).toBe(false);
    expect(keepRequest(row({ female: 1 }), f({ party: "both" }))).toBe(true);
  });

  it("抓到日期：两头都含，没有 captured_at 用 created_at", () => {
    expect(keepRequest(row(), f({ from: "2026-10-24", to: "2026-10-24" }))).toBe(true);
    expect(keepRequest(row(), f({ from: "2026-10-25" }))).toBe(false);
    expect(keepRequest(row({ captured_at: null }), f({ to: "2026-10-23" }))).toBe(false);
  });
});

describe("parseGroupForm", () => {
  const form = (o: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(o)) fd.set(k, v);
    return fd;
  };
  const existing = [{ id: "g1", name: "Xyz 活动" }];

  it("名字原样存（只去头尾空格），加群默认在抓", () => {
    expect(parseGroupForm(form({ name: "  ABC互助群 " }), existing)).toEqual({
      ok: true, name: "ABC互助群", active: true, note: null,
    });
  });

  it("没名字、重名（不分大小写空格）都拦", () => {
    expect(parseGroupForm(form({ name: " " }), existing)).toEqual({ ok: false, error: "empty" });
    expect(parseGroupForm(form({ name: "xyz活动" }), existing)).toEqual({ ok: false, error: "dup" });
  });

  it("改自己不算重名；复选框没勾就是停抓", () => {
    expect(parseGroupForm(form({ name: "Xyz 活动" }), existing, "g1")).toMatchObject({ ok: true, active: false });
    expect(parseGroupForm(form({ name: "Xyz 活动", active: "on" }), existing, "g1")).toMatchObject({ ok: true, active: true });
  });
});

describe("排序", () => {
  const r = (id: string, captured: string, sent: string | null) => ({
    id, captured_at: captured, created_at: captured, sent_time: sent,
  });
  const rows = [
    r("a", "2026-10-24T01:00:00Z", "2026-10-22T02:07:00Z"),
    r("b", "2026-10-24T05:00:00Z", null),
    r("c", "2026-10-24T03:00:00Z", "2026-04-18T16:15:00Z"),
  ];
  const ids = (sort: "captured" | "sent", dir: "asc" | "desc") => sortRequests(rows, { sort, dir }).map((x) => x.id);

  it("默认按抓到时间，新的在上", () => {
    const f = parseRequestFilters({});
    expect([f.sort, f.dir]).toEqual(["captured", "desc"]);
    expect(ids("captured", "desc")).toEqual(["b", "c", "a"]);
    expect(ids("captured", "asc")).toEqual(["a", "c", "b"]);
  });

  it("按群里时间排：推不出时间的不管升降都在最后", () => {
    expect(ids("sent", "desc")).toEqual(["a", "c", "b"]);
    expect(ids("sent", "asc")).toEqual(["c", "a", "b"]);
  });

  it("URL：默认排序不写，改了才写；认不出的当默认", () => {
    expect(requestFiltersQuery(parseRequestFilters({ sort: "captured", dir: "desc" }))).toBe("");
    expect(requestFiltersQuery(parseRequestFilters({ sort: "sent", dir: "asc" }))).toBe("?sort=sent&dir=asc");
    expect(parseRequestFilters({ sort: "price", dir: "up" })).toMatchObject({ sort: "captured", dir: "desc" });
  });
});

describe("估总价", () => {
  const prices = { beta: 60, alpha: 50 };
  const req = (o: Record<string, any> = {}) => ({
    item_type: "unknown", location: "loccx", dates: ["02-24", "02-25"], male: 1, female: 2, ...o,
  });

  it("单价 × 天数 × 人数；类型按地点推的也算", () => {
    expect(estimateTotal(req(), prices)).toEqual({ total: 360, price: 60, days: 2, people: 3 });
    expect(estimateTotal(req({ item_type: "alpha", location: "locaa" }), prices)?.total).toBe(300);
  });

  it("类型推不出、没设单价、日期没说、人数没说：不估", () => {
    expect(estimateTotal(req({ location: null }), prices)).toBeNull();
    expect(estimateTotal(req(), { beta: null, alpha: 50 })).toBeNull();
    expect(estimateTotal(req({ dates: [] }), prices)).toBeNull();
    expect(estimateTotal(req({ male: 0, female: 0 }), prices)).toBeNull();
  });

  it("按估价排：估不出的不管升降都在最后", () => {
    const rows = [
      { id: "a", captured_at: "2026-10-24T01:00:00Z", created_at: "2026-10-24T01:00:00Z" },
      { id: "b", captured_at: "2026-10-24T02:00:00Z", created_at: "2026-10-24T02:00:00Z" },
      { id: "c", captured_at: "2026-10-24T03:00:00Z", created_at: "2026-10-24T03:00:00Z" },
    ];
    const total: Record<string, number | null> = { a: 120, b: null, c: 480 };
    const ids = (dir: "asc" | "desc") => sortRequests(rows, { sort: "total", dir }, (r) => total[r.id]).map((r) => r.id);
    expect(ids("desc")).toEqual(["c", "a", "b"]);
    expect(ids("asc")).toEqual(["a", "c", "b"]);
    expect(parseRequestFilters({ sort: "total" }).sort).toBe("total");
  });
});

describe("parseBulkIds", () => {
  it("只要 uuid、去重", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseBulkIds([id, id, "x", "", "1; drop table"])).toEqual([id]);
  });
});

describe("群里时间推算", () => {
  // 真实数据里的两条：采集 Mac 在 UTC+8
  const resolved = [
    { sent_at: "4/16 07:40", sent_time: "2026-04-15T23:40:00Z" },
    { sent_at: "4/18 16:15", sent_time: "2026-04-18T08:15:00Z" },
    { sent_at: "Thursday 02:07", sent_time: "2026-10-21T18:07:00Z" },
    { sent_at: "2/23 13:13", sent_time: null },
  ];

  it("时区从已经推好的行里反推", () => {
    expect(sentOffsetMinutes(resolved)).toBe(480);
    // 一条参照都没有就不推
    expect(sentOffsetMinutes([{ sent_at: "2/23 13:13", sent_time: null }])).toBeNull();
    expect(sentOffsetMinutes([{ sent_at: "Yesterday 10:02", sent_time: "2026-10-21T02:02:00Z" }])).toBeNull();
  });

  it("跨年那几个小时也反推得对", () => {
    // 墙上 1/1 03:00（+8）= UTC 去年 12/31 19:00
    expect(sentOffsetMinutes([{ sent_at: "1/1 03:00", sent_time: "2025-12-31T19:00:00Z" }])).toBe(480);
  });

  it("年份取不晚于抓到那天的最近一年", () => {
    expect(inferSentTime("2/23 13:13", "2026-10-24T06:43:18Z", 480)).toBe("2026-02-23T05:13:00.000Z");
    // 12 月的消息、1 月抓到的：是去年的
    expect(inferSentTime("12/30 22:00", "2026-01-05T00:00:00Z", 480)).toBe("2025-12-30T14:00:00.000Z");
    // 写了年份的照它
    expect(inferSentTime("2025/2/23 13:13", "2026-10-24T06:43:18Z", 480)).toBe("2025-02-23T05:13:00.000Z");
  });

  it("相对写法、认不出的、没有时区的都不推", () => {
    expect(inferSentTime("Thursday 02:07", "2026-10-24T06:43:18Z", 480)).toBeNull();
    expect(inferSentTime("Yesterday 10:02", "2026-10-24T06:43:18Z", 480)).toBeNull();
    expect(inferSentTime("13/40 10:00", "2026-10-24T06:43:18Z", 480)).toBeNull();
    expect(inferSentTime(null, "2026-10-24T06:43:18Z", 480)).toBeNull();
    expect(inferSentTime("2/23 13:13", "2026-10-24T06:43:18Z", null)).toBeNull();
  });

  it("推出来的参与按群里时间排序", () => {
    const rows = [
      { id: "real", captured_at: null, created_at: "2026-10-24T00:00:00Z", sent_time: "2026-04-18T08:15:00Z" },
      { id: "guess", captured_at: null, created_at: "2026-10-24T00:00:00Z", sent_time: null, sent_guess: "2026-02-23T05:13:00Z" },
      { id: "none", captured_at: null, created_at: "2026-10-24T00:00:00Z", sent_time: null, sent_guess: null },
    ];
    expect(sortRequests(rows, { sort: "sent", dir: "desc" }).map((r) => r.id)).toEqual(["real", "guess", "none"]);
    expect(sortRequests(rows, { sort: "sent", dir: "asc" }).map((r) => r.id)).toEqual(["guess", "real", "none"]);
  });
});
