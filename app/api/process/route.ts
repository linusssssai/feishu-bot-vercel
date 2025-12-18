/**
 * 异步消息处理API
 * 由webhook触发，负责调用AI生成回复并发送
 * 支持: 文字回复、图片生成、多图+文字生成
 */

import { NextRequest, NextResponse } from 'next/server'
import { replyMessage, replyImageMessage, uploadImage, getImageResource } from '@/lib/feishu'
import {
  generateAssistantReply,
  analyzeImage,
  analyzeUserIntent,
  generateImage,
  generateImageWithReferences
} from '@/lib/gemini'

export async function POST(request: NextRequest) {
  try {
    const { messageId, msgType, textContent, imageKeys } = await request.json()

    // 兼容旧版本的 imageKey 单数参数
    const imageKeyArray: string[] = Array.isArray(imageKeys)
      ? imageKeys
      : (imageKeys ? [imageKeys] : [])

    console.log(`[Process] 开始处理消息: ${messageId}, 类型: ${msgType}, 图片数: ${imageKeyArray.length}`)

    // 情况1: 纯文字消息
    if (msgType === 'text' && textContent && imageKeyArray.length === 0) {
      // 分析用户意图
      console.log(`[Process] 分析用户意图: ${textContent.substring(0, 50)}...`)
      const intent = await analyzeUserIntent(textContent)
      console.log(`[Process] 用户意图: ${intent}`)

      if (intent === 'image_generation') {
        // 纯文字生成图片
        console.log(`[Process] 开始生成图片...`)
        const imageResult = await generateImage(textContent)
        await handleImageResult(messageId, imageResult)
      } else {
        // 普通文字回复
        console.log(`[Process] 调用Gemini处理文本: ${textContent.substring(0, 50)}...`)
        const replyText = await generateAssistantReply(textContent)
        console.log(`[Process] 发送回复: ${replyText.substring(0, 50)}...`)
        await replyMessage(messageId, replyText)
      }
    }
    // 情况2: 单图消息（无文字）- 图片分析
    else if (msgType === 'image' && imageKeyArray.length === 1 && !textContent) {
      console.log(`[Process] 处理单图分析: ${imageKeyArray[0]}`)
      const imageData = await getImageResource(messageId, imageKeyArray[0])
      if (imageData) {
        const replyText = await analyzeImage(imageData)
        await replyMessage(messageId, replyText)
      } else {
        await replyMessage(messageId, '抱歉，无法获取图片内容。')
      }
    }
    // 情况3: 富文本消息（图片+文字）或多图 - 调用多图生成
    else if ((msgType === 'post' || imageKeyArray.length > 0) && (textContent || imageKeyArray.length > 0)) {
      console.log(`[Process] 处理多图+文字生成: 图片数=${imageKeyArray.length}`)

      // 下载所有图片
      const imageBuffers: ArrayBuffer[] = []
      for (const key of imageKeyArray) {
        console.log(`[Process] 下载图片: ${key}`)
        const imageData = await getImageResource(messageId, key)
        if (imageData) {
          imageBuffers.push(imageData)
        }
      }

      if (imageBuffers.length === 0 && textContent) {
        // 没有成功下载图片，但有文字，当作纯文字生成
        console.log(`[Process] 无可用图片，使用纯文字生成`)
        const imageResult = await generateImage(textContent)
        await handleImageResult(messageId, imageResult)
      } else if (imageBuffers.length > 0) {
        // 有图片，调用多图生成
        const prompt = textContent || '请根据这些图片生成一张新的图片'
        console.log(`[Process] 调用多图生成, 成功下载 ${imageBuffers.length} 张图片`)
        const imageResult = await generateImageWithReferences(imageBuffers, prompt)
        await handleImageResult(messageId, imageResult)
      } else {
        await replyMessage(messageId, '抱歉，无法获取图片内容，请重新发送。')
      }
    }
    // 其他情况
    else {
      await replyMessage(messageId, `收到你的${msgType}消息，目前仅支持文字和图片处理。`)
    }

    console.log(`[Process] 处理完成`)
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Process] 处理错误:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

/**
 * 处理图片生成结果
 */
async function handleImageResult(
  messageId: string,
  imageResult: { text?: string; imageBase64?: string }
) {
  if (imageResult.imageBase64) {
    // 上传图片到飞书
    console.log(`[Process] 上传图片到飞书...`)
    const imageBuffer = Buffer.from(imageResult.imageBase64, 'base64')
    const uploadedImageKey = await uploadImage(imageBuffer)

    if (uploadedImageKey) {
      // 发送图片回复
      console.log(`[Process] 发送图片回复: ${uploadedImageKey}`)
      await replyImageMessage(messageId, uploadedImageKey)

      // 如果有附带文字描述，也发送
      if (imageResult.text) {
        await replyMessage(messageId, imageResult.text)
      }
    } else {
      await replyMessage(messageId, '抱歉，图片上传失败，请稍后重试。')
    }
  } else {
    // 未生成图片
    const errorText = imageResult.text || '抱歉，无法生成图片，请尝试其他描述。'
    await replyMessage(messageId, errorText)
  }
}
