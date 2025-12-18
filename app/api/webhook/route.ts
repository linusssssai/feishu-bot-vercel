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
  imageKeys: string[]  // 改为数组，支持多图
) {
  // 使用自定义域名（中国可访问）
  const baseUrl = 'https://feishu-hook.cc-agent.net'

  try {
    // 调用异步处理API
    await fetch(`${baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, msgType, textContent, imageKeys }),
    })
  } catch (error) {
    console.error('[Webhook] 触发异步处理失败:', error)
  }
}

/**
 * 解析富文本消息（post类型）
 * 提取所有文本和图片
 */
function parsePostContent(content: string): { text: string; imageKeys: string[] } {
  const result = { text: '', imageKeys: [] as string[] }

  try {
    const contentJson = JSON.parse(content)
    console.log(`[Webhook] parsePostContent JSON keys: ${Object.keys(contentJson).join(', ')}`)

    // 尝试多种可能的结构
    let langContent: any = null

    // 结构1: { post: { zh_cn: { content: [...] } } }
    if (contentJson.post) {
      const post = contentJson.post
      langContent = post.zh_cn || post.en_us || post.ja_jp || Object.values(post)[0]
    }
    // 结构2: { zh_cn: { content: [...] } }
    else if (contentJson.zh_cn || contentJson.en_us) {
      langContent = contentJson.zh_cn || contentJson.en_us
    }
    // 结构3: { title: "", content: [...] } 直接是内容
    else if (contentJson.content && Array.isArray(contentJson.content)) {
      langContent = contentJson
    }

    if (!langContent) {
      console.log(`[Webhook] 无法识别post结构`)
      return result
    }

    console.log(`[Webhook] langContent keys: ${Object.keys(langContent).join(', ')}`)

    // 提取标题
    if (langContent.title) {
      result.text += langContent.title + '\n'
    }

    // 遍历所有段落
    const paragraphs = langContent.content || []
    console.log(`[Webhook] 段落数: ${paragraphs.length}`)

    for (const paragraph of paragraphs) {
      if (!Array.isArray(paragraph)) continue

      for (const element of paragraph) {
        console.log(`[Webhook] 元素: ${JSON.stringify(element)}`)

        if (element.tag === 'text' && element.text) {
          result.text += element.text
        } else if (element.tag === 'img' && element.image_key) {
          result.imageKeys.push(element.image_key)
        } else if (element.tag === 'a' && element.text) {
          result.text += element.text
        }
        // 也检查 media 类型（某些版本可能用这个）
        else if (element.tag === 'media' && element.image_key) {
          result.imageKeys.push(element.image_key)
        }
      }
      result.text += '\n'
    }

    result.text = result.text.trim()
  } catch (e) {
    console.error('[Webhook] 解析post消息失败:', e)
  }

  return result
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
      let imageKeys: string[] = []

      if (msgType === 'text') {
        // 纯文本消息
        try {
          const contentJson = JSON.parse(message.content || '{}')
          textContent = contentJson.text || ''
          textContent = textContent.replace(/@_user_\d+/g, '').trim()
        } catch {
          textContent = message.content || ''
        }
      } else if (msgType === 'image') {
        // 单图消息
        try {
          const contentJson = JSON.parse(message.content || '{}')
          if (contentJson.image_key) {
            imageKeys.push(contentJson.image_key)
          }
        } catch {
          // ignore
        }
      } else if (msgType === 'post') {
        // 富文本消息（可包含多图+文字）
        console.log(`[Webhook] 原始post内容: ${message.content}`)
        const parsed = parsePostContent(message.content || '{}')
        textContent = parsed.text
        imageKeys = parsed.imageKeys
        console.log(`[Webhook] 富文本消息 - 文字: ${textContent.substring(0, 50)}... 图片数: ${imageKeys.length}`)
      }

      console.log(`[Webhook] 收到消息 - ${Date.now() - startTime}ms - ${messageId} - 类型: ${msgType}`)

      // 关键：使用waitUntil确保异步处理完成，但不阻塞响应
      waitUntil(processMessageAsync(messageId, msgType, textContent, imageKeys))
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
