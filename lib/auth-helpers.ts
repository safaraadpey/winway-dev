/**
 * Helper functions for authentication with username-based system
 * 
 * در سیستم ما، کاربر فقط username وارد می‌کند، اما Supabase نیاز به email دارد.
 * بنابراین ما خودمان ایمیل را می‌سازیم: ${username.toLowerCase()}@dingmoney.org
 */

/**
 * تبدیل username به email برای Supabase
 * @param username - نام کاربری (مثلاً: alipro)
 * @returns ایمیل کامل (مثلاً: alipro@dingmoney.org)
 */
export function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@dingmoney.org`;
}

/**
 * استخراج username از email
 * استفاده در RLS policies و profiles table
 * @param email - ایمیل کامل (مثلاً: alipro@dingmoney.org)
 * @returns نام کاربری (مثلاً: alipro)
 */
export function emailToUsername(email: string): string {
  return email.toLowerCase().replace('@dingmoney.org', '');
}

/**
 * اعتبارسنجی username
 * @param username - نام کاربری برای بررسی
 * @returns true اگر معتبر باشد
 */
export function validateUsername(username: string): boolean {
  // فقط حروف انگلیسی، اعداد، و زیرخط مجاز است
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username.trim());
}

// ============================================
// Admin Sub Role Types and Helpers
// ============================================

import { supabase } from './supabaseClient';
import type { AdminSubRole, UserRole } from './auth/adminPanelRules';

export type { AdminSubRole, UserRole } from './auth/adminPanelRules';
export {
  isDevPanelSubRole,
  canAccessAdminPanel,
  canAccessDevPanel,
} from './auth/adminPanelRules';

/**
 * Interface برای اطلاعات نقش کاربر
 */
export interface UserRoleInfo {
  role: UserRole;
  admin_sub_role?: AdminSubRole | null;
}

/**
 * بررسی می‌کند که آیا کاربر ادمین با sub_role مشخص است
 * 
 * @param userId - شناسه کاربر
 * @param requiredSubRole - نقش فرعی مورد نیاز
 * @returns true اگر کاربر ادمین با sub_role مشخص باشد یا مدیر کل باشد
 * 
 * @example
 * ```typescript
 * const canAccess = await hasAdminSubRole(userId, 'finance');
 * if (canAccess) {
 *   // نمایش بخش مالی
 * }
 * ```
 */
export async function hasAdminSubRole(
  userId: string, 
  requiredSubRole: AdminSubRole
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("role, admin_sub_role")
      .eq("id", userId)
      .single();
    
    if (error || !data) {
      console.error('Error checking admin sub role:', error);
      return false;
    }
    
    // مدیر کل (admin_sub_role = NULL) دسترسی کامل دارد
    if (data.role === 'admin' && !data.admin_sub_role) {
      return true;
    }
    
    return (
      data.role === 'admin' && 
      data.admin_sub_role === requiredSubRole
    );
  } catch (error) {
    console.error('Error in hasAdminSubRole:', error);
    return false;
  }
}

/**
 * دریافت sub_role کاربر فعلی
 * 
 * @returns sub_role کاربر یا null اگر ادمین نباشد یا مدیر کل باشد
 * 
 * @example
 * ```typescript
 * const subRole = await getCurrentUserSubRole();
 * if (subRole === 'finance') {
 *   // نمایش بخش مالی
 * }
 * ```
 */
export async function getCurrentUserSubRole(): Promise<AdminSubRole | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
      .from("users")
      .select("role, admin_sub_role")
      .eq("id", user.id)
      .single();
    
    if (error || !data) {
      console.error('Error getting user sub role:', error);
      return null;
    }
    
    // فقط اگر ادمین باشد، sub_role را برمی‌گرداند
    if (data.role === 'admin') {
      return data.admin_sub_role || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error in getCurrentUserSubRole:', error);
    return null;
  }
}

/**
 * دریافت اطلاعات کامل نقش کاربر فعلی
 * 
 * @returns اطلاعات نقش کاربر شامل role و admin_sub_role
 * 
 * @example
 * ```typescript
 * const roleInfo = await getCurrentUserRoleInfo();
 * if (roleInfo?.role === 'admin' && roleInfo.admin_sub_role === 'finance') {
 *   // نمایش بخش مالی
 * }
 * ```
 */
export async function getCurrentUserRoleInfo(): Promise<UserRoleInfo | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // تلاش اول: خواندن role و admin_sub_role (اگر ستون وجود داشته باشد)
    const { data, error } = await supabase
      .from("users")
      .select("role, admin_sub_role")
      .eq("id", user.id)
      .single();

    if (error) {
      // اگر خطا به خاطر نبودن ستون admin_sub_role بود، به صورت graceful fallback می‌کنیم
      if (
        (error as any).code === "42703" ||
        (error as any).message?.includes("admin_sub_role")
      ) {
        console.warn(
          "admin_sub_role column not found on users table; falling back to role only"
        );

        const { data: roleOnly, error: roleError } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();

        if (roleError || !roleOnly) {
          console.error("Error getting user role info (fallback):", roleError);
          return null;
        }

        return {
          role: roleOnly.role as UserRole,
          admin_sub_role: null,
        };
      }

      console.error("Error getting user role info:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      role: data.role as UserRole,
      admin_sub_role: (data as any).admin_sub_role as AdminSubRole | null,
    };
  } catch (error) {
    console.error("Error in getCurrentUserRoleInfo:", error);
    return null;
  }
}

/**
 * بررسی می‌کند که آیا کاربر می‌تواند به یک بخش دسترسی داشته باشد
 * مدیر کل (admin_sub_role = NULL) به همه بخش‌ها دسترسی دارد
 * 
 * @param section - بخش مورد نظر
 * @returns true اگر کاربر دسترسی داشته باشد
 * 
 * @example
 * ```typescript
 * const canAccess = await canAccessSection('finance');
 * if (canAccess) {
 *   // نمایش بخش مالی
 * }
 * ```
 */
export async function canAccessSection(
  section: 'finance' | 'support' | 'room'
): Promise<boolean> {
  try {
    const roleInfo = await getCurrentUserRoleInfo();
    
    if (!roleInfo || roleInfo.role !== 'admin') {
      return false;
    }
    
    // مدیر کل (NULL) یا manager دسترسی کامل دارد
    if (!roleInfo.admin_sub_role || roleInfo.admin_sub_role === 'manager') {
      return true;
    }
    
    // بررسی دسترسی به بخش مشخص
    return roleInfo.admin_sub_role === section;
  } catch (error) {
    console.error('Error in canAccessSection:', error);
    return false;
  }
}

/**
 * بررسی می‌کند که آیا کاربر مدیر کل است (admin بدون sub_role)
 * 
 * @returns true اگر کاربر مدیر کل باشد
 * 
 * @example
 * ```typescript
 * const isManager = await isSuperAdmin();
 * if (isManager) {
 *   // نمایش همه بخش‌ها
 * }
 * ```
 */
export async function isSuperAdmin(): Promise<boolean> {
  try {
    const roleInfo = await getCurrentUserRoleInfo();
    return (
      roleInfo?.role === 'admin' && 
      (!roleInfo.admin_sub_role || roleInfo.admin_sub_role === 'manager')
    );
  } catch (error) {
    console.error('Error in isSuperAdmin:', error);
    return false;
  }
}

/**
 * بررسی می‌کند که آیا کاربر فعلی اجازه مدیریت تراکنش‌ها (واریز/برداشت دستی) را دارد.
 * 
 * منطق:
 * - admin:
 *   - اگر admin_sub_role = 'finance' یا 'manager' یا NULL → مجاز
 *   - بقیه sub_role ها (مثلاً 'support' یا 'room') → مجاز نیستند
 * - agent و super → مجاز (برای زیرمجموعه خودشان)
 * - player → مجاز نیست
 * 
 * @returns true اگر کاربر می‌تواند به صفحه مدیریت تراکنش‌ها دسترسی داشته باشد
 * 
 * @example
 * ```typescript
 * const canManage = await canManageTransactions();
 * if (!canManage) {
 *   router.replace('/not-authorized');
 * }
 * ```
 */
export async function canManageTransactions(): Promise<boolean> {
  try {
    const roleInfo = await getCurrentUserRoleInfo();
    if (!roleInfo) return false;

    if (roleInfo.role === 'admin') {
      // مدیر کل یا finance می‌توانند
      if (!roleInfo.admin_sub_role || roleInfo.admin_sub_role === 'manager') {
        return true;
      }
      if (roleInfo.admin_sub_role === 'finance') {
        return true;
      }
      return false;
    }

    // agent و super مجازند (روی زیرمجموعه خودشان)
    if (roleInfo.role === 'agent' || roleInfo.role === 'super') {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in canManageTransactions:', error);
    return false;
  }
}

// ============================================
// Referral Code Helpers
// ============================================

/**
 * Interface برای تاریخچه referral_code
 */
export interface ReferralCodeHistoryItem {
  referral_code: string;
  changed_at: string;
  changed_to: string | null;
  is_current: boolean;
}

/**
 * بررسی اعتبار referral_code در frontend
 * 
 * @param code - کد معرف برای بررسی
 * @returns true اگر معتبر باشد (3-8 کاراکتر، حروف و اعداد)
 * 
 * @example
 * ```typescript
 * if (!validateReferralCodeFormat('ABC123')) {
 *   toast.error('کد باید 3-8 کاراکتر و فقط حروف و اعداد باشد');
 * }
 * ```
 */
export function validateReferralCodeFormat(code: string): boolean {
  if (!code || code.trim().length === 0) {
    return false;
  }
  
  const trimmed = code.trim().toUpperCase();
  
  // بررسی طول (3-8 کاراکتر)
  if (trimmed.length < 3 || trimmed.length > 8) {
    return false;
  }
  
  // بررسی اینکه فقط حروف انگلیسی و اعداد باشد
  const validPattern = /^[A-Z0-9]+$/;
  return validPattern.test(trimmed);
}

/**
 * بررسی اینکه آیا یک referral_code قابل استفاده است
 * 
 * @param code - کد معرف برای بررسی
 * @param userId - شناسه کاربر فعلی
 * @returns true اگر کد قابل استفاده باشد (آزاد است یا متعلق به کاربر است)
 * 
 * @example
 * ```typescript
 * const isAvailable = await checkReferralCodeAvailable('ABC123', userId);
 * if (!isAvailable) {
 *   toast.error('این کد در حال حاضر استفاده می‌شود');
 * }
 * ```
 */
export async function checkReferralCodeAvailable(
  code: string,
  userId: string
): Promise<boolean> {
  try {
    // بررسی اعتبار format
    if (!validateReferralCodeFormat(code)) {
      return false;
    }
    
    const trimmedCode = code.trim().toUpperCase();
    
    // بررسی اینکه آیا کد استفاده شده است
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', trimmedCode)
      .single();
    
    // اگر خطا از "not found" باشد، یعنی کد آزاد است
    if (userError && userError.code !== 'PGRST116') {
      console.error('Error checking user:', userError);
      return false;
    }
    
    // اگر کد استفاده نشده یا متعلق به کاربر فعلی است
    if (!existingUser || existingUser.id === userId) {
      return true;
    }
    
    // بررسی اینکه آیا کد در تاریخچه کاربر است (می‌تواند به آن برگردد)
    // اگر جدول referral_code_history وجود نداشته باشد، این query خطا می‌دهد
    // پس با try-catch جداگانه handle می‌کنیم
    try {
      const { data: history, error: historyError } = await supabase
        .from('referral_code_history')
        .select('referral_code')
        .eq('user_id', userId)
        .eq('referral_code', trimmedCode)
        .limit(1);
      
      // اگر جدول وجود نداشت، خطا را ignore می‌کنیم
      if (historyError) {
        // جدول وجود ندارد یا خطای دیگری - فقط log می‌کنیم
        console.warn('referral_code_history table may not exist:', historyError.message);
        // اگر کد استفاده نشده، می‌تواند استفاده کند
        return !existingUser;
      }
      
      // اگر کد در تاریخچه است و الان استفاده نمی‌شود، می‌تواند برگردد
      if (history && history.length > 0 && !existingUser) {
        return true;
      }
    } catch (historyErr) {
      // اگر جدول وجود نداشت، فقط log می‌کنیم و ادامه می‌دهیم
      console.warn('Error checking history (table may not exist):', historyErr);
    }
    
    return false;
  } catch (error) {
    console.error('Error in checkReferralCodeAvailable:', error);
    return false;
  }
}

/**
 * دریافت تاریخچه referral_code کاربر فعلی
 * 
 * @returns لیست کدهای قبلی و فعلی
 * 
 * @example
 * ```typescript
 * const history = await getReferralCodeHistory();
 * // نمایش کدهای قبلی در UI
 * ```
 */
export async function getReferralCodeHistory(): Promise<ReferralCodeHistoryItem[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    // ابتدا کد فعلی را بگیریم
    const currentCode = await getCurrentReferralCode();
    
    // اگر RPC function وجود نداشته باشد، از جدول referral_code_history استفاده می‌کنیم
    // اگر جدول هم وجود نداشته باشد، فقط کد فعلی را برمی‌گردانیم
    try {
      const { data, error } = await supabase.rpc('get_user_referral_code_history', {
        p_user_id: user.id
      });
      
      if (error) {
        // اگر function وجود نداشت، از جدول مستقیم استفاده می‌کنیم
        if (error.code === '42883' || error.message?.includes('does not exist')) {
          console.warn('RPC function not found, trying direct table access');
          
          // استفاده مستقیم از جدول
          const { data: historyData, error: tableError } = await supabase
            .from('referral_code_history')
            .select('referral_code, changed_at, changed_to')
            .eq('user_id', user.id)
            .order('changed_at', { ascending: false });
          
          if (tableError) {
            // اگر جدول هم وجود نداشت، فقط کد فعلی را برمی‌گردانیم
            if (tableError.code === '42P01' || tableError.message?.includes('does not exist')) {
              console.warn('referral_code_history table does not exist yet');
              if (currentCode) {
                return [{
                  referral_code: currentCode,
                  changed_at: new Date().toISOString(),
                  changed_to: null,
                  is_current: true,
                }];
              }
              return [];
            }
            console.error('Error getting history from table:', tableError);
            return [];
          }
          
          // تبدیل به format مورد نیاز
          const result: ReferralCodeHistoryItem[] = (historyData || []).map((item: any) => ({
            referral_code: item.referral_code,
            changed_at: item.changed_at,
            changed_to: item.changed_to,
            is_current: item.referral_code === currentCode,
          }));
          
          // اگر کد فعلی در تاریخچه نیست، آن را اضافه می‌کنیم
          if (currentCode && !result.find(r => r.referral_code === currentCode)) {
            result.unshift({
              referral_code: currentCode,
              changed_at: new Date().toISOString(),
              changed_to: null,
              is_current: true,
            });
          }
          
          return result;
        }
        
        console.error('Error getting referral code history:', error);
        return [];
      }
      
      return (data || []).map((item: any) => ({
        referral_code: item.referral_code,
        changed_at: item.changed_at,
        changed_to: item.changed_to,
        is_current: item.is_current || false,
      }));
    } catch (rpcError) {
      console.warn('RPC call failed, trying fallback:', rpcError);
      
      // Fallback: فقط کد فعلی را برگردان
      if (currentCode) {
        return [{
          referral_code: currentCode,
          changed_at: new Date().toISOString(),
          changed_to: null,
          is_current: true,
        }];
      }
      
      return [];
    }
  } catch (error) {
    console.error('Error in getReferralCodeHistory:', error);
    return [];
  }
}

/**
 * تغییر referral_code کاربر فعلی
 * 
 * @param newCode - کد جدید
 * @returns true اگر موفق باشد
 * 
 * @example
 * ```typescript
 * const success = await updateReferralCode('ABC123');
 * if (success) {
 *   toast.success('کد معرف با موفقیت تغییر کرد');
 * }
 * ```
 */
export async function updateReferralCode(newCode: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }
    
    // بررسی اعتبار format
    if (!validateReferralCodeFormat(newCode)) {
      return false;
    }
    
    const trimmedCode = newCode.trim().toUpperCase();
    
    // بررسی اینکه کد قابل استفاده است
    const isAvailable = await checkReferralCodeAvailable(trimmedCode, user.id);
    if (!isAvailable) {
      return false;
    }
    
    // به‌روزرسانی کد
    // مهم: اگر RLS اجازه ندهد، ممکن است update بدون error ولی با 0 row انجام شود.
    // برای جلوگیری از false-positive، خروجی را select می‌کنیم و بررسی می‌کنیم واقعاً ردیف آپدیت شده باشد.
    const { data: updatedRow, error } = await supabase
      .from('users')
      .update({ referral_code: trimmedCode })
      .eq('id', user.id)
      .select('id, referral_code')
      .single();
    
    if (error) {
      console.error('Error updating referral code:', error);
      return false;
    }

    if (!updatedRow || updatedRow.referral_code !== trimmedCode) {
      console.error('Referral code update did not persist for user:', user.id);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in updateReferralCode:', error);
    return false;
  }
}

/**
 * دریافت referral_code فعلی کاربر
 * 
 * @returns کد فعلی یا null
 * 
 * @example
 * ```typescript
 * const currentCode = await getCurrentReferralCode();
 * if (currentCode) {
 *   console.log('کد فعلی:', currentCode);
 * }
 * ```
 */
export async function getCurrentReferralCode(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    const { data, error } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', user.id)
      .single();
    
    if (error || !data) {
      console.error('Error getting current referral code:', error);
      return null;
    }
    
    return data.referral_code || null;
  } catch (error) {
    console.error('Error in getCurrentReferralCode:', error);
    return null;
  }
}

