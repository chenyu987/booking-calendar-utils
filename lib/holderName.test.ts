import { describe, it, expect } from "vitest";
import { shortHolderNames } from "./holderName";

const map = (...names: string[]) => shortHolderNames(names);

describe("shortHolderNames", () => {
  it("不撞名就只显示 first name", () => {
    const m = map("jordan doe", "sara lee", "david chang");
    expect(m.get("jordan doe")).toBe("jordan");
    expect(m.get("sara lee")).toBe("sara");
    expect(m.get("david chang")).toBe("david");
  });

  it("单名照原样", () => {
    expect(map("oshn", "zolan").get("oshn")).toBe("oshn");
  });

  it("撞名了补一个大写的姓氏首字母，中间不留空格", () => {
    const m = map("admin1 chen", "admin1 Yoon");
    expect(m.get("admin1 chen")).toBe("admin1C");
    expect(m.get("admin1 Yoon")).toBe("admin1Y");
  });

  it("首字母也一样，就再多补一个，直到分得开", () => {
    const m = map("simon kwon", "simon kim");
    expect(m.get("simon kwon")).toBe("simonKw");
    expect(m.get("simon kim")).toBe("simonKi");
  });

  it("一直补到真正分岔的那一位", () => {
    const m = map("amy anderson", "amy andersen");
    expect(m.get("amy anderson")).toBe("amyAnderso");
    expect(m.get("amy andersen")).toBe("amyAnderse");
  });

  it("大小写不同也算撞名 —— 库里的名字大小写很随意", () => {
    const m = map("Simon Kwon", "simon lee");
    expect(m.get("Simon Kwon")).toBe("SimonK");
    expect(m.get("simon lee")).toBe("simonL");
  });

  it("撞名但其中一个没有姓，也分得开", () => {
    const m = map("oshn", "oshn wang");
    expect(m.get("oshn")).toBe("oshn");
    expect(m.get("oshn wang")).toBe("oshnW");
  });

  it("补满姓氏还分不开就显示原样 —— 没有别的信息可用了", () => {
    const m = map("lee wang", "lee wang ");
    expect(m.get("lee wang")).toBe("lee wang");
    expect(m.get("lee wang ")).toBe("lee wang");
  });

  it("撞名只影响撞的那一组，别人照样只显示 first name", () => {
    const m = map("admin1 chen", "admin1 Yoon", "david chang");
    expect(m.get("david chang")).toBe("david");
  });

  it("同一个全名出现多次只算一个人", () => {
    expect(map("jordan doe", "jordan doe").get("jordan doe")).toBe("jordan");
  });

  it("多余空格和空字符串不会炸", () => {
    const m = map("  jordan   doe  ", "");
    expect(m.get("  jordan   doe  ")).toBe("jordan");
    expect(m.get("")).toBe("");
  });

  it("复姓 / 三段名：中间名和姓连起来当姓用", () => {
    const m = map("mary jo smith", "mary kate olsen");
    expect(m.get("mary jo smith")).toBe("maryJ");
    expect(m.get("mary kate olsen")).toBe("maryK");
  });
});
