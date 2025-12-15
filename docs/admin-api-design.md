# طراحی Admin API - فاز دوم سخت‌سازی

**تاریخ ایجاد:** 2025-01-27  
**هدف:** طراحی API routes برای عملیات بسیار حساس ادمین  
**مرجع:** `docs/admin-control-plane-ops.md`

---

## 1. طراحی API Routes برای عملیات بسیار حساس

### 1.1. تغییر نقش کاربر (`changeUserRole`)

#### a) مسیر پیشنهادی API

```
POST /api/admin/users/set-role
```

#### b) Body نمونه

```json
{
  "user_id": "uuid-of-target-user",
  "new_role": "agent",
  "admin_sub_role": null
}
```

**نکات:**
- `user_id`: شناسه کاربر هدف (required)
- `new_role`: یکی از `"player"`, `"agent"`, `"super"`, `"admin"` (required)
- `admin_sub_role`: فقط اگر `new_role = "admin"` باشد، می‌تواند `"manager"` (null), `"finance"`, `"support"`, `"room"` باشد (optional)

#### c) چک‌های لازم در سرور (Server-side Validation)

1. **Authentication:**
   - کاربر باید لاگین باشد (session معتبر)
   - Authorization header باید شامل Bearer token باشد

2. **Authorization:**
   - فقط Admin می‌تواند نقش را به Super یا Admin تبدیل کند
   - Super فقط می‌تواند Player را به Agent تبدیل کند
   - Agent فقط می‌تواند Player را به Agent تبدیل کند
   - Player نمی‌تواند نقش کسی را تغییر دهد

3. **Business Rules:**
   - تنزل نقش ممنوع است:
     - Super نمی‌تواند به Agent یا Player تبدیل شود
     - Agent نمی‌تواند به Player تبدیل شود
     - Admin نمی‌تواند نقش دیگری داشته باشد
   - اگر `new_role = "admin"` باشد:
     - فقط Admin (با هر sub-role) می‌تواند این کار را انجام دهد
     - `admin_sub_role` باید یکی از مقادیر مجاز باشد یا `null` (مدیر کل)
   - `user_id` باید معتبر باشد (کاربر وجود داشته باشد)
   - کاربر هدف نباید خود کاربر فعلی باشد (اختیاری - برای جلوگیری از lockout)

4. **Data Validation:**
   - `user_id` باید UUID معتبر باشد
   - `new_role` باید یکی از enumهای مجاز باشد
   - `admin_sub_role` باید null یا یکی از مقادیر مجاز باشد (اگر new_role = admin)

#### d) انواع خطاهایی که باید برگردانده شوند

| کد HTTP | Error Code | توضیح |
|---------|------------|-------|
| 401 | `unauthorized` | Session نامعتبر یا missing |
| 403 | `forbidden` | کاربر مجاز به تغییر نقش نیست |
| 400 | `invalid_payload` | Body نامعتبر (مثلاً user_id missing) |
| 400 | `validation_error` | Validation rule نقض شده (مثلاً تنزل نقش) |
| 404 | `user_not_found` | کاربر هدف پیدا نشد |
| 500 | `database_error` | خطای دیتابیس |
| 500 | `unexpected_error` | خطای غیرمنتظره |

#### e) منطق کلی عمل (Pseudo-code)

