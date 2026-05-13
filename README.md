# MangaPlus
**by abdou oran hsai bounif**

نظام استضافة فصول المانهوا على Cloudflare Pages + Telegram + D1

---

## المميزات
- ✅ رفع صور الفصول إلى Telegram (مجاني بلا حدود)
- ✅ D1 لحفظ الـ metadata (100,000 كتابة/يوم)
- ✅ KV كـ cache سريع للقراءة (يكتب مرة واحدة/فصل فقط)
- ✅ API كامل لموقعك
- ✅ لوحة إدارة عربي/إنجليزي
- ✅ روابط مباشرة من Telegram CDN (بدون proxy)
- ✅ نشر يدوي عبر GitHub

---

## خطوات الإعداد

### 1. إنشاء Telegram Bot
1. افتح @BotFather على Telegram
2. أرسل `/newbot` واتبع التعليمات
3. احفظ **Bot Token**
4. أنشئ قناة خاصة وأضف البوت كـ admin
5. احصل على **Chat ID** القناة (ابحث: how to get telegram channel id)

### 2. إنشاء D1 Database
1. افتح Cloudflare Dashboard
2. اذهب إلى **Storage & Databases → D1**
3. أنشئ قاعدة بيانات باسم `mangaplus`
4. احفظ الـ **Database ID**
5. انسخ محتوى `schema.sql` وشغّله في D1 Console

### 3. إنشاء KV Namespace
1. اذهب إلى **Workers & Pages → KV**
2. أنشئ namespace باسم `CACHE`
3. احفظ الـ **Namespace ID**

### 4. تحديث wrangler.toml
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "KV_ID_هنا"

[[d1_databases]]
binding = "DB"
database_name = "mangaplus"
database_id = "D1_ID_هنا"
```

### 5. النشر على Cloudflare Pages
1. ارفع الملفات على GitHub
2. افتح Cloudflare Pages → Create Project
3. اربطه بـ GitHub repository
4. في **Environment Variables** أضف:

| المتغير | القيمة |
|---------|--------|
| `TG_BOT_TOKEN` | توكن البوت |
| `TG_CHAT_ID` | ID القناة |
| `ADMIN_KEY` | كلمة سر من اختيارك |

5. اضغط Deploy ✅

---

## استخدام API من موقعك

```javascript
// جلب قائمة المانهوا
const manga = await fetch('https://yoursite.pages.dev/api/manga').then(r => r.json());

// جلب فصل مع صوره
const chapter = await fetch(
  'https://yoursite.pages.dev/api/chapters?manga_id=abc123&chapter=1'
).then(r => r.json());

// الصور جاهزة للعرض مباشرة
chapter.images.forEach(img => {
  console.log(img.url); // رابط مباشر من Telegram CDN
});
```

---

## هيكل المشروع
```
mangaplus/
├── functions/
│   ├── _middleware.js       ← CORS
│   ├── api/
│   │   ├── manga.js         ← CRUD المانهوا
│   │   ├── chapters.js      ← CRUD الفصول
│   │   └── upload.js        ← رفع الصور
│   ├── file/
│   │   └── [id].js          ← عرض الصور
│   └── utils/
│       ├── telegram.js      ← Telegram Bot API
│       ├── cache.js         ← KV cache
│       └── helpers.js       ← Auth + helpers
├── admin.html               ← لوحة الإدارة
├── index.html               ← صفحة API
├── schema.sql               ← D1 schema
├── wrangler.toml            ← إعدادات Cloudflare
└── package.json
```

---

## حدود الاستخدام المجاني

| الخدمة | الحد |
|--------|------|
| Telegram | ♾️ لا حد |
| D1 كتابة | 100,000/يوم |
| D1 قراءة | 5,000,000/يوم |
| KV كتابة | نادراً (مرة/فصل) |
| KV قراءة | 100,000/يوم |
| Workers | 100,000/يوم |

---

*MangaPlus v1.0.0 — by abdou oran hsai bounif*
