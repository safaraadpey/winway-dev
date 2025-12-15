// Helper functions برای کار با سیستم Ding
import { supabase } from '../../supabaseClient';

export interface DingBalance {
  user_id: string;
  balance: number;
  updated_at: string;
  created_at: string;
}

export interface DingTransaction {
  id: string;
  user_id: string;
  room_id: string | null;
  ticket_id: string | null;
  draw_id: string | null;
  drawn_number: number;
  amount: number;
  description: string | null;
  created_at: string;
}

/**
 * دریافت موجودی Ding کاربر فعلی
 */
export async function getMyDingBalance(): Promise<number> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return 0;
    }

    const { data, error } = await supabase
      .from('ding_balances')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // ردیف وجود ندارد، موجودی صفر است
        return 0;
      }
      console.error('Error fetching ding balance:', error);
      return 0;
    }

    return data?.balance || 0;
  } catch (error) {
    console.error('Error in getMyDingBalance:', error);
    return 0;
  }
}

/**
 * دریافت موجودی Ding یک کاربر خاص (برای admin)
 */
export async function getUserDingBalance(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('ding_balances')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return 0;
      }
      console.error('Error fetching user ding balance:', error);
      return 0;
    }

    return data?.balance || 0;
  } catch (error) {
    console.error('Error in getUserDingBalance:', error);
    return 0;
  }
}

/**
 * دریافت تراکنش‌های Ding کاربر فعلی
 * @param limit تعداد تراکنش‌ها (پیش‌فرض: 50)
 * @param offset برای pagination
 */
export async function getMyDingTransactions(
  limit: number = 50,
  offset: number = 0
): Promise<DingTransaction[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('ding_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching ding transactions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getMyDingTransactions:', error);
    return [];
  }
}

/**
 * دریافت تراکنش‌های Ding یک Room خاص
 */
export async function getRoomDingTransactions(
  roomId: string,
  limit: number = 50
): Promise<DingTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('ding_transactions')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching room ding transactions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getRoomDingTransactions:', error);
    return [];
  }
}

/**
 * دریافت آمار Ding کاربر (تعداد تراکنش‌ها، مجموع دریافتی، و غیره)
 */
export interface DingStats {
  total_received: number;
  transaction_count: number;
  last_transaction_at: string | null;
}

export async function getMyDingStats(): Promise<DingStats> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        total_received: 0,
        transaction_count: 0,
        last_transaction_at: null,
      };
    }

    const { data, error } = await supabase
      .from('ding_transactions')
      .select('amount, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching ding stats:', error);
      return {
        total_received: 0,
        transaction_count: 0,
        last_transaction_at: null,
      };
    }

    const total_received = data?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const transaction_count = data?.length || 0;
    const last_transaction_at = data?.[0]?.created_at || null;

    return {
      total_received,
      transaction_count,
      last_transaction_at,
    };
  } catch (error) {
    console.error('Error in getMyDingStats:', error);
    return {
      total_received: 0,
      transaction_count: 0,
      last_transaction_at: null,
    };
  }
}

// Realtime subscription for ding_balances removed: dingBalance is now synced via API per-draw.

