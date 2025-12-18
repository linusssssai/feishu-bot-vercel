/**
 * Google Gemini API 封装
 * 支持多模态（图片+文字）
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

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
