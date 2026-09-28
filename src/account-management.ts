import type { AccessController } from "./access";
import { escapeHtml as h } from "./html";
import { SurfaceTransition } from "./ui-transitions";

type Account = { id: number; username: string; role: "admin" | "reader"; self: boolean };

export class AccountManagement {
  private dialog = document.createElement("dialog");
  private transition = new SurfaceTransition(this.dialog);
  private busy = false;
  private closing = false;
  private reduced = false;
  private previousFocus?: HTMLElement;
  private users: Account[] = [];
  get isOpen() { return this.dialog.open; }

  constructor(private access: AccessController) {
    this.dialog.className = "archive-editor account-manager";
    this.dialog.hidden = true;
    this.dialog.setAttribute("aria-label", "账户管理");
    document.body.append(this.dialog);
    this.dialog.addEventListener("cancel", event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener("click", event => {
      if (this.busy || this.closing) return;
      const button = (event.target as Element).closest<HTMLButtonElement>("button");
      if (!button) return;
      if (button.hasAttribute("data-account-close")) this.close();
      if (button.hasAttribute("data-account-back")) this.renderList();
      if (button.hasAttribute("data-account-retry")) void this.load();
      const user = this.users.find(u => String(u.id) === button.dataset.accountId);
      if (user && button.dataset.accountAction) this.renderAction(user, button.dataset.accountAction === "delete");
    });
  }

  open(reduced: boolean) {
    if (!this.access.admin || this.isOpen) return;
    this.reduced = reduced;
    this.closing = false;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.shell("<p>正在读取账户…</p>");
    this.dialog.showModal();
    this.transition.show(reduced);
    void this.load();
  }

  private close() {
    if (this.busy || this.closing) return;
    this.closing = true;
    this.transition.hide(this.reduced, () => {
      this.dialog.close();
      this.dialog.replaceChildren();
      this.previousFocus?.focus({ preventScroll: true });
    });
  }

  private shell(content: string) {
    this.dialog.innerHTML = `<div class="editor-top"><span>ACCOUNT MANAGEMENT / 管理员</span><button type="button" data-account-close aria-label="关闭账户管理">关闭 ×</button></div><h2>账户管理</h2>${content}`;
  }

  private setBusy(busy: boolean) {
    this.busy = busy;
    this.dialog.setAttribute("aria-busy", String(busy));
    this.dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button,input").forEach(el => { el.disabled = busy; });
  }

  private async load() {
    this.setBusy(true);
    try {
      this.users = (await this.access.api<{ users: Account[] }>("/users")).users;
      this.renderList();
    } catch (error) {
      this.shell(`<p class="access-error" role="alert">${h((error as Error).message)}</p><button data-account-retry>重新加载</button>`);
    } finally { this.setBusy(false); }
  }

  private renderList(message = "") {
    this.shell(`<p class="editor-hint">管理其他账户，或修改自己的密码。密码重置后，该账户需要重新登录。</p><p class="reader-result" role="status">${h(message)}</p><ul class="account-list">${this.users.map(user => `<li><div><strong>${h(user.username)}</strong><span>${user.role === "admin" ? "管理员" : "普通账户"}${user.self ? " · 当前账户" : ""}</span></div><div class="account-actions"><button type="button" data-account-id="${user.id}" data-account-action="password">${user.self ? "修改我的密码" : "重置密码"}</button>${user.self ? "" : `<button type="button" class="account-delete" data-account-id="${user.id}" data-account-action="delete">删除账户</button>`}</div></li>`).join("")}</ul>`);
    this.dialog.querySelector<HTMLButtonElement>("[data-account-close]")!.focus({ preventScroll: true });
  }

  private renderAction(user: Account, deleting: boolean) {
    const title = deleting ? "删除账户" : user.self ? "修改我的密码" : "重置密码";
    const passwordInput = (name: string, label: string, current = false) => `<label>${label}<input name="${name}" type="password" autocomplete="${current ? "current-password" : "new-password"}" ${current ? "" : 'minlength="8"'} maxlength="128" required></label>`;
    this.shell(`<form><h3>${title} · ${h(user.username)}</h3>${deleting
      ? `<p class="editor-hint">将删除该账户及其收藏，并使其登录失效。网站档案会保留。此操作无法撤销。</p><label>输入账户名称 ${h(user.username)} 以确认<input name="confirmUsername" autocomplete="off" required maxlength="32"></label>`
      : `<p class="editor-hint">新密码为 8–128 位。${user.self ? "修改后保留本次登录，其他设备需使用新密码重新登录。" : "原密码将失效，所有设备需使用新密码重新登录。"}</p>${user.self ? passwordInput("currentPassword", "当前密码", true) : ""}${passwordInput("newPassword", "新密码")}${passwordInput("confirmPassword", "确认新密码")}`}
      <p class="access-error" role="alert"></p><div class="editor-bottom"><button type="button" data-account-back>返回账户列表</button><button type="submit" class="access-primary ${deleting ? "danger-button" : ""}">${deleting ? "确认删除账户" : "保存新密码"}</button></div></form>`);
    const form = this.dialog.querySelector("form")!;
    form.querySelector("input")!.focus();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (this.busy) return;
      const data = Object.fromEntries(new FormData(form));
      const errorLabel = form.querySelector<HTMLElement>(".access-error")!;
      errorLabel.textContent = "";
      if (deleting && data.confirmUsername !== user.username) { errorLabel.textContent = "账户名称不匹配。"; return; }
      if (!deleting && data.newPassword !== data.confirmPassword) { errorLabel.textContent = "两次输入的新密码不一致。"; return; }
      this.setBusy(true);
      try {
        await this.access.api(`/users/${user.id}${deleting ? "" : "/password"}`, deleting ? "DELETE" : "PUT", deleting ? { confirmUsername: data.confirmUsername } : { username: user.username, newPassword: data.newPassword, currentPassword: data.currentPassword });
        form.reset();
        if (deleting) this.users = this.users.filter(u => u.id !== user.id);
        this.renderList(deleting ? `已删除账户 ${user.username}。` : `已更新 ${user.username} 的密码。`);
      } catch (error) { errorLabel.textContent = (error as Error).message; }
      finally { this.setBusy(false); }
    });
  }
}
