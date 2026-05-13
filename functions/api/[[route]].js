// MangaPlus — API Router
// by abdou oran hsai bounif
// functions/api/[[route]].js

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function err(msg, status = 400) {
  return json({ success: false, error: msg }, status);
}

function verifyAdmin(request, env) {
  const key = request.headers.get("X-Admin-Key");
  return key && key === env.ADMIN_KEY;
}

function generateId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// ══════════════════════════════════════════
// CACHE (KV) — فشل الكتابة لا يوقف النظام
// ══════════════════════════════════════════

const CACHE_TTL = 60 * 60 * 24; // 24h

async function cacheGet(env, key) {
  try {
    return await env.CACHE.get(key, { type: "json" });
  } catch {
    return null;
  }
}

async function cacheSet(env, key, value) {
  try {
    await env.CACHE.put(key, JSON.stringify(value), {
      expirationTtl: CACHE_TTL,
    });
  } catch {
    // KV limit reached — D1 هو المصدر الحقيقي
  }
}

async function cacheDel(env, key) {
  try { await env.CACHE.delete(key); } catch {}
}

// ══════════════════════════════════════════
// TELEGRAM
// ══════════════════════════════════════════

function encodeFileId(fileId) {
  return btoa(fileId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeFileId(encoded) {
  try {
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
}

async function uploadToTelegram(env, file, retry = 0) {
  const form = new FormData();
  form.append("chat_id", env.TG_CHAT_ID);
  form.append("document", file);

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendDocument`,
      { method: "POST", body: form }
    );
    const data = await res.json();
    if (data.ok) return { success: true, data };
    if (retry < 3) {
      await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
      return uploadToTelegram(env, file, retry + 1);
    }
    return { success: false, error: data.description || "Telegram error" };
  } catch (e) {
    if (retry < 3) {
      await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
      return uploadToTelegram(env, file, retry + 1);
    }
    return { success: false, error: "Network error" };
  }
}

function extractFileId(data) {
  const r = data?.result;
  if (!r) return null;
  if (Array.isArray(r.photo)) {
    return r.photo.reduce((a, b) => (a.file_size > b.file_size ? a : b)).file_id;
  }
  return r.document?.file_id || r.video?.file_id || null;
}

// ══════════════════════════════════════════
// ROUTES — MANGA
// ══════════════════════════════════════════

async function handleManga(request, env) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const method = request.method;

  // OPTIONS
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // GET /api/manga?id=xxx — single
  if (method === "GET" && id) {
    const cacheKey = `manga:${id}`;
    const cached = await cacheGet(env, cacheKey);
    if (cached) return json(cached);

    const manga = await env.DB
      .prepare("SELECT * FROM manga WHERE id = ?")
      .bind(id).first();
    if (!manga) return err("Manga not found", 404);

    const chapters = await env.DB
      .prepare("SELECT id, number, title, title_ar, created_at FROM chapters WHERE manga_id = ? ORDER BY number ASC")
      .bind(id).all();

    const result = { ...manga, chapters: chapters.results };
    await cacheSet(env, cacheKey, result);
    return json(result);
  }

  // GET /api/manga — list
  if (method === "GET") {
    const cached = await cacheGet(env, "manga:list");
    if (cached) return json(cached);

    const list = await env.DB
      .prepare("SELECT id, title, title_ar, cover, status, created_at FROM manga ORDER BY created_at DESC")
      .all();

    await cacheSet(env, "manga:list", list.results);
    return json(list.results);
  }

  // POST /api/manga — create
  if (method === "POST") {
    if (!verifyAdmin(request, env)) return err("Unauthorized", 401);

    const body = await request.json();
    const { title, title_ar, description, description_ar, cover, status } = body;
    if (!title) return err("Title is required");

    const id2 = generateId();
    await env.DB.prepare(
      "INSERT INTO manga (id, title, title_ar, description, description_ar, cover, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id2, title, title_ar || null, description || null, description_ar || null, cover || null, status || "ongoing").run();

    await cacheDel(env, "manga:list");
    return json({ success: true, id: id2 });
  }

  // DELETE /api/manga?id=xxx
  if (method === "DELETE") {
    if (!verifyAdmin(request, env)) return err("Unauthorized", 401);
    if (!id) return err("ID required");

    await env.DB.prepare("DELETE FROM manga WHERE id = ?").bind(id).run();
    await cacheDel(env, `manga:${id}`);
    await cacheDel(env, "manga:list");
    return json({ success: true });
  }

  return err("Method not allowed", 405);
}

// ══════════════════════════════════════════
// ROUTES — CHAPTERS
// ══════════════════════════════════════════

async function handleChapters(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const mangaId = url.searchParams.get("manga_id");
  const chapterNum = url.searchParams.get("chapter");
  const id = url.searchParams.get("id");

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // GET فصل واحد مع صوره
  if (method === "GET" && mangaId && chapterNum) {
    const cacheKey = `chapter:${mangaId}:${chapterNum}`;
    const cached = await cacheGet(env, cacheKey);
    if (cached) return json(cached);

    const chapter = await env.DB
      .prepare("SELECT * FROM chapters WHERE manga_id = ? AND number = ?")
      .bind(mangaId, parseFloat(chapterNum)).first();
    if (!chapter) return err("Chapter not found", 404);

    const images = await env.DB
      .prepare("SELECT id, url, order_num FROM images WHERE chapter_id = ? ORDER BY order_num ASC")
      .bind(chapter.id).all();

    const result = { ...chapter, images: images.results };
    await cacheSet(env, cacheKey, result);
    return json(result);
  }

  // GET قائمة فصول
  if (method === "GET" && mangaId) {
    const cacheKey = `chapters:${mangaId}`;
    const cached = await cacheGet(env, cacheKey);
    if (cached) return json(cached);

    const chapters = await env.DB
      .prepare("SELECT id, number, title, title_ar, created_at FROM chapters WHERE manga_id = ? ORDER BY number ASC")
      .bind(mangaId).all();

    await cacheSet(env, cacheKey, chapters.results);
    return json(chapters.results);
  }

  // POST إنشاء فصل
  if (method === "POST") {
    if (!verifyAdmin(request, env)) return err("Unauthorized", 401);

    const body = await request.json();
    const { manga_id, number, title, title_ar, images } = body;
    if (!manga_id || number === undefined || !images?.length) {
      return err("manga_id, number and images required");
    }

    const chapterId = generateId();
    await env.DB.prepare(
      "INSERT INTO chapters (id, manga_id, number, title, title_ar) VALUES (?, ?, ?, ?, ?)"
    ).bind(chapterId, manga_id, number, title || null, title_ar || null).run();

    // batch insert images
    const stmts = images.map((img, i) =>
      env.DB.prepare(
        "INSERT INTO images (id, chapter_id, file_id, order_num, url) VALUES (?, ?, ?, ?, ?)"
      ).bind(generateId(), chapterId, img.file_id, i + 1, img.url)
    );
    await env.DB.batch(stmts);

    await cacheDel(env, `chapters:${manga_id}`);
    await cacheDel(env, `manga:${manga_id}`);
    await cacheDel(env, `chapter:${manga_id}:${number}`);

    return json({ success: true, id: chapterId });
  }

  // DELETE فصل
  if (method === "DELETE") {
    if (!verifyAdmin(request, env)) return err("Unauthorized", 401);
    if (!id) return err("ID required");

    const chapter = await env.DB
      .prepare("SELECT * FROM chapters WHERE id = ?")
      .bind(id).first();
    if (!chapter) return err("Chapter not found", 404);

    await env.DB.prepare("DELETE FROM chapters WHERE id = ?").bind(id).run();
    await cacheDel(env, `chapters:${chapter.manga_id}`);
    await cacheDel(env, `manga:${chapter.manga_id}`);
    await cacheDel(env, `chapter:${chapter.manga_id}:${chapter.number}`);

    return json({ success: true });
  }

  return err("Method not allowed", 405);
}

// ══════════════════════════════════════════
// ROUTES — UPLOAD
// ══════════════════════════════════════════

async function handleUpload(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "POST") return err("Method not allowed", 405);
  if (!verifyAdmin(request, env)) return err("Unauthorized", 401);

  const MAX_SIZE = 20 * 1024 * 1024;
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const origin = new URL(request.url).origin;

  try {
    const formData = await request.formData();
    const files = formData.getAll("files");
    if (!files.length) return err("No files uploaded");

    const uploaded = [];
    const errors = [];

    for (const file of files) {
      if (typeof file === "string") continue;
      if (file.size > MAX_SIZE) {
        errors.push({ name: file.name, error: "Exceeds 20MB" });
        continue;
      }
      if (!ALLOWED.includes(file.type)) {
        errors.push({ name: file.name, error: "Invalid type" });
        continue;
      }

      const result = await uploadToTelegram(env, file);
      if (!result.success) {
        errors.push({ name: file.name, error: result.error });
        continue;
      }

      const fileId = extractFileId(result.data);
      if (!fileId) {
        errors.push({ name: file.name, error: "No file_id" });
        continue;
      }

      const encodedId = encodeFileId(fileId);
      const url = `${origin}/file/${encodedId}`;

      uploaded.push({ name: file.name, file_id: fileId, url, size: file.size });
    }

    return json({ success: true, uploaded, errors });
  } catch (e) {
    return err("Server error: " + e.message, 500);
  }
}

// ══════════════════════════════════════════
// MAIN ROUTER
// ══════════════════════════════════════════

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (path.startsWith("/api/manga")) return handleManga(request, env);
  if (path.startsWith("/api/chapters")) return handleChapters(request, env);
  if (path.startsWith("/api/upload")) return handleUpload(request, env);

  return err("Not found", 404);
}
