/**
 * API Route: تولید استخر کارت جدید
 * 
 * POST /api/admin/card-pool/generate
 * 
 * این route فقط برای admin قابل دسترسی است (نه agent، نه super)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminContextOrThrow, logAdminAction } from '@/lib/supabaseServer'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. استخراج session و service client
    const { session, supabase } = await getAdminContextOrThrow(request)

    // 2. بررسی اینکه فقط admin باشد (نه agent، نه super)
    if (session.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'فقط ادمین می‌تواند به این بخش دسترسی داشته باشد' },
        { status: 403 }
      )
    }

    // 3. خواندن body
    const body = await request.json()
    const { cardCount } = body

    // 4. Validation
    if (!cardCount || typeof cardCount !== 'number') {
      return NextResponse.json(
        { ok: false, error: 'validation_error', message: 'تعداد کارت باید یک عدد باشد' },
        { status: 400 }
      )
    }

    if (cardCount < 0 || cardCount > 10000) {
      return NextResponse.json(
        { ok: false, error: 'validation_error', message: 'تعداد کارت باید بین 0 تا 10000 باشد' },
        { status: 400 }
      )
    }

    // 5. بررسی اینکه آیا استخر دیگری در حال ساخت است یا نه
    const { data: buildingPool, error: checkError } = await supabase
      .from('card_pools')
      .select('id')
      .eq('is_building', true)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking building pools:', checkError)
      return NextResponse.json(
        { ok: false, error: 'database_error', message: checkError.message },
        { status: 500 }
      )
    }

    if (buildingPool) {
      return NextResponse.json(
        { ok: false, error: 'pool_building', message: 'در حال حاضر استخر دیگری در حال ساخت است. لطفاً منتظر بمانید.' },
        { status: 400 }
      )
    }

    // 6. فراخوانی تابع fn_generate_card_pool از schema game_core
    // استفاده از SQL مستقیم از طریق REST API یا RPC
    // برای حال حاضر از RPC با نام کامل schema امتحان می‌کنیم
    let poolId: string | null = null
    let generateError: any = null

    // تلاش 1: فراخوانی مستقیم RPC (اگر در public schema wrapper وجود داشته باشد)
    try {
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('fn_generate_card_pool', {
        p_card_count: cardCount,
        p_created_by: session.user.id,
        p_prng_version: 'v1'
      })
      
      if (!rpcErr && rpcResult) {
        poolId = typeof rpcResult === 'string' ? rpcResult : String(rpcResult)
      } else {
        generateError = rpcErr
      }
    } catch (rpcCallError) {
      generateError = rpcCallError
    }

    // تلاش 2: اگر RPC مستقیم کار نکرد، از REST API با schema path استفاده می‌کنیم
    if (!poolId && generateError) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        
        if (supabaseUrl && serviceKey) {
          // استفاده از POST request مستقیم به Supabase REST API
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/fn_generate_card_pool`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify({
              p_card_count: cardCount,
              p_created_by: session.user.id,
              p_prng_version: 'v1'
            })
          })

          if (response.ok) {
            const result = await response.json()
            poolId = typeof result === 'string' ? result : (result?.[0]?.fn_generate_card_pool || result)
          } else {
            const errorText = await response.text()
            console.error('REST API call failed:', errorText)
            generateError = new Error(errorText)
          }
        }
      } catch (fetchError) {
        console.error('Fetch error:', fetchError)
        generateError = fetchError
      }
    }

    // اگر هنوز poolId نداریم، خطا برمی‌گردانیم
    if (!poolId) {
      console.error('Error generating card pool:', generateError)
      return NextResponse.json(
        { 
          ok: false, 
          error: 'generation_error', 
          message: generateError?.message || 'خطا در تولید استخر کارت. لطفاً مطمئن شوید که تابع fn_generate_card_pool در دسترس است.' 
        },
        { status: 500 }
      )
    }

    // 7. ثبت در audit log
    try {
      await logAdminAction(
        supabase,
        session.user.id,
        'generate_card_pool',
        'card_pools',
        poolId,
        {
          cardCount,
          prngVersion: 'v1'
        },
        request
      )
    } catch (auditError) {
      console.error('Failed to log audit:', auditError)
      // ادامه می‌دهیم حتی اگر audit log ثبت نشد
    }

    return NextResponse.json(
      {
        ok: true,
        poolId,
        message: 'تولید استخر کارت با موفقیت آغاز شد'
      },
      { status: 200 }
    )
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { ok: false, error: 'unauthorized', message: 'جلسه معتبر نیست' },
        { status: 401 }
      )
    }
    if (err.message === 'FORBIDDEN') {
      return NextResponse.json(
        { ok: false, error: 'forbidden', message: 'دسترسی کافی نیست' },
        { status: 403 }
      )
    }

    console.error('POST /api/admin/card-pool/generate error:', err)
    return NextResponse.json(
      { ok: false, error: 'unexpected_error', message: err?.message || 'خطای غیرمنتظره' },
      { status: 500 }
    )
  }
}