```typescript
async function POST(request: Request) {
  try {
    // 1. استخراج session از Authorization header
    const authHeader = request.headers.get('authorization')
    const currentUser = await getUserFromRequest(authHeader)
    if (!currentUser) {
      return 401, { error: 'unauthorized' }
    }

    // 2. بررسی role کاربر فعلی
    const adminInfo = await verifyAdminAccess(currentUser.id)
    if (!adminInfo) {
      return 403, { error: 'forbidden' }
    }

    // 3. خواندن body
    const body = await request.json()
    const { user_id, new_role, admin_sub_role } = body

    // 4. Validation اولیه
    if (!user_id || !new_role) {
      return 400, { error: 'invalid_payload', message: 'user_id and new_role are required' }
    }

    // 5. بررسی وجود کاربر هدف
    const targetUser = await supabaseServer
      .from('users')
      .select('id, role, parent_id')
      .eq('id', user_id)
      .single()
    
    if (!targetUser || targetUser.error) {
      return 404, { error: 'user_not_found' }
    }

    // 6. بررسی قوانین دسترسی (authorization)
    const currentRole = adminInfo.user.role
    const targetRole = targetUser.data.role

    // فقط Admin می‌تواند نقش را به Super یا Admin تبدیل کند
    if ((new_role === 'super' || new_role === 'admin') && currentRole !== 'admin') {
      return 403, { error: 'forbidden', message: 'only admin can promote to super or admin' }
    }

    // Super فقط می‌تواند Player را به Agent تبدیل کند
    if (currentRole === 'super') {
      if (targetRole !== 'player' || new_role !== 'agent') {
        return 403, { error: 'forbidden', message: 'super can only convert player to agent' }
      }
    }

    // Agent فقط می‌تواند Player را به Agent تبدیل کند
    if (currentRole === 'agent') {
      if (targetRole !== 'player' || new_role !== 'agent') {
        return 403, { error: 'forbidden', message: 'agent can only convert player to agent' }
      }
    }

    // 7. بررسی قوانین business (جلوگیری از تنزل نقش)
    if (targetRole === 'super' && new_role !== 'super') {
      return 400, { error: 'validation_error', message: 'cannot demote super' }
    }
    if (targetRole === 'agent' && new_role === 'player') {
      return 400, { error: 'validation_error', message: 'cannot demote agent to player' }
    }
    if (targetRole === 'admin') {
      return 400, { error: 'validation_error', message: 'cannot change admin role' }
    }

    // 8. آماده‌سازی update data
    const updateData: any = {
      role: new_role,
      parent_id: targetUser.data.parent_id, // حفظ parent_id
    }

    if (new_role === 'admin') {
      // manager = null در دیتابیس
      updateData.admin_sub_role = admin_sub_role === 'manager' || admin_sub_role === null 
        ? null 
        : admin_sub_role
    } else {
      updateData.admin_sub_role = null
    }

    // 9. انجام transaction (update users + manage user_commissions)
    // استفاده از transaction برای اتمیک بودن
    const { error: updateError } = await supabaseServer
      .from('users')
      .update(updateData)
      .eq('id', user_id)

    if (updateError) {
      return 500, { error: 'database_error', message: updateError.message }
    }

    // 10. مدیریت user_commissions بر اساس نقش جدید
    // (اگر new_role = agent: super_commission = null, agent_commission حفظ یا null)
    // (اگر new_role = super: agent_commission = null, super_commission حفظ یا null)
    // (اگر new_role = player: هر دو null)
    const commissionUpdateData: any = { user_id }
    if (new_role === 'agent') {
      commissionUpdateData.super_commission = null
      // agent_commission را حفظ می‌کنیم اگر وجود داشته باشد
    } else if (new_role === 'super') {
      commissionUpdateData.agent_commission = null
      // super_commission را حفظ می‌کنیم اگر وجود داشته باشد
    } else if (new_role === 'player') {
      commissionUpdateData.agent_commission = null
      commissionUpdateData.super_commission = null
    }

    if (new_role === 'agent' || new_role === 'super' || new_role === 'player') {
      await supabaseServer
        .from('user_commissions')
        .upsert(commissionUpdateData, { onConflict: 'user_id' })
    }

    // 11. ثبت در audit log (اختیاری - اگر جدول admin_audit_log وجود دارد)
    // await logAdminAction(currentUser.id, 'change_user_role', { user_id, new_role, admin_sub_role })

    // 12. برگرداندن نتیجه موفق
    return 200, { 
      success: true, 
      message: 'نقش کاربر با موفقیت تغییر کرد',
      data: { user_id, new_role, admin_sub_role: updateData.admin_sub_role }
    }
  } catch (err) {
    console.error('POST /api/admin/users/set-role error:', err)
    return 500, { error: 'unexpected_error', message: err.message }
  }
}
```

---

### 1.2. تغییر sub-role مدیر (`changeAdminSubRole`)

#### a) مسیر پیشنهادی API

```
POST /api/admin/admins/set-sub-role
```

#### b) Body نمونه

```json
{
  "admin_id": "uuid-of-admin-user",
  "new_sub_role": "finance"
}
```

**نکات:**
- `admin_id`: شناسه مدیر هدف (required)
- `new_sub_role`: `null` (مدیر کل), `"finance"`, `"support"`, `"room"` (required)

#### c) چک‌های لازم در سرور

1. **Authentication:**
   - کاربر باید لاگین باشد

2. **Authorization:**
   - فقط مدیر کل (`admin_sub_role = null`) می‌تواند این تغییر را انجام دهد
   - کاربر فعلی باید `role = "admin"` و `admin_sub_role = null` باشد

3. **Business Rules:**
   - `admin_id` باید معتبر باشد
   - کاربر هدف باید `role = "admin"` باشد
   - `new_sub_role` باید یکی از مقادیر مجاز باشد

#### d) انواع خطاها

| کد HTTP | Error Code | توضیح |
|---------|------------|-------|
| 401 | `unauthorized` | Session نامعتبر |
| 403 | `forbidden` | فقط مدیر کل می‌تواند sub-role را تغییر دهد |
| 400 | `invalid_payload` | Body نامعتبر |
| 404 | `admin_not_found` | مدیر هدف پیدا نشد یا admin نیست |
| 500 | `database_error` | خطای دیتابیس |

#### e) منطق کلی عمل

```typescript
async function POST(request: Request) {
  try {
    // 1. استخراج session
    const currentUser = await getUserFromRequest(request.headers.get('authorization'))
    if (!currentUser) return 401, { error: 'unauthorized' }

    // 2. بررسی مدیر کل بودن
    const isManager = await verifyManagerAccess(currentUser.id)
    if (!isManager) {
      return 403, { error: 'forbidden', message: 'only manager can change admin sub-role' }
    }

    // 3. خواندن body
    const { admin_id, new_sub_role } = await request.json()
    if (!admin_id || new_sub_role === undefined) {
      return 400, { error: 'invalid_payload' }
    }

    // 4. بررسی وجود و role مدیر هدف
    const targetAdmin = await supabaseServer
      .from('users')
      .select('id, role')
      .eq('id', admin_id)
      .eq('role', 'admin')
      .single()

    if (!targetAdmin || targetAdmin.error) {
      return 404, { error: 'admin_not_found' }
    }

    // 5. Validation new_sub_role
    const validSubRoles = [null, 'finance', 'support', 'room']
    if (!validSubRoles.includes(new_sub_role)) {
      return 400, { error: 'validation_error', message: 'invalid sub_role' }
    }

    // 6. Update admin_sub_role
    const { error: updateError } = await supabaseServer
      .from('users')
      .update({ admin_sub_role: new_sub_role })
      .eq('id', admin_id)
      .eq('role', 'admin')

    if (updateError) {
      return 500, { error: 'database_error', message: updateError.message }
    }

    // 7. Audit log (اختیاری)
    // await logAdminAction(currentUser.id, 'change_admin_sub_role', { admin_id, new_sub_role })

    return 200, { success: true, message: 'نقش مدیر با موفقیت تغییر کرد' }
  } catch (err) {
    return 500, { error: 'unexpected_error', message: err.message }
  }
}
```

