import { NextRequest, NextResponse } from "next/server";

// В Docker: backend доступен по имени сервиса "backend" на порту 7070
// Локально: используем переменную окружения или localhost:7272
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:7070";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, params);
}

async function proxyRequest(
  request: NextRequest,
  paramsPromise: Promise<{ path: string[] }>
) {
  const { path } = await paramsPromise;
  const targetPath = path.join("/");
  const url = `${BACKEND_URL}/api/${targetPath}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Пропускаем заголовки, которые не нужно передавать
    if (!["host", "connection", "content-length"].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  try {
    let body: BodyInit | undefined;
    const contentType = request.headers.get("content-type");

    if (["POST", "PUT", "PATCH"].includes(request.method)) {
      if (contentType?.includes("multipart/form-data")) {
        body = await request.formData();
      } else if (contentType?.includes("application/json")) {
        body = await request.text();
      } else {
        body = await request.arrayBuffer();
      }
    }

    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
    });

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    const responseBody = await response.arrayBuffer();

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Backend unavailable", details: String(error) },
      { status: 502 }
    );
  }
}
