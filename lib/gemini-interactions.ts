/**
 * Gemini Interactions API 封装
 * 提供结构化输出、会话管理等功能
 */

import { GoogleGenAI } from '@google/genai'
import type { BitableOperation } from './gemini'

/**
 * 初始化 Interactions API 客户端
 */
export function getInteractionsClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY 未配置')
  }
  return new GoogleGenAI({ apiKey })
}

/**
 * Bitable 操作的 JSON Schema 定义
 * 用于 Interactions API 的 structured output
 */
export const BitableOperationSchema = {
  name: 'BitableOperation',
  schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['query', 'create', 'update', 'delete', 'create_table', 'none'],
        description: '操作类型'
      },
      description: {
        type: 'string',
        description: '操作描述'
      },
      filter: {
        type: 'string',
        description: '查询条件（如果是query）'
      },
      fields: {
        type: 'object',
        description: '字段键值对（如果是create或update）'
      },
      recordId: {
        type: 'string',
        description: '记录ID（如果是update或delete）'
      },
      tableName: {
        type: 'string',
        description: '表格名称（如果是create_table）'
      },
      tableFields: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' }
          }
        },
        description: '表格字段定义（如果是create_table）'
      }
    },
    required: ['type']
  }
}

/**
 * 构建 Bitable 意图分析的 Prompt
 */
