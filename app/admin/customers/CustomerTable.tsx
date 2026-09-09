"use client";

import { useMemo, useState } from "react";
import type { FootprintSegment } from "@/lib/footprint";
import { tableStyle, thStyle, tdStyle } from "@/lib/adminStyles";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  chat: string;
  age: number | null;
  status: string;
  note: string;
  segments: FootprintSegment[];
  orderCount: number;
  footprintText: string;
};

// 老客户能有十几段足迹，全铺开表格会长到没法看。默认只露最近这几段，剩下的点开。
const VISIBLE_SEGMENTS = 3;

// 筛选在客户端做，不走 URL 参数：一季几百人，数据一次全拿回来了，
// 前端过滤是零网络的即时响应；每敲一个字回一次服务端反而更慢。
const filterInputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "3px 6px",
  border: "1px solid #ddd",
  borderRadius: 3,
  fontSize: 12,
};

const filterThStyle: React.CSSProperties = {
  padding: "0 8px 8px",
  borderBottom: "1px solid #ddd",
  verticalAlign: "top",
};

function matches(value: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return value.toLowerCase().includes(q);
}

export default function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [chat, setChat] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [status, setStatus] = useState("");
  const [footprint, setFootprint] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.status).filter(Boolean))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const min = ageMin.trim() === "" ? null : Number(ageMin);
    const max = ageMax.trim() === "" ? null : Number(ageMax);

    return rows.filter((r) => {
      if (!matches(r.name, name)) return false;
      if (!matches(r.phone, phone)) return false;
      if (!matches(r.chat, chat)) return false;
      if (!matches(r.footprintText, footprint)) return false;
      if (status && r.status !== status) return false;
      // 年龄没填的人：一旦按年龄筛就排除掉，不然「找 25 岁以上」会把没记生日的全捞出来
      if (min !== null || max !== null) {
        if (r.age === null) return false;
        if (min !== null && r.age < min) return false;
        if (max !== null && r.age > max) return false;
      }
      return true;
    });
  }, [rows, name, phone, chat, footprint, status, ageMin, ageMax]);

  const hasFilter =
    name || phone || chat || footprint || status || ageMin || ageMax;

  function clearAll() {
    setName("");
    setPhone("");
    setChat("");
    setFootprint("");
    setStatus("");
    setAgeMin("");
    setAgeMax("");
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
          fontSize: 13,
          color: "#666",
        }}
      >
        <span>
          显示 {filtered.length} / {rows.length} 人
        </span>
        {hasFilter && (
          <button
            type="button"
            onClick={clearAll}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#666",
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            清空筛选
          </button>
        )}
      </div>

      <table style={{ ...tableStyle, marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, borderBottom: "none", width: "14%" }}>姓名</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "12%" }}>电话</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "12%" }}>聊天</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "10%" }}>年龄</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "10%" }}>状态</th>
            <th style={{ ...thStyle, borderBottom: "none", width: "14%" }}>备注</th>
            <th style={{ ...thStyle, borderBottom: "none" }}>足迹</th>
          </tr>
          <tr>
            <th style={filterThStyle}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="筛选姓名"
                style={filterInputStyle}
              />
            </th>
            <th style={filterThStyle}>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="筛选电话"
                style={filterInputStyle}
              />
            </th>
            <th style={filterThStyle}>
              <input
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                placeholder="筛选聊天"
                style={filterInputStyle}
              />
            </th>
            <th style={filterThStyle}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value)}
                  placeholder="最小"
                  inputMode="numeric"
                  style={filterInputStyle}
                />
                <span style={{ color: "#bbb", fontSize: 12 }}>~</span>
                <input
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value)}
                  placeholder="最大"
                  inputMode="numeric"
                  style={filterInputStyle}
                />
              </div>
            </th>
            <th style={filterThStyle}>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={filterInputStyle}
              >
                <option value="">全部</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </th>
            {/* 备注不给筛选框：内容太散，真要找人用姓名/电话/足迹更快 */}
            <th style={filterThStyle} />
            <th style={filterThStyle}>
              <input
                value={footprint}
                onChange={(e) => setFootprint(e.target.value)}
                placeholder="筛选地点或日期，如 locbg / 1/18"
                style={filterInputStyle}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const isOpen = expanded.has(r.id);
            const shown = isOpen
              ? r.segments
              : r.segments.slice(0, VISIBLE_SEGMENTS);
            const hidden = r.segments.length - shown.length;

            return (
              <tr key={r.id}>
                <td style={tdStyle}>{r.name}</td>
                <td style={tdStyle}>{r.phone}</td>
                <td style={tdStyle}>{r.chat}</td>
                <td style={tdStyle}>{r.age ?? "-"}</td>
                <td style={tdStyle}>{r.status}</td>
                <td style={tdStyle}>{r.note}</td>
                <td style={tdStyle}>
                  {r.segments.length === 0 ? (
                    <span style={{ color: "#bbb" }}>-</span>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "4px 6px",
                        alignItems: "center",
                      }}
                    >
                      {shown.map((s, i) => (
                        <span
                          key={`${s.start}-${i}`}
                          title={s.inactive ? "已取消或已退款" : undefined}
                          style={{
                            padding: "1px 6px",
                            borderRadius: 3,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                            background: s.inactive ? "#f6f6f6" : "#eef4fa",
                            color: s.inactive ? "#aaa" : "#28527a",
                            textDecoration: s.inactive ? "line-through" : "none",
                          }}
                        >
                          {s.label}
                        </span>
                      ))}
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={() => toggle(r.id)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: "#666",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          +{hidden} 段
                        </button>
                      )}
                      {isOpen && (
                        <button
                          type="button"
                          onClick={() => toggle(r.id)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            color: "#666",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          收起
                        </button>
                      )}
                      <span style={{ color: "#aaa", fontSize: 12 }}>
                        共 {r.orderCount} 单
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {filtered.length === 0 && rows.length > 0 && (
        <p style={{ color: "#666", fontSize: 13 }}>没有符合筛选条件的 Customer</p>
      )}
    </>
  );
}
