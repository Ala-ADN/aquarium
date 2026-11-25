import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

export const archiveHash = data => createHash("sha256").update(data).digest("hex");

export async function saveReference(directory, files, destination) {
  const contents = {};
  for (const file of [...files].sort()) contents[file] = (await readFile(join(directory, file))).toString("base64");
  const archive = gzipSync(JSON.stringify(contents), { level: 9 });
  await writeFile(destination, archive);
  return archiveHash(archive);
}

export async function unpackReference(archivePath, expectedHash, destination) {
  const archive = await readFile(archivePath);
  if (!expectedHash || archiveHash(archive) !== expectedHash) throw new Error("Reference build hash mismatch. Record and stage both baseline.json and reference.json.gz together.");
  const contents = JSON.parse(gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 }).toString());
  if (!contents["index.html"]) throw new Error("Reference build has no index.html.");
  for (const [relative, encoded] of Object.entries(contents)) {
    const file = resolve(destination, relative);
    if (!file.startsWith(`${resolve(destination)}${sep}`)) throw new Error("Invalid path in reference build.");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(encoded, "base64"));
  }
}
