# Shiro

> **重要声明：** 由于个人精力有限，开源版本的 Shiro 后续将不再积极维护，仅会在发现重要安全漏洞时进行修复。我将把主要精力投入到赞助版 [白い](https://github.com/innei-dev/Shiroi) 的维护和功能迭代中。开源版本依然可以正常使用，感谢大家的理解和支持。

一个极简主义的个人网站主题，如纸的纯净，似雪的清新。

专为 [Mix Space](https://github.com/mx-space) 生态系统设计的现代化个人站点前端。

## 后端兼容性

此分支已适配 **Mix Space Core v14.15.2 / API v3**（2026-10-09 按官方迁移指南补齐，见[迁移对照](docs/core-migration.md)）。适配参考 [Cyber](https://github.com/At87668/Cyber/tree/1073379) 的集中响应转换及 Better Auth 会话方案，并补充 Core 14 的原生 WebSocket 协议。保留 Shiro 页面与 Markdown 编辑器，不需要迁移主题配置。

```dotenv
NEXT_PUBLIC_API_URL=https://你的后端域名/api/v3
NEXT_PUBLIC_GATEWAY_URL=https://你的后端域名
```

- 运行和构建需要 Node.js 22.12+、pnpm 10.12.4；原有以 `/api/v2` 结尾的前端配置会转换为 `/api/v3`。
- 后端的 `server_url` 也应更新为 `/api/v3`。反向代理需转发 `/ws/web` 的 WebSocket Upgrade，并允许前端来源的带凭据请求；启用响应缓存时需正确处理 `Origin` / `Vary: Origin`。本地开发需额外允许 `http://localhost:2323`。
- 浏览、分页、分类/页面导航、搜索、评论/回复、订阅、站长登录和实时事件继续使用现有界面。搜索改用 Core 内置搜索；索引由 Core 控制台管理。
- 新版评论的审核状态和隐藏回复分页已接入。富文本（Lexical）内容可读取其后端提供的 Markdown 文本；请在 Core 控制台编辑，轻管理会阻止用旧编辑器覆盖富文本。
- 请求层保留 `@mx-space/api-client@1.17.0` 的页面类型及调用方式，别名依赖 `@mx-space/api-client-v3@5.13.0` 提供官方响应兼容转换；新的修订发布流程直接使用 v5 的 v3 响应。

GitHub 登录成功和新用户登录会返回发起登录的页面；失败会返回前端 `/auth/error`，可重新授权。GitHub OAuth App 的回调地址应为 `https://你的后端域名/api/v3/auth/callback/github`。若仍返回 `invalid_code`，请检查 Core 日志中的 `GitHub OAuth token exchange failed`：该错误发生在后端兑换授权码时，前端错误页只能处理返回与重试，不能替代后端错误诊断。若日志为 `State mismatch: verification not found`，则失败发生在读取服务端授权状态时，尚未检查 Cookie 或兑换授权码。有效回调会立即消费该状态，失败后应重新发起登录。CDN 应对 `/api/v3/auth/*` 禁用缓存，对 callback 禁用自动重试，并透传原始 3xx、`Location` 和 `Set-Cookie`；不能在代理内部跟随回调重定向。排查时不要公开授权码、state 或密钥。

验证适配：`pnpm test:core`、`pnpm exec tsc --noEmit`、`pnpm build:ci`。实际账号登录、评论发布及后台写入需在部署后验证；自动化验证不会向生产站点发布内容。

## :sparkles: 示例站点

以下是一些使用 Shiro 主题的精美站点：

- [静かな森](https://innei.in)
- [可愛い松](https://blog.wibus.ren/)
- [启动台の博客](https://www.launchpadx.top/)

欢迎体验 Shiro 带来的极简之美！

## :rocket: 核心特性

- **:zap: 极致性能**：在 LightHouse 测试中表现卓越，Performance 和 Best Practice 均超过 90%
- **:art: 现代设计**：简洁而不简单的用户界面，提供流畅优雅的用户体验
- **:gem: 细节至上**：采用符合物理学的 Spring 弹性动画，每一帧都如自然般舒适
- **:bell: 实时通知**：通过 WebSocket 连接，访客可实时接收最新文章推送
- **:computer: 活动状态**：结合 [ProcessReporter](https://github.com/Innei/ProcessReporter)，在主页展示实时活动状态
- **:pencil: 扩展语法**：支持丰富的 Markdown 扩展语法，满足多样化写作需求
- **:wrench: 轻量管理**：内置轻量级管理面板，便于内容管理

## :gear: 技术架构

基于现代化的前端技术栈构建：

- **NextJS** (App Router) - React 全栈框架
- **Jotai** - 原子化状态管理
- **Framer Motion** - 流畅动画库
- **Radix UI** - 无障碍组件库
- **Socket.IO** - 实时通信
- **TailwindCSS** - 原子化 CSS 框架

## 📖 部署指南

详细的部署教程请参考：https://mx-space.js.org/docs/themes/shiro/deploy

感谢 @wibus-wee、@wuhang2003 等社区贡献者编写的详细文档。

## :camera: 界面预览

<img width="1471" alt="Live Demo" src="https://github.com/Innei/Shiro/assets/41265413/bf8af4ec-0f0c-441a-8c06-4b44e1649597">

**轻量级管理面板：**

![管理面板 1](https://github.com/Innei/Shiro/assets/41265413/4bb5b34a-3ce2-45da-bec7-4596ac87f849)
![管理面板 2](https://github.com/Innei/Shiro/assets/41265413/592941d0-2ebe-4d64-bd77-3171829bd896)

<details>
<summary>
点击查看更多完整页面截图
</summary>

![页面截图 1](https://github.com/Innei/Shiro/assets/41265413/1b85c9be-0cd3-46b5-a089-a9ab97fdfecb)
![页面截图 2](https://github.com/Innei/Shiro/assets/41265413/d808d288-c022-42f2-8d74-ad057a588771)

</details>

## :zap: 性能测试

在 M2 MacBook Air 环境下对重负载页面的性能测试结果：

![性能测试结果](https://github.com/Innei/Shiro/assets/41265413/f76152af-4a52-46a2-9b83-20567800ba75)

## :whale: 快速开始

### :package: 预构建版本

从 [Releases](https://github.com/Innei/Shiro/releases) 页面下载最新的 `release.zip` 压缩包并解压：

```bash
cd standalone
vim .env # 配置环境变量
export PORT=2323
node server.js
```

### :docker: Docker Compose（推荐）

```bash
mkdir shiro && cd shiro
wget https://raw.githubusercontent.com/Innei/Shiro/main/docker-compose.yml
wget https://raw.githubusercontent.com/Innei/Shiro/main/.env.template .env

vim .env # 配置环境变量
mkdir public # 放置自定义 Favicon
docker compose up -d

# 后续更新
docker compose pull
```

## :memo: Markdown 扩展

了解更多 Markdown 扩展语法，请访问：https://shiro.innei.in/#/markdown

## :heart: 致谢与许可

**© 2024 Innei** - 本项目采用 AGPLv3 许可证，并附加特定的商业使用条件。

使用本项目需要遵循 [附加条款和条件](ADDITIONAL_TERMS.md)。

**特别鸣谢：**
- 部分代码参考了 GPT-4 和 [cali.so](https://github.com/CaliCastle/cali.so)
- 感谢 Mix Space Team 和社区贡献者们的持续支持

**赞助版本：** [白い (Shiroi)](https://github.com/innei-dev/Shiroi) - 获得更多功能和持续更新

---

> [个人网站](https://innei.in/) · GitHub [@Innei](https://github.com/innei/)
