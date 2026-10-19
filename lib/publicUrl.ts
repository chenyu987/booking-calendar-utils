// 拼「用户在浏览器里看到的那个地址」：跳转、邮件里的回跳链接都用它。
//
// **别用 `new URL(path, req.url)`。** 部署成 standalone（Cloud Run）之后，`req.url` 的主机名
// 是 Next 自己的（localhost / 0.0.0.0:8080），不是用户访问的域名 —— 2026-10-19 实测，
// 带着 `Host: beta.example.com` 去访问，跳转出来的是 `https://localhost:3011/...`。
//
// 主机名取 `Host` 头，**不取 `X-Forwarded-Host`**：后者浏览器能随便填，而 Host 在 Cloud Run 上
// 一定是我们的域名（不是的话请求根本到不了这儿）。协议取 Cloud Run 前面那层给的
// `X-Forwarded-Proto`，本地直连没有这个头，localhost / 127.0.0.1 当 http，别的当 https。
//
// 纯函数，middleware（edge）和 Route Handler 都能用。

type HeaderGetter = { get(name: string): string | null };

export function publicOrigin(headers: HeaderGetter): string {
  const host = headers.get("host") ?? "localhost";
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return `${proto}://${host}`;
}

export function publicUrl(path: string, headers: HeaderGetter): URL {
  return new URL(path, publicOrigin(headers));
}
