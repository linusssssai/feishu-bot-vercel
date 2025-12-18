/**
 * 异步消息处理API
 * 由webhook触发，负责调用AI生成回复并发送
 * 支持: 文字回复、图片生成
 */

import { NextRequest, NextResponse } from 'next/server'
import { replyMessage, replyImageMessage, uploadImage, getImageResource } from '@/lib/feishu'
import { generateAssistantReply, analyzeImage, analyzeUserIntent, generateImage } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  try {
    const { messageId, msgType, textContent, imageKey } = await request.json()

    console.log(`[Process] 开始处理消息: ${messageId}`)

    if (msgType === 'text' && textContent) {
      // Step 1: 分析用户意图
      console.log(`[Process] 分析用户意图: ${textContent.substring(0, 50)}...`)
      const intent = await analyzeUserIntent(textContent)
      console.log(`[Process] 用户意图: ${intent}`)

      if (intent === 'image_generation') {
        // Step 2a: 生成图片
        console.log(`[Process] 开始生成图片...`)
        const imageResult = await generateImage(textContent)

        if (imageResult.imageBase64) {
          // Step 3: 上传图片到飞书
          console.log(`[Process] 上传图片到飞书...`)
          const imageBuffer = Buffer.from(imageResult.imageBase64, 'base64')
          const uploadedImageKey = await uploadImage(imageBuffer)

          if (uploadedImageKey) {
            // Step 4: 发送图片回复
            console.log(`[Process] 发送图片回复: ${uploadedImageKey}`)
            await replyImageMessage(messageId, uploadedImageKey)

            // 如果有附带文字描述，也发送
            if (imageResult.text) {
              await replyMessage(messageId, imageResult.text)
            }
          } else {
            // 上传失败
            await replyMessage(messageId, '抱歉，图片上传失败，请稍后重试。')
          }
        } else {
          // 未生成图片
          const errorText = imageResult.text || '抱歉，无法生成图片，请尝试其他描述。'
          await replyMessage(messageId, errorText)
        }
      } else {
        // Step 2b: 普通文字回复
        console.log(`[Process] 调用Gemini处理文本: ${textContent.substring(0, 50)}...`)
        const replyText = await generateAssistantReply(textContent)
        console.log(`[Process] 发送回复: ${replyText.substring(0, 50)}...`)
        await replyMessage(messageId, replyText)
      }

    } else if (msgType === 'image' && imageKey) {
      // 图片消息 - 下载图片并分析
      console.log(`[Process] 处理图片: ${imageKey}`)
      const imageData = await getImageResource(messageId, imageKey)
      if (imageData) {
        const replyText = await analyzeImage(imageData)
        await replyMessage(messageId, replyText)
      } else {
        await replyMessage(messageId, '抱歉，无法获取图片内容。')
      }

    } else {
      await replyMessage(messageId, `收到你的${msgType}消息，目前仅支持文字和图片处理。`)
    }

    console.log(`[Process] 处理完成`)
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Process] 处理错误:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
