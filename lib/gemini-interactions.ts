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
