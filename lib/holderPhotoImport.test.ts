import { describe, expect, it } from "vitest";
import { parseSheetDate, planImport, type ResourceForImport } from "./holderPhotoImport";

const resource = (id: string, name: string | null, dob: string | null, photo: string | null = null): ResourceForImport => ({
  id,
  holder_name: name,
  holder_date_of_birth: dob,
  holder_photo_path: photo,
});

describe("parseSheetDate", () => {
  it("表里的 月/日/年 转成 ISO，也认 ISO", () => {
    expect(parseSheetDate("7/7/1998")).toBe("1998-07-07");
    expect(parseSheetDate("12/24/1997")).toBe("1997-12-24");
    expect(parseSheetDate("1998-07-07")).toBe("1998-07-07");
  });
  it("填错的、空的不认", () => {
    expect(parseSheetDate("2/30/1998")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("加拿大被偷用")).toBeNull();
    expect(parseSheetDate(null)).toBeNull();
  });
});

describe("planImport", () => {
  it("名字 + 生日都对上才导；名字大小写、多余空格不算不同", () => {
    const plan = planImport(
      [{ row: 10, name: "  Karen   Wei ", dob: "7/7/1998", url: "u1" }],
      [resource("s1", "karen wei", "1998-07-07")],
    );
    expect(plan.toImport).toEqual([{ resourceId: "s1", name: "Karen   Wei", dob: "1998-07-07", row: 10, url: "u1" }]);
  });

  it("只对上名字或者只对上生日的，不算 —— 表里有同名的、也有同一天生的", () => {
    const plan = planImport(
      [
        { row: 1, name: "Sonia Hu", dob: "10/15/1996", url: "u1" },
        { row: 2, name: "Rory Chen", dob: "1/6/2000", url: "u2" },
      ],
      [resource("s1", "Sonia Hu", "1997-01-01"), resource("s2", "Somebody Else", "2000-01-06")],
    );
    expect(plan.toImport).toEqual([]);
    expect(plan.notInDb).toBe(2);
  });

  it("表里有、库里没有的行只计数跳过，不建资源、不列出来", () => {
    const plan = planImport(
      [
        { row: 1, name: "Not In Db", dob: "1/1/1990", url: "u1" },
        { row: 2, name: "In Db", dob: "1/1/1991", url: "u2" },
      ],
      [resource("s1", "In Db", "1991-01-01")],
    );
    expect(plan.notInDb).toBe(1);
    expect(plan.toImport.map((x) => x.resourceId)).toEqual(["s1"]);
    expect(plan.ambiguous).toEqual([]);
  });

  it("已经有照片的不覆盖，除非 overwrite", () => {
    const rows = [{ row: 1, name: "A", dob: "1/1/1990", url: "u" }];
    const s = [resource("s1", "A", "1990-01-01", "s1/1.jpg")];
    expect(planImport(rows, s).alreadyHave).toBe(1);
    expect(planImport(rows, s).toImport).toEqual([]);
    expect(planImport(rows, s, { overwrite: true }).toImport.length).toBe(1);
  });

  it("库里两个资源名字生日一模一样：分不出来，不猜", () => {
    const plan = planImport(
      [{ row: 1, name: "A", dob: "1/1/1990", url: "u" }],
      [resource("s1", "A", "1990-01-01"), resource("s2", "a", "1990-01-01")],
    );
    expect(plan.toImport).toEqual([]);
    expect(plan.ambiguous).toEqual([{ name: "A", dob: "1990-01-01", resourceIds: ["s1", "s2"] }]);
  });

  it("同一个人在表里出现好几行，只导一次，用第一行有图的", () => {
    const plan = planImport(
      [
        { row: 1, name: "A", dob: "1/1/1990", url: null },
        { row: 2, name: "A", dob: "1/1/1990", url: "first" },
        { row: 3, name: "A", dob: "1/1/1990", url: "second" },
      ],
      [resource("s1", "A", "1990-01-01")],
    );
    expect(plan.toImport.map((x) => x.url)).toEqual(["first"]);
  });

  it("算出库里还有几个资源表里找不到照片（导完要手动补的）", () => {
    const plan = planImport(
      [{ row: 1, name: "A", dob: "1/1/1990", url: "u" }],
      [resource("s1", "A", "1990-01-01"), resource("s2", "B", "1990-01-01"), resource("s3", "C", null), resource("s4", "D", "1990-01-01", "s4/1.jpg")],
    );
    expect(plan.dbWithoutPhoto).toBe(2);
  });
});
