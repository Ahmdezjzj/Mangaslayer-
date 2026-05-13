// MangaPlus — File Proxy
// by abdou oran hsai bounif
// functions/file/[id].js

function decodeFileId(encoded) {
  try {
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const encoded = params.id;
  if (!encoded) return new Response("Not found", { status: 404 });

  const fileId = decodeFileId(encoded);
  if (!fileId) return new Response("Invalid ID", { status: 400 });

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const data = await res.json();
    if (!data.ok) return new Response("File not found", { status: 404 });

    const fileUrl = `https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${data.result.file_path}`;

    // redirect مباشر لـ Telegram CDN — بدون proxy
    return Response.redirect(fileUrl, 302);
  } catch {
    return new Response("Error", { status: 500 });
  }
}
