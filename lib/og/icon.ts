import { readFile } from "node:fs/promises";
import { join } from "node:path";

let iconPromise: Promise<ArrayBuffer> | null = null;

/**
 * The app icon as an ArrayBuffer for `<img src>` inside an ImageResponse.
 *
 * Read once per instance and memoized. A failed read is not memoized, and it
 * rejects only the render that asked for it, so a missing file cannot take the
 * whole route down at module load.
 */
export function loadOgIcon(): Promise<ArrayBuffer> {
  iconPromise ??= readFile(join(process.cwd(), "app/icon.png")).then(
    (file) =>
      file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength,
      ) as ArrayBuffer,
    (error) => {
      iconPromise = null;
      throw error;
    },
  );
  return iconPromise;
}