---

### 1.3. به‌روزرسانی دسترسی‌های مدیر (`updateAdminPermissions`)

#### a) مسیر پیشنهادی API

```
POST /api/admin/admins/set-permissions
```

#### b) Body نمونه

```json
{
  "admin_id": "uuid-of-admin-user",
  "permissions": {
    "rooms": true,
    "users": true,
    "transactions": false,
    "entry_banner": true,
    "admins": false
  }
}
```

**نکات:**
- `admin_id`: شناسه مدیر هدف (required)
- `permissions`: object با کلیدهای `rooms`, `users`, `transactions`, `entry_banner`, `admins` (required)
- هر کلید باید boolean باشد

#### c) چک‌های لازم در سرور

1. **Authentication:**
   - کاربر باید لاگین باشد

2. **Authorization:**
   - فقط مدیر کل می‌تواند permissions را تغییر دهد

3. **Business Rules:**
   - `admin_id` باید معتبر باشد و `role = "admin"` باشد
   - تمام کلیدهای permissions باید boolean باشند
   - کلیدهای مجاز: `rooms`, `users`, `transactions`, `entry_banner`, `admins`

#### d) انواع خطاها

| کد HTTP | Error Code | توضیح |
|---------|------------|-------|
| 401 | `unauthorized` | Session نامعتبر |
| 403 | `forbidden` | فقط مدیر کل می‌تواند permissions را تغییر دهد |
| 400 | `invalid_payload` | Body نامعتبر |
| 400 | `validation_error` | permissions نامعتبر |
| 404 | `admin_not_found` | مدیر هدف پیدا نشد |
| 500 | `database_error` | خطای دیتابیس |

#### e) منطق کلی عمل

```typescript
async function POST(request: Request) {
  try {
    // 1. استخراج session و بررسی مدیر کل
    const currentUser = await getUserFromRequest(request.headers.get('authorization'))
    if (!currentUser) return 401, { error: 'unauthorized' }

    const isManager = await verifyManagerAccess(currentUser.id)
    if (!isManager) {
      return 403, { error: 'forbidden', message: 'only manager can change permissions' }
    }

    // 2. خواندن body
    const { admin_id, permissions } = await request.json()
    if (!admin_id || !permissions) {
      return 400, { error: 'invalid_payload' }
    }

    // 3. Validation permissions
    const validKeys = ['rooms', 'users', 'transactions', 'entry_banner', 'admins']
    for (const key of Object.keys(permissions)) {
      if (!validKeys.includes(key)) {
        return 400, { error: 'validation_error', message: `invalid permission key: ${key}` }
      }
      if (typeof permissions[key] !== 'boolean') {
        return 400, { error: 'validation_error', message: `permission ${key} must be boolean` }
      }
    }

    // 4. بررسی وجود مدیر
    const targetAdmin = await supabaseServer
      .from('users')
      .select('id, role')
      .eq('id', admin_id)
      .eq('role', 'admin')
      .single()

    if (!targetAdmin || targetAdmin.error) {
      return 404, { error: 'admin_not_found' }
    }

    // 5. حذف permissions قدیمی
    const { error: deleteError } = await supabaseServer
      .from('admin_permissions')
      .delete()
      .eq('admin_id', admin_id)
      .in('permission_key', validKeys)

    if (deleteError) {
      return 500, { error: 'database_error', message: deleteError.message }
    }

    // 6. اضافه کردن permissions جدید
    const permissionRecords = Object.entries(permissions).map(([key, granted]) => ({
      admin_id,
      permission_key: key,
      granted: granted as boolean,
    }))

    if (permissionRecords.length > 0) {
      const { error: insertError } = await supabaseServer
        .from('admin_permissions')
        .insert(permissionRecords)

      if (insertError) {
        return 500, { error: 'database_error', message: insertError.message }
      }
    }

    // 7. Audit log
    // await logAdminAction(currentUser.id, 'update_admin_permissions', { admin_id, permissions })

    return 200, { success: true, message: 'دسترسی‌های مدیر با موفقیت به‌روزرسانی شد' }
  } catch (err) {
    return 500, { error: 'unexpected_error', message: err.message }
  }
}
```

---

### 1.4. ذخیره درصد کمیسیون (`saveUserCommission`)

#### a) مسیر پیشنهادی API

```
POST /api/admin/users/set-commission
```

#### b) Body نمونه

```json
{
  "user_id": "uuid-of-user",
  "commission_percent": 15
}
```

**نکات:**
- `user_id`: شناسه کاربر (required)
- `commission_percent`: درصد کمیسیون (0-100) (required)

