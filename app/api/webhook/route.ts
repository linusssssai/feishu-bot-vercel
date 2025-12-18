/**
 * 飞书事件订阅 Webhook 处理
 * POST /api/webhook
 */

import { NextRequest, NextResponse } from 'next/server'
import { replyMessage, getImageResource } from '@/lib/feishu'
import { generateAssistantReply, analyzeImage } from '@/lib/gemini'

// 已处理的消息ID缓存（防止重复处理）
const processedMessages = new Set<string>()

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    console.log('[Webhook] 收到事件:', JSON.stringify(data, null, 2))

    // 1. URL验证（首次配置时飞书会发送challenge）
    if (data.challenge) {
      console.log('[Webhook] URL验证 - 返回challenge')
      return NextResponse.json({ challenge: data.challenge })
    }

    // 2. 获取事件类型
    const header = data.header || {}
    const eventType = header.event_type || ''
    const eventId = header.event_id || ''

    // 3. 处理消息接收事件
    if (eventType === 'im.message.receive_v1') {
      const event = data.event || {}
      const message = event.message || {}
      const sender = event.sender || {}

      const messageId = message.message_id || ''
      const msgType = message.message_type || ''
      const chatType = message.chat_type || '' // p2p=单聊, group=群聊

      // 防止重复处理
      if (processedMessages.has(messageId)) {
        console.log('[Webhook] 消息已处理，跳过:', messageId)
        return NextResponse.json({ code: 0 })
      }
      processedMessages.add(messageId)

      // 限制缓存大小
      if (processedMessages.size > 1000) {
        const firstKey = processedMessages.values().next().value
        processedMessages.delete(firstKey)
      }

      // 解析消息内容
      let textContent = ''
      let imageKey = ''

      if (msgType === 'text') {
        try {
          const contentJson = JSON.parse(message.content || '{}')
          textContent = contentJson.text || ''
          // 去除@机器人的内容
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

      console.log('[Webhook] 消息详情:', {
        messageId,
        msgType,
        chatType,
        textContent,
        imageKey,
        senderId: sender.sender_id?.open_id,
      })

      // 处理消息并回复
      let replyText = ''

      try {
        if (msgType === 'text' && textContent) {
          // 纯文字消息 - 调用Gemini生成回复
          replyText = await generateAssistantReply(textContent)
        } else if (msgType === 'image' && imageKey) {
          // 图片消息 - 下载图片并分析
          const imageData = await getImageResource(messageId, imageKey)
          if (imageData) {
            replyText = await analyzeImage(imageData)
          } else {
            replyText = '抱歉，无法获取图片内容。'
          }
        } else {
          replyText = `收到你的${msgType}消息，目前仅支持文字和图片处理。`
        }
      } catch (error) {
        console.error('[Webhook] AI处理错误:', error)
        replyText = '抱歉，处理消息时出现错误，请稍后再试。'
      }

      // 发送回复
      if (replyText) {
        await replyMessage(messageId, replyText)
        console.log('[Webhook] 回复已发送')
      }
    }

    return NextResponse.json({ code: 0, msg: 'success' })
  } catch (error) {
    console.error('[Webhook] 处理错误:', error)
    return NextResponse.json({ code: -1, msg: 'error' }, { status: 500 })
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
