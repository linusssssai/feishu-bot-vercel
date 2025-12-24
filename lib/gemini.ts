/**
 * Google Gemini API 封装
 * 支持多模态（图片+文字）+ 图片生成
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleGenAI } from '@google/genai'

// 初始化 Gemini
function getGeminiClient() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY 未配置')
  }
  return new GoogleGenerativeAI(apiKey)
}

/**
 * 纯文字对话
 */
export async function chatWithText(prompt: string): Promise<string> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

  const result = await model.generateContent(prompt)
  const response = await result.response
  return response.text()
}

/**
 * 多模态对话（图片+文字）- 传统方法（作为降级备份）
 */
async function chatWithImageLegacy(
  prompt: string,
  imageData: ArrayBuffer,
  mimeType: string = 'image/png'
): Promise<string> {
  console.log('[Gemini] 使用传统方法进行图片对话')

  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

  // 将图片转为 base64
  const base64Image = Buffer.from(imageData).toString('base64')

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64Image,
        mimeType: mimeType,
      },
    },
  ])

  const response = await result.response
  return response.text()
}

/**
 * 多模态对话（图片+文字）- 带降级
 * 优先使用 Interactions API（支持上下文记忆），失败时回退到传统方法
 */
export async function chatWithImage(
  prompt: string,
  imageData: ArrayBuffer,
  mimeType: string = 'image/png',
  previousInteractionId?: string
): Promise<{ reply: string; interactionId?: string }> {
  try {
    // 尝试使用 Interactions API（支持上下文记忆）
    const { analyzeImageWithInteractions } = await import('./gemini-interactions')
    const result = await analyzeImageWithInteractions(imageData, prompt, previousInteractionId)

    console.log('[Gemini] 使用 Interactions API 图片对话成功（支持上下文记忆）')
    return {
      reply: result.reply,
      interactionId: result.interactionId
    }

  } catch (error) {
    // 降级：使用传统方法（无上下文记忆）
    console.warn('[Gemini] Interactions API 失败，降级到传统方法:', error)
    const reply = await chatWithImageLegacy(prompt, imageData, mimeType)

    return {
      reply,
      interactionId: undefined  // 降级模式没有 interaction ID
    }
  }
}

/**
 * 智能助手 - 根据用户消息生成回复
 */
export async function generateAssistantReply(
  userMessage: string,
  context?: string
): Promise<string> {
  const systemPrompt = `你是一个智能飞书机器人助手。请用简洁友好的中文回复用户。

${context ? `上下文信息：${context}` : ''}

用户消息：${userMessage}

请直接回复用户，不要加任何前缀。`

  return await chatWithText(systemPrompt)
}

/**
 * 带降级的普通对话
 * 优先使用 Interactions API（有会话记忆），失败时回退到传统方法
 */
export async function generateAssistantReplyWithFallback(
  userMessage: string,
  previousInteractionId?: string
): Promise<{ reply: string; interactionId?: string }> {
  try {
    // 尝试使用 Interactions API（带会话记忆）
    const { chatWithContext } = await import('./gemini-interactions')
    const result = await chatWithContext(userMessage, previousInteractionId)

    console.log('[Gemini] 使用 Interactions API 对话成功（有会话记忆）')
    return result

  } catch (error) {
    // 降级：使用传统方法（无会话记忆）
    console.warn('[Gemini] Interactions API 失败，降级到传统方法:', error)
    const reply = await generateAssistantReply(userMessage)

    return {
      reply,
      interactionId: undefined  // 降级模式没有 interaction ID
    }
  }
}

/**
 * 图片分析助手（带降级）
 */
export async function analyzeImage(
  imageData: ArrayBuffer,
  userPrompt?: string,
  previousInteractionId?: string
): Promise<{ reply: string; interactionId?: string }> {
  const prompt = userPrompt || '请描述这张图片的内容，用中文回答。'

  return await chatWithImage(prompt, imageData, 'image/png', previousInteractionId)
}

