export class EmployeeFormError extends Error {}

const arrayFields = ["skills", "credentials", "experiences"] as const;

function parseArrayField(form: FormData, field: string): unknown[] {
  const entries = form.getAll(field);
  const result: unknown[] = [];
  for (const entry of entries) {
    if (entry instanceof File) {
      throw new EmployeeFormError(`${field}はJSON配列で指定してください。`);
    }
    const text = entry.trim();
    if (text === "") continue;
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) result.push(...parsed);
      else result.push(parsed);
    } catch {
      // 素のUUID文字列など、JSONくくりなしの単体値も許容する。
      result.push(entry);
    }
  }
  return result;
}

/** JSONまたはOpenAPIで定義したmultipart/form-dataを社員入力へ変換する。 */
export async function parseEmployeeRequest(
  request: Request
): Promise<{ body: Record<string, unknown>; photo?: File }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const body: Record<string, unknown> = {};
    const scalarFields = [
      "loginId",
      "password",
      "lastName",
      "firstName",
      "email",
      "role",
      "departmentId",
      "locationId",
      "positionId",
      "seatId",
      "photoUrl",
      "selfPR",
      "hobbyInfo",
    ];

    for (const field of scalarFields) {
      const value = form.get(field);
      if (typeof value === "string") body[field] = value;
    }
    for (const field of arrayFields) {
      if (form.has(field)) body[field] = parseArrayField(form, field);
    }

    const photo = form.get("photo");
    if (typeof photo === "string") {
      if (photo.trim() === "") return { body };
      throw new EmployeeFormError("photoは画像ファイルで指定してください。");
    }
    if (photo !== null && !(photo instanceof File)) {
      throw new EmployeeFormError("photoは画像ファイルで指定してください。");
    }
    // 未選択時に空Fileを送るブラウザがあるため、size 0は「写真なし」とみなす。
    if (photo instanceof File && photo.size === 0) return { body };

    return { body, photo: photo instanceof File ? photo : undefined };
  }

  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error();
    }
    return { body: body as Record<string, unknown> };
  } catch {
    throw new EmployeeFormError("リクエストボディが不正です。");
  }
}
