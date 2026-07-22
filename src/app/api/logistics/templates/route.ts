import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { LogisticsTemplate, LogisticsTemplateUpsert } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

const STORAGE_DIR = path.join(process.cwd(), ".data", "logistics");

function getStoragePath(shopName: string): string {
  const safeName = shopName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(STORAGE_DIR, `${safeName}.json`);
}

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function getTemplatesFromStorage(shopName: string): LogisticsTemplate[] {
  try {
    ensureStorageDir();
    const filePath = getStoragePath(shopName);
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveTemplatesToStorage(shopName: string, templates: LogisticsTemplate[]): void {
  try {
    ensureStorageDir();
    const filePath = getStoragePath(shopName);
    fs.writeFileSync(filePath, JSON.stringify(templates, null, 2));
  } catch {
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopName = searchParams.get("shopName");

  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName 参数" }, { status: 400 });
  }

  const localTemplates = getTemplatesFromStorage(shopName);

  if (!API_BASE) {
    return NextResponse.json(localTemplates.length > 0 ? localTemplates : []);
  }

  try {
    const upstreamRes = await fetch(
      `${API_BASE}/api/plugin/logistics/template?shopName=${encodeURIComponent(shopName)}`
    );

    if (!upstreamRes.ok) {
      return NextResponse.json(localTemplates);
    }

    const upstreamTemplate = (await upstreamRes.json()) as LogisticsTemplate;

    if (!upstreamTemplate.id) {
      upstreamTemplate.id = "default";
    }
    if (!upstreamTemplate.name) {
      upstreamTemplate.name = "默认模板";
    }
    if (upstreamTemplate.isActive === undefined) {
      upstreamTemplate.isActive = true;
    }

    const hasDefault = localTemplates.some((t) => t.id === upstreamTemplate.id);
    if (!hasDefault) {
      const merged = [upstreamTemplate, ...localTemplates];
      saveTemplatesToStorage(shopName, merged);
      return NextResponse.json(merged);
    }

    return NextResponse.json(localTemplates);
  } catch {
    return NextResponse.json(localTemplates);
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopName = searchParams.get("shopName");

  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName 参数" }, { status: 400 });
  }

  const body = (await request.json()) as LogisticsTemplateUpsert & { id?: string };

  const now = new Date();
  const newTemplate: LogisticsTemplate = {
    id: `template_${Date.now()}`,
    shopName: body.shopName || shopName,
    name: body.name || `物流模板 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    packaging: body.packaging,
    speedPreference: body.speedPreference,
    markets: body.markets || [],
    isActive: true,
    updatedAt: now.toISOString(),
  };

  const templates = getTemplatesFromStorage(shopName);
  templates.unshift(newTemplate);
  saveTemplatesToStorage(shopName, templates);

  return NextResponse.json(newTemplate, { status: 201 });
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const shopName = searchParams.get("shopName");

  if (!shopName) {
    return NextResponse.json({ error: "缺少 shopName 参数" }, { status: 400 });
  }

  const body = (await request.json()) as LogisticsTemplateUpsert & { id?: string };

  if (!body.id) {
    return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
  }

  const templates = getTemplatesFromStorage(shopName);
  const index = templates.findIndex((t) => t.id === body.id);

  if (index === -1) {
    return NextResponse.json({ error: "模板不存在" }, { status: 404 });
  }

  templates[index] = {
    ...templates[index],
    ...body,
    shopName: body.shopName || shopName,
    isActive: true,
    updatedAt: new Date().toISOString(),
  };

  saveTemplatesToStorage(shopName, templates);

  return NextResponse.json(templates[index]);
}
