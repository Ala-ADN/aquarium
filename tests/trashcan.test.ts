// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cvLibrary } from "../src/cv/library";
import { mountTrashcan } from "../src/ui/trashcan";

const files = [
  { name: "CV.txt", text: "A CV\nExperience\nEducation" },
  { name: "CV draft.txt", text: "A different CV" },
];
let app: ReturnType<typeof mountTrashcan> | undefined;
let host: HTMLElement;

function openDirectory() {
  host.querySelector<HTMLButtonElement>(".trashcan-desktop-icon")!.click();
}
function openFile(name = "CV.txt") {
  [...host.querySelectorAll<HTMLButtonElement>(".trashcan-file")]
    .find(button => button.getAttribute("aria-label") === `Open ${name}`)!.click();
  return [...host.querySelectorAll<HTMLElement>(".notepad-window")]
    .find(editor => editor.dataset.file === name)!;
}

beforeEach(() => {
  document.body.innerHTML = "<main></main>";
  host = document.querySelector("main")!;
});
afterEach(() => {
  app?.destroy();
  app = undefined;
  vi.restoreAllMocks();
});

describe("Trashcan and Notepad", () => {
  it("discovers the CV text assets and keeps the directory closed until launched", () => {
    const directory = resolve("src/asset/cv");
    const names = readdirSync(directory).filter(name => name.endsWith(".txt")).sort();
    expect(cvLibrary.map(file => file.name).sort()).toEqual(names);
    for (const file of cvLibrary) expect(file.text).toBe(readFileSync(join(directory, file.name), "utf8"));
    app = mountTrashcan(host);
    expect(app.element.hidden).toBe(true);
    expect(host.querySelectorAll(".trashcan-file")).toHaveLength(cvLibrary.length);
    openDirectory();
    expect(app.element.hidden).toBe(false);
    expect(host.querySelectorAll(".notepad-window")).toHaveLength(0);
  });

  it("opens each CV as literal editable text and retains edits when reopening", () => {
    app = mountTrashcan(host, files);
    openDirectory();
    const editor = openFile();
    const text = editor.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(text.value).toBe(files[0].text);
    expect(text.readOnly).toBe(false);
    text.value = "Edited CV <script>literal text</script>";
    text.dispatchEvent(new Event("input"));
    expect(editor.querySelector(".title-bar-text")!.textContent).toBe("*CV.txt - Notepad");
    editor.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(editor.hidden).toBe(true);
    expect(openFile()).toBe(editor);
    expect(text.value).toContain("Edited CV");
    const other = openFile("CV draft.txt");
    expect(other.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(files[1].text);
    expect(host.querySelectorAll(".notepad-window")).toHaveLength(2);
    expect(host.querySelector("script")).toBeNull();
  });

  it("keeps CV windows independent of the directory and restores maximized windows", () => {
    app = mountTrashcan(host, files);
    openDirectory();
    const editor = openFile();
    editor.querySelector<HTMLButtonElement>('[aria-label="Maximize"]')!.click();
    expect(editor.hasAttribute("data-maximized")).toBe(true);
    editor.querySelector<HTMLButtonElement>('[aria-label="Restore"]')!.click();
    expect(editor.hasAttribute("data-maximized")).toBe(false);
    app.element.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(app.element.hidden).toBe(true);
    expect(editor.hidden).toBe(false);
    editor.querySelector<HTMLButtonElement>('[aria-label="Minimize"]')!.click();
    expect(editor.hidden).toBe(true);
    expect(document.activeElement).toBe(host.querySelector(".trashcan-desktop-icon"));
    openDirectory();
    expect(openFile().hidden).toBe(false);
  });

  it("supports selecting all, word wrap, caret position, and isolated keyboard shortcuts", () => {
    app = mountTrashcan(host, files);
    openDirectory();
    const editor = openFile();
    const text = editor.querySelector<HTMLTextAreaElement>("textarea")!;
    editor.querySelector<HTMLButtonElement>('[data-action="wrap"]')!.click();
    expect(text.wrap).toBe("off");
    editor.querySelector<HTMLButtonElement>('[data-action="wrap"]')!.click();
    expect(text.wrap).toBe("soft");
    editor.querySelector<HTMLButtonElement>('[data-action="select"]')!.click();
    expect(text.selectionStart).toBe(0);
    expect(text.selectionEnd).toBe(text.value.length);
    text.setSelectionRange(6, 6);
    text.dispatchEvent(new Event("click"));
    expect(editor.querySelector(".notepad-position")!.textContent).toBe("Ln 2, Col 2");
    const onKey = vi.fn();
    document.addEventListener("keydown", onKey);
    text.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
    expect(onKey).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onKey);
  });

  it("downloads edited text under the original filename and releases download URLs on teardown", async () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cv-download");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let savedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      savedName = this.download;
    });
    app = mountTrashcan(host, files);
    openDirectory();
    const text = openFile().querySelector<HTMLTextAreaElement>("textarea")!;
    text.value = "My updated CV";
    const shortcut = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    text.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(true);
    expect(savedName).toBe("CV.txt");
    expect(await (create.mock.calls[0][0] as Blob).text()).toBe("My updated CV");
    app.destroy();
    expect(revoke).toHaveBeenCalledWith("blob:cv-download");
    expect(host.children).toHaveLength(0);
  });

  it("handles an empty directory and removes launcher listeners on teardown", () => {
    app = mountTrashcan(host, []);
    const launcher = host.querySelector<HTMLButtonElement>(".trashcan-desktop-icon")!;
    openDirectory();
    expect(app.element.textContent).toContain("The Trashcan is empty.");
    app.element.hidden = true;
    app.destroy();
    launcher.click();
    expect(app.element.hidden).toBe(true);
    expect(host.children).toHaveLength(0);
  });
});
