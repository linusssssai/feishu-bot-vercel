/**
 * 会话状态管理器
 * 使用 Interactions API 的 previous_interaction_id 保持上下文
 */

import { SupabaseSessionStore } from './session-store'

/**
 * 会话上下文接口
 */
export interface ConversationContext {
  // Interactions API 相关
  lastInteractionId?: string
  lastUpdateTime?: number

  // 图片上下文 - 用于迭代编辑
  // ✅ CHANGED: 存储 Files API URI 而不是 base64
  lastGeneratedImageUri?: string     // Files API URI (e.g., https://generativelanguage.googleapis.com/v1beta/files/abc123)
  lastGeneratedImageFileName?: string // Files API 文件名 (e.g., files/abc123) - 用于清理
  lastImageMessageId?: string        // 对应的飞书消息 ID（用于引用）

  // 保留 base64 字段用于向后兼容（可选）
  lastGeneratedImage?: string  // @deprecated - 迁移完成后可删除

  // ✅ NEW: 视频上下文 - 用于延展
  lastGeneratedVideoUri?: string      // Gemini Files API URI（2天有效）
  lastGeneratedVideoFileName?: string // 文件名（用于引用）
  lastVideoMessageId?: string         // 飞书消息ID
  lastVideoOperationName?: string     // Operation名称（用于断点续传）
  videoGenerationTimestamp?: number   // 生成时间戳（检查2天过期）

  // Bitable 上下文
  bitableContext?: {
    appToken: string
    tableId: string
    fields?: any[]
  }
}

/**
 * 会话存储配置
 */
interface SessionConfig {
  ttl: number  // Time to live in milliseconds
  maxSessions: number  // Maximum number of sessions to store
}

// 默认配置
const DEFAULT_CONFIG: SessionConfig = {
  ttl: 24 * 60 * 60 * 1000,  // 24 hours
  maxSessions: 10000  // 最多存储 10000 个会话
}

/**
 * 会话存储（内存 Map）
 * 未来可以升级为 Redis/KV Store
 */
const sessionCache = new Map<string, ConversationContext>()

/**
 * 会话管理器
 * 提供会话上下文的 CRUD 操作和 TTL 管理
 */
export class ConversationManager {
  private static config: SessionConfig = DEFAULT_CONFIG

