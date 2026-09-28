import type { ArchiveRecord } from "./data";
import { escapeHtml as h } from "./html";
import { renderMarkdown } from "./markdown";
import { SurfaceTransition } from "./ui-transitions";
import "./article-reader.css";

export class ArticleReader {
  private dialog = document.createElement("dialog");
  private transition = new SurfaceTransition(this.dialog);
  private observer?: IntersectionObserver;
  private previousFocus?: HTMLElement;
  private closing = false;
  private reduced = false;
  get isOpen() { return this.dialog.open; }

  constructor() {
    this.dialog.className = "article-reader";
    this.dialog.hidden = true;
    this.dialog.setAttribute("aria-labelledby", "article-reader-title");
    document.body.append(this.dialog);
    this.dialog.addEventListener("cancel", event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener("click", event => {
      if ((event.target as Element).closest("[data-reader-close]")) this.close();
    });
  }

  open(record: ArchiveRecord, reduced: boolean) {
    if (this.isOpen) return;
    this.reduced = reduced;
    this.closing = false;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.dialog.innerHTML = `<header class="article-reader-top"><div><span>FILE ${h(record.id)} / FULL ARTICLE</span><h2 id="article-reader-title">${h(record.title)}</h2></div><button type="button" data-reader-close aria-label="关闭全文">关闭 <span>×</span></button></header><div class="article-reader-layout"><div class="article-scroll" tabindex="0" role="region" aria-label="文章正文"><article class="markdown-body"><header class="article-heading"><p>${h(record.date)} <span>／</span> ${h(record.lead)}</p><h1>${h(record.title)}</h1><p class="article-description">${h(record.abstract)}</p></header><div class="article-markdown">${renderMarkdown(record.bodyMarkdown?.trim() ? record.bodyMarkdown : record.findings.join("\n\n"))}</div></article></div><nav class="article-toc" aria-label="文章目录"><span class="article-toc-caption">目录</span><div class="article-toc-links"></div></nav></div>`;
    const content = this.dialog.querySelector<HTMLElement>(".article-markdown")!;
    content.querySelectorAll<HTMLAnchorElement>("a").forEach(link => {
      const href = link.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
      else if (!href.startsWith("#") && !href.startsWith("mailto:")) link.removeAttribute("href");
    });
    content.querySelectorAll<HTMLInputElement>("input").forEach(input => {
      if (input.type !== "checkbox") input.remove();
      else input.disabled = true;
    });
    content.querySelectorAll<HTMLImageElement>("img").forEach(image => {
      const src = image.getAttribute("src") || "";
      if (!/^https?:\/\//i.test(src) && !/^\/api\/photos\/[a-f0-9]{64}$/.test(src)) image.removeAttribute("src");
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
    });
    content.querySelectorAll("table").forEach(table => {
      const wrapper = document.createElement("div");
      wrapper.className = "article-table";
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", "可横向滚动的表格");
      table.before(wrapper); wrapper.append(table);
    });
    const scroll = this.dialog.querySelector<HTMLElement>(".article-scroll")!;
    const headings = [...content.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")];
    const links = this.dialog.querySelector(".article-toc-links")!;
    const buttons = headings.map((heading, i) => {
      heading.id = `article-heading-${i}`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = heading.textContent;
      button.title = heading.textContent || "";
      button.dataset.level = heading.tagName.slice(1);
      button.addEventListener("click", () => {
        const top = heading.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 24;
        scroll.scrollTo({ top, behavior: this.reduced ? "instant" : "smooth" });
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      });
      links.append(button);
      return button;
    });
    if (!headings.length) {
      this.dialog.querySelector<HTMLElement>(".article-toc")!.hidden = true;
      this.dialog.querySelector(".article-reader-layout")!.classList.add("without-toc");
    }
    const update = () => {
      const boundary = scroll.getBoundingClientRect().top + 100;
      let active = 0;
      headings.forEach((heading, i) => { if (heading.getBoundingClientRect().top <= boundary) active = i; });
      // A short final section cannot reach the top of the scroll viewport.
      if (scroll.scrollTop > 0 && scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 2) active = headings.length - 1;
      buttons.forEach((button, i) => {
        if (i === active) button.setAttribute("aria-current", "location");
        else button.removeAttribute("aria-current");
      });
    };
    scroll.addEventListener("scroll", update, { passive: true });
    this.observer = new IntersectionObserver(update, { root: scroll });
    headings.forEach(heading => this.observer!.observe(heading));
    this.dialog.showModal();
    scroll.scrollTop = 0;
    this.transition.show(reduced);
    this.dialog.querySelector<HTMLButtonElement>("[data-reader-close]")!.focus({ preventScroll: true });
    update();
  }

  close() {
    if (!this.isOpen || this.closing) return;
    this.closing = true;
    this.transition.hide(this.reduced, () => {
      this.observer?.disconnect();
      this.dialog.close();
      this.dialog.replaceChildren();
      this.closing = false;
      this.previousFocus?.focus({ preventScroll: true });
    });
  }
}