// ============ 图片生成功能 ============

/**
 * 获取 GenAI 客户端 (用于图片生成)
 */
function getGenAIClient() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY 未配置')
  }
  return new GoogleGenAI({ apiKey })
}

/**
 * 分析用户意图
 * @returns 'text' | 'image_generation'
 */
export async function analyzeUserIntent(userMessage: string): Promise<'text' | 'image_generation'> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

  const prompt = `分析以下用户消息的意图。判断用户是想要：
1. 普通文字对话/问答 -> 返回 "text"
2. 生成或编辑图片 -> 返回 "image_generation"

图片相关的操作包括：
- 生成新图片：画一张xxx、生成xxx的图片、帮我画、创作一个xxx的图像、设计一个xxx
- 编辑图片：把这张图xxx、改成xxx、修改xxx、调整xxx、换成xxx、变成xxx
- 图片属性修改：改颜色、改背景、改大小、改清晰度、加xxx、去掉xxx

只返回 "text" 或 "image_generation"，不要返回其他内容。

用户消息：${userMessage}`

  const result = await model.generateContent(prompt)
  const response = await result.response
  const intent = response.text().trim().toLowerCase()

  console.log(`[Gemini] 意图分析结果: ${intent}`)
  return intent.includes('image_generation') ? 'image_generation' : 'text'
}

/**
 * 生成图片（传统方法 - 作为降级备份）
 */
async function generateImageLegacy(prompt: string): Promise<{ text?: string; imageBase64?: string }> {
  console.log(`[Gemini] 使用传统方法生成图片, prompt: ${prompt.substring(0, 50)}...`)

  const ai = getGenAIClient()

  const result = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  })

  const response: { text?: string; imageBase64?: string } = {}

  // 解析响应
  if (result.candidates && result.candidates[0] && result.candidates[0].content) {
    const parts = result.candidates[0].content.parts || []
    for (const part of parts) {
      if ('text' in part && part.text) {
        response.text = part.text
      }
      if ('inlineData' in part && part.inlineData && part.inlineData.data) {
        response.imageBase64 = part.inlineData.data
        const size = (part.inlineData.data.length / 1024).toFixed(2)
        console.log(`[Gemini] 图片生成成功, 大小: ${size} KB`)
      }
    }
  }

  if (!response.imageBase64) {
    console.log('[Gemini] 未生成图片')
  }

  return response
}

/**
 * 生成图片（带降级）
 * 优先使用 Interactions API（支持上下文记忆），失败时回退到传统方法
 * @returns { text?: string, imageBase64?: string, interactionId?: string }
 */
export async function generateImage(
  prompt: string,
  previousInteractionId?: string
): Promise<{ text?: string; imageBase64?: string; interactionId?: string }> {
  console.log(`[Gemini] 开始生成图片, prompt: ${prompt.substring(0, 50)}...`)

  try {
    // 尝试使用 Interactions API（支持上下文记忆）
    const { generateImageWithInteractions } = await import('./gemini-interactions')
    const result = await generateImageWithInteractions(prompt, previousInteractionId)

    console.log('[Gemini] 使用 Interactions API 生成图片成功（支持上下文记忆）')
    return {
      text: result.text,
      imageBase64: result.imageBase64,
      interactionId: result.interactionId
    }

  } catch (error) {
    // 降级：使用传统方法（无上下文记忆）
    console.warn('[Gemini] Interactions API 失败，降级到传统方法:', error)
    const result = await generateImageLegacy(prompt)

    return {
      text: result.text,
      imageBase64: result.imageBase64,
      interactionId: undefined  // 降级模式没有 interaction ID
    }
  }
}

/**
 * 多图+文字生成图片（传统方法 - 作为降级备份）
 */
