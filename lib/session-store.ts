/**
 * 会话存储接口 - Supabase 实现
 */

import { getSupabaseClient } from './supabase'
import type { ConversationContext } from './conversation-state'

const TTL_HOURS = 24  // 会话有效期 24 小时

/**
 * Supabase 会话存储
 */
export class SupabaseSessionStore {
  /**
   * 获取会话上下文
   */
  static async getSession(sessionId: string): Promise<ConversationContext> {
    try {
      const supabase = getSupabaseClient()

      const { data, error } = await supabase
        .from('sessions')
        .select('conversation_context, last_interaction_id, expires_at')
        .eq('session_id', sessionId)
        .single()

      if (error) {
        // 记录不存在时返回空对象
        if (error.code === 'PGRST116') {
          console.log(`[SessionStore] Session ${sessionId} not found`)
          return {}
        }
        throw error
      }

      // 检查是否过期
      if (data && new Date(data.expires_at) < new Date()) {
        console.log(`[SessionStore] Session ${sessionId} expired, deleting...`)
        await this.deleteSession(sessionId)
        return {}
      }

      console.log(`[SessionStore] Retrieved session ${sessionId}`)
      return data?.conversation_context || {}

    } catch (error) {
      console.error('[SessionStore] Error getting session:', error)
      // 降级：返回空对象，不影响功能
      return {}
    }
  }

  /**
   * 保存会话上下文
   */
  static async saveSession(
    sessionId: string,
    context: ConversationContext
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient()

      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + TTL_HOURS)

      const { error } = await supabase
        .from('sessions')
        .upsert({
          session_id: sessionId,
          conversation_context: context,
          last_interaction_id: context.lastInteractionId || null,
          last_updated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString()
        }, {
          onConflict: 'session_id'
        })

      if (error) {
        throw error
      }

      console.log(`[SessionStore] Saved session ${sessionId}`)

    } catch (error) {
      console.error('[SessionStore] Error saving session:', error)
      // 不抛出错误，允许继续执行（降级处理）
    }
  }

  /**
   * 删除会话
   */
  static async deleteSession(sessionId: string): Promise<void> {
    try {
      const supabase = getSupabaseClient()

      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('session_id', sessionId)

      if (error) {
        throw error
      }

      console.log(`[SessionStore] Deleted session ${sessionId}`)

    } catch (error) {
      console.error('[SessionStore] Error deleting session:', error)
    }
  }

  /**
   * 清理过期会话（可定期调用）
   */
  static async cleanupExpired(): Promise<number> {
    try {
      const supabase = getSupabaseClient()

      const { data, error } = await supabase
        .from('sessions')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('session_id')

      if (error) {
        throw error
      }

      const count = data?.length || 0
      console.log(`[SessionStore] Cleaned up ${count} expired sessions`)
      return count

    } catch (error) {
      console.error('[SessionStore] Error cleaning up:', error)
      return 0
    }
  }
}
