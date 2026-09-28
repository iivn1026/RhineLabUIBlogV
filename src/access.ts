import { logo } from "./brand";
import { escapeHtml as h } from "./html";
import { archiveColumns, type ArchiveRecord } from "./data";
import labels from "../content/column-labels.json";
import "./access.css";
import { preparePhoto } from "./photo-upload";
import { AccountManagement } from "./account-management";

type User = { username: string; role: "admin" | "reader" | "guest" };
type Session = { user: User | null; csrf?: string };
export class AccessController {
  user: User | null = null;
  entered = false;
  private csrf = "";
  private gate = document.createElement("dialog");
  private editor = document.createElement("dialog");
  private accounts = new AccountManagement(this);
  get admin() { return this.user?.role === "admin"; }
  get canSave() { return this.user?.role === "admin" || this.user?.role === "reader"; }
  get dialogOpen() { return this.gate.open || this.editor.open || this.accounts.isOpen; }
  manageAccounts(reduced: boolean) { this.accounts.open(reduced); }
  get identity() { return this.user ? `${this.user.username} · ${this.admin ? "管理员" : this.user.role === "reader" ? "普通账户" : "只读游客"}` : "未登录"; }
  constructor() {
    this.gate.className = "access-gate";
    this.gate.setAttribute("aria-label", "登录莱茵终端");
    this.editor.className = "archive-editor";
    document.body.append(this.gate, this.editor);
    this.gate.addEventListener("cancel", e => e.preventDefault());
    // Back/forward cache must not restore an already authorized page.
    window.addEventListener("pageshow", event => {
      if (event.persisted) location.reload();
    });
  }
  async api<T>(path: string, method = "GET", data?: unknown): Promise<T> {
    const response = await fetch(`/api${path}`, {
      method, credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": this.csrf },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    let result;
    try { result = await response.json(); } catch { throw new Error("登录服务未启动，请通过 npm start 启动完整网站。"); }
    if (!response.ok) throw new Error(result.error || "请求失败，请稍后重试。");
    return result as T;
  }
  private accept(session: Session) {
    if (!session.user || !session.csrf) throw new Error("无效会话。");
    this.user = session.user;
    this.csrf = session.csrf;
    this.entered = true;
    document.body.dataset.role = session.user.role;
    this.gate.close();
  }
  async enter() {
    this.gate.innerHTML = `<form class="access-card" autocomplete="off"><div class="access-logo">${logo}</div><p class="access-caption">INTERNAL DATABASE / ACCESS</p><h1>登录终端</h1><p class="access-hint">每次进入需重新登录，也可选择游客浏览。</p><label>账户<input name="username" autocomplete="off" maxlength="32" required placeholder="请输入账户名称"></label><label>密码<input name="password" type="password" autocomplete="off" maxlength="128" required placeholder="请输入密码"></label><p class="access-error" role="alert"></p><button class="access-primary" type="submit" disabled>登录并进入 →</button><button class="access-guest" type="button" data-guest disabled>游客浏览 ↗</button><p class="access-note">普通账户可浏览与收藏 · 游客仅可浏览</p></form>`;
    this.gate.showModal();
    const form = this.gate.querySelector("form")!;
    let resetDone = false;
    const resetSession = async () => {
      await this.api("/session/reset", "POST", {});
      resetDone = true;
    };
    try {
      await resetSession();
    } catch {
      this.gate.querySelector(".access-error")!.textContent = "暂时无法连接登录服务，请确认服务已启动后重试。";
    }
    await new Promise<void>((resolve) => {
      const buttons = [...form.querySelectorAll("button")];
      buttons.forEach(b => b.disabled = false);
      let submitting = false;
      const submit = async (guest: boolean) => {
        if (submitting) return;
        submitting = true;
        buttons.forEach(b => b.disabled = true);
        form.querySelector(".access-error")!.textContent = "";
        try {
          if (!resetDone) await resetSession();
          const data = new FormData(form);
          const session = await this.api<Session>(guest ? "/guest" : "/login", "POST", guest ? {} : { username: data.get("username"), password: data.get("password") });
          form.reset();
          this.accept(session);
          resolve();
        } catch (error) {
          form.querySelector(".access-error")!.textContent = (error as Error).message;
        } finally { submitting = false; buttons.forEach(b => b.disabled = false); }
      };
      form.addEventListener("submit", e => { e.preventDefault(); void submit(false); });
      form.querySelector("[data-guest]")!.addEventListener("click", () => void submit(true));
    });
  }
  async logout() {
    await this.api("/logout", "POST", {});
    location.reload();
  }
  edit(record: ArchiveRecord | undefined, lane: number, onSave: (record: ArchiveRecord) => void) {
    if (!this.admin) return;
    const initial = record || { title: "", en: "", category: archiveColumns[lane], date: new Date().toISOString().slice(0, 10), lead: this.user!.username, department: labels[lane], clearance: "PUBLIC", abstract: "", findings: [""], source: location.origin };
    const field = (name: string, title: string, max: number, value: string) => `<label>${title}<input name="${name}" required maxlength="${max}" value="${h(value)}"></label>`;
    this.editor.setAttribute("aria-label", record ? "编辑档案" : "新建档案");
    this.editor.innerHTML = `<form><div class="editor-top"><span>RHINE LAB / CONTENT EDITOR</span><button type="button" data-close-editor aria-label="关闭编辑器">关闭 ×</button></div><h2>${record ? `编辑 ${h(record.id)}` : "新建档案"}</h2><p class="editor-hint">保存后会出现在所选栏目的三维档案队列中。</p><div class="editor-grid"><label>档案编号（X- 后的部分）<input name="codeSuffix" maxlength="24" pattern="[A-Za-z0-9]([A-Za-z0-9_]|-){0,23}" placeholder="留空自动分配，例如 PHOTO-001" value="${h(record?.id.slice(2) ?? "")}"></label><label>所属栏目<select name="category" ${record ? "disabled" : ""}>${archiveColumns.map((c,i) => `<option value="${h(c)}" ${c === initial.category ? "selected" : ""}>${h(labels[i])}</option>`).join("")}</select></label>${field("title", "档案标题", 100, initial.title)}${field("en", "英文标题 / 副标题", 150, initial.en)}${field("department", "分类 / 主题", 100, initial.department)}${field("date", "日期 / 编目范围", 100, initial.date)}${field("lead", "作者", 100, initial.lead)}${field("clearance", "显示标签", 50, initial.clearance)}${field("source", "参考链接（HTTP / HTTPS）", 2000, initial.source)}</div><section class="photo-upload" data-photo-section hidden><label>上传照片<input name="photoFile" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="editor-hint">JPG / PNG / WebP，最大 20 MB；保存时缩放至最长边 2048 像素。照片按原比例放入档案外壳。</p><img class="photo-preview" alt="所选照片预览" ${record?.photo ? `src="${h(record.photo)}"` : "hidden"}><label class="photo-remove" ${record?.photo ? "" : "hidden"}><input name="removePhoto" type="checkbox">移除已有照片，恢复原组件</label></section><label>摘要<textarea name="abstract" rows="4" required maxlength="20000">${h(initial.abstract)}</textarea></label><label>档案摘要段落（段落之间空一行）<textarea name="findings" rows="7" required>${h(initial.findings.join("\n\n"))}</textarea></label><label>阅读全文 · Markdown 正文<textarea name="bodyMarkdown" rows="14" maxlength="100000" placeholder="## 标题&#10;&#10;在这里编写 Markdown 正文…">${h(record?.bodyMarkdown ?? "")}</textarea></label><p class="editor-hint">支持标题、列表、表格、引用、链接和代码块。留空时阅读全文使用上面的档案段落。</p><p class="access-error" role="alert"></p><div class="editor-bottom"><span>保存后立即对浏览者可见</span><button class="access-primary" type="submit">保存档案 →</button></div></form>`;
    const form = this.editor.querySelector("form")!;
    const close = form.querySelector<HTMLButtonElement>("[data-close-editor]")!;
    close.addEventListener("click", () => this.editor.close());
    const category = form.elements.namedItem("category") as HTMLSelectElement;
    const photoSection = form.querySelector<HTMLElement>("[data-photo-section]")!;
    const photoFile = form.elements.namedItem("photoFile") as HTMLInputElement;
    const preview = form.querySelector<HTMLImageElement>(".photo-preview")!;
    const updatePhotoSection = () => { photoSection.hidden = category.value !== archiveColumns[2]; };
    category.addEventListener("change", updatePhotoSection);
    updatePhotoSection();
    let previewUrl = "";
    const revokePreview = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ""; };
    this.editor.addEventListener("close", revokePreview, { once: true });
    photoFile.addEventListener("change", () => {
      revokePreview();
      const file = photoFile.files?.[0];
      if (file && ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 20 * 1024 * 1024) {
        previewUrl = URL.createObjectURL(file); preview.src = previewUrl; preview.hidden = false;
        (form.elements.namedItem("removePhoto") as HTMLInputElement).checked = false;
      } else {
        preview.hidden = !record?.photo;
        if (record?.photo) preview.src = record.photo;
        if (file) { photoFile.value = ""; form.querySelector(".access-error")!.textContent = "请选择不超过 20 MB 的 JPG、PNG 或 WebP 图片。"; }
      }
    });
    (form.elements.namedItem("removePhoto") as HTMLInputElement).addEventListener("change", event => {
      if ((event.target as HTMLInputElement).checked) {
        photoFile.value = ""; revokePreview(); preview.hidden = true;
      } else if (record?.photo) { preview.src = record.photo; preview.hidden = false; }
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      button.disabled = close.disabled = true;
      const preventCancel = (e: Event) => e.preventDefault();
      this.editor.addEventListener("cancel", preventCancel);
      const data = new FormData(form);
      const file = photoFile.files?.[0];
      data.delete("photoFile");
      const input = Object.fromEntries(data);
      form.querySelector(".access-error")!.textContent = "";
      try {
        const result = await this.api<{ record: ArchiveRecord }>(record ? `/archives/${record.id}` : "/archives", record ? "PUT" : "POST", {
          ...input, category: record?.category ?? input.category, version: record?.version,
          photoData: file && category.value === archiveColumns[2] ? await preparePhoto(file) : undefined,
          removePhoto: data.get("removePhoto") === "on",
          findings: String(input.findings).split(/\n\s*\n/).map(x => x.trim()).filter(Boolean),
        });
        this.editor.close();
        onSave(result.record);
      } catch (error) { form.querySelector(".access-error")!.textContent = (error as Error).message; }
      finally { button.disabled = close.disabled = false; this.editor.removeEventListener("cancel", preventCancel); }
    });
    this.editor.showModal();
  }
  deleteRecord(record: ArchiveRecord, onDelete: (records: ArchiveRecord[]) => void) {
    if (!this.admin) return;
    this.editor.setAttribute("aria-label", "删除档案");
    this.editor.innerHTML = `<form><h2>删除档案</h2><p class="editor-hint">确定删除 ${h(record.id)} · ${h(record.title)}？档案及其照片将被移除，此操作无法撤销。</p><p class="access-error" role="alert"></p><div class="editor-bottom"><button type="button" data-cancel>取消</button><button type="submit" class="access-primary danger-button">确认删除档案</button></div></form>`;
    const form = this.editor.querySelector("form")!;
    form.querySelector("[data-cancel]")!.addEventListener("click", () => this.editor.close());
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const buttons = [...form.querySelectorAll("button")];
      buttons.forEach(b => b.disabled = true);
      const preventCancel = (e: Event) => e.preventDefault();
      this.editor.addEventListener("cancel", preventCancel);
      try {
        const result = await this.api<{ records: ArchiveRecord[] }>(`/archives/${record.id}`, "DELETE", { version: record.version });
        this.editor.close();
        onDelete(result.records);
      } catch (e) { form.querySelector(".access-error")!.textContent = (e as Error).message; }
      finally { buttons.forEach(b => b.disabled = false); this.editor.removeEventListener("cancel", preventCancel); }
    });
    this.editor.showModal();
  }
  createReader() {
    if (!this.admin) return;
    this.editor.setAttribute("aria-label", "创建普通账户");
    this.editor.innerHTML = `<form><div class="editor-top"><span>ACCOUNT / 只读账户</span><button type="button" data-close-editor>关闭 ×</button></div><h2>创建普通账户</h2><p class="editor-hint">普通账户可浏览和收藏档案，没有内容编辑权限。</p><label>账户名称<input name="username" required pattern="[A-Za-z0-9_-]{3,32}" minlength="3" maxlength="32" autocomplete="off" placeholder="3–32 位字母、数字、下划线或短横线"></label><label>初始密码<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><p class="access-error" role="alert"></p><p class="reader-result" role="status"></p><button class="access-primary" type="submit">创建普通账户 →</button></form>`;
    const form = this.editor.querySelector("form")!;
    form.querySelector("[data-close-editor]")!.addEventListener("click", () => this.editor.close());
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      button.disabled = true;
      form.querySelector(".access-error")!.textContent = "";
      form.querySelector(".reader-result")!.textContent = "";
      try {
        const result = await this.api<{ user: User }>("/users", "POST", Object.fromEntries(new FormData(form)));
        form.reset();
        form.querySelector(".reader-result")!.textContent = `已创建普通账户 ${result.user.username}，可使用设置的密码登录。`;
      } catch (e) { form.querySelector(".access-error")!.textContent = (e as Error).message; }
      finally { button.disabled = false; }
    });
    this.editor.showModal();
  }
}
