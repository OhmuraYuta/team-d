export class EmployeeFormError extends Error {}

const arrayFields = ["skills", "credentials", "experiences"] as const;

function parseArrayField(value: FormDataEntryValue | null, field: string): unknown[] {
  if (value === null) return [];
  if (typeof value !== "string") throw new EmployeeFormError(`${field}はJSON配列で指定してください。`);

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new EmployeeFormError(`${field}はJSON配列で指定してください。`);
  }
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
      if (form.has(field)) body[field] = parseArrayField(form.get(field), field);
    }

    const photo = form.get("photo");
    if (photo !== null && !(photo instanceof File)) {
      throw new EmployeeFormError("photoは画像ファイルで指定してください。");
    }

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