#### c) چک‌های لازم در سرور

1. **Authentication:**
   - کاربر باید لاگین باشد

2. **Authorization:**
   - فقط Admin, Super, Agent می‌توانند کمیسیون را تنظیم کنند
   - کاربر هدف باید `role = "agent"` یا `role = "super"` باشد

3. **Business Rules:**
   - `commission_percent` باید بین 0 تا 100 باشد
   - `user_id` باید معتبر باشد
   - کاربر هدف باید agent یا super باشد

#### d) انواع خطاها

| کد HTTP | Error Code | توضیح |
|---------|------------|-------|
| 401 | `unauthorized` | Session نامعتبر |
| 403 | `forbidden` | کاربر مجاز به تنظیم کمیسیون نیست |
| 400 | `invalid_payload` | Body نامعتبر |
| 400 | `validation_error` | commission_percent خارج از محدوده یا کاربر agent/super نیست |
| 404 | `user_not_found` | کاربر پیدا نشد |
| 500 | `database_error` | خطای دیتابیس |

#### e) منطق کلی عمل

```typescript
async function POST(request: Request) {
  try {
    // 1. استخراج session
    const currentUser = await getUserFromRequest(request.headers.get('authorization'))
    if (!currentUser) return 401, { error: 'unauthorized' }

    // 2. بررسی role (admin, super, agent)
    const adminInfo = await verifyAdminAccess(currentUser.id)
    if (!adminInfo) {
      return 403, { error: 'forbidden' }
    }

    const allowedRoles = ['admin', 'super', 'agent']
    if (!allowedRoles.includes(adminInfo.user.role)) {
      return 403, { error: 'forbidden', message: 'insufficient permissions' }
    }

    // 3. خواندن body
    const { user_id, commission_percent } = await request.json()
    if (!user_id || commission_percent === undefined) {
      return 400, { error: 'invalid_payload' }
    }

    // 4. Validation commission_percent
    if (typeof commission_percent !== 'number' || commission_percent < 0 || commission_percent > 100) {
      return 400, { error: 'validation_error', message: 'commission_percent must be between 0 and 100' }
    }

    // 5. بررسی وجود و role کاربر هدف
    const targetUser = await supabaseServer
      .from('users')
      .select('id, role')
      .eq('id', user_id)
      .single()

    if (!targetUser || targetUser.error) {
      return 404, { error: 'user_not_found' }
    }

    const targetRole = targetUser.data.role
    if (targetRole !== 'agent' && targetRole !== 'super') {
      return 400, { error: 'validation_error', message: 'commission can only be set for agent or super' }
    }

    // 6. تبدیل درصد به اعشار (0-1)
    const commissionDecimal = commission_percent / 100

    // 7. Upsert user_commissions
    const updateData: any = { user_id }
    if (targetRole === 'agent') {
      updateData.agent_commission = commissionDecimal
    } else if (targetRole === 'super') {
      updateData.super_commission = commissionDecimal
    }

    const { error: upsertError } = await supabaseServer
      .from('user_commissions')
      .upsert(updateData, { onConflict: 'user_id' })

    if (upsertError) {
      return 500, { error: 'database_error', message: upsertError.message }
    }

    // 8. Audit log
    // await logAdminAction(currentUser.id, 'save_user_commission', { user_id, commission_percent, role: targetRole })

    return 200, { 
      success: true, 
      message: 'درصد کمیسیون با موفقیت ذخیره شد',
      data: { user_id, commission_percent, commission_decimal: commissionDecimal }
    }
  } catch (err) {
    return 500, { error: 'unexpected_error', message: err.message }
  }
}
```

---

### 1.5. ایجاد/ویرایش Room Template (`saveRoomTemplate`)

#### a) مسیر پیشنهادی API

```
POST /api/admin/rooms/template
```

#### b) Body نمونه

```json
{
  "id": "uuid-of-template-or-null",
  "name": "اتاق VIP",
  "price": 10000,
  "currency": "IRR",
  "min_players": 2,
  "countdown_sec": 60,
  "line_reward_percentage": 10,
  "full_reward_percentage": 50,
  "vip": true,
  "password": null,
  "repeatable": true,
  "scheduled_start_time": null,
  "ding_per_number": 100,
  "room_type": "standard",
  "commission_rate": 0.15,
  "max_cards_per_player": 5
}
```

**نکات:**
- اگر `id` موجود باشد → UPDATE
- اگر `id` null یا missing باشد → INSERT

#### c) چک‌های لازم در سرور

1. **Authentication:**
   - کاربر باید لاگین باشد

2. **Authorization:**
   - فقط Admin می‌تواند Room Template ایجاد/ویرایش کند
   - اگر `admin_sub_role` موجود باشد، باید `rooms` permission داشته باشد

3. **Business Rules:**
   - `price` باید > 0 باشد
   - `min_players` باید >= 1 باشد
   - `countdown_sec` باید > 0 باشد
   - `line_reward_percentage` و `full_reward_percentage` باید بین 0-100 باشند
   - `commission_rate` باید بین 0-1 باشد (یا اگر > 1 باشد، به اعشار تبدیل شود)
   - `max_cards_per_player` باید > 0 باشد
   - اگر `id` موجود باشد، template باید وجود داشته باشد

#### d) انواع خطاها