async function generateImageWithReferencesLegacy(
  imageBuffers: ArrayBuffer[],
  prompt: string
): Promise<{ text?: string; imageBase64?: string }> {
  console.log(`[Gemini] 使用传统方法多图生成 - 图片数: ${imageBuffers.length}`)

  const ai = getGenAIClient()

  // 构建图片部分 (最多14张)
  const imageParts = imageBuffers.slice(0, 14).map(buffer => ({
    inlineData: {
      data: Buffer.from(buffer).toString('base64'),
      mimeType: 'image/png',
    },
  }))

  // 构建提示词
  const fullPrompt = `你是一个专业的AI助手，擅长分析图片并根据用户需求生成新图片。

用户提供了 ${imageBuffers.length} 张参考图片。

用户的需求: "${prompt}"

请根据参考图片和用户需求:
1. 如果用户需要生成新图片，请生成一张结合参考图片元素的高质量图片
2. 同时提供简短的中文说明（2-3句话），描述生成的图片内容

请生成图片和说明。`

  // 调用API
  const result = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [{
      role: 'user',
      parts: [
        { text: fullPrompt },
        ...imageParts,
      ],
    }],
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  })

  const response: { text?: string; imageBase64?: string } = {}

  // 解析响应
  if (result.candidates && result.candidates[0] && result.candidates[0].content) {
    const parts = result.candidates[0].content.parts || []
    for (const part of parts) {
      if ('text' in part && part.text) {
        response.text = part.text
      }
      if ('inlineData' in part && part.inlineData && part.inlineData.data) {
        response.imageBase64 = part.inlineData.data
        const size = (part.inlineData.data.length / 1024).toFixed(2)
        console.log(`[Gemini] 多图生成成功, 大小: ${size} KB`)
      }
    }
  }

  if (!response.imageBase64) {
    console.log('[Gemini] 多图生成未产出图片')
  }

  return response
}

/**
 * 多图+文字生成图片（带降级）
 * 优先使用 Interactions API（支持上下文记忆），失败时回退到传统方法
 * 支持最多14张参考图片 + 文字提示
 * @param imageBuffers - 图片数据数组
 * @param prompt - 用户提示词
 * @param previousInteractionId - 可选的上一次 interaction ID（用于迭代修改）
 * @returns { text?: string, imageBase64?: string, interactionId?: string }
 */
export async function generateImageWithReferences(
  imageBuffers: ArrayBuffer[],
  prompt: string,
  previousInteractionId?: string
): Promise<{ text?: string; imageBase64?: string; interactionId?: string }> {
  console.log(`[Gemini] 多图生成 - 图片数: ${imageBuffers.length}, prompt: ${prompt.substring(0, 50)}...`)

  try {
    // 尝试使用 Interactions API（支持上下文记忆）
    const { editImageWithInteractions } = await import('./gemini-interactions')
    const result = await editImageWithInteractions(imageBuffers, prompt, previousInteractionId)

    console.log('[Gemini] 使用 Interactions API 多图生成成功（支持上下文记忆）')
    return {
      text: result.text,
      imageBase64: result.imageBase64,
      interactionId: result.interactionId
    }

  } catch (error) {
    // 降级：使用传统方法（无上下文记忆）
    console.warn('[Gemini] Interactions API 失败，降级到传统方法:', error)
    const result = await generateImageWithReferencesLegacy(imageBuffers, prompt)

    return {
      text: result.text,
      imageBase64: result.imageBase64,
      interactionId: undefined  // 降级模式没有 interaction ID
    }
  }
}

// ============ 多维表格操作分析 ============

export interface BitableOperation {
  type: 'query' | 'create' | 'update' | 'delete' | 'create_table' | 'none'
  tableName?: string
  filter?: string
  fields?: Record<string, any>
  recordId?: string
  tableFields?: Array<{ name: string; type: string }>
  description?: string
}

/**
 * 分析用户的多维表格操作意图
 */
