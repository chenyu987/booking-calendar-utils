import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 浏览器的日期框不挂 max，年份格能敲 6 位（「200474年」）。挂了 max 才只收 4 位。
// 日期框散在十几个页面里，靠记性迟早漏一个 —— 这里把 app/ 下所有 <input type="date"> 扫一遍
const ROOT = join(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

// 从 type="date" 往前找到 <input，往后找到 />，中间就是这个框的全部属性
function dateInputsWithoutMax(source: string): number[] {
  const lines: number[] = [];
  let at = source.indexOf('type="date"');
  while (at !== -1) {
    const start = source.lastIndexOf("<input", at);
    const end = source.indexOf("/>", at);
    if (!/\bmax=/.test(source.slice(start, end))) {
      lines.push(source.slice(0, at).split("\n").length);
    }
    at = source.indexOf('type="date"', at + 1);
  }
  return lines;
}

describe("日期框都挂了 max", () => {
  it("app/ 下每个 <input type=\"date\"> 都有 max（年份才只能敲 4 位）", () => {
    const missing = tsxFiles(join(ROOT, "app")).flatMap((file) =>
      dateInputsWithoutMax(readFileSync(file, "utf8")).map(
        (line) => `${relative(ROOT, file)}:${line}`,
      ),
    );
    expect(missing).toEqual([]);
  });

  it("扫描本身认得出漏挂的", () => {
    expect(dateInputsWithoutMax('<input type="date" name="a" />')).toEqual([1]);
    expect(dateInputsWithoutMax('<input type="date" max={DATE_INPUT_MAX} />')).toEqual([]);
  });
});
