// Helper functions برای دریافت لیدربورد از Supabase
import { supabase } from '../../supabaseClient';

export interface LeaderboardEntry {
  user_id: string;
  wins: number;
  total_rewards: number;
  last_win: string;
  rank_position: number;
  // اطلاعات کاربر (باید جداگانه fetch شود)
  email?: string;
  username?: string;
  nickname?: string;
}

/**
 * دریافت برندگان هفته (7 روز گذشته)
 * @param limit تعداد برندگان (پیش‌فرض: 5)
 * @returns لیست برندگان هفته
 */
export async function getWeeklyLeaders(limit: number = 5): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_weekly_leaders', {
      limit_count: limit,
    });

    if (error) {
      console.error('Error fetching weekly leaders:', error);
      throw error;
    }

    // Enrich با اطلاعات کاربر
    const enrichedData = await enrichWithUserData(data || []);
    return enrichedData;
  } catch (error) {
    console.error('Error in getWeeklyLeaders:', error);
    return [];
  }
}

/**
 * دریافت برندگان روز (24 ساعت گذشته)
 * @param limit تعداد برندگان (پیش‌فرض: 5)
 * @returns لیست برندگان روز
 */
export async function getDailyLeaders(limit: number = 5): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await supabase.rpc('get_daily_leaders', {
      limit_count: limit,
    });

    if (error) {
      console.error('Error fetching daily leaders:', error);
      throw error;
    }

    // Enrich با اطلاعات کاربر
    const enrichedData = await enrichWithUserData(data || []);
    return enrichedData;
  } catch (error) {
    console.error('Error in getDailyLeaders:', error);
    return [];
  }
}

/**
 * دریافت برندگان یک روز خاص
 * @param targetDate تاریخ مورد نظر
 * @param limit تعداد برندگان (پیش‌فرض: 5)
 * @returns لیست برندگان روز
 */
export async function getDailyLeadersByDate(
  targetDate: Date,
  limit: number = 5
): Promise<LeaderboardEntry[]> {
  try {
    // تبدیل Date به YYYY-MM-DD
    const dateString = targetDate.toISOString().split('T')[0];

    const { data, error } = await supabase.rpc('get_daily_leaders_by_date', {
      target_date: dateString,
      limit_count: limit,
    });

    if (error) {
      console.error('Error fetching daily leaders by date:', error);
      throw error;
    }

    // Enrich با اطلاعات کاربر
    const enrichedData = await enrichWithUserData(data || []);
    return enrichedData;
  } catch (error) {
    console.error('Error in getDailyLeadersByDate:', error);
    return [];
  }
}

/**
 * افزودن اطلاعات کاربر به entries لیدربورد
 * @param entries ردیف‌های لیدربورد
 * @returns entries با اطلاعات کاربر
 */
async function enrichWithUserData(
  entries: LeaderboardEntry[]
): Promise<LeaderboardEntry[]> {
  try {
    if (entries.length === 0) {
      return entries;
    }

    // دریافت اطلاعات کاربران از جدول users و user_profiles
    const userIds = entries.map(e => e.user_id);
    
    // دریافت اطلاعات از جدول users
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, username, email')
      .in('id', userIds);

    if (usersError) {
      console.error('Error fetching users:', usersError);
    }

    // دریافت اطلاعات از جدول user_profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('user_profiles')
      .select('user_id, nickname')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error fetching user profiles:', profilesError);
    }

    // ایجاد Map برای دسترسی سریع
    const usersMap = new Map(
      (usersData || []).map(u => [u.id, { username: u.username, email: u.email }])
    );
    const profilesMap = new Map(
      (profilesData || []).map(p => [p.user_id, { nickname: p.nickname }])
    );

    // Enrich کردن entries
    const enrichedEntries = entries.map(entry => {
      const user = usersMap.get(entry.user_id);
      const profile = profilesMap.get(entry.user_id);

      return {
        ...entry,
        email: user?.email,
        username: user?.username,
        nickname: profile?.nickname,
      };
    });

    return enrichedEntries;
  } catch (error) {
    console.error('Error enriching user data:', error);
    return entries;
  }
}

/**
 * دریافت لیدربورد امروز (بر اساس تاریخ امروز)
 */
export async function getTodayLeaders(limit: number = 5): Promise<LeaderboardEntry[]> {
  return getDailyLeadersByDate(new Date(), limit);
}