export async function analyzeBitableIntent(
  userMessage: string,
  tableFields?: any[]
): Promise<BitableOperation> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

  const fieldInfo = tableFields
    ? `\n当前表格字段: ${JSON.stringify(tableFields.map(f => ({ name: f.field_name, type: f.type })))}`
    : ''

  const prompt = `分析用户对多维表格的操作意图，返回JSON格式。

用户消息: "${userMessage}"
${fieldInfo}

请分析用户想要执行的操作，返回以下JSON格式（只返回JSON，不要其他内容）：

{
  "type": "query|create|update|delete|create_table|none",
  "description": "操作描述",
  "filter": "查询条件（如果是query）",
  "fields": {"字段名": "值"},  // 如果是create或update
  "recordId": "记录ID",  // 如果是update或delete且用户指定了
  "tableName": "表格名称",  // 如果是create_table
  "tableFields": [{"name": "字段名", "type": "text|number|date|checkbox|single_select|multi_select"}]  // 如果是create_table
}

操作类型说明:
- query: 查询/搜索/查看记录
- create: 添加/新增/插入记录
- update: 修改/更新/编辑记录
- delete: 删除/移除记录
- create_table: 创建新表格/新数据表
- none: 不是多维表格操作

示例:
- "查询所有订单" -> {"type": "query", "description": "查询所有记录"}
- "添加一条记录，姓名张三，年龄25" -> {"type": "create", "fields": {"姓名": "张三", "年龄": 25}}
- "删除第一条记录" -> {"type": "delete", "description": "删除第一条记录"}
- "创建一个员工表，包含姓名、部门、入职日期" -> {"type": "create_table", "tableName": "员工表", "tableFields": [{"name": "姓名", "type": "text"}, {"name": "部门", "type": "single_select"}, {"name": "入职日期", "type": "date"}]}
- "今天天气怎么样" -> {"type": "none"}`

  try {
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text().trim()

    // 提取JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const operation = JSON.parse(jsonMatch[0]) as BitableOperation
      console.log(`[Gemini] Bitable意图分析: ${operation.type}`)
      return operation
    }
  } catch (e) {
    console.error('[Gemini] Bitable意图分析失败:', e)
  }

  return { type: 'none' }
}

/**
 * 生成多维表格操作结果的自然语言回复
 */
export async function generateBitableResponse(
  operation: string,
  result: any,
  error?: string
): Promise<string> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

  const prompt = `根据多维表格操作结果生成友好的中文回复。

操作类型: ${operation}
操作结果: ${JSON.stringify(result)}
${error ? `错误信息: ${error}` : ''}

请生成简洁友好的回复，告知用户操作结果。如果是查询结果，用表格或列表形式展示数据。`

  try {
    const response = await model.generateContent(prompt)
    return response.response.text()
  } catch (e) {
    return error || '操作完成'
  }
}

// ============ Interactions API 集成 ============

/**
 * 带降级的 Bitable 意图分析
 * 优先使用 Interactions API 的结构化输出，失败时回退到传统方法
 *
 * 这个函数结合了新旧两种方法的优势：
 * - 新方法（Interactions API）：结构化输出，100% JSON 解析成功率
 * - 旧方法（传统方法）：作为降级保障，确保服务可用性
 */
export async function analyzeBitableIntentWithFallback(
  userMessage: string,
  tableFields?: any[]
): Promise<BitableOperation> {
  try {
    // 尝试使用新方法（Interactions API + 结构化输出）
    const { analyzeBitableIntentStructured } = await import('./gemini-interactions')
    const operation = await analyzeBitableIntentStructured(userMessage, tableFields)

    console.log('[Gemini] 使用 Interactions API 结构化输出成功')
    return operation

  } catch (error) {
    // 降级：使用传统方法
    console.warn('[Gemini] Interactions API 失败，降级到传统方法:', error)
    return await analyzeBitableIntent(userMessage, tableFields)
  }
}
