import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { LogisticsTemplate } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_DIR = path.join(process.cwd(), ".data", "logistics");

function getStoragePath(shopName: string): string {
  const safeName = shopName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(STORAGE_DIR, `${safeName}.json`);
}

function getTemplatesFromStorage(shopName: string): LogisticsTemplate[] {
  try {
    const filePath = getStoragePath(shopName);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as LogisticsTemplate[];
  } catch {
    return [];
  }
}

function saveTemplatesToStorage(shopName: string, templates: LogisticsTemplate[]): void {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(getStoragePath(shopName), JSON.stringify(templates, null, 2));
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url);
  const shopName = searchParams.get("shopName");
  const { id } = await context.params;

  if (!shopName || !id) {
    return NextResponse.json({ error: "缺少 shopName 或 id 参数" }, { status: 400 });
  }

  const templates = getTemplatesFromStorage(shopName);
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) {
    return NextResponse.json({ error: "模板不存在" }, { status: 404 });
  }

  saveTemplatesToStorage(shopName, filtered);
  return NextResponse.json({ success: true });
}
