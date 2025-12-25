/**
 * Gemini Veo 3.1 视频生成 API 封装
 * 支持：文字生成、图片转视频、视频延展、参考图片引导、帧插值
 */

import { GoogleGenAI } from '@google/genai'

// Type definitions (inferred from SDK - using camelCase)
type GenerateVideosConfig = {
  aspectRatio?: '16:9' | '9:16' | '1:1'
  resolution?: '720p' | '1080p'
  durationSeconds?: number
  personGeneration?: 'allow_all' | 'allow_adult' | 'block_all'
  numberOfVideos?: number
  referenceImages?: VideoGenerationReferenceImage[]
  lastFrame?: string  // URI string
}

type VideoGenerationReferenceImage = {
  image: string  // URI string
  referenceType: 'asset' | 'style'
}

/**
 * 获取 Veo 客户端实例
 */
export function getVeoClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY 未配置')
  }
  return new GoogleGenAI({ apiKey })
}

/**
 * 文字生成视频（基础功能）
 * @param prompt - 视频描述提示词
 * @param config - 可选配置（分辨率、时长等）
 * @returns Operation对象（需轮询）
 */
export async function generateVideoFromText(
  prompt: string,
  config?: Partial<GenerateVideosConfig>
): Promise<{ operationName: string; estimatedTime: string }> {
  const client = getVeoClient()

  const defaultConfig: GenerateVideosConfig = {
    aspectRatio: '16:9',
    resolution: '720p',
    durationSeconds: 8,
    personGeneration: 'allow_all',
    numberOfVideos: 1,
    ...config
  }

  console.log(`[Veo] 开始生成视频 - Prompt: ${prompt.substring(0, 100)}...`)

  try {
    const operation = await client.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt,
      config: defaultConfig as any
    })

    // 调试日志：查看返回的对象结构
    console.log(`[Veo] API 返回对象:`, JSON.stringify(operation, null, 2))

    if (!operation) {
      throw new Error('generateVideos() 返回了 undefined')
    }

    if (!operation.name) {
      console.error('[Veo] Operation 对象缺少 name 属性:', operation)
      throw new Error(`Operation name is missing. 返回的对象: ${JSON.stringify(operation)}`)
    }

    console.log(`[Veo] Operation 创建成功: ${operation.name}`)

    return {
      operationName: operation.name,
      estimatedTime: '预计 30-180 秒'
    }
  } catch (error) {
    console.error('[Veo] 视频生成 API 调用失败:', error)
    throw error
  }
}

/**
 * 图片生成视频（Image-to-Video）
 * @param imageUri - Gemini Files API 图片 URI 或 base64
 * @param prompt - 动画描述
 * @param config - 可选配置
 */
export async function generateVideoFromImage(
  imageUri: string,
  prompt: string,
  config?: Partial<GenerateVideosConfig>
): Promise<{ operationName: string; estimatedTime: string }> {
  const client = getVeoClient()

  console.log(`[Veo] 图片转视频 - Image: ${imageUri.substring(0, 50)}...`)

  const operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt,
    image: imageUri as any,  // Type assertion - SDK expects Image type but we pass URI
    config: {
      aspectRatio: '16:9',
      resolution: '720p',
      durationSeconds: 8,
      personGeneration: 'allow_adult',
      ...config
    } as any
  })

  console.log(`[Veo] Operation 创建成功: ${operation.name}`)

  if (!operation.name) {
    throw new Error('Operation name is missing')
  }

  return {
    operationName: operation.name,
    estimatedTime: '预计 40-200 秒'
  }
}

/**
 * 视频延展（Extension）
 * @param videoUri - 之前生成的视频 Files API URI
 * @param prompt - 延展内容描述
 */
export async function extendVideo(
  videoUri: string,
  prompt: string
): Promise<{ operationName: string; estimatedTime: string }> {
  const client = getVeoClient()

  console.log(`[Veo] 延展视频 - Video URI: ${videoUri}`)

  const operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt,
    video: videoUri as any,  // Type assertion - SDK expects Video type but we pass URI
    config: {
      resolution: '720p',  // Extension只支持720p
      numberOfVideos: 1
    } as any
  })

  console.log(`[Veo] Operation 创建成功: ${operation.name}`)

  if (!operation.name) {
    throw new Error('Operation name is missing')
  }

  return {
    operationName: operation.name,
    estimatedTime: '预计 50-240 秒'
  }
}

/**
 * 参考图片引导生成
 * @param prompt - 视频描述
 * @param referenceImageUris - 最多3张参考图片URI
 * @param config - 可选配置
 */