| کد HTTP | Error Code | توضیح |
|---------|------------|-------|
| 401 | `unauthorized` | Session نامعتبر |
| 403 | `forbidden` | کاربر مجاز به ایجاد/ویرایش template نیست |
| 400 | `invalid_payload` | Body نامعتبر |
| 400 | `validation_error` | Validation rule نقض شده |
| 404 | `template_not_found` | Template برای update پیدا نشد |
| 500 | `database_error` | خطای دیتابیس |

#### e) منطق کلی عمل

```typescript
async function POST(request: Request) {
  try {
    // 1. استخراج session
    const currentUser = await getUserFromRequest(request.headers.get('authorization'))
    if (!currentUser) return 401, { error: 'unauthorized' }

    // 2. بررسی admin بودن
    const adminInfo = await verifyAdminAccess(currentUser.id)
    if (!adminInfo || adminInfo.user.role !== 'admin') {
      return 403, { error: 'forbidden' }
    }

    // 3. بررسی permission (اگر admin_sub_role موجود باشد)
    if (adminInfo.adminSubRole !== null) {
      const permissions = await loadAdminPermissions(currentUser.id)
      if (!permissions.rooms) {
        return 403, { error: 'forbidden', message: 'no permission to manage rooms' }
      }
    }

    // 4. خواندن body
    const body = await request.json()
    const { id, name, price, currency, min_players, countdown_sec, 
            line_reward_percentage, full_reward_percentage, vip, password,
            repeatable, scheduled_start_time, ding_per_number, room_type,
            commission_rate, max_cards_per_player } = body

    // 5. Validation
    if (!name || !price || !currency) {
      return 400, { error: 'invalid_payload', message: 'name, price, currency are required' }
    }

    if (price <= 0) {
      return 400, { error: 'validation_error', message: 'price must be > 0' }
    }

    if (min_players < 1) {
      return 400, { error: 'validation_error', message: 'min_players must be >= 1' }
    }

    if (countdown_sec <= 0) {
      return 400, { error: 'validation_error', message: 'countdown_sec must be > 0' }
    }

    if (line_reward_percentage < 0 || line_reward_percentage > 100) {
      return 400, { error: 'validation_error', message: 'line_reward_percentage must be between 0-100' }
    }

    if (full_reward_percentage < 0 || full_reward_percentage > 100) {
      return 400, { error: 'validation_error', message: 'full_reward_percentage must be between 0-100' }
    }

    // تبدیل commission_rate از درصد به اعشار (اگر > 1 باشد)
    let commissionRateDecimal = commission_rate
    if (commission_rate > 1) {
      commissionRateDecimal = commission_rate / 100
    }
    if (commissionRateDecimal < 0 || commissionRateDecimal > 1) {
      return 400, { error: 'validation_error', message: 'commission_rate must be between 0-1' }
    }

    if (max_cards_per_player <= 0) {
      return 400, { error: 'validation_error', message: 'max_cards_per_player must be > 0' }
    }

    // 6. آماده‌سازی data برای insert/update
    const templateData = {
      name,
      price,
      currency,
      min_players,
      countdown_sec,
      line_reward_percentage,
      full_reward_percentage,
      vip: vip ?? false,
      password: password || null,
      repeatable: repeatable ?? false,
      scheduled_start_time: scheduled_start_time || null,
      ding_per_number: ding_per_number || null,
      room_type: room_type || 'standard',
      commission_rate: commissionRateDecimal,
      max_cards_per_player,
    }

    // 7. Insert یا Update
    let result
    if (id) {
      // UPDATE
      // بررسی وجود template
      const existing = await supabaseServer
        .from('room_templates')
        .select('id')
        .eq('id', id)
        .single()

      if (!existing || existing.error) {
        return 404, { error: 'template_not_found' }
      }

      const { data, error } = await supabaseServer
        .from('room_templates')
        .update(templateData)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        return 500, { error: 'database_error', message: error.message }
      }

      result = data
    } else {
      // INSERT
      const { data, error } = await supabaseServer
        .from('room_templates')
        .insert(templateData)
        .select()
        .single()

      if (error) {
        return 500, { error: 'database_error', message: error.message }
      }

      result = data
    }

    // 8. Audit log
    // await logAdminAction(currentUser.id, 'save_room_template', { template_id: result.id, is_update: !!id })

    return 200, { 
      success: true, 
      message: id ? 'Template با موفقیت به‌روزرسانی شد' : 'Template جدید با موفقیت ایجاد شد',
      data: result
    }
  } catch (err) {
    return 500, { error: 'unexpected_error', message: err.message }
  }
}
```

---

### 1.6. حذف Room Template (`deleteRoomTemplate`)

#### a) مسیر پیشنهادی API

```
DELETE /api/admin/rooms/template/{template_id}
```

#### b) Body نمونه

بدون body (template_id در URL)

#### c) چک‌های لازم در سرور

1. **Authentication:**
   - کاربر باید لاگین باشد

2. **Authorization:**
   - فقط Admin می‌تواند Template را حذف کند
   - اگر `admin_sub_role` موجود باشد، باید `rooms` permission داشته باشد

3. **Business Rules:**
   - `template_id` باید معتبر باشد
   - Template باید وجود داشته باشد
   - (اختیاری) بررسی اینکه آیا template در حال استفاده است (rooms فعال با این template)

#### d) انواع خطاها

