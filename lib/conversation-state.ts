/**
 * 会话状态管理器
 * 使用 Interactions API 的 previous_interaction_id 保持上下文
 */

/**
 * 会话上下文接口
 */
export interface ConversationContext {
  // Interactions API 相关
  lastInteractionId?: string
  lastUpdateTime?: number

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
  static getContext(sessionId: string): ConversationContext {
    const context = sessionCache.get(sessionId)

    if (!context) {
      return {}
    }

    // 检查是否过期
    if (this.isExpired(context)) {
      console.log(`[ConversationManager] Session ${sessionId} expired, removing...`)
      sessionCache.delete(sessionId)
      return {}
    }

    return context
  }

  /**
   * 更新会话上下文
   * @param sessionId 会话 ID
   * @param updates 要更新的字段
   */
  static updateContext(sessionId: string, updates: Partial<ConversationContext>) {
    const existing = sessionCache.get(sessionId) || {}
    const updated: ConversationContext = {
      ...existing,
      ...updates,
      lastUpdateTime: Date.now()
    }

    sessionCache.set(sessionId, updated)

    // 触发清理检查（如果会话数量过多）
    if (sessionCache.size > this.config.maxSessions) {
      this.cleanup()
    }

    console.log(`[ConversationManager] Updated session ${sessionId}, total sessions: ${sessionCache.size}`)
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
