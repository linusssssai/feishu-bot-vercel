/**
 * Supabase 客户端初始化
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

/**
 * 获取 Supabase 客户端（单例模式）
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY  // 使用 service key，权限更高

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase 配置缺失: SUPABASE_URL 或 SUPABASE_SERVICE_KEY 未设置')
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false  // Serverless 环境不需要持久化 session
    }
  })

  console.log('[Supabase] Client initialized')
  return supabaseClient
}