| کد HTTP | Error Code | توضیح |
|---------|------------|-------|
| 401 | `unauthorized` | Session نامعتبر |
| 403 | `forbidden` | کاربر مجاز به حذف template نیست |
| 404 | `template_not_found` | Template پیدا نشد |
| 400 | `template_in_use` | Template در حال استفاده است (اختیاری) |
| 500 | `database_error` | خطای دیتابیس |

#### e) منطق کلی عمل

```typescript
async function DELETE(request: Request, { params }: { params: { template_id: string } }) {
  try {
    // 1. استخراج session
    const currentUser = await getUserFromRequest(request.headers.get('authorization'))
    if (!currentUser) return 401, { error: 'unauthorized' }

    // 2. بررسی admin بودن
    const adminInfo = await verifyAdminAccess(currentUser.id)
    if (!adminInfo || adminInfo.user.role !== 'admin') {
      return 403, { error: 'forbidden' }
    }

    // 3. بررسی permission
    if (adminInfo.adminSubRole !== null) {
      const permissions = await loadAdminPermissions(currentUser.id)
      if (!permissions.rooms) {
        return 403, { error: 'forbidden', message: 'no permission to manage rooms' }
      }
    }

    // 4. استخراج template_id از params
    const { template_id } = params
    if (!template_id) {
      return 400, { error: 'invalid_payload', message: 'template_id is required' }
    }

    // 5. بررسی وجود template
    const existing = await supabaseServer
      .from('room_templates')
      .select('id')
      .eq('id', template_id)
      .single()

    if (!existing || existing.error) {
      return 404, { error: 'template_not_found' }
    }

    // 6. (اختیاری) بررسی استفاده template
    // const activeRooms = await supabaseServer
    //   .from('rooms')
    //   .select('id')
    //   .eq('template_id', template_id)
    //   .in('status', ['waiting', 'active'])
    //   .limit(1)
    // 
    // if (activeRooms.data && activeRooms.data.length > 0) {
    //   return 400, { error: 'template_in_use', message: 'template is currently in use' }
    // }

    // 7. حذف template
    const { error: deleteError } = await supabaseServer
      .from('room_templates')
      .delete()
      .eq('id', template_id)

    if (deleteError) {
      return 500, { error: 'database_error', message: deleteError.message }
    }

    // 8. Audit log
    // await logAdminAction(currentUser.id, 'delete_room_template', { template_id })

    return 200, { success: true, message: 'Template با موفقیت حذف شد' }
  } catch (err) {
    return 500, { error: 'unexpected_error', message: err.message }
  }
}
```

---

### 1.7. تعلیق/فعال‌سازی کاربر (`toggleUserSuspension`)

#### a) مسیر پیشنهادی API

```
POST /api/admin/users/toggle-suspension
```

#### b) Body نمونه

```json
{
  "user_id": "uuid-of-user"
}
```

**نکات:**
- `user_id`: شناسه کاربر هدف (required)
- وضعیت به صورت خودکار toggle می‌شود (active ↔ suspended)

#### c) چک‌های لازم در سرور

1. **Authentication:**
   - کاربر باید لاگین باشد

2. **Authorization:**
   - فقط Admin, Super, Agent می‌توانند کاربر را تعلیق/فعال کنند
   - کاربر فعلی باید بتواند کاربر هدف را مدیریت کند (بر اساس سلسله‌مراتب)

3. **Business Rules:**
   - `user_id` باید معتبر باشد
   - کاربر هدف نباید خود کاربر فعلی باشد (جلوگیری از lockout)
   - (اختیاری) Admin نمی‌تواند Admin دیگر را تعلیق کند (فقط مدیر کل می‌تواند)

#### d) انواع خطاها

| کد HTTP | Error Code | توضیح |
|---------|------------|-------|
| 401 | `unauthorized` | Session نامعتبر |
| 403 | `forbidden` | کاربر مجاز به تعلیق/فعال‌سازی نیست |
| 400 | `invalid_payload` | Body نامعتبر |
| 400 | `cannot_suspend_self` | کاربر نمی‌تواند خودش را تعلیق کند |
| 404 | `user_not_found` | کاربر پیدا نشد |
| 500 | `database_error` | خطای دیتابیس |

#### e) منطق کلی عمل

