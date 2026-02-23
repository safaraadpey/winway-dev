# متادیتا و پیش‌نمایش لینک برای هر صفحه

برای اینکه هر صفحه وقتی لینکش به اشتراک گذاشته می‌شود (واتساپ، تلگرام و…) **عنوان و توضیح اختصاصی** داشته باشد، دو روش داریم.

## روش ۱: صفحه Server Component است

اگر صفحه `"use client"` ندارد، مستقیم از همان فایل `page.tsx` می‌توانی `metadata` export کنی:

```tsx
// app/example/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "عنوان این صفحه | Dingmoney",
  description: "توضیح کوتاه مخصوص این صفحه.",
  openGraph: {
    title: "عنوان این صفحه | Dingmoney - بازی آنلاین و تورنومنت دبرنا",
    description: "توضیح کوتاه مخصوص این صفحه.",
  },
  twitter: {
    title: "عنوان این صفحه | Dingmoney",
    description: "توضیح کوتاه مخصوص این صفحه.",
  },
};

export default function ExamplePage() {
  return <div>...</div>;
}
```

## روش ۲: صفحه Client Component است (`"use client"`)

اگر صفحه از `"use client"` استفاده می‌کند، در همان مسیر یک **layout** با متادیتا اضافه کن. این layout باید **بدون** `"use client"` باشد (یعنی Server Component):

```tsx
// app/player/نام-صفحه/layout.tsx
import type { Metadata } from "next";

const siteOrigin =
  process.env.NEXT_PUBLIC_MAIN_ORIGIN || "https://dingmoney.org";

export const metadata: Metadata = {
  title: "عنوان صفحه | Dingmoney - بازی آنلاین و تورنومنت دبرنا",
  description: "یک خط توضیح برای پیش‌نمایش لینک.",
  openGraph: {
    title: "عنوان صفحه | Dingmoney - بازی آنلاین و تورنومنت دبرنا",
    description: "یک خط توضیح برای پیش‌نمایش لینک.",
    url: `${siteOrigin}/player/نام-صفحه`,
  },
  twitter: {
    title: "عنوان صفحه | Dingmoney",
    description: "یک خط توضیح برای پیش‌نمایش لینک.",
  },
};

export default function SegmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

- **عکس پیش‌نمایش**: اگر در این layout چیزی برای `openGraph.images` نذاری، همان عکس پیش‌فرض روت (`/ding_money_preview.jpg`) استفاده می‌شود.
- **آدرس صفحه**: برای `openGraph.url` از `siteOrigin` + مسیر همان صفحه استفاده کن (مثلاً `/player/tournaments`).

## نمونه در پروژه

- **صفحه تورنومنت‌ها**: `app/player/tournaments/layout.tsx` — عنوان و توضیح مخصوص لیست تورنومنت‌ها.

برای بقیه صفحات (home، wallet، قوانین، پشتیبانی و…) هم می‌توانی به همین شکل یک `layout.tsx` در مسیر همان صفحه بسازی و فقط `metadata` را عوض کنی.
