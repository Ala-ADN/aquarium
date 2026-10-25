import "98.css/dist/98.css";
import "./trashcan.css";
import { cvLibrary } from "../cv/library";
import type { CvFile } from "../cv/library";
import trashcanIcon from "../asset/windows98/recycle-bin-full-32x32.png";
import trashcanTitleIcon from "../asset/windows98/recycle-bin-full-16x16.png";
import textFileIcon from "../asset/text-file.svg";
import { createWindow } from "./window";
import { prioritizeControlClicks } from "./control-pointer-priority";

function image(src: string) {
  const element = document.createElement("img");
  element.src = src;
  element.alt = "";
  element.draggable = false;
  return element;
}

export function mountTrashcan(host: HTMLElement, files: readonly CvFile[] = cvLibrary) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const editors = new Map<string, ReturnType<typeof openEditor>>();
  const fileButtons = new Map<string, HTMLButtonElement>();
  const downloads = new Map<string, ReturnType<typeof setTimeout>>();
  let destroyed = false;

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "desktop-icon trashcan-desktop-icon";
  launcher.setAttribute("aria-label", "Open Trashcan");
  const label = document.createElement("span");
  label.textContent = "Trashcan";
  launcher.append(image(trashcanIcon), label);

  function retroWindow(title: string, content: HTMLElement, icon: string, className: string, onHide: () => void, onLayout?: () => void) {
    const frame = createWindow(title, content, "98");
    const element = frame.element;
    element.classList.add(className);
    element.hidden = true;
    element.tabIndex = -1;
    const handle = element.querySelector<HTMLElement>(".glass-window__handle")!;
    const heading = element.querySelector<HTMLElement>(".title-bar-text")!;
    const titleText = document.createElement("span");
    titleText.textContent = title;
    heading.replaceChildren(image(icon), titleText);
    const controls = document.createElement("div");
    controls.className = "title-bar-controls";
    const maximize = document.createElement("button");

    function hide() {
      element.hidden = true;
      content.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => { menu.open = false; });
      onHide();
    }
    function toggleMaximize() {
      const maximized = element.toggleAttribute("data-maximized");
      maximize.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
      maximize.title = maximized ? "Restore" : "Maximize";
      if (!maximized) frame.resetPosition();
      onLayout?.();
    }
    for (const name of ["Minimize", "Maximize", "Close"]) {
      const button = name === "Maximize" ? maximize : document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", name);
      button.title = name;
      button.addEventListener("click", name === "Maximize" ? toggleMaximize : hide, options);
      controls.append(button);
    }
    handle.append(controls);
    handle.addEventListener("dblclick", (event) => {
      if (!(event.target instanceof Element && event.target.closest("button"))) toggleMaximize();
    }, options);
    // Space on a window must not trigger the aquarium's debug shortcut.
    element.addEventListener("keydown", event => { event.stopPropagation(); }, options);
    prioritizeControlClicks(element, events.signal);
    host.append(element);
    return {
      ...frame,
      hide,
      show() {
        if (element.hidden) frame.resetPosition();
        element.hidden = false;
        onLayout?.();
        element.focus({ preventScroll: true });
      },
    };
  }

  const directoryContent = document.createElement("div");
  directoryContent.className = "trashcan-directory";
  directoryContent.innerHTML = `
    <div class="trashcan-address"><span>Address</span><span class="trashcan-path">Trashcan</span></div>
    <div class="trashcan-files" role="group" aria-label="CV text files"></div>
    <footer class="status-bar"><p class="status-bar-field" role="status"></p><p class="status-bar-field">Text documents</p></footer>
  `;
  const fileList = directoryContent.querySelector<HTMLElement>(".trashcan-files")!;
  directoryContent.querySelector("[role=status]")!.textContent = `${files.length} object${files.length === 1 ? "" : "s"}`;
  const directory = retroWindow("Trashcan", directoryContent, trashcanTitleIcon, "trashcan-window", () => {
    launcher.focus({ preventScroll: true });
  });
  directory.element.id = "trashcan";

  function openEditor(file: CvFile) {
    const content = document.createElement("div");
    content.className = "notepad-editor";
    content.innerHTML = `
      <nav class="notepad-menubar" aria-label="Notepad menu">
        <details><summary>File</summary><div class="notepad-menu">
          <button type="button" data-action="save">Save as…<span>Ctrl+S</span></button>
          <button type="button" data-action="close">Close</button>
        </div></details>
        <details><summary>Edit</summary><div class="notepad-menu">
          <button type="button" data-action="select">Select all<span>Ctrl+A</span></button>
        </div></details>
        <details><summary>Format</summary><div class="notepad-menu">
          <button type="button" data-action="wrap" aria-pressed="true">Word wrap<span class="notepad-wrap-check">✓</span></button>
        </div></details>
      </nav>
      <textarea class="notepad-text" spellcheck="false" wrap="soft"></textarea>
      <footer class="status-bar"><p class="status-bar-field">Text document</p><p class="status-bar-field notepad-position">Ln 1, Col 1</p></footer>
    `;
    const textarea = content.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.setAttribute("aria-label", file.name);
    textarea.value = file.text;
    const position = content.querySelector<HTMLElement>(".notepad-position")!;
    const editor = retroWindow(`${file.name} - Notepad`, content, textFileIcon, "notepad-window", () => {
      const target = directory.element.hidden ? launcher : fileButtons.get(file.name)!;
      target.focus({ preventScroll: true });
    }, fitContent);
    editor.element.dataset.file = file.name;
    const title = editor.element.querySelector<HTMLElement>(".title-bar-text span")!;
    const closeMenus = () => content.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => { menu.open = false; });

    function fitContent() {
      if (destroyed || editor.element.hidden || editor.element.hasAttribute("data-maximized")) return;
      const style = getComputedStyle(textarea);
      const measure = document.createElement("div");
      Object.assign(measure.style, {
        position: "fixed", visibility: "hidden", pointerEvents: "none",
        width: "max-content", whiteSpace: "pre", font: style.font,
        letterSpacing: style.letterSpacing, tabSize: style.tabSize,
      });
      // Trailing padding spaces should not make an otherwise narrow CV wider.
      measure.textContent = textarea.value.split("\n").map(line => line.trimEnd()).join("\n");
      document.body.append(measure);
      const textWidth = measure.offsetWidth;
      measure.remove();

      const number = (value: string) => parseFloat(value) || 0;
      const horizontalChrome = editor.element.offsetWidth - textarea.offsetWidth;
      const padding = number(style.paddingLeft) + number(style.paddingRight);
      const borders = number(style.borderLeftWidth) + number(style.borderRightWidth);
      // Reserve room for a vertical scrollbar without wrapping the ASCII heading.
      editor.element.style.setProperty("--window-width", `${Math.ceil(Math.max(320, textWidth + padding + borders + horizontalChrome + 18))}px`);
      const chromeHeight = editor.element.offsetHeight - textarea.offsetHeight;
      editor.element.style.setProperty("--notepad-chrome-height", `${chromeHeight}px`);

      const scrollTop = textarea.scrollTop;
      const scrollLeft = textarea.scrollLeft;
      textarea.style.height = "0px";
      const height = textarea.scrollHeight + number(style.borderTopWidth) + number(style.borderBottomWidth);
      editor.element.style.setProperty("--notepad-text-height", `${height}px`);
      textarea.style.removeProperty("height");
      textarea.scrollTop = scrollTop;
      textarea.scrollLeft = scrollLeft;
    }

    function update() {
      title.textContent = `${textarea.value === file.text ? "" : "*"}${file.name} - Notepad`;
      const lines = textarea.value.slice(0, textarea.selectionStart).split("\n");
      position.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
    }
    function save() {
      const url = URL.createObjectURL(new Blob([textarea.value], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      // Allow the browser to start the download before releasing the object URL.
      downloads.set(url, setTimeout(() => {
        URL.revokeObjectURL(url);
        downloads.delete(url);
      }, 1000));
    }
    for (const name of ["input", "click", "keyup", "select"]) textarea.addEventListener(name, update, options);
    textarea.addEventListener("input", fitContent, options);
    window.addEventListener("resize", fitContent, options);
    void document.fonts?.ready.then(fitContent);
    content.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>("button[data-action]");
      if (!button) return;
      switch (button.dataset.action) {
        case "save": save(); break;
        case "close": editor.hide(); break;
        case "select": textarea.focus(); textarea.select(); update(); break;
        case "wrap": {
          const wrap = button.getAttribute("aria-pressed") !== "true";
          button.setAttribute("aria-pressed", `${wrap}`);
          textarea.wrap = wrap ? "soft" : "off";
          content.querySelector<HTMLElement>(".notepad-wrap-check")!.textContent = wrap ? "✓" : "";
          fitContent();
          break;
        }
      }
      closeMenus();
    }, options);
    content.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
        closeMenus();
      }
      if (event.key === "Escape") {
        closeMenus();
        textarea.focus({ preventScroll: true });
      }
    }, options);
    for (const menu of content.querySelectorAll<HTMLDetailsElement>("details")) {
      menu.querySelector("summary")!.addEventListener("click", () => {
        for (const other of content.querySelectorAll<HTMLDetailsElement>("details")) {
          if (other !== menu) other.open = false;
        }
      }, options);
    }
    document.addEventListener("pointerdown", event => {
      if (!(event.target instanceof Element && event.target.closest(".notepad-menubar") === content.querySelector("nav"))) closeMenus();
    }, options);
    return { ...editor, textarea };
  }

  for (const file of files) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trashcan-file";
    button.setAttribute("aria-label", `Open ${file.name}`);
    const name = document.createElement("span");
    name.textContent = file.name;
    button.append(image(textFileIcon), name);
    button.addEventListener("click", () => {
      let editor = editors.get(file.name);
      if (!editor) {
        editor = openEditor(file);
        editors.set(file.name, editor);
      }
      editor.show();
      editor.textarea.focus({ preventScroll: true });
    }, options);
    fileButtons.set(file.name, button);
    fileList.append(button);
  }
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "trashcan-empty";
    empty.textContent = "The Trashcan is empty.";
    fileList.append(empty);
  }
  launcher.addEventListener("click", () => directory.show(), options);
  host.append(launcher);

  return {
    element: directory.element,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      events.abort();
      for (const [url, timer] of downloads) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      downloads.clear();
      for (const editor of editors.values()) editor.destroy();
      editors.clear();
      directory.destroy();
      launcher.remove();
    },
  };
}
