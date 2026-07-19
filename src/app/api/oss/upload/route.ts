import { NextResponse } from "next/server";

// Same-origin proxy for the Tangbuy OSS upload gateway. Keeps the upstream detail server-side,
// avoids browser CORS, validates the file, and normalizes the response to { url }.
// Reusable primitive: any frontend scenario (AI chat attachments, manual sourcing image, etc.)
// can POST multipart/form-data with a `file` field to /api/oss/upload.

const UPLOAD_GATEWAY =
  process.env.TANGBUY_OSS_UPLOAD_URL ??
  "https://www.tangbuy.com/gateway/resource/common/oss/upload";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "请求体需为 multipart/form-data" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件字段 file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "仅支持图片文件" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "图片过大（上限 10MB）" },
      { status: 413 }
    );
  }

  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name || "upload");

  let upstream: Response;
  try {
    upstream = await fetch(UPLOAD_GATEWAY, {
      method: "POST",
      headers: { Referer: "https://admin.tangbuy.com/" },
      body: upstreamForm,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `上传网关不可达：${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 }
    );
  }

  const text = await upstream.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (!upstream.ok) {
    const msg =
      (body as { msg?: string; error?: string })?.msg ??
      (body as { error?: string })?.error ??
      `上传失败（${upstream.status}）`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Upstream returns the public URL in `data`.
  const url = (body as { data?: unknown })?.data;
  if (typeof url !== "string" || !url) {
    const msg =
      (body as { msg?: string })?.msg ?? "上传成功但未返回文件地址";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ url });
}
