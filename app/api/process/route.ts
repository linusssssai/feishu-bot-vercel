/**
 * 异步消息处理API
 * 由webhook触发，负责调用AI生成回复并发送
 */

import { NextRequest, NextResponse } from 'next/server'
import { replyMessage, getImageResource } from '@/lib/feishu'
import { generateAssistantReply, analyzeImage } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  try {
    const { messageId, msgType, textContent, imageKey } = await request.json()

    console.log(`[Process] 开始处理消息: ${messageId}`)

    let replyText = ''

    if (msgType === 'text' && textContent) {
      // 纯文字消息 - 调用Gemini生成回复
      console.log(`[Process] 调用Gemini处理文本: ${textContent.substring(0, 50)}...`)
      replyText = await generateAssistantReply(textContent)
    } else if (msgType === 'image' && imageKey) {
      // 图片消息 - 下载图片并分析
      console.log(`[Process] 处理图片: ${imageKey}`)
      const imageData = await getImageResource(messageId, imageKey)
      if (imageData) {
        replyText = await analyzeImage(imageData)
      } else {
        replyText = '抱歉，无法获取图片内容。'
      }
    } else {
      replyText = `收到你的${msgType}消息，目前仅支持文字和图片处理。`
    }

    // 发送回复
    if (replyText) {
      console.log(`[Process] 发送回复: ${replyText.substring(0, 50)}...`)
      await replyMessage(messageId, replyText)
      console.log(`[Process] 回复已发送`)
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Process] 处理错误:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