function buildBitableIntentPrompt(userMessage: string, tableFields?: any[]): string {
  const fieldInfo = tableFields
    ? `\n当前表格字段: ${JSON.stringify(tableFields.map(f => ({ name: f.field_name, type: f.type })))}`
    : ''

  return `分析用户对多维表格的操作意图，返回JSON格式。

用户消息: "${userMessage}"
${fieldInfo}

请分析用户想要执行的操作，返回以下JSON格式：

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
}

/**
 * 使用 Interactions API 的结构化输出分析 Bitable 意图
 * 相比旧方法，这个方法保证返回有效的 JSON，无需正则提取
 */
export async function analyzeBitableIntentStructured(
  userMessage: string,
  tableFields?: any[]
): Promise<BitableOperation> {
  const client = getInteractionsClient()
  const prompt = buildBitableIntentPrompt(userMessage, tableFields)

  console.log('[Gemini Interactions] 开始结构化意图分析...')

  try {
    const interaction = await client.interactions.create({
      model: 'gemini-3-flash-preview',
      input: prompt,
      response_format: BitableOperationSchema.schema
    })

    // 获取最后一个输出（通常是模型的最终响应）
    const outputs = interaction.outputs
    if (!outputs || outputs.length === 0) {
      throw new Error('No outputs from interaction')
    }

    const lastOutput = outputs[outputs.length - 1]

    // 检查输出类型
    if (lastOutput.type !== 'text') {
      throw new Error(`Unexpected output type: ${lastOutput.type}`)
    }

    // 检查 text 字段存在
    if (!lastOutput.text) {
      throw new Error('Output text is empty')
    }

    // Interactions API 的结构化输出保证是有效 JSON
    const operation = JSON.parse(lastOutput.text) as BitableOperation

    console.log(`[Gemini Interactions] 意图分析成功: ${operation.type}`)
    return operation

  } catch (error) {
    console.error('[Gemini Interactions] 结构化意图分析失败:', error)
    throw error  // 抛出错误，让调用方处理降级
  }
}

/**
 * 带上下文的 Bitable 意图分析
 * 使用 previous_interaction_id 保持会话上下文
 */
export async function analyzeBitableIntentWithContext(
  userMessage: string,
  previousInteractionId?: string,
  tableFields?: any[]
): Promise<{ operation: BitableOperation; interactionId: string }> {
  const client = getInteractionsClient()
  const prompt = buildBitableIntentPrompt(userMessage, tableFields)

  console.log('[Gemini Interactions] 开始带上下文的意图分析...')
  if (previousInteractionId) {
    console.log(`[Gemini Interactions] 使用上一次 interaction ID: ${previousInteractionId}`)
  }

  try {
    const interaction = await client.interactions.create({
      model: 'gemini-3-flash-preview',
      input: prompt,
      previous_interaction_id: previousInteractionId,  // 关键：保持上下文
      response_format: BitableOperationSchema.schema
    })

    const outputs = interaction.outputs
    if (!outputs || outputs.length === 0) {
      throw new Error('No outputs from interaction')
    }

    const lastOutput = outputs[outputs.length - 1]

    if (lastOutput.type !== 'text') {
      throw new Error(`Unexpected output type: ${lastOutput.type}`)
    }

    if (!lastOutput.text) {
      throw new Error('Output text is empty')
    }

    const operation = JSON.parse(lastOutput.text) as BitableOperation

    console.log(`[Gemini Interactions] 意图分析成功: ${operation.type}, interaction ID: ${interaction.id}`)

    return {
      operation,
      interactionId: interaction.id
    }

  } catch (error) {
    console.error('[Gemini Interactions] 带上下文的意图分析失败:', error)
    throw error
  }
}

/**
 * 使用 Interactions API 的普通文字对话（带会话记忆）
 * 不使用结构化输出，让模型自由返回自然语言
 */
export async function chatWithContext(
  userMessage: string,
  previousInteractionId?: string
): Promise<{ reply: string; interactionId: string }> {
  const client = getInteractionsClient()

  const prompt = `你是一个智能飞书机器人助手。请用简洁友好的中文回复用户。

用户消息：${userMessage}

请直接回复用户，不要加任何前缀。`

  console.log('[Gemini Interactions] 开始普通对话处理...')
  if (previousInteractionId) {
    console.log(`[Gemini Interactions] 使用上一次 interaction ID: ${previousInteractionId}`)
  }

  try {
    const interaction = await client.interactions.create({
      model: 'gemini-3-flash-preview',
      input: prompt,
      previous_interaction_id: previousInteractionId,  // 关键：保持上下文
      // 注意：不传 response_format，让模型自由返回文本
    })

    const outputs = interaction.outputs
    if (!outputs || outputs.length === 0) {
      throw new Error('No outputs from interaction')
    }

    const lastOutput = outputs[outputs.length - 1]

    if (lastOutput.type !== 'text') {
      throw new Error(`Unexpected output type: ${lastOutput.type}`)
    }

    if (!lastOutput.text) {
      throw new Error('Output text is empty')
    }

    const reply = lastOutput.text

    console.log(`[Gemini Interactions] 对话成功, interaction ID: ${interaction.id}`)

    return {
      reply,
      interactionId: interaction.id
    }

  } catch (error) {
    console.error('[Gemini Interactions] 对话失败:', error)
    throw error
  }
}

// ============ 多模态（图文混合）支持 ============

/**
 * 统一的多模态对话接口
 * 支持：纯文字、纯图片、图文混合、跨轮次上下文记忆
 *
 * 使用场景：
 * 1. 纯文字对话
 * 2. 图片理解（图片 + 问题）
 * 3. 图片生成（文字描述 → 图片）
 * 4. 图片编辑（之前的图片 + 修改指令）
 * 5. 多图融合（多张图片 + 融合指令）
 */
export async function chatWithInteractions(options: {
  prompt: string
  images?: ArrayBuffer[]  // 可选的图片数组
  previousInteractionId?: string
  responseModalities?: ('TEXT' | 'IMAGE')[]  // 期望的响应类型
  model?: string  // 默认根据 responseModalities 自动选择
}): Promise<{
  reply?: string
  imageBase64?: string
  interactionId: string
}> {
  const {
    prompt,
    images,
    previousInteractionId,
    responseModalities = ['TEXT'],  // 默认只返回文字
    model
  } = options

  const client = getInteractionsClient()

  // 自动选择模型
  const selectedModel = model || (
    responseModalities.includes('IMAGE')
      ? 'gemini-3-pro-image-preview'  // 需要生成图片
      : 'gemini-3-flash-preview'       // 只需要文字
  )

  console.log(`[Gemini Interactions] 多模态对话 - 模型: ${selectedModel}, 响应类型: ${responseModalities.join('+')}`)
  if (previousInteractionId) {
    console.log(`[Gemini Interactions] 使用上一次 interaction ID: ${previousInteractionId}`)
  }
  if (images && images.length > 0) {
    console.log(`[Gemini Interactions] 包含 ${images.length} 张图片`)
  }

  // 构建输入内容
  // Interactions API 期望的格式是字符串（纯文字）或对象数组（多模态）
  let input: string | any[]

  if (!images || images.length === 0) {
    // 纯文字输入
    input = prompt
  } else {
    // 多模态输入（图片 + 文字）
    input = [
      { type: 'text', text: prompt }
    ]

    // 添加图片（如果有）
    for (const imageBuffer of images.slice(0, 14)) {  // Gemini 最多支持14张参考图
      input.push({
        type: 'image',
        image: {
          data: Buffer.from(imageBuffer).toString('base64'),
          mime_type: 'image/png'
        }
      })
    }
  }

  try {
    const createParams: any = {
      model: selectedModel,
      input,
      previous_interaction_id: previousInteractionId
    }

    // 只在需要指定响应模态时才添加 generation_config
    // 对于图片生成模型，需要明确指定 responseModalities
    if (selectedModel === 'gemini-3-pro-image-preview') {
      createParams.generation_config = {
        response_modalities: responseModalities
      }
    }

    const interaction = await client.interactions.create(createParams)

    const outputs = interaction.outputs
    if (!outputs || outputs.length === 0) {
      throw new Error('No outputs from interaction')
    }

    const result: {
      reply?: string
      imageBase64?: string
      interactionId: string
    } = {
      interactionId: interaction.id
    }

    // 解析所有输出
    for (const output of outputs) {
      if (output.type === 'text' && output.text) {
        result.reply = output.text
      } else if (output.type === 'image' && output.image) {
        // 图片输出
        if ('data' in output.image) {
          result.imageBase64 = output.image.data as string
          const size = (result.imageBase64.length / 1024).toFixed(2)
          console.log(`[Gemini Interactions] 图片生成成功, 大小: ${size} KB`)
        }
      }
    }

    console.log(`[Gemini Interactions] 多模态对话成功, interaction ID: ${interaction.id}`)

    return result

  } catch (error) {
    console.error('[Gemini Interactions] 多模态对话失败:', error)
    throw error
  }
}

/**
 * 使用 Interactions API 生成图片（带上下文记忆）
 *
 * 使用场景：
 * - 轮1: "画一只蓝色的猫" → 生成蓝猫
 * - 轮2: "把猫改成红色" → AI 记住之前的蓝猫，生成红猫
 * - 轮3: "加个帽子" → AI 记住红猫，生成戴帽子的红猫
 */
export async function generateImageWithInteractions(
  prompt: string,
  previousInteractionId?: string
): Promise<{ text?: string; imageBase64?: string; interactionId: string }> {
  console.log(`[Gemini Interactions] 图片生成 - prompt: ${prompt.substring(0, 50)}...`)

  return await chatWithInteractions({
    prompt,
    previousInteractionId,
    responseModalities: ['TEXT', 'IMAGE'],
    model: 'gemini-3-pro-image-preview'
  })
}

/**
 * 使用 Interactions API 编辑/融合图片（带上下文记忆）
 *
 * 使用场景：
 * - 单图编辑: [图片] + "把背景改成蓝天"
 * - 多图融合: [图片A, 图片B] + "把这两张图融合"
 * - 迭代修改: 基于上一次生成的图片继续修改（通过 previousInteractionId）
 */
export async function editImageWithInteractions(
  images: ArrayBuffer[],
  prompt: string,
  previousInteractionId?: string
): Promise<{ text?: string; imageBase64?: string; interactionId: string }> {
  console.log(`[Gemini Interactions] 图片编辑 - 图片数: ${images.length}, prompt: ${prompt.substring(0, 50)}...`)

  // 构建专业的编辑提示词
  const enhancedPrompt = images.length > 1
    ? `你是一个专业的AI助手，擅长分析图片并根据用户需求生成新图片。

用户提供了 ${images.length} 张参考图片。

用户的需求: "${prompt}"

请根据参考图片和用户需求:
1. 如果用户需要生成新图片，请生成一张结合参考图片元素的高质量图片
2. 同时提供简短的中文说明（2-3句话），描述生成的图片内容

请生成图片和说明。`
    : prompt  // 单图编辑，直接使用用户的提示词

  return await chatWithInteractions({
    prompt: enhancedPrompt,
    images,
    previousInteractionId,
    responseModalities: ['TEXT', 'IMAGE'],
    model: 'gemini-3-pro-image-preview'
  })
}

/**
 * 使用 Interactions API 理解图片（带上下文记忆）
 *
 * 使用场景：
 * - 图片问答: [图片] + "这张图片里有什么？"
 * - 持续追问:
 *   轮1: [图片] + "这是什么动物？"
 *   轮2: "它的颜色是什么？" ← AI 记住之前的图片
 */
export async function analyzeImageWithInteractions(
  imageData: ArrayBuffer,
  prompt: string,
  previousInteractionId?: string
): Promise<{ reply: string; interactionId: string }> {
  console.log(`[Gemini Interactions] 图片分析 - prompt: ${prompt.substring(0, 50)}...`)

  const result = await chatWithInteractions({
    prompt,
    images: [imageData],
    previousInteractionId,
    responseModalities: ['TEXT'],  // 只需要文字回复
    model: 'gemini-3-flash-preview'  // 图片理解用 flash 就够了
  })

  return {
    reply: result.reply || '',
    interactionId: result.interactionId
  }
}
