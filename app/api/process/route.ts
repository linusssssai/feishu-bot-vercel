/**
 * 异步消息处理API
 * 由webhook触发，负责调用AI生成回复并发送
 * 支持: 文字回复、图片生成、多图+文字生成、多维表格CRUD
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  replyMessage,
  replyImageMessage,
  uploadImage,
  getImageResource,
  parseBitableUrl,
  getBitableRecords,
  createBitableRecord,
  updateBitableRecord,
  deleteBitableRecord,
  getBitableFields,
  listBitableTables,
  createBitableTable,
  BITABLE_FIELD_TYPES
} from '@/lib/feishu'
import {
  generateAssistantReply,
  generateAssistantReplyWithFallback,
  analyzeImage,
  analyzeUserIntent,
  generateImage,
  generateImageWithReferences,
  analyzeBitableIntent,
  analyzeBitableIntentWithFallback,
  generateBitableResponse,
  BitableOperation
} from '@/lib/gemini'
import { ConversationManager } from '@/lib/conversation-state'
import { analyzeBitableIntentWithContext } from '@/lib/gemini-interactions'

// 用户会话中的多维表格上下文 - 现在由 ConversationManager 管理
// const userBitableContext = new Map<string, { appToken: string; tableId: string; fields?: any[] }>()  // 已废弃

export async function POST(request: NextRequest) {
  try {
    const { messageId, msgType, textContent, imageKeys, chatId } = await request.json()

    // 兼容旧版本的 imageKey 单数参数
    const imageKeyArray: string[] = Array.isArray(imageKeys)
      ? imageKeys
      : (imageKeys ? [imageKeys] : [])

    // 使用chatId作为会话标识（如果没有则用messageId）
    const sessionId = chatId || messageId

    console.log(`[Process] 开始处理消息: ${messageId}, 类型: ${msgType}, 图片数: ${imageKeyArray.length}, 会话: ${sessionId}`)

    // 情况1: 纯文字消息
    if (msgType === 'text' && textContent && imageKeyArray.length === 0) {
      // 首先检查是否包含多维表格URL
      const bitableUrl = parseBitableUrl(textContent)
      if (bitableUrl && bitableUrl.appToken) {
        // 用户发送了多维表格链接，保存上下文
        console.log(`[Process] 检测到多维表格链接: ${bitableUrl.appToken}/${bitableUrl.tableId}`)
        await ConversationManager.updateContext(sessionId, {
          bitableContext: bitableUrl
        })

        // 获取表格信息
        let replyText = '✅ 已识别多维表格链接\n\n'

        if (bitableUrl.tableId) {
          // 有具体表格ID，获取字段信息
          const fields = await getBitableFields(bitableUrl.appToken, bitableUrl.tableId)
          await ConversationManager.updateContext(sessionId, {
            bitableContext: { ...bitableUrl, fields }
          })

          replyText += `📊 表格字段:\n`
          fields.forEach(f => {
            replyText += `  • ${f.field_name} (${getFieldTypeName(f.type)})\n`
          })
          replyText += `\n💡 你可以对我说:\n`
          replyText += `  • "查询所有记录"\n`
          replyText += `  • "添加一条记录，姓名张三，年龄25"\n`
          replyText += `  • "删除第一条记录"\n`
        } else {
          // 只有appToken，列出所有表格
          const tables = await listBitableTables(bitableUrl.appToken)
          replyText += `📋 该应用包含 ${tables.length} 个数据表:\n`
          tables.forEach((t, i) => {
            replyText += `  ${i + 1}. ${t.name} (${t.table_id})\n`
          })
          replyText += `\n💡 请发送包含table参数的完整链接，或告诉我要操作哪个表格`
        }

        await replyMessage(messageId, replyText)
      }
      // 检查是否明确提到图片相关操作（优先级高于多维表格）
      else if (isImageRelatedRequest(textContent)) {
        console.log(`[Process] 检测到图片相关请求，分析意图...`)
        const intent = await analyzeUserIntent(textContent)
        console.log(`[Process] 用户意图: ${intent}`)

        if (intent === 'image_generation') {
          // 图片生成/编辑（使用 Interactions API + 会话记忆）
          console.log(`[Process] 开始生成/编辑图片...`)

          // 获取会话上下文
          const conversationCtx = await ConversationManager.getContext(sessionId)

          const imageResult = await generateImage(textContent, conversationCtx.lastInteractionId)
          await handleImageResult(messageId, sessionId, imageResult)
        } else {
          // 普通文字回复（使用 Interactions API + 会话记忆）
          console.log(`[Process] 调用Gemini处理文本: ${textContent.substring(0, 50)}...`)

          // 获取会话上下文
          const conversationCtx = await ConversationManager.getContext(sessionId)

          try {
            // 尝试使用 Interactions API（带降级）
            const result = await generateAssistantReplyWithFallback(
              textContent,
              conversationCtx.lastInteractionId
            )

            const replyText = result.reply
            console.log(`[Process] 发送回复: ${replyText.substring(0, 50)}...`)
            await replyMessage(messageId, replyText)

            // 保存新的 interaction ID（如果有）
            if (result.interactionId) {
              await ConversationManager.updateContext(sessionId, {
                lastInteractionId: result.interactionId
              })
              console.log(`[Process] 已保存普通对话 interaction ID: ${result.interactionId}`)
            }
          } catch (error) {
            // 最后的保底：如果降级也失败，使用传统方法
            console.error('[Process] 所有方法均失败，使用传统方法保底:', error)
            const replyText = await generateAssistantReply(textContent)
            await replyMessage(messageId, replyText)
          }
        }
      }
      // 检查是否是多维表格操作命令
      else if (isBitableCommand(textContent)) {
        await handleBitableOperation(messageId, sessionId, textContent)
      }
      else {
        // 分析用户意图
        console.log(`[Process] 分析用户意图: ${textContent.substring(0, 50)}...`)
        const intent = await analyzeUserIntent(textContent)
        console.log(`[Process] 用户意图: ${intent}`)

        if (intent === 'image_generation') {
          // 纯文字生成图片（使用 Interactions API + 会话记忆）
          console.log(`[Process] 开始生成图片...`)

          // 获取会话上下文
          const conversationCtx = await ConversationManager.getContext(sessionId)

          const imageResult = await generateImage(textContent, conversationCtx.lastInteractionId)
          await handleImageResult(messageId, sessionId, imageResult)
        } else {
          // 普通文字回复（使用 Interactions API + 会话记忆）
          console.log(`[Process] 调用Gemini处理文本: ${textContent.substring(0, 50)}...`)

          // 获取会话上下文
          const conversationCtx = await ConversationManager.getContext(sessionId)

          try {
            // 尝试使用 Interactions API（带降级）
            const result = await generateAssistantReplyWithFallback(
              textContent,
              conversationCtx.lastInteractionId
            )

            const replyText = result.reply
            console.log(`[Process] 发送回复: ${replyText.substring(0, 50)}...`)
            await replyMessage(messageId, replyText)

            // 保存新的 interaction ID（如果有）
            if (result.interactionId) {
              await ConversationManager.updateContext(sessionId, {
                lastInteractionId: result.interactionId
              })
              console.log(`[Process] 已保存普通对话 interaction ID: ${result.interactionId}`)
            }
          } catch (error) {
            // 最后的保底：如果降级也失败，使用传统方法
            console.error('[Process] 所有方法均失败，使用传统方法保底:', error)
            const replyText = await generateAssistantReply(textContent)
            await replyMessage(messageId, replyText)
          }
        }
      }
    }
    // 情况2: 单图消息（无文字）- 图片分析（使用 Interactions API + 会话记忆）
    else if (msgType === 'image' && imageKeyArray.length === 1 && !textContent) {
      console.log(`[Process] 处理单图分析: ${imageKeyArray[0]}`)
      const imageData = await getImageResource(messageId, imageKeyArray[0])
      if (imageData) {
        // 获取会话上下文
        const conversationCtx = await ConversationManager.getContext(sessionId)

        const result = await analyzeImage(imageData, undefined, conversationCtx.lastInteractionId)
        await replyMessage(messageId, result.reply)

        // 保存新的 interaction ID（如果有）
        if (result.interactionId) {
          await ConversationManager.updateContext(sessionId, {
            lastInteractionId: result.interactionId
          })
          console.log(`[Process] 已保存图片分析 interaction ID: ${result.interactionId}`)
        }
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

      // 获取会话上下文（用于图片生成/编辑的上下文记忆）
      const conversationCtx = await ConversationManager.getContext(sessionId)

      if (imageBuffers.length === 0 && textContent) {
        // 没有成功下载图片，但有文字，当作纯文字生成
        console.log(`[Process] 无可用图片，使用纯文字生成`)
        const imageResult = await generateImage(textContent, conversationCtx.lastInteractionId)
        await handleImageResult(messageId, sessionId, imageResult)
      } else if (imageBuffers.length > 0) {
        // 有图片，调用多图生成/编辑（带上下文记忆）
        const prompt = textContent || '请根据这些图片生成一张新的图片'
        console.log(`[Process] 调用多图生成/编辑, 成功下载 ${imageBuffers.length} 张图片`)
        const imageResult = await generateImageWithReferences(imageBuffers, prompt, conversationCtx.lastInteractionId)
        await handleImageResult(messageId, sessionId, imageResult)
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
 * @param messageId - 消息ID
 * @param sessionId - 会话ID（用于保存 interaction ID）
 * @param imageResult - 图片生成结果（包含 interactionId）
 */
