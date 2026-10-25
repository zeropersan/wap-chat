# wap-chat

支持 **功能机 WAP 浏览器** + **现代响应式前端**的聊天室，部署在 Cloudflare Workers + D1，附件通过 WebDAV 存储。

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zeropersan/wap-chat)

点击按钮后，Cloudflare 会自动：
1. 克隆仓库到你的 GitHub 账户
2. 创建 D1 数据库并绑定
3. 运行迁移建表
4. 部署 Worker

部署过程中会要求填写以下 **Secret**（必填）：

| Secret 名称 | 说明 | 示例 |
|---|---|---|
| `CHAT_PASSWORD` | 聊天室访问密码 | `my-secret-123` |
| `WEBDAV_URL` | WebDAV 根地址，**末尾不带斜杠** | `https://dav.example.com/remote.php/dav/files/user` |
| `WEBDAV_USERNAME` | WebDAV 用户名 | `alice` |
| `WEBDAV_PASSWORD` | WebDAV 密码 | `dav-pass` |

> 如果暂时不用附件功能，WebDAV 三项可以随便填占位值；聊天和 WAP 功能不受影响。

## 访问入口

- **现代前端**：`https://<你的-worker>.workers.dev/` （默认滚动模式）
- **分页模式**：`https://<你的-worker>.workers.dev/?mode=paged`
- **功能机 WAP**：`https://<你的-worker>.workers.dev/wap`

## 部署后补设 Secret（如果一键部署时未填）

进入 **Worker → Settings → Variables and Secrets → Add → Secret**，逐个添加上述 4 个变量，然后 **Deploy** 一次。

## 自定义

- 分页大小：修改 `src/worker.js` 中的 `PAGE_SIZE`
- 附件大小上限：修改 `MAX_UPLOAD_BYTES`（默认 90MB，受 Cloudflare CDN 100MB 限制）
- WebDAV 存储目录：修改 `WEBDAV_BASE_DIR`（默认 `/chat-attachments`）
