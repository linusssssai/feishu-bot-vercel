/**
 * 飞书事件订阅 Webhook 处理
 * 核心原则：先在 10-50ms 内返回 200，再异步处理
 */

import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { replyMessage } from '@/lib/feishu'
import { generateAssistantReply } from '@/lib/gemini'

// 改用Node.js Runtime（支持后台执行）
export const runtime = 'nodejs'
export const maxDuration = 30

// 已处理的消息ID缓存（防止重复处理）
const processedMessages = new Set<string>()

// 异步处理消息（不阻塞响应）
async function processMessageAsync(
  messageId: string,
  msgType: string,
  textContent: string,
  imageKey: string
) {
  // 使用自定义域名（中国可访问）
  const baseUrl = 'https://feishu-hook.cc-agent.net'

  try {
    // 调用异步处理API
    await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, msgType, textContent, imageKey }),
    })
  } catch (error) {
    console.error('[Webhook] 触发异步处理失败:', error)
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const data = await request.json()

    // 1. URL验证（首次配置时飞书会发送challenge）- 必须最快返回
    if (data.challenge) {
      console.log(`[Webhook] URL验证 - ${Date.now() - startTime}ms`)
      return NextResponse.json({ challenge: data.challenge })
    }

    // 2. 获取事件类型
    const header = data.header || {}
    const eventType = header.event_type || ''

    // 3. 处理消息接收事件
    if (eventType === 'im.message.receive_v1') {
      const event = data.event || {}
      const message = event.message || {}

      const messageId = message.message_id || ''
      const msgType = message.message_type || ''

      // 防止重复处理
      if (processedMessages.has(messageId)) {
        return NextResponse.json({ code: 0 })
      }
      processedMessages.add(messageId)

      // 限制缓存大小
      if (processedMessages.size > 1000) {
        const firstKey = processedMessages.values().next().value
        if (firstKey) processedMessages.delete(firstKey)
      }

      // 解析消息内容
      let textContent = ''
      let imageKey = ''

      if (msgType === 'text') {
        try {
          const contentJson = JSON.parse(message.content || '{}')
          textContent = contentJson.text || ''
          textContent = textContent.replace(/@_user_\d+/g, '').trim()
        } catch {
          textContent = message.content || ''
        }
      } else if (msgType === 'image') {
        try {
          const contentJson = JSON.parse(message.content || '{}')
          imageKey = contentJson.image_key || ''
        } catch {
          // ignore
        }
      }

      console.log(`[Webhook] 收到消息 - ${Date.now() - startTime}ms - ${messageId}`)

      // 关键：使用waitUntil确保异步处理完成，但不阻塞响应
      waitUntil(processMessageAsync(messageId, msgType, textContent, imageKey))
    }

    // 立即返回200！
    console.log(`[Webhook] 返回200 - ${Date.now() - startTime}ms`)
    return NextResponse.json({ code: 0, msg: 'success' })

  } catch (error) {
    console.error('[Webhook] 错误:', error)
    return NextResponse.json({ code: 0 }) // 即使出错也返回200，避免飞书重试
  }
}

// 健康检查
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: '飞书机器人 Webhook 服务运行中',
    timestamp: new Date().toISOString(),
  })
}