export async function generateVideoWithReferences(
  prompt: string,
  referenceImageUris: string[],
  config?: Partial<GenerateVideosConfig>
): Promise<{ operationName: string; estimatedTime: string }> {
  const client = getVeoClient()

  if (referenceImageUris.length > 3) {
    throw new Error('最多支持3张参考图片')
  }

  console.log(`[Veo] 参考图片生成 - 图片数: ${referenceImageUris.length}`)

  // 构建参考图片对象
  const referenceImages: VideoGenerationReferenceImage[] = referenceImageUris.map(uri => ({
    image: uri,  // Pass URI directly
    referenceType: 'asset'
  }))

  const operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt,
    config: {
      referenceImages: referenceImages,
      durationSeconds: 8,  // Reference images 只支持8秒
      aspectRatio: '16:9', // 只支持16:9
      resolution: '720p',
      ...config
    } as any
  })

  console.log(`[Veo] Operation 创建成功: ${operation.name}`)

  if (!operation.name) {
    throw new Error('Operation name is missing')
  }

  return {
    operationName: operation.name,
    estimatedTime: '预计 60-300 秒'
  }
}

/**
 * 帧间插值生成（First & Last Frame）
 * @param firstFrameUri - 第一帧图片URI
 * @param lastFrameUri - 最后一帧图片URI
 * @param prompt - 过渡描述
 */
export async function generateVideoWithInterpolation(
  firstFrameUri: string,
  lastFrameUri: string,
  prompt: string
): Promise<{ operationName: string; estimatedTime: string }> {
  const client = getVeoClient()

  console.log(`[Veo] 帧插值生成 - First: ${firstFrameUri}, Last: ${lastFrameUri}`)

  const operation = await client.models.generateVideos({
    model: 'veo-3.1-generate-preview',
    prompt,
    image: firstFrameUri as any,  // Type assertion - SDK expects Image type but we pass URI
    config: {
      lastFrame: lastFrameUri as any,  // Type assertion - SDK expects Image type but we pass URI
      durationSeconds: 8,
      resolution: '720p'
    } as any
  })

  console.log(`[Veo] Operation 创建成功: ${operation.name}`)

  if (!operation.name) {
    throw new Error('Operation name is missing')
  }

  return {
    operationName: operation.name,
    estimatedTime: '预计 50-240 秒'
  }
}

/**
 * 轮询Operation状态（核心函数）
 * @param operationName - Operation名称
 * @param maxAttempts - 最大轮询次数（默认36次 = 6分钟）
 * @param onProgress - 可选的进度回调
 * @returns 生成完成的视频URI和metadata
 */
export async function pollVideoOperation(
  operationName: string,
  maxAttempts: number = 36,
  onProgress?: (attempt: number, total: number) => void
): Promise<{
  videoUri: string
  videoFileName: string
  durationSeconds: number
  resolution: string
}> {
  const client = getVeoClient()

  let attempts = 0
  let operation = await client.operations.get(operationName as any)

  console.log(`[Veo] 开始轮询 Operation: ${operationName}`)

  while (!operation.done && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 10000)) // 10秒间隔
    operation = await client.operations.get(operationName as any)
    attempts++

    console.log(`[Veo] 轮询第 ${attempts}/${maxAttempts} 次 - Status: ${operation.done ? 'Done' : 'Processing'}`)

    // 每10次（100秒）调用进度回调
    if (attempts % 10 === 0 && onProgress) {
      onProgress(attempts, maxAttempts)
    }
  }

  if (!operation.done) {
    throw new Error(`视频生成超时（${maxAttempts * 10}秒）`)
  }

  // 解析结果
  const response = operation.response as any  // Type assertion for response object
  if (!response || !response.generatedVideos || response.generatedVideos.length === 0) {
    throw new Error('Operation完成但无视频生成')
  }

  const video = response.generatedVideos[0]

  if (!video.video || !video.video.uri) {
    throw new Error('视频URI缺失')
  }

  console.log(`[Veo] 视频生成完成 - URI: ${video.video.uri}`)

  return {
    videoUri: video.video.uri,
    videoFileName: video.video.name || `veo-${Date.now()}.mp4`,
    durationSeconds: 8, // TODO: 从metadata提取
    resolution: '720p'
  }
}

/**
 * 下载视频文件（从Files API）
 * @param videoUri - Gemini Files API URI
 * @returns 视频Buffer
 */
export async function downloadVideoFile(videoUri: string): Promise<Buffer> {
  const client = getVeoClient()

  console.log(`[Veo] 下载视频 - URI: ${videoUri}`)

  // 使用Files API下载
  const fileData = await client.files.download({ uri: videoUri } as any) as any

  // 转换为Buffer
  const buffer = Buffer.from(await fileData.arrayBuffer())

  console.log(`[Veo] 视频下载完成 - 大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`)

  return buffer
}

/**
 * 检查视频URI是否仍然有效（2天内）
 * @param timestamp - 视频生成时间戳
 * @returns 是否有效
 */
export function isVideoUriValid(timestamp?: number): boolean {
  if (!timestamp) return false

  const ageInDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24)
  return ageInDays < 2
}
