import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const photoTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function validateEmployeePhoto(file: File): string | null {
  if (!photoTypes.has(file.type)) return "顔写真はJPEG、PNG、またはWebP形式で指定してください。";
  if (file.size > MAX_PHOTO_SIZE) return "顔写真のサイズは5MB以下にしてください。";
  return null;
}

export async function saveEmployeePhoto(file: File, employeeId: string): Promise<string> {
  const extension = photoTypes.get(file.type);
  if (!extension) throw new Error("Unsupported employee photo type");

  const directory = path.join(process.cwd(), "public", "uploads", "employees");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${employeeId}.${extension}`), Buffer.from(await file.arrayBuffer()));
  return `/uploads/employees/${employeeId}.${extension}`;
}

export async function removeEmployeePhoto(photoUrl: string | null | undefined): Promise<void> {
  if (!photoUrl?.startsWith("/uploads/employees/")) return;
  try {
    await unlink(path.join(process.cwd(), "public", photoUrl));
  } catch {
    // 既に削除済みの場合はDB更新を妨げない。
  }
}
