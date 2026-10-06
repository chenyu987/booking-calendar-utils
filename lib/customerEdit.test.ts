import { describe, expect, it } from "vitest";

import { parseCustomerEdit } from "./customerEdit";

const TODAY = "2026-10-03";
const form = (fields: Record<string, string>) => (k: string) => fields[k] ?? null;
const ok = {
  first_name: " Kevin ",
  last_name: "",
  phone_number: " 123 ",
  chat: " kevin_w ",
  email: " Kevin@Example.com ",
  date_of_birth: "1998-01-28",
  status: "active",
  note: "",
};

describe("parseCustomerEdit：Customer 编辑的服务端校验", () => {
  it("正常的：去掉首尾空格，空的变 null，邮箱转小写", () => {
    expect(parseCustomerEdit(form(ok), TODAY)).toEqual({
      values: {
        first_name: "Kevin",
        last_name: null,
        phone_number: "123",
        chat: "kevin_w",
        email: "kevin@example.com",
        date_of_birth: "1998-01-28",
        status: "active",
        note: null,
      },
    });
  });

  it.each([
    [{ first_name: "  " }, "姓名必填"],
    [{ chat: "" }, "聊天必填"],
    [{ status: "deleted" }, "状态只能是"],
    [{ date_of_birth: "1998-02-30" }, "生日格式不对"],
    [{ date_of_birth: "2030-01-01" }, "生日不能晚于今天"],
    [{ email: "not-an-email" }, "邮箱格式不对"],
  ])("拦住：%o", (patch, msg) => {
    const r = parseCustomerEdit(form({ ...ok, ...patch }), TODAY);
    expect("error" in r && r.error).toContain(msg);
  });

  it("生日、邮箱、电话都可以留空", () => {
    const r = parseCustomerEdit(form({ ...ok, date_of_birth: "", email: "", phone_number: "" }), TODAY);
    expect(r).toMatchObject({ values: { date_of_birth: null, email: null, phone_number: null } });
  });
});
