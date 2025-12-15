## fn_join_or_create_room – راهنمای استفاده در فرانت

این تابع یک **RPC در Supabase** است که:

- اگر روم `waiting` بر اساس یک `room_template` موجود باشد، شما را به همان روم متصل می‌کند و برایتان کارت رزرو می‌کند.
- اگر وجود نداشته باشد، **یک روم جدید از روی همان template می‌سازد** و سپس کارت‌ها را رزرو می‌کند.

خروجی تابع:

- `room_id :: uuid` – شناسه روم نهایی
- `starts_at :: timestamptz` – زمان شروع روم
- `ticket_ids :: uuid[]` – آرایه‌ی شناسه‌ بلیت‌های `reserved` برای این کاربر

### امضاهای موجود در دیتابیس

در حال حاضر دو نسخه از تابع وجود دارد:

1. `fn_join_or_create_room(p_template_id uuid, p_card_count integer)`
2. `fn_join_or_create_room(p_template_id uuid, p_card_count integer, p_password text)`

در فرانت پیشنهاد می‌شود **همیشه نسخه‌ی سوم پارامتری** را صدا بزنید و اگر روم پسورد نداشت، مقدار `null` بفرستید.

### منطق پسورد

- اگر در `room_templates.password` برای آن template مقدار **ست شده باشد**:
  - پارامتر `p_password` باید با آن مقدار **دقیقاً یکسان** باشد.
  - در غیر این صورت تابع خطا می‌دهد: `invalid room password`.
- اگر `room_templates.password IS NULL`:
  - اتاق **بدون پسورد** محسوب می‌شود و مقدار `p_password` نادیده گرفته می‌شود (می‌توانید `null` بفرستید).

### منطق سقف کارت‌ها (`max_cards_per_player`)

- مقدار `max_cards_per_player` فقط از `room_templates.max_cards_per_player` خوانده می‌شود (snapshsot هنگام ساخت روم).
- اگر تعداد کارت‌های `reserved`+`paid` این کاربر در همان روم + `p_card_count` از این سقف بیشتر شود:
  - تابع خطا می‌دهد: `max_cards_per_player exceeded`.

### مثال استفاده در Next.js / TypeScript

```ts
import { supabase } from "@/lib/supabaseClient";

type JoinOrCreateResult = {
  room_id: string;
  starts_at: string | null;
  ticket_ids: string[];
};

export async function joinOrCreateRoom(options: {
  templateId: string;
  cardCount: number;
  password?: string; // اختیاری
}): Promise<JoinOrCreateResult> {
  const { templateId, cardCount, password } = options;

  const { data, error } = await supabase
    .rpc("fn_join_or_create_room", {
      p_template_id: templateId,
      p_card_count: cardCount,
      // اگر پسورد نداریم، null بفرستیم
      p_password: password ?? null,
    });

  if (error) {
    // هندل خطاهای شایع
    if (error.message.includes("invalid room password")) {
      throw new Error("رمز اتاق اشتباه است");
    }
    if (error.message.includes("max_cards_per_player exceeded")) {
      throw new Error("سقف تعداد کارت برای این اتاق را رد کرده‌اید");
    }
    if (error.message.includes("no active card pool")) {
      throw new Error("هیچ card pool فعالی برای ایجاد اتاق موجود نیست");
    }
    throw error;
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error("no data returned from fn_join_or_create_room");
  }

  // چون تابع به صورت TABLE برمی‌گرداند، Supabase نتیجه را به صورت آرایه می‌دهد
  const row = data[0] as JoinOrCreateResult;
  return row;
}
```

### ادغام با `app/player/lobby/page.tsx`

در هندل کلیک روی یک تمپلیت (جایی که TODO گذاشته شده بود)، می‌توانید این تابع را صدا بزنید:

```ts
// pseudo-code برای handleRoomClick
const handleRoomClick = async (templateId: string, password?: string) => {
  try {
    const { room_id } = await joinOrCreateRoom({
      templateId,
      cardCount: 1,      // یا هر تعداد کارت مورد نیاز
      password,          // اگر اتاق خصوصی است
    });

    router.push(`/player/gameroom?roomId=${room_id}`);
  } catch (err: any) {
    console.error(err);
    toast.error(err.message || "خطا در ورود به اتاق");
  }
};
```

نکته‌ها:

- `auth.uid()` داخل فانکشن از سشن فعلی Supabase استفاده می‌کند؛ پس کاربر باید لاگین کرده باشد.
- این RPC همزمان:
  - روم `waiting` مناسب را پیدا یا بسازد،
  - کارت‌های آزاد را به شکل `reserved` برای کاربر ایجاد کند،
  - و `room_id` + `ticket_ids` را برگرداند.