```typescript
async function POST(request: Request) {
  try {
    // 1. استخراج session
    const currentUser = await getUserFromRequest(request.headers.get('authorization'))
    if (!currentUser) return 401, { error: 'unauthorized' }

    // 2. بررسی role
    const adminInfo = await verifyAdminAccess(currentUser.id)
    if (!adminInfo) {
      return 403, { error: 'forbidden' }
    }

    const allowedRoles = ['admin', 'super', 'agent']
    if (!allowedRoles.includes(adminInfo.user.role)) {
      return 403, { error: 'forbidden', message: 'insufficient permissions' }
    }

    // 3. خواندن body
    const { user_id } = await request.json()
    if (!user_id) {
      return 400, { error: 'invalid_payload', message: 'user_id is required' }
    }

    // 4. جلوگیری از تعلیق خود
    if (user_id === currentUser.id) {
      return 400, { error: 'cannot_suspend_self', message: 'cannot suspend yourself' }
    }

    // 5. بررسی وجود کاربر
    const targetUser = await supabaseServer
      .from('users')
      .select('id, status, role')
      .eq('id', user_id)
      .single()

    if (!targetUser || targetUser.error) {
      return 404, { error: 'user_not_found' }
    }

    // 6. (اختیاری) بررسی سلسله‌مراتب
    // Admin نمی‌تواند Admin دیگر را تعلیق کند (فقط مدیر کل می‌تواند)
    if (targetUser.data.role === 'admin' && adminInfo.user.role === 'admin' && adminInfo.adminSubRole !== null) {
      return 403, { error: 'forbidden', message: 'only manager can suspend admins' }
    }

    // 7. Toggle status
    const currentStatus = targetUser.data.status as 'active' | 'suspended' | 'deleted'
    const newStatus: 'active' | 'suspended' = currentStatus === 'suspended' ? 'active' : 'suspended'

    const { error: updateError } = await supabaseServer
      .from('users')
      .update({ status: newStatus })
      .eq('id', user_id)

    if (updateError) {
      return 500, { error: 'database_error', message: updateError.message }
    }

    // 8. Audit log
    // await logAdminAction(currentUser.id, 'toggle_user_suspension', { user_id, new_status: newStatus })

    return 200, { 
      success: true, 
      message: newStatus === 'suspended' ? 'کاربر با موفقیت تعلیق شد' : 'کاربر با موفقیت فعال شد',
      data: { user_id, new_status: newStatus }
    }
  } catch (err) {
    return 500, { error: 'unexpected_error', message: err.message }
  }
}
```

---

### 1.8. تعلیق/فعال‌سازی مدیر (`toggleAdminStatus`)

#### a) مسیر پیشنهادی API

```
POST /api/admin/admins/toggle-status
```

#### b) Body نمونه

```json
{
  "admin_id": "uuid-of-admin-user"
}
```

**نکات:**
- `admin_id`: شناسه مدیر هدف (required)
- وضعیت به صورت خودکار toggle می‌شود (active ↔ suspended)

#### c) چک‌های لازم در سرور

1. **Authentication:**
   - کاربر باید لاگین باشد

2. **Authorization:**
   - فقط مدیر کل (`admin_sub_role = null`) می‌تواند مدیر را تعلیق/فعال کند

3. **Business Rules:**
   - `admin_id` باید معتبر باشد
   - کاربر هدف باید `role = "admin"` باشد
   - کاربر هدف نباید خود کاربر فعلی باشد

#### d) انواع خطاها

| کد HTTP | Error Code | توضیح |
|---------|------------|-------|
| 401 | `unauthorized` | Session نامعتبر |
| 403 | `forbidden` | فقط مدیر کل می‌تواند مدیر را تعلیق/فعال کند |
| 400 | `invalid_payload` | Body نامعتبر |
| 400 | `cannot_suspend_self` | مدیر نمی‌تواند خودش را تعلیق کند |
| 404 | `admin_not_found` | مدیر پیدا نشد |
| 500 | `database_error` | خطای دیتابیس |

#### e) منطق کلی عمل

```typescript
async function POST(request: Request) {
  try {
    // 1. استخراج session
    const currentUser = await getUserFromRequest(request.headers.get('authorization'))
    if (!currentUser) return 401, { error: 'unauthorized' }

    // 2. بررسی مدیر کل بودن
    const isManager = await verifyManagerAccess(currentUser.id)
    if (!isManager) {
      return 403, { error: 'forbidden', message: 'only manager can toggle admin status' }
    }

    // 3. خواندن body
    const { admin_id } = await request.json()
    if (!admin_id) {
      return 400, { error: 'invalid_payload', message: 'admin_id is required' }
    }

    // 4. جلوگیری از تعلیق خود
    if (admin_id === currentUser.id) {
      return 400, { error: 'cannot_suspend_self', message: 'cannot suspend yourself' }
    }

    // 5. بررسی وجود و role مدیر
    const targetAdmin = await supabaseServer
      .from('users')
      .select('id, status, role')
      .eq('id', admin_id)
      .eq('role', 'admin')
      .single()

    if (!targetAdmin || targetAdmin.error) {
      return 404, { error: 'admin_not_found' }
    }

    // 6. Toggle status
    const currentStatus = targetAdmin.data.status as 'active' | 'suspended' | 'deleted'
    const newStatus: 'active' | 'suspended' = currentStatus === 'suspended' ? 'active' : 'suspended'

    const { error: updateError } = await supabaseServer
      .from('users')
      .update({ status: newStatus })
      .eq('id', admin_id)
      .eq('role', 'admin')

    if (updateError) {
      return 500, { error: 'database_error', message: updateError.message }
    }

    // 7. Audit log
    // await logAdminAction(currentUser.id, 'toggle_admin_status', { admin_id, new_status: newStatus })

    return 200, { 
      success: true, 
      message: newStatus === 'suspended' ? 'مدیر با موفقیت تعلیق شد' : 'مدیر با موفقیت فعال شد',
      data: { admin_id, new_status: newStatus }
    }
  } catch (err) {
    return 500, { error: 'unexpected_error', message: err.message }
  }
}
```

---

## 2. دسته‌بندی APIها

### 2.1. Users & Roles API

**Routeها:**
- `POST /api/admin/users/set-role` - تغییر نقش کاربر
- `POST /api/admin/users/toggle-suspension` - تعلیق/فعال‌سازی کاربر
- `POST /api/admin/users/set-commission` - تنظیم درصد کمیسیون

