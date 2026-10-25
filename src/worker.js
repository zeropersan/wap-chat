// ============================================================
// WAP + 现代前端聊天室 (Cloudflare Worker + D1 + WebDAV 附件)
// 表单登录 / 分页 & 滚动 / 用户名记忆 / 上海时区 / 附件上传下载
// ============================================================

const PAGE_SIZE = 10;
const COOKIE_NAME = "chat_auth";
const USERNAME_COOKIE = "chat_username";
const WEBDAV_BASE_DIR = "/chat-attachments";
const MAX_UPLOAD_BYTES = 90 * 1024 * 1024; // 90MB 安全上限，避免 CF 100MB 413

// ------------------------------------------------------------
// 共用样式（GitHub 极简黑白）
// ------------------------------------------------------------
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif; background: #ffffff; color: #1f2328; font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  a { color: #1f2328; text-decoration: none; }
  a:hover { text-decoration: underline; }
  input, textarea { font: inherit; color: #1f2328; background: #ffffff; border: 1px solid #d0d7de; border-radius: 6px; padding: 8px 12px; }
  input:focus, textarea:focus { outline: none; border-color: #1f2328; box-shadow: 0 0 0 3px rgba(31, 35, 40, 0.08); }
  button { font: inherit; cursor: pointer; padding: 8px 16px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; color: #1f2328; }
  button:hover { background: #eaeef2; }
  button.primary { background: #1f2328; border-color: #1f2328; color: #ffffff; }
  button.primary:hover { background: #000000; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #d0d7de; background: #ffffff; flex: none; }
  .brand { font-weight: 600; font-size: 15px; }
  .topnav { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #656d76; }
  .topnav a { color: #1f2328; }
  .topnav a.active { font-weight: 600; }
  .sep { color: #d0d7de; }
  .msg { padding: 12px 0; border-bottom: 1px solid #d0d7de; }
  .msg:last-child { border-bottom: none; }
  .msg-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .msg-user { font-weight: 600; }
  .msg-time { color: #656d76; font-size: 12px; flex: none; }
  .msg-content { white-space: pre-wrap; word-break: break-word; }
  .attach-link { display: inline-block; margin-top: 4px; color: #0969da; font-size: 13px; }
  .attach-link:hover { text-decoration: underline; }
  .empty { color: #656d76; text-align: center; padding: 40px 0; }
`;

const LOGIN_CSS = `
  .login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
  .login-box { width: 100%; max-width: 360px; border: 1px solid #d0d7de; border-radius: 6px; padding: 32px 24px; }
  .login-box h1 { font-size: 20px; font-weight: 600; margin-bottom: 24px; text-align: center; }
  .login-box label { display: block; font-size: 13px; color: #656d76; margin-bottom: 6px; }
  .login-box input { width: 100%; margin-bottom: 16px; }
  .login-box button { width: 100%; }
  .error { color: #cf222e; font-size: 13px; text-align: center; margin-bottom: 16px; }
  .login-footer { text-align: center; margin-top: 16px; font-size: 13px; color: #656d76; }
`;

const PAGED_CSS = `
  .page { max-width: 760px; margin: 0 auto; padding: 0 16px 40px; }
  .page-content { padding-top: 16px; }
  .messages-box { border: 1px solid #d0d7de; border-radius: 6px; padding: 0 16px; margin-bottom: 16px; }
  .pagination { display: flex; justify-content: center; align-items: center; gap: 12px; margin-bottom: 16px; }
  .btn { display: inline-block; padding: 6px 14px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; font-size: 13px; color: #1f2328; }
  .btn:hover { background: #eaeef2; text-decoration: none; }
  .btn.disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
  .page-info { font-size: 13px; color: #656d76; }
  .composer-inline { display: grid; grid-template-columns: 120px 1fr auto; gap: 8px; align-items: start; border: 1px solid #d0d7de; border-radius: 6px; padding: 12px; }
  .composer-inline textarea { resize: vertical; min-height: 38px; }
  .file-input { font-size: 12px; padding: 6px; }
  .attach-preview { font-size: 12px; color: #656d76; margin-top: 4px; }
`;

const SCROLL_CSS = `
  .app { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
  .messages { flex: 1; overflow-y: auto; padding: 0 16px; }
  .message-list { max-width: 760px; margin: 0 auto; }
  .load-more-wrap { max-width: 760px; margin: 0 auto; text-align: center; padding: 12px 0; }
  .load-more-wrap[hidden] { display: none; }
  .composer { flex: none; border-top: 1px solid #d0d7de; padding: 12px 16px; background: #ffffff; }
  .composer-inner { max-width: 760px; margin: 0 auto; display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
  .composer input[name="username"] { width: 120px; flex: none; }
  .composer textarea { flex: 1; resize: none; min-height: 38px; max-height: 120px; overflow-y: auto; }
  .composer button { flex: none; }
  .file-row { width: 100%; display: flex; align-items: center; gap: 8px; font-size: 12px; color: #656d76; }
  .file-input { font-size: 12px; padding: 4px; }
  .attach-preview { font-size: 12px; color: #0969da; }
`;

// ------------------------------------------------------------
// 滚动模式前端脚本
// ------------------------------------------------------------
const SCROLL_JS = `
(function () {
  var messagesEl = document.getElementById('messages');
  var messageList = document.getElementById('messageList');
  var loadMoreWrap = document.getElementById('loadMoreWrap');
  var loadMoreBtn = document.getElementById('loadMoreBtn');
  var composer = document.getElementById('composer');
  var contentInput = composer.querySelector('textarea');
  var fileInput = composer.querySelector('input[type="file"]');
  var attachPreview = composer.querySelector('.attach-preview');
  var submitBtn = composer.querySelector('button[type="submit"]');

  var state = {
    oldestId: INIT.oldestId,
    newestId: INIT.newestId,
    hasMore: INIT.hasMore,
    loadingMore: false,
    uploading: false
  };

  function isNearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderAttachLink(m) {
    if (!m.attachment_name || !m.attachment_path) return null;
    var a = document.createElement('a');
    a.className = 'attach-link';
    a.href = '/api/attachment/view?id=' + encodeURIComponent(m.id);
    a.target = '_blank';
    a.rel = 'noopener';
    var isImage = (m.attachment_mime || '').indexOf('image/') === 0;
    a.textContent = (isImage ? '查看图片' : '下载附件') + ': ' + m.attachment_name;
    return a;
  }

  function createMessageEl(m) {
    var div = document.createElement('div');
    div.className = 'msg';
    div.setAttribute('data-id', m.id);
    var head = document.createElement('div');
    head.className = 'msg-head';
    var user = document.createElement('span');
    user.className = 'msg-user';
    user.textContent = m.username;
    var time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = m.created_at;
    head.appendChild(user);
    head.appendChild(time);
    var content = document.createElement('div');
    content.className = 'msg-content';
    content.textContent = m.content;
    div.appendChild(head);
    div.appendChild(content);
    var link = renderAttachLink(m);
    if (link) div.appendChild(link);
    return div;
  }

  function removeEmpty() {
    var empty = messageList.querySelector('.empty');
    if (empty) empty.parentNode.removeChild(empty);
  }

  function appendMessage(m) {
    removeEmpty();
    messageList.appendChild(createMessageEl(m));
  }

  function prependMessage(m) {
    removeEmpty();
    messageList.insertBefore(createMessageEl(m), messageList.firstChild);
  }

  function updateHasMore(hasMore) {
    state.hasMore = hasMore;
    loadMoreWrap.hidden = !hasMore;
  }

  loadMoreBtn.addEventListener('click', function () {
    if (state.loadingMore) return;
    state.loadingMore = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = '加载中...';
    fetch('/api/messages?before=' + state.oldestId)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.messages.length) {
          var prevHeight = messagesEl.scrollHeight;
          var prevTop = messagesEl.scrollTop;
          for (var i = data.messages.length - 1; i >= 0; i--) {
            prependMessage(data.messages[i]);
          }
          state.oldestId = data.messages[0].id;
          messagesEl.scrollTop = messagesEl.scrollHeight - prevHeight + prevTop;
          updateHasMore(data.hasMore);
        } else if (data) {
          updateHasMore(false);
        }
      })
      .catch(function () {})
      .then(function () {
        state.loadingMore = false;
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = '拉取更多消息';
      });
  });

  function poll() {
    fetch('/api/messages?after=' + state.newestId)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.messages.length) {
          var atBottom = isNearBottom();
          data.messages.forEach(appendMessage);
          state.newestId = data.messages[data.messages.length - 1].id;
          if (atBottom) scrollToBottom();
        }
      })
      .catch(function () {})
      .then(function () { setTimeout(poll, 5000); });
  }

  function uploadFile() {
    return new Promise(function (resolve, reject) {
      var file = fileInput.files[0];
      if (!file) { resolve(null); return; }
      if (file.size > 90 * 1024 * 1024) {
        alert('文件超过 90MB，无法上传');
        reject(new Error('too large'));
        return;
      }
      var fd = new FormData();
      fd.append('file', file);
      fetch('/api/upload', { method: 'POST', body: fd })
        .then(function (res) {
          if (!res.ok) throw new Error('upload failed');
          return res.json();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  composer.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.uploading) return;
    var form = new FormData(composer);
    var username = (form.get('username') || '').toString().trim();
    var content = (form.get('content') || '').toString().trim();
    if (!username || !content) return;

    state.uploading = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '发送中...';

    uploadFile()
      .then(function (att) {
        if (att) {
          form.set('attachment_path', att.path);
          form.set('attachment_name', att.name);
          form.set('attachment_mime', att.mime);
          form.set('attachment_size', String(att.size));
        }
        return fetch('/api/send', { method: 'POST', body: form });
      })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.message && data.message.id > state.newestId) {
          appendMessage(data.message);
          state.newestId = data.message.id;
          scrollToBottom();
        }
        contentInput.value = '';
        if (fileInput) fileInput.value = '';
        if (attachPreview) attachPreview.textContent = '';
        contentInput.focus();
      })
      .catch(function () {})
      .then(function () {
        state.uploading = false;
        submitBtn.disabled = false;
        submitBtn.textContent = '发送';
      });
  });

  if (fileInput && attachPreview) {
    fileInput.addEventListener('change', function () {
      attachPreview.textContent = fileInput.files[0] ? '已选择: ' + fileInput.files[0].name : '';
    });
  }

  scrollToBottom();
  setTimeout(poll, 5000);
})();
`;

// ============================================================
// 主入口
// ============================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const expectedHash = await sha256(env.CHAT_PASSWORD);
    const isLoggedIn = getCookie(request, COOKIE_NAME) === expectedHash;

    // 登录
    if (path === "/login" && request.method === "POST") {
      const form = await request.formData();
      const pwd = (form.get("password") || "").toString();
      const username = (form.get("username") || "").toString().trim().slice(0, 16);
      const fromWap = form.get("wap") === "1";
      const redirectTo = fromWap ? "/wap" : "/?mode=scroll";

      if (pwd === env.CHAT_PASSWORD) {
        const headers = new Headers();
        headers.set("Location", redirectTo);
        headers.append("Set-Cookie", `${COOKIE_NAME}=${expectedHash}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
        if (username) {
          headers.append("Set-Cookie", `${USERNAME_COOKIE}=${encodeURIComponent(username)}; Path=/; Max-Age=31536000; SameSite=Lax`);
        }
        return new Response(null, { status: 302, headers });
      }
      return fromWap ? wapLoginPage("密码错误，请重试", username) : htmlLoginPage("密码错误，请重试", username);
    }

    if (path === "/logout") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/", "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0` },
      });
    }

    if (!isLoggedIn) {
      const savedUsername = getCookie(request, USERNAME_COOKIE);
      if (path === "/wap") return wapLoginPage("", savedUsername);
      return htmlLoginPage("", savedUsername);
    }

    // ---------- 附件上传（仅现代前端） ----------
    if (path === "/api/upload" && request.method === "POST") {
      return handleUpload(request, env);
    }

    // ---------- 附件查看 / 下载（两端共用，WAP 使用下载） ----------
    if (path === "/api/attachment/view" && request.method === "GET") {
      return handleAttachmentProxy(request, url, env, false);
    }
    if (path === "/api/attachment/download" && request.method === "GET") {
      return handleAttachmentProxy(request, url, env, true);
    }

    // 表单发送（分页 / WAP）
    if (path === "/send" && request.method === "POST") {
      const form = await request.formData();
      const username = (form.get("username") || "").toString().trim().slice(0, 16);
      const content = (form.get("content") || "").toString().trim().slice(0, 200);
      const fromWap = form.get("wap") === "1";
      const mode = form.get("mode") === "paged" ? "paged" : "scroll";
      const page = form.get("page") || "1";

      let redirect;
      if (fromWap) redirect = "/wap";
      else if (mode === "paged") redirect = `/?mode=paged&page=${page}`;
      else redirect = "/?mode=scroll";

      const headers = { Location: url.origin + redirect };

      if (username && content) {
        await env.DB.prepare(
          `INSERT INTO messages (username, content, attachment_path, attachment_name, attachment_mime, attachment_size)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          username, content,
          strOrNull(form.get("attachment_path")),
          strOrNull(form.get("attachment_name")),
          strOrNull(form.get("attachment_mime")),
          intOrNull(form.get("attachment_size"))
        ).run();
        headers["Set-Cookie"] = `${USERNAME_COOKIE}=${encodeURIComponent(username)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      }

      return new Response(null, { status: 302, headers });
    }

    // API 发送（滚动模式）
    if (path === "/api/send" && request.method === "POST") {
      return handleApiSend(request, env);
    }

    // API 获取消息
    if (path === "/api/messages" && request.method === "GET") {
      return handleApiMessages(url, env);
    }

    // 首页
    if (path === "/") {
      const mode = url.searchParams.get("mode") === "paged" ? "paged" : "scroll";
      if (mode === "paged") return handlePagedPage(request, url, env);
      return handleScrollPage(request, url, env);
    }

    if (path === "/wap") {
      return handleWap(request, url, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ============================================================
// 工具函数
// ============================================================
async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp("(?:^|;\\s*)" + safeName + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : "";
}

function strOrNull(v) {
  const s = (v || "").toString().trim();
  return s || null;
}

function intOrNull(v) {
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function wmlResponse(cardXml) {
  const WML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE wml PUBLIC "-//WAPFORUM//DTD WML 1.1//EN" "http://www.wapforum.org/DTD/wml_1.1.xml">
<wml>
`;
  return new Response(WML_HEADER + cardXml + `</wml>`, {
    headers: { "Content-Type": "text/vnd.wap.wml", "Cache-Control": "no-store, must-revalidate" },
  });
}

function escapeWml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\$/g, "$$");
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function renderTopbar(active) {
  const link = (mode, label) =>
    mode === active
      ? `<a class="active" href="/?mode=${mode}">${label}</a>`
      : `<a href="/?mode=${mode}">${label}</a>`;
  return `
  <header class="topbar">
    <div class="brand">聊天室</div>
    <nav class="topnav">
      ${link("scroll", "滚动")}<span class="sep">/</span>
      ${link("paged", "分页")}<span class="sep">/</span>
      <a href="/wap">WAP</a><span class="sep">/</span>
      <a href="/logout">退出</a>
    </nav>
  </header>`;
}

function renderAttachHtml(m) {
  if (!m.attachment_name || !m.attachment_path) return "";
  const isImage = (m.attachment_mime || "").indexOf("image/") === 0;
  const endpoint = isImage ? "/api/attachment/view" : "/api/attachment/download";
  const label = isImage ? "查看图片" : "下载附件";
  return `<a class="attach-link" href="${endpoint}?id=${m.id}" target="_blank" rel="noopener">${label}: ${escapeHtml(m.attachment_name)}</a>`;
}

function renderMessage(m) {
  return `<div class="msg" data-id="${m.id}">
    <div class="msg-head">
      <span class="msg-user">${escapeHtml(m.username)}</span>
      <span class="msg-time">${escapeHtml(m.created_at)}</span>
    </div>
    <div class="msg-content">${escapeHtml(m.content)}</div>
    ${renderAttachHtml(m)}
  </div>`;
}

// ============================================================
// WAP 登录页
// ============================================================
function wapLoginPage(errorMsg, savedUsername = "") {
  const card = `
<card id="login" title="登录">
  <p>${errorMsg ? `<b>${errorMsg}</b><br/>` : ""}请输入名字和聊天室密码：</p>
  <p>
    名字: <input name="username" maxlength="16" value="${escapeWml(savedUsername)}"/>
    <br/>
    密码: <input name="password" type="password" maxlength="64"/>
    <br/>
    <anchor>登录
      <go method="post" href="/login">
        <postfield name="username" value="$(username)"/>
        <postfield name="password" value="$(password)"/>
        <postfield name="wap" value="1"/>
      </go>
    </anchor>
  </p>
</card>`;
  return wmlResponse(card);
}

// ============================================================
// HTML 登录页
// ============================================================
function htmlLoginPage(errorMsg, savedUsername = "") {
  const focusUsername = savedUsername ? "" : "autofocus";
  const focusPassword = savedUsername ? "autofocus" : "";
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录 - 聊天室</title>
  <style>${BASE_CSS}${LOGIN_CSS}</style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-box">
      <h1>聊天室登录</h1>
      ${errorMsg ? `<div class="error">${escapeHtml(errorMsg)}</div>` : ""}
      <form method="POST" action="/login">
        <label for="username">你的名字（可留空）</label>
        <input id="username" name="username" maxlength="16" placeholder="留空则显示为访客" value="${escapeHtml(savedUsername)}" ${focusUsername}>
        <label for="password">聊天室密码</label>
        <input id="password" name="password" type="password" maxlength="64" placeholder="请输入密码" required ${focusPassword}>
        <button type="submit" class="primary">登录</button>
      </form>
      <div class="login-footer"><a href="/wap">切换到 WAP 版本</a></div>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ============================================================
// WAP 主页面（功能不变，附件仅显示下载链接）
// ============================================================
async function handleWap(request, url, env) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  const savedUsername = getCookie(request, USERNAME_COOKIE) || "访客";

  const { results } = await env.DB.prepare(
    `SELECT id, username, content, attachment_name, attachment_mime
     FROM messages ORDER BY id DESC LIMIT ? OFFSET ?`
  ).bind(PAGE_SIZE, offset).all();

  const lines = results
    .reverse()
    .map((m) => {
      let line = `<b>${escapeWml(m.username)}:</b> ${escapeWml(m.content)}`;
      if (m.attachment_name) {
        line += `<br/><a href="/api/attachment/download?id=${m.id}">下载附件: ${escapeWml(m.attachment_name)}</a>`;
      }
      return line + `<br/>`;
    })
    .join("");

  let nav = "";
  if (page > 1) nav += `<a href="/wap?page=${page - 1}">上一页</a> `;
  nav += `第 ${page} 页 `;
  if (results.length === PAGE_SIZE) nav += `<a href="/wap?page=${page + 1}">下一页</a>`;

  const card = `
<card id="chat" title="WAP Chat">
  <p>${lines || "还没有消息。"}<br/><a href="/wap?page=${page}">手动刷新</a> | <a href="/logout">退出</a></p>
  <p>${nav}</p>
  <p>
    名字: <input name="username" maxlength="16" value="${escapeWml(savedUsername)}"/><br/>
    消息: <input name="content" maxlength="200"/><br/>
    <anchor>发送
      <go method="post" href="/send">
        <postfield name="username" value="$(username)"/>
        <postfield name="content" value="$(content)"/>
        <postfield name="wap" value="1"/>
      </go>
    </anchor>
  </p>
</card>`;
  return wmlResponse(card);
}

// ============================================================
// 分页模式（逻辑不变，增加附件链接）
// ============================================================
async function handlePagedPage(request, url, env) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;
  const savedUsername = getCookie(request, USERNAME_COOKIE);

  const { results } = await env.DB.prepare(
    `SELECT id, username, content, attachment_path, attachment_name, attachment_mime,
            strftime('%Y-%m-%d %H:%M', created_at, '+8 hours') AS created_at
     FROM messages ORDER BY id DESC LIMIT ? OFFSET ?`
  ).bind(PAGE_SIZE, offset).all();

  const ordered = results.slice().reverse();
  const messagesHtml = ordered.map(renderMessage).join("");
  const hasNext = results.length === PAGE_SIZE;

  const pagination = `
    <div class="pagination">
      ${page > 1 ? `<a class="btn" href="/?mode=paged&page=${page - 1}">上一页</a>` : `<span class="btn disabled">上一页</span>`}
      <span class="page-info">第 ${page} 页</span>
      ${hasNext ? `<a class="btn" href="/?mode=paged&page=${page + 1}">下一页</a>` : `<span class="btn disabled">下一页</span>`}
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>聊天室</title>
  <style>${BASE_CSS}${PAGED_CSS}</style>
</head>
<body>
  <div class="page">
    ${renderTopbar("paged")}
    <main class="page-content">
      <div class="messages-box">${messagesHtml || '<div class="empty">还没有消息，来说点什么吧。</div>'}</div>
      ${pagination}
      <form class="composer-inline" method="POST" action="/send" enctype="multipart/form-data">
        <input type="hidden" name="mode" value="paged">
        <input type="hidden" name="page" value="${page}">
        <input name="username" maxlength="16" placeholder="名字" value="${escapeHtml(savedUsername)}" required>
        <textarea name="content" maxlength="200" placeholder="说点什么..." required></textarea>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <input class="file-input" type="file" name="file" onchange="this.nextElementSibling.textContent=this.files[0]?'已选择: '+this.files[0].name:''">
          <span class="attach-preview"></span>
        </div>
        <button type="submit" class="primary">发送</button>
      </form>
    </main>
  </div>
  <script>
    document.querySelector('.composer-inline').addEventListener('submit', function(e) {
      e.preventDefault();
      var form = this;
      var fileInput = form.querySelector('input[type="file"]');
      var file = fileInput.files[0];
      var done = function(att) {
        if (att) {
          var p = form.querySelector('input[name="attachment_path"]') || document.createElement('input');
          p.type = 'hidden'; p.name = 'attachment_path'; p.value = att.path;
          form.appendChild(p);
          var n = form.querySelector('input[name="attachment_name"]') || document.createElement('input');
          n.type = 'hidden'; n.name = 'attachment_name'; n.value = att.name;
          form.appendChild(n);
          var mi = form.querySelector('input[name="attachment_mime"]') || document.createElement('input');
          mi.type = 'hidden'; mi.name = 'attachment_mime'; mi.value = att.mime;
          form.appendChild(mi);
          var s = form.querySelector('input[name="attachment_size"]') || document.createElement('input');
          s.type = 'hidden'; s.name = 'attachment_size'; s.value = att.size;
          form.appendChild(s);
        }
        HTMLFormElement.prototype.submit.call(form);
      };
      if (!file) { done(null); return; }
      if (file.size > 90 * 1024 * 1024) { alert('文件超过 90MB'); return; }
      var fd = new FormData(); fd.append('file', file);
      fetch('/api/upload', { method: 'POST', body: fd })
        .then(function(r){ if(!r.ok) throw new Error(); return r.json(); })
        .then(done)
        .catch(function(){ alert('附件上传失败'); });
    });
  </script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ============================================================
// 滚动模式（默认，带附件上传）
// ============================================================
async function handleScrollPage(request, url, env) {
  const savedUsername = getCookie(request, USERNAME_COOKIE);

  const { results } = await env.DB.prepare(
    `SELECT id, username, content, attachment_path, attachment_name, attachment_mime,
            strftime('%Y-%m-%d %H:%M', created_at, '+8 hours') AS created_at
     FROM messages ORDER BY id DESC LIMIT ?`
  ).bind(PAGE_SIZE + 1).all();

  const hasMore = results.length > PAGE_SIZE;
  const ordered = (hasMore ? results.slice(0, PAGE_SIZE) : results).reverse();
  const initialMessagesHtml = ordered.map(renderMessage).join("");

  const initData = {
    oldestId: ordered.length ? ordered[0].id : 0,
    newestId: ordered.length ? ordered[ordered.length - 1].id : 0,
    hasMore,
  };
  const initJson = JSON.stringify(initData).replace(/</g, "\\u003c");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>聊天室</title>
  <style>${BASE_CSS}${SCROLL_CSS}</style>
</head>
<body>
  <div class="app">
    ${renderTopbar("scroll")}
    <main class="messages" id="messages">
      <div class="load-more-wrap" id="loadMoreWrap" ${hasMore ? "" : "hidden"}>
        <button type="button" id="loadMoreBtn">拉取更多消息</button>
      </div>
      <div class="message-list" id="messageList">${initialMessagesHtml || '<div class="empty">还没有消息，来说点什么吧。</div>'}</div>
    </main>
    <form class="composer" id="composer">
      <div class="composer-inner">
        <input name="username" maxlength="16" placeholder="名字" value="${escapeHtml(savedUsername)}" required>
        <textarea name="content" maxlength="200" placeholder="说点什么..." rows="1" required></textarea>
        <button type="submit" class="primary">发送</button>
        <div class="file-row">
          <input class="file-input" type="file" name="file">
          <span class="attach-preview"></span>
        </div>
      </div>
    </form>
  </div>
  <script>
    const INIT = ${initJson};
    ${SCROLL_JS}
  </script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ============================================================
// API 发送（滚动模式，支持附件元数据）
// ============================================================
async function handleApiSend(request, env) {
  const form = await request.formData();
  const username = (form.get("username") || "").toString().trim().slice(0, 16);
  const content = (form.get("content") || "").toString().trim().slice(0, 200);

  if (!username || !content) {
    return jsonResponse({ error: "empty" });
  }

  const result = await env.DB.prepare(
    `INSERT INTO messages (username, content, attachment_path, attachment_name, attachment_mime, attachment_size)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    username, content,
    strOrNull(form.get("attachment_path")),
    strOrNull(form.get("attachment_name")),
    strOrNull(form.get("attachment_mime")),
    intOrNull(form.get("attachment_size"))
  ).run();

  const id = result.meta.last_row_id;
  const { results } = await env.DB.prepare(
    `SELECT id, username, content, attachment_path, attachment_name, attachment_mime, attachment_size,
            strftime('%Y-%m-%d %H:%M', created_at, '+8 hours') AS created_at
     FROM messages WHERE id = ?`
  ).bind(id).all();

  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", `${USERNAME_COOKIE}=${encodeURIComponent(username)}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return new Response(JSON.stringify({ message: results[0] }), { status: 200, headers });
}

// ============================================================
// API 获取消息（增加附件字段）
// ============================================================
async function handleApiMessages(url, env) {
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const limitParam = parseInt(url.searchParams.get("limit") || "10", 10);
  const limit = Math.min(50, Math.max(1, isNaN(limitParam) ? 10 : limitParam));

  const sql = `SELECT id, username, content, attachment_path, attachment_name, attachment_mime, attachment_size,
                      strftime('%Y-%m-%d %H:%M', created_at, '+8 hours') AS created_at
               FROM messages`;

  let rows;
  let hasMore = false;

  if (after !== null) {
    const afterId = parseInt(after, 10) || 0;
    const { results } = await env.DB.prepare(`${sql} WHERE id > ? ORDER BY id ASC LIMIT 100`).bind(afterId).all();
    rows = results;
  } else if (before !== null) {
    const beforeId = parseInt(before, 10) || 0;
    const { results } = await env.DB.prepare(`${sql} WHERE id < ? ORDER BY id DESC LIMIT ?`).bind(beforeId, limit + 1).all();
    hasMore = results.length > limit;
    rows = (hasMore ? results.slice(0, limit) : results).reverse();
  } else {
    const { results } = await env.DB.prepare(`${sql} ORDER BY id DESC LIMIT ?`).bind(limit + 1).all();
    hasMore = results.length > limit;
    rows = (hasMore ? results.slice(0, limit) : results).reverse();
  }

  return jsonResponse({ messages: rows, hasMore });
}

// ============================================================
// 附件上传：Worker 作为 WebDAV 客户端，流式 PUT
// ============================================================
async function handleUpload(request, env) {
  if (!env.WEBDAV_URL || !env.WEBDAV_USERNAME || !env.WEBDAV_PASSWORD) {
    return jsonResponse({ error: "WebDAV 未配置" });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return jsonResponse({ error: "缺少文件" });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonResponse({ error: "文件超过 90MB 上限" });
  }

  const rawName = file.name || "file";
  const safeName = rawName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 120);
  const uuid = crypto.randomUUID();
  const remoteName = uuid + "_" + safeName;
  const remotePath = WEBDAV_BASE_DIR + "/" + remoteName;

  const davUrl = env.WEBDAV_URL.replace(/\/+$/, "") + remotePath;
  const auth = "Basic " + btoa(env.WEBDAV_USERNAME + ":" + env.WEBDAV_PASSWORD);

  // 确保父目录存在（MKCOL 已存在时返回 405/409，忽略）
  const dirUrl = env.WEBDAV_URL.replace(/\/+$/, "") + WEBDAV_BASE_DIR + "/";
  try {
    await fetch(dirUrl, { method: "MKCOL", headers: { Authorization: auth } });
  } catch (e) {}

  // 预认证 PUT，流式上传
  const putRes = await fetch(davUrl, {
    method: "PUT",
    headers: {
      Authorization: auth,
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
    },
    body: file.stream(),
  });

  if (!putRes.ok) {
    return jsonResponse({ error: "WebDAV 上传失败: " + putRes.status });
  }

  return jsonResponse({
    path: remotePath,
    name: rawName,
    mime: file.type || "application/octet-stream",
    size: file.size,
  });
}

// ============================================================
// 附件代理：查看（内联） / 下载（附件），透传 Range
// ============================================================
async function handleAttachmentProxy(request, url, env, asDownload) {
  const id = parseInt(url.searchParams.get("id") || "0", 10);
  if (!id) return new Response("Not Found", { status: 404 });

  const row = await env.DB.prepare(
    "SELECT attachment_path, attachment_name, attachment_mime FROM messages WHERE id = ?"
  ).bind(id).first();

  if (!row || !row.attachment_path) return new Response("Not Found", { status: 404 });

  const davUrl = env.WEBDAV_URL.replace(/\/+$/, "") + row.attachment_path;
  const auth = "Basic " + btoa(env.WEBDAV_USERNAME + ":" + env.WEBDAV_PASSWORD);
  const headers = { Authorization: auth };

  const range = request.headers.get("Range");
  if (range) headers["Range"] = range;

  const davRes = await fetch(davUrl, { method: "GET", headers });

  if (!davRes.ok && davRes.status !== 206) {
    return new Response("附件读取失败", { status: 502 });
  }

  const respHeaders = new Headers();
  respHeaders.set("Content-Type", row.attachment_mime || "application/octet-stream");
  respHeaders.set("Cache-Control", "private, max-age=3600");

  const contentRange = davRes.headers.get("Content-Range");
  if (contentRange) respHeaders.set("Content-Range", contentRange);

  const acceptRanges = davRes.headers.get("Accept-Ranges");
  if (acceptRanges) respHeaders.set("Accept-Ranges", acceptRanges);

  const contentLength = davRes.headers.get("Content-Length");
  if (contentLength) respHeaders.set("Content-Length", contentLength);

  const isImage = (row.attachment_mime || "").indexOf("image/") === 0;

  if (asDownload || !isImage) {
    respHeaders.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(row.attachment_name || "file")}`
    );
  } else {
    respHeaders.set("Content-Disposition", "inline");
    respHeaders.set("X-Content-Type-Options", "nosniff");
  }

  return new Response(davRes.body, { status: davRes.status, headers: respHeaders });
}