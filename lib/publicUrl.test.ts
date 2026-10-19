import { describe, expect, it } from "vitest";
import { publicOrigin, publicUrl } from "./publicUrl";

const h = (o: Record<string, string>) => new Headers(o);

describe("publicOrigin", () => {
  it("Cloud Run 上：Host 是域名、前面那层说是 https", () => {
    expect(publicOrigin(h({ host: "beta.example.com", "x-forwarded-proto": "https" }))).toBe("https://beta.example.com");
  });
  it("本地直连没有 X-Forwarded-Proto：localhost 当 http", () => {
    expect(publicOrigin(h({ host: "localhost:3010" }))).toBe("http://localhost:3010");
    expect(publicOrigin(h({ host: "127.0.0.1:3011" }))).toBe("http://127.0.0.1:3011");
  });
  it("**不信 X-Forwarded-Host** —— 浏览器能随便填，信了就能把人跳到别的网站", () => {
    expect(publicOrigin(h({ host: "beta.example.com", "x-forwarded-host": "evil.example" }))).toBe("https://beta.example.com");
  });
  it("拼路径", () => {
    expect(publicUrl("/login/admin?next=%2Fadmin", h({ host: "beta.example.com" })).href).toBe(
      "https://beta.example.com/login/admin?next=%2Fadmin"
    );
  });
});