**خطرات پوشش داده شده:**
این دسته از APIها خطرات مربوط به تغییر ساختار سلسله‌مراتبی کاربران و اقتصاد سیستم را پوشش می‌دهند. تغییر نقش کاربر می‌تواند دسترسی‌ها و روابط مالی را تغییر دهد. تعلیق کاربر می‌تواند دسترسی کاربر به سیستم را مسدود کند. تنظیم کمیسیون تأثیر مستقیم بر درآمد agent/super دارد. تمام این عملیات باید با احراز هویت و مجوز مناسب انجام شوند و در audit log ثبت شوند.

---

### 2.2. Admin Permissions API

**Routeها:**
- `POST /api/admin/admins/set-sub-role` - تغییر sub-role مدیر
- `POST /api/admin/admins/set-permissions` - تنظیم دسترسی‌های granular مدیر
- `POST /api/admin/admins/toggle-status` - تعلیق/فعال‌سازی مدیر

**خطرات پوشش داده شده:**
این دسته از APIها خطرات مربوط به کنترل دسترسی مدیران را پوشش می‌دهند. تغییر sub-role مدیر می‌تواند دسترسی به بخش‌های مختلف سیستم را تغییر دهد. تنظیم permissions granular کنترل دقیق‌تری بر دسترسی مدیران فراهم می‌کند. تعلیق مدیر می‌تواند دسترسی مدیر به سیستم را مسدود کند. تمام این عملیات فقط باید توسط مدیر کل انجام شوند و در audit log ثبت شوند.

---

### 2.3. Commissions API

**Routeها:**
- `POST /api/admin/users/set-commission` - تنظیم درصد کمیسیون

**خطرات پوشش داده شده:**
این دسته از APIها خطرات مربوط به اقتصاد سیستم را پوشش می‌دهند. تنظیم درصد کمیسیون تأثیر مستقیم بر درآمد agent/super دارد و باید با validation مناسب (0-100) انجام شود. این عملیات باید توسط admin/super/agent انجام شود و در audit log ثبت شود.

---

### 2.4. Room Template API

**Routeها:**
- `POST /api/admin/rooms/template` - ایجاد/ویرایش Room Template
- `DELETE /api/admin/rooms/template/{template_id}` - حذف Room Template

**خطرات پوشش داده شده:**
این دسته از APIها خطرات مربوط به اقتصاد بازی را پوشش می‌دهند. ایجاد/ویرایش Room Template می‌تواند قیمت کارت، درصد جایزه، و نرخ کمیسیون را تغییر دهد که تأثیر مستقیم بر اقتصاد اتاق دارد. حذف Template می‌تواند تنظیمات اتاق را از بین ببرد. تمام این عملیات باید توسط Admin با permission مناسب انجام شوند و در audit log ثبت شوند.

---

### 2.5. Account Suspension API

**Routeها:**
- `POST /api/admin/users/toggle-suspension` - تعلیق/فعال‌سازی کاربر
- `POST /api/admin/admins/toggle-status` - تعلیق/فعال‌سازی مدیر

**خطرات پوشش داده شده:**
این دسته از APIها خطرات مربوط به دسترسی کاربران و مدیران را پوشش می‌دهند. تعلیق کاربر می‌تواند دسترسی کاربر به سیستم را مسدود کند. تعلیق مدیر می‌تواند دسترسی مدیر به سیستم را مسدود کند. تمام این عملیات باید با احراز هویت و مجوز مناسب انجام شوند و در audit log ثبت شوند. همچنین باید از تعلیق خود کاربر جلوگیری شود.

---

## 3. خلاصه و نکات مهم

### 3.1. الگوی مشترک

تمام API routes از الگوی مشترک زیر پیروی می‌کنند:

1. **Authentication:** استخراج session از Authorization header
2. **Authorization:** بررسی role و permissions
3. **Validation:** بررسی صحت داده‌های ورودی
4. **Business Logic:** انجام عملیات با استفاده از `supabaseServer`
5. **Audit Logging:** ثبت عملیات در audit log (اختیاری)
6. **Error Handling:** برگرداندن خطاهای مناسب

### 3.2. استفاده از Helper Functions

تمام API routes از helper functions زیر استفاده می‌کنند:

- `getUserFromRequest(authHeader)`: استخراج user از Authorization header
- `verifyAdminAccess(userId)`: بررسی admin بودن
- `verifyManagerAccess(userId)`: بررسی مدیر کل بودن
- `loadAdminPermissions(adminId)`: بارگذاری permissions مدیر

### 3.3. Error Response Format

تمام خطاها به فرمت زیر برگردانده می‌شوند:

```json
{
  "error": "error_code",
  "message": "توضیح خطا (اختیاری)"
}
```

### 3.4. Success Response Format

تمام پاسخ‌های موفق به فرمت زیر برگردانده می‌شوند:

```json
{
  "success": true,
  "message": "پیام موفقیت",
  "data": { ... } // اختیاری
}
```

### 3.5. Security Considerations

- تمام API routes از `supabaseServer` (service_role) استفاده می‌کنند
- تمام عملیات باید با احراز هویت و مجوز مناسب انجام شوند
- تمام عملیات باید در audit log ثبت شوند (برای traceability)
- Rate limiting باید اعمال شود (برای جلوگیری از abuse)

---

**پایان سند**

