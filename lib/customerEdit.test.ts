import { describe, expect, it } from "vitest";

import { parseCustomerEdit, customerRowAfterEdit } from "./customerEdit";

const TODAY = "2026-10-03";
const form = (fields: Record<string, string>) => (k: string) => fields[k] ?? null;
const ok = {
  chat_name: " 凯文 ",
  chat_id: " kevin_w ",
  phone_number: " 123 ",
  email: " Kevin@Example.com ",
  date_of_birth: "1998-01-28",
  status: "active",
  note: "",
};

describe("parseCustomerEdit：Customer 编辑的服务端校验", () => {
  it("正常的：去掉首尾空格，空的变 null，邮箱转小写", () => {
    expect(parseCustomerEdit(form(ok), TODAY)).toEqual({
      values: {
        chat_name: "凯文",
        chat_id: "kevin_w",
        phone_number: "123",
        email: "kevin@example.com",
        date_of_birth: "1998-01-28",
        status: "active",
        note: null,
      },
    });
  });

  it.each([
    [{ chat_name: "  " }, "昵称必填"],
    [{ status: "deleted" }, "状态只能是"],
    [{ date_of_birth: "1998-02-30" }, "生日格式不对"],
    [{ date_of_birth: "2030-01-01" }, "生日不能晚于今天"],
    [{ email: "not-an-email" }, "邮箱格式不对"],
  ])("拦住：%o", (patch, msg) => {
    const r = parseCustomerEdit(form({ ...ok, ...patch }), TODAY);
    expect("error" in r && r.error).toContain(msg);
  });

  it("账号可以留空，想加再加", () => {
    const r = parseCustomerEdit(form({ ...ok, chat_id: "" }), TODAY);
    expect(r).toMatchObject({ values: { chat_name: "凯文", chat_id: null } });
  });

  it("**不碰 first_name / last_name**：那两列清空了留着备用（0022），后台编辑不往里写", () => {
    const r = parseCustomerEdit(form({ ...ok, first_name: "Kevin", last_name: "W" }), TODAY);
    expect("values" in r && Object.keys(r.values)).not.toContain("first_name");
    expect("values" in r && Object.keys(r.values)).not.toContain("last_name");
  });

  it("生日、邮箱、电话都可以留空", () => {
    const r = parseCustomerEdit(form({ ...ok, date_of_birth: "", email: "", phone_number: "" }), TODAY);
    expect(r).toMatchObject({ values: { date_of_birth: null, email: null, phone_number: null } });
  });
});

describe("customerRowAfterEdit：点保存那一下先画成什么样", () => {
  it("显示的列跟着新值走，空的选填项显示成空串（跟服务端给的同一个形状）", () => {
    const row = customerRowAfterEdit(
      { chat_name: "凯文", chat_id: null, phone_number: null, email: null, date_of_birth: null, status: "blacklisted", note: null },
      ["admin-1"]
    );
    expect(row).toMatchObject({ name: "凯文", chatId: "", age: null, status: "blacklisted", note: "", contactIds: ["admin-1"] });
    expect(row.edit).toEqual({
      chat_name: "凯文", chat_id: "", phone_number: "", email: "", date_of_birth: "", status: "blacklisted", note: "",
    });
  });

  it("年龄从生日现算，不是留着改之前的", () => {
    const row = customerRowAfterEdit(
      { chat_name: "a", chat_id: null, phone_number: null, email: null, date_of_birth: "2000-01-01", status: "active", note: null },
      []
    );
    expect(row.age).toBeGreaterThanOrEqual(26);
  });
});