  /**
   * 配置会话管理器
   */
  static configure(config: Partial<SessionConfig>) {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取会话上下文
   * @param sessionId 会话 ID（通常是 chatId 或 messageId）
   * @returns 会话上下文，如果不存在则返回空对象
   */
  static async getContext(sessionId: string): Promise<ConversationContext> {
    // 先检查内存缓存（快速路径）
    const cached = sessionCache.get(sessionId)
    if (cached && !this.isExpired(cached)) {
      console.log(`[ConversationManager] Cache hit for session ${sessionId}`)
      return cached
    }

    // 从 Supabase 获取
    try {
      const context = await SupabaseSessionStore.getSession(sessionId)

      // 保存到内存缓存
      if (context && Object.keys(context).length > 0) {
        sessionCache.set(sessionId, context)
        console.log(`[ConversationManager] Loaded from Supabase for session ${sessionId}`)
        return context
      }
    } catch (error) {
      console.error(`[ConversationManager] Failed to load from Supabase:`, error)
    }

    // 缓存未命中或 Supabase 失败
    console.log(`[ConversationManager] Cache miss for session ${sessionId}`)
    return {}
  }

  /**
   * 更新会话上下文
   * @param sessionId 会话 ID
   * @param updates 要更新的字段
   */
  static async updateContext(sessionId: string, updates: Partial<ConversationContext>): Promise<void> {
    const existing = sessionCache.get(sessionId) || {}

    // ✅ NEW: 清理旧的 Files API 文件（图片）
    if (updates.lastGeneratedImageFileName && existing.lastGeneratedImageFileName) {
      if (updates.lastGeneratedImageFileName !== existing.lastGeneratedImageFileName) {
        // 新图片已生成，删除旧文件
        const { deleteGeminiFile } = await import('./gemini-interactions')
        deleteGeminiFile(existing.lastGeneratedImageFileName).catch(err => {
          console.warn(`[ConversationManager] 清理旧图片失败: ${existing.lastGeneratedImageFileName}`, err)
        })
      }
    }

    // ✅ NEW: 清理旧的视频文件
    if (updates.lastGeneratedVideoFileName && existing.lastGeneratedVideoFileName) {
      if (updates.lastGeneratedVideoFileName !== existing.lastGeneratedVideoFileName) {
        // 视频文件2天后自动删除，无需主动清理
        console.log(`[ConversationManager] 新视频已生成，旧视频URI将在2天后过期`)
      }
    }

    const updated: ConversationContext = {
      ...existing,
      ...updates,
      lastUpdateTime: Date.now()
    }

    // 同步更新内存缓存
    sessionCache.set(sessionId, updated)

    console.log(`[ConversationManager] Updated session ${sessionId}`, updated)

    // 异步保存到 Supabase（不等待完成）
    SupabaseSessionStore.saveSession(sessionId, updated).catch(err => {
      console.error(`[ConversationManager] Failed to save session ${sessionId}:`, err)
    })
  }

  /**
   * 删除会话上下文
   * @param sessionId 会话 ID
   */
  static deleteContext(sessionId: string) {
    const deleted = sessionCache.delete(sessionId)
    if (deleted) {
      console.log(`[ConversationManager] Deleted session ${sessionId}`)
    }
    return deleted
  }

  /**
   * 清除所有会话
   */
  static clearAll() {
    const count = sessionCache.size
    sessionCache.clear()
    console.log(`[ConversationManager] Cleared all ${count} sessions`)
  }

  /**
   * 获取当前会话数量
   */
  static getSessionCount(): number {
    return sessionCache.size
  }

  /**
   * 检查会话是否过期
   */
  private static isExpired(context: ConversationContext): boolean {
    if (!context.lastUpdateTime) {
      return false  // 没有时间戳，视为未过期（兼容旧数据）
    }

    const now = Date.now()
    const age = now - context.lastUpdateTime

    return age > this.config.ttl
  }

  /**
   * 清理过期会话
   * 定期调用或在会话数量过多时调用
   */
  static cleanup() {
    console.log(`[ConversationManager] Starting cleanup, current sessions: ${sessionCache.size}`)

    let removed = 0
    const now = Date.now()

    // 遍历所有会话，删除过期的
    for (const [sessionId, context] of sessionCache.entries()) {
      if (this.isExpired(context)) {
        sessionCache.delete(sessionId)
        removed++
      }
    }

    // 如果还是太多，删除最旧的
    if (sessionCache.size > this.config.maxSessions) {
      const sessions = Array.from(sessionCache.entries())
      // 按更新时间排序
      sessions.sort((a, b) => {
        const timeA = a[1].lastUpdateTime || 0
        const timeB = b[1].lastUpdateTime || 0
        return timeA - timeB
      })

      // 删除最旧的直到满足限制
      const toRemove = sessionCache.size - this.config.maxSessions
      for (let i = 0; i < toRemove; i++) {
        sessionCache.delete(sessions[i][0])
        removed++
      }
    }

    console.log(`[ConversationManager] Cleanup complete, removed ${removed} sessions, remaining: ${sessionCache.size}`)
  }

  /**
   * 获取会话统计信息（用于监控）
   */
  static getStats(): {
    totalSessions: number
    oldestSession?: number
    newestSession?: number
  } {
    const sessions = Array.from(sessionCache.values())

    if (sessions.length === 0) {
      return { totalSessions: 0 }
    }

    const timestamps = sessions
      .map(s => s.lastUpdateTime)
      .filter(t => t !== undefined) as number[]

    return {
      totalSessions: sessions.length,
      oldestSession: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestSession: timestamps.length > 0 ? Math.max(...timestamps) : undefined
    }
  }
}

/**
 * 定期清理任务（可选）
 * 在 Serverless 环境中可能不需要，因为每次冷启动都会清空内存
 */
export function startCleanupTask(intervalMs: number = 60 * 60 * 1000) {
  setInterval(() => {
    ConversationManager.cleanup()
  }, intervalMs)

  console.log(`[ConversationManager] Cleanup task started, interval: ${intervalMs}ms`)
}