async function handleImageResult(
  messageId: string,
  sessionId: string,
  imageResult: { text?: string; imageBase64?: string; interactionId?: string }
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

      // 保存新的 interaction ID（如果有）
      if (imageResult.interactionId) {
        await ConversationManager.updateContext(sessionId, {
          lastInteractionId: imageResult.interactionId
        })
        console.log(`[Process] 已保存图片生成 interaction ID: ${imageResult.interactionId}`)
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

// ============ 多维表格辅助函数 ============

// 默认多维表格配置（可通过环境变量设置）
const DEFAULT_BITABLE = {
  appToken: process.env.DEFAULT_BITABLE_APP_TOKEN || '',
  tableId: process.env.DEFAULT_BITABLE_TABLE_ID || '',
}

/**
 * 判断是否是图片相关请求
 * 优先级高于多维表格操作判断
 */
function isImageRelatedRequest(text: string): boolean {
  const imageKeywords = [
    '图片', '图', '这张图', '那张图', '上面的图', '刚才的图',
    '画', '生成', '绘制', '创作',
    '背景', '颜色', '大小', '尺寸', '清晰',
    '把图', '这图', '改图', '修改图片', '编辑图片'
  ]
  return imageKeywords.some(k => text.includes(k))
}

/**
 * 判断是否是多维表格操作命令
 * 增强版：支持上下文相关的关键词
 */
function isBitableCommand(text: string): boolean {
  const keywords = [
    // 查询相关
    '查询', '查看', '搜索', '获取', '看看', '看一下', '查一下',
    // 添加相关
    '添加', '新增', '创建', '插入', '再添加', '再加', '再来', '继续', '还要',
    // 修改相关
    '修改', '更新', '编辑',
    // 删除相关
    '删除', '移除', '删掉',
    // 表格/记录相关
    '表格', '记录', '数据表', '条记录', '条数据'
  ]
  return keywords.some(k => text.includes(k))
}

/**
 * 获取字段类型的中文名称
 */
function getFieldTypeName(type: number): string {
  const typeNames: Record<number, string> = {
    1: '文本',
    2: '数字',
    3: '单选',
    4: '多选',
    5: '日期',
    7: '复选框',
    11: '人员',
    15: '超链接',
    17: '附件',
    1001: '创建时间',
    1002: '修改时间',
  }
  return typeNames[type] || '未知'
}

/**
 * 处理多维表格操作
 */
async function handleBitableOperation(messageId: string, sessionId: string, textContent: string) {
  console.log(`[Process] 处理多维表格操作: ${textContent.substring(0, 50)}...`)

  // 获取会话上下文
  const conversationCtx = await ConversationManager.getContext(sessionId)
  let context = conversationCtx.bitableContext

  // 如果没有上下文，尝试使用默认配置
  if (!context && DEFAULT_BITABLE.appToken && DEFAULT_BITABLE.tableId) {
    context = { ...DEFAULT_BITABLE }
    console.log(`[Process] 使用默认多维表格配置`)
  }

  if (!context || !context.appToken) {
    await replyMessage(messageId, '请先发送多维表格链接，或配置默认表格。\n\n格式: https://feishu.cn/base/xxx?table=xxx')
    return
  }

  // 如果没有tableId，提示用户
  if (!context.tableId) {
    const tables = await listBitableTables(context.appToken)
    let reply = '请指定要操作的表格:\n'
    tables.forEach((t, i) => {
      reply += `${i + 1}. ${t.name}\n`
    })
    await replyMessage(messageId, reply)
    return
  }

  // 获取字段信息（如果没有缓存）
  if (!context.fields) {
    context.fields = await getBitableFields(context.appToken, context.tableId)
    await ConversationManager.updateContext(sessionId, {
      bitableContext: context
    })
  }

  // 分析用户意图（使用带上下文的方法）
  // 优先使用 Interactions API 的会话上下文，失败时降级到无上下文方法
  let operation: BitableOperation
  let newInteractionId: string | undefined

  try {
    const result = await analyzeBitableIntentWithContext(
      textContent,
      conversationCtx.lastInteractionId,  // 传递上一次的 interaction ID
      context.fields
    )
    operation = result.operation
    newInteractionId = result.interactionId
    console.log(`[Process] Bitable操作类型: ${operation.type}, 使用会话上下文`)
  } catch (error) {
    console.warn('[Process] 带上下文的意图分析失败，降级到无上下文方法:', error)
    operation = await analyzeBitableIntentWithFallback(textContent, context.fields)
    console.log(`[Process] Bitable操作类型: ${operation.type}, 降级模式`)
  }

  try {
    let result: any
    let responseText: string

    switch (operation.type) {
      case 'query': {
        // 查询记录
        const records = await getBitableRecords(context.appToken, context.tableId, operation.filter)
        result = { count: records.length, records: records.slice(0, 10) }
        responseText = await generateBitableResponse('query', result)
        break
      }

      case 'create': {
        // 创建记录
        if (!operation.fields || Object.keys(operation.fields).length === 0) {
          responseText = '请告诉我要添加的记录内容，例如: "添加一条记录，姓名张三，年龄25"'
        } else {
          const recordId = await createBitableRecord(context.appToken, context.tableId, operation.fields)
          result = { success: !!recordId, recordId }
          responseText = await generateBitableResponse('create', result)
        }
        break
      }

      case 'update': {
        // 更新记录
        if (!operation.recordId) {
          // 没有指定记录ID，先查询
          const records = await getBitableRecords(context.appToken, context.tableId)
          if (records.length === 0) {
            responseText = '表格中暂无记录可更新'
          } else {
            responseText = `请指定要更新的记录。当前有 ${records.length} 条记录:\n`
            records.slice(0, 5).forEach((r, i) => {
              const firstField = Object.values(r.fields)[0]
              responseText += `${i + 1}. ${firstField || '(空)'}\n`
            })
          }
        } else {
          const success = await updateBitableRecord(
            context.appToken,
            context.tableId,
            operation.recordId,
            operation.fields || {}
          )
          result = { success }
          responseText = await generateBitableResponse('update', result)
        }
        break
      }

      case 'delete': {
        // 删除记录
        if (!operation.recordId) {
          // 没有指定记录ID，查询并删除第一条或按条件删除
          const records = await getBitableRecords(context.appToken, context.tableId, operation.filter)
          if (records.length === 0) {
            responseText = '没有找到符合条件的记录'
          } else if (operation.description?.includes('第一条') || operation.description?.includes('首条')) {
            // 删除第一条
            const success = await deleteBitableRecord(context.appToken, context.tableId, records[0].record_id)
            result = { success, deletedCount: success ? 1 : 0 }
            responseText = await generateBitableResponse('delete', result)
          } else {
            responseText = `找到 ${records.length} 条记录，请确认要删除哪条:\n`
            records.slice(0, 5).forEach((r, i) => {
              const firstField = Object.values(r.fields)[0]
              responseText += `${i + 1}. ${firstField || '(空)'}\n`
            })
            responseText += '\n请说 "删除第X条" 来确认删除'
          }
        } else {
          const success = await deleteBitableRecord(context.appToken, context.tableId, operation.recordId)
          result = { success }
          responseText = await generateBitableResponse('delete', result)
        }
        break
      }

      case 'create_table': {
        // 创建新表格
        if (!operation.tableName || !operation.tableFields) {
          responseText = '请告诉我表格名称和字段，例如: "创建员工表，包含姓名、部门、入职日期"'
        } else {
          // 转换字段类型
          const fields = operation.tableFields.map(f => ({
            field_name: f.name,
            type: convertFieldType(f.type),
          }))
          const newTableId = await createBitableTable(context.appToken, operation.tableName, fields)
          result = { success: !!newTableId, tableId: newTableId, tableName: operation.tableName }
          responseText = await generateBitableResponse('create_table', result)

          // 更新上下文到新表格
          if (newTableId) {
            await ConversationManager.updateContext(sessionId, {
              bitableContext: {
                appToken: context.appToken,
                tableId: newTableId,
              }
            })
          }
        }
        break
      }

      default:
        responseText = '我不太理解这个操作。你可以尝试:\n• 查询记录\n• 添加记录\n• 修改记录\n• 删除记录\n• 创建新表格'
    }

    await replyMessage(messageId, responseText)

    // 保存新的 interaction ID（如果有）
    if (newInteractionId) {
      await ConversationManager.updateContext(sessionId, {
        lastInteractionId: newInteractionId
      })
      console.log(`[Process] 已保存 interaction ID: ${newInteractionId}`)
    }

  } catch (error) {
    console.error('[Process] Bitable操作错误:', error)
    const errorResponse = await generateBitableResponse(operation.type, null, String(error))
    await replyMessage(messageId, errorResponse)
  }
}

/**
 * 转换字段类型字符串到数字
 */
function convertFieldType(typeStr: string): number {
  const typeMap: Record<string, number> = {
    'text': BITABLE_FIELD_TYPES.TEXT,
    'number': BITABLE_FIELD_TYPES.NUMBER,
    'single_select': BITABLE_FIELD_TYPES.SINGLE_SELECT,
    'multi_select': BITABLE_FIELD_TYPES.MULTI_SELECT,
    'date': BITABLE_FIELD_TYPES.DATE,
    'checkbox': BITABLE_FIELD_TYPES.CHECKBOX,
    'person': BITABLE_FIELD_TYPES.PERSON,
    'url': BITABLE_FIELD_TYPES.URL,
    'attachment': BITABLE_FIELD_TYPES.ATTACHMENT,
  }
  return typeMap[typeStr.toLowerCase()] || BITABLE_FIELD_TYPES.TEXT
}
