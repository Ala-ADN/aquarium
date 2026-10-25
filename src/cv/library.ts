export interface CvFile {
  name: string;
  text: string;
}

const files = import.meta.glob<string>("../asset/cv/*.txt", {
  eager: true, query: "?raw", import: "default",
});

export const cvLibrary: readonly CvFile[] = Object.entries(files)
  .map(([path, text]) => ({ name: path.slice(path.lastIndexOf("/") + 1), text }))
  .sort((a, b) => a.name.localeCompare(b.name));
