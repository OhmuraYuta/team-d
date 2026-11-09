import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { uuidv7 } from "uuidv7";

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const photoTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const photoExtensions = ["jpg", "png", "webp"];

export function validateEmployeePhoto(file: File): string | null {
  if (!photoTypes.has(file.type)) return "顔写真はJPEG、PNG、またはWebP形式で指定してください。";
  if (file.size > MAX_PHOTO_SIZE) return "顔写真のサイズは5MB以下にしてください。";
  return null;
}

function employeePhotoDir(): string {
  return path.join(process.cwd(), "public", "uploads", "employees");
}

export function employeePhotoUrl(employeeId: string, extension: string): string {
  return `/uploads/employees/${employeeId}.${extension}`;
}

export async function saveEmployeePhoto(file: File, employeeId: string): Promise<string> {
  const extension = photoTypes.get(file.type);
  if (!extension) throw new Error("Unsupported employee photo type");

  const directory = employeePhotoDir();
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${employeeId}.${extension}`), Buffer.from(await file.arrayBuffer()));
  return employeePhotoUrl(employeeId, extension);
}

/** PUT時の既存写真破壊を避けるため、COMMIT確定まではtmpに書き出す。 */
export async function saveTempEmployeePhoto(file: File): Promise<{ tempPath: string; extension: string }> {
  const extension = photoTypes.get(file.type);
  if (!extension) throw new Error("Unsupported employee photo type");

  const directory = employeePhotoDir();
  await mkdir(directory, { recursive: true });
  const tempPath = path.join(directory, `.tmp-${uuidv7()}.${extension}`);
  await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));
  return { tempPath, extension };
}

/** tmpを本番パスへ移動し、拡張子違いの旧ファイルを掃除する。 */
export async function commitTempEmployeePhoto(
  tempPath: string,
  employeeId: string,
  extension: string
): Promise<string> {
  const directory = employeePhotoDir();
  const finalPath = path.join(directory, `${employeeId}.${extension}`);
  await rename(tempPath, finalPath);
  for (const ext of photoExtensions) {
    if (ext === extension) continue;
    try {
      await unlink(path.join(directory, `${employeeId}.${ext}`));
    } catch {
      // 存在しない拡張子は無視する。
    }
  }
  return employeePhotoUrl(employeeId, extension);
}

export async function discardTempEmployeePhoto(tempPath: string | null | undefined): Promise<void> {
  if (!tempPath) return;
  try {
    await unlink(tempPath);
  } catch {
    // tmp削除の失敗はDB更新を妨げない。
  }
}

export async function removeEmployeePhoto(photoUrl: string | null | undefined): Promise<void> {
  if (!photoUrl?.startsWith("/uploads/employees/")) return;
  try {
    await unlink(path.join(process.cwd(), "public", photoUrl));
  } catch {
    // 既に削除済みの場合はDB更新を妨げない。
  }
}
