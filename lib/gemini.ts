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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

  const result = await model.generateContent(prompt)
  const response = await result.response
  return response.text()
}

/**
 * 多模态对话（图片+文字）
 */
export async function chatWithImage(
  prompt: string,
  imageData: ArrayBuffer,
  mimeType: string = 'image/png'
): Promise<string> {
  const genAI = getGeminiClient()
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

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
 * 图片分析助手
 */
export async function analyzeImage(
  imageData: ArrayBuffer,
  userPrompt?: string
): Promise<string> {
  const prompt = userPrompt || '请描述这张图片的内容，用中文回答。'

  return await chatWithImage(prompt, imageData)
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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

  const prompt = `分析以下用户消息的意图。判断用户是想要：
1. 普通文字对话/问答 -> 返回 "text"
2. 生成图片（例如：画一张xxx、生成xxx的图片、帮我画、创作一个xxx的图像、设计一个xxx等） -> 返回 "image_generation"

只返回 "text" 或 "image_generation"，不要返回其他内容。

用户消息：${userMessage}`

  const result = await model.generateContent(prompt)
  const response = await result.response
  const intent = response.text().trim().toLowerCase()

  console.log(`[Gemini] 意图分析结果: ${intent}`)
  return intent.includes('image_generation') ? 'image_generation' : 'text'
}

/**
 * 生成图片
 * @returns { text?: string, imageBase64?: string }
 */
export async function generateImage(prompt: string): Promise<{ text?: string; imageBase64?: string }> {
  console.log(`[Gemini] 开始生成图片, prompt: ${prompt.substring(0, 50)}...`)

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
