import type { OverviewRaw } from "@/lib/overviewModel";

// 排期总览实时更新的纯逻辑（浏览器那头在 app/admin/overview/useLiveRaw.ts）：
//   1. 库里一改，change_log 的 trigger 发一条广播（迁移 0035），**只带 id 不带内容**
//   2. 浏览器攒一小会儿，collectChanges 把这批广播换算成「要重新拉哪几行」
//   3. 服务端（rows/route.ts）按同一份查询（lib/overviewData.ts）拉回那几行
//   4. mergeRaw 合进浏览器手里的原始数据，lib/overviewModel.ts 再算一遍就是新样子

/** 广播里的一条（change_log 的一行，去掉了内容）。字段名短是因为每条都要过网 */
export type ChangeMsg = {
  /** change_log.id，递增 */
  id: number;
  /** 表名 */
  t: string;
  /** 那一行的主键（多列主键用「/」连，见 log_change） */
  row: string;
  op: "insert" | "update" | "delete";
  /** 那一行上的 order_id（分配、备注这些子表才有） */
  order?: string | null;
};

export type RowsRequest = {
  /** 重新拉这几单（订单本身变了，或者它的分配变了） */
  orders: string[];
  /** 这几个人的名字 / 生日变了：重新拉他们这季的单 */
  customers: string[];
  resources: string[];
  /** 这几单的备注变了 */
  notes: string[];
  dayNotes: boolean;
  /** 增量合不了的（设置、管理员名单）：整页刷新 */
  full: boolean;
};

export function emptyRequest(): RowsRequest {
  return { orders: [], customers: [], resources: [], notes: [], dayNotes: false, full: false };
}

export function isEmptyRequest(r: RowsRequest): boolean {
  return !r.full && !r.dayNotes && !r.orders.length && !r.customers.length && !r.resources.length && !r.notes.length;
}

export function collectChanges(msgs: ChangeMsg[]): RowsRequest {
  const orders = new Set<string>();
  const customers = new Set<string>();
  const resources = new Set<string>();
  const notes = new Set<string>();
  let dayNotes = false;
  let full = false;
  for (const m of msgs) {
    switch (m.t) {
      case "orders":
        orders.add(m.row);
        break;
      case "order_assignments":
        // 分配是挂在订单上一起拉回来的（ORDER_SELECT 里的 order_assignments），所以重拉那一单
        if (m.order) orders.add(m.order);
        break;
      case "order_notes":
        if (m.order) notes.add(m.order);
        break;
      case "resources":
        resources.add(m.row);
        break;
      // 人和客户身份：名字、生日改了，色块上的名字跟着变。customers.id = people.id
      case "people":
      case "customers":
        customers.add(m.row);
        break;
      case "day_notes":
        dayNotes = true;
        break;
      // 主要管理员、每行几天这些影响整张图的设置，管理员改名：整页刷新（一年没几次）
      case "app_settings":
      case "admins":
        full = true;
        break;
      // 意向、付款、返点、需求……这一页不显示，不管
      default:
        break;
    }
  }
  return {
    orders: [...orders],
    customers: [...customers],
    resources: [...resources],
    notes: [...notes],
    dayNotes,
    full,
  };
}

/** 服务端拉回来的那几行。row: null = 没了（删了、不在这季了、资源被删了） */
export type RowsResponse = {
  /** 服务端开始查库的时间：整页重新渲染（data-rendered-at）早于它的话，这批还得再合一次 */
  at: number;
  orders: { id: string; row: any | null }[];
  resources: { id: string; row: any | null }[];
  /** 问了哪几单的备注；问了没回来的 = 备注删了 */
  notesFor: string[];
  orderNotes: { order_id: string; internal_note: string | null }[];
  dayNotes?: { day: string; note: string }[];
};

/**
 * 把拉回来的几行合进手里的原始数据。skipOrders 里的单不动（正在编辑的那一单：
 * 合进去的话编辑框会被重新挂载、刚打的字没了），调用方记着，退出编辑后再拉一次
 */
export function mergeRaw(raw: OverviewRaw, res: RowsResponse, skipOrders: ReadonlySet<string> = new Set()): OverviewRaw {
  let orders = raw.orders;
  const orderUpdates = res.orders.filter((o) => !skipOrders.has(o.id));
  if (orderUpdates.length) {
    const byId = new Map(orders.map((o) => [o.id, o]));
    for (const { id, row } of orderUpdates) {
      if (row) byId.set(id, row);
      else byId.delete(id);
    }
    orders = [...byId.values()];
  }

  let resources = raw.resources;
  if (res.resources.length) {
    const byId = new Map(resources.map((s) => [s.id, s]));
    for (const { id, row } of res.resources) {
      if (row) byId.set(id, row);
      else byId.delete(id);
    }
    resources = [...byId.values()];
  }

  let orderNotes = raw.orderNotes;
  const notesFor = res.notesFor.filter((id) => !skipOrders.has(id));
  if (notesFor.length) {
    const asked = new Set(notesFor);
    orderNotes = [
      ...orderNotes.filter((n) => !asked.has(n.order_id)),
      ...res.orderNotes.filter((n) => asked.has(n.order_id)),
    ];
  }

  return {
    orders,
    resources,
    orderNotes,
    dayNotes: res.dayNotes ?? raw.dayNotes,
  };
}

/** 这批变动里碰到了哪几单（正在编辑的那一单要不要先放着） */
export function touchedOrders(res: RowsResponse): string[] {
  return [...new Set([...res.orders.map((o) => o.id), ...res.notesFor])];
}
