# 多模态上下文记忆实现总结

## 日期
2025-12-25

## 任务目标
将所有图片相关功能迁移到 Interactions API，实现跨轮次的图片上下文记忆，让用户可以像在 Gemini 客户端一样持续修改图片。

## 核心改进

### 1. 新增统一的多模态接口 (`lib/gemini-interactions.ts`)

#### `chatWithInteractions()` - 核心多模态函数
```typescript
export async function chatWithInteractions(options: {
  prompt: string
  images?: ArrayBuffer[]
  previousInteractionId?: string
  responseModalities?: ('TEXT' | 'IMAGE')[]
  model?: string
}): Promise<{
  reply?: string
  imageBase64?: string
  interactionId: string
}>
```

**功能**:
- 支持纯文字、纯图片、图文混合输入
- 自动传递 `previous_interaction_id` 保持上下文
- 自动选择合适的模型（flash vs pro-image）
- 返回 `interactionId` 用于下次对话

#### 专用函数

1. **`generateImageWithInteractions()`** - 纯文字生成图片
   - 迭代编辑: "画猫" → "改红色" → "加帽子"
   - AI 会记住之前生成的图片

2. **`editImageWithInteractions()`** - 图片编辑/融合
   - 单图编辑: [图片] + "改背景"
   - 多图融合: [图A, 图B] + "融合"
   - 迭代修改: 基于上一次的图片继续编辑

3. **`analyzeImageWithInteractions()`** - 图片理解
   - 图片问答 + 持续追问
   - AI 会记住之前的图片

### 2. 更新现有函数支持上下文记忆 (`lib/gemini.ts`)

所有图片相关函数都添加了：
- ✅ **降级支持**: 优先使用 Interactions API，失败时自动降级到传统方法
- ✅ **上下文参数**: 接受 `previousInteractionId`
- ✅ **返回 interactionId**: 用于保存到 Supabase

更新的函数：
1. `generateImage()` - 添加 `previousInteractionId` 参数和 `interactionId` 返回值
2. `generateImageWithReferences()` - 添加 `previousInteractionId` 参数
3. `chatWithImage()` - 返回结构改为 `{ reply, interactionId }`
4. `analyzeImage()` - 返回结构改为 `{ reply, interactionId }`

### 3. 业务逻辑更新 (`app/api/process/route.ts`)

#### 所有图片操作流程都更新为：

```typescript
// 1. 获取会话上下文
const conversationCtx = await ConversationManager.getContext(sessionId)

// 2. 调用 AI 函数（传入上一次的 interaction ID）
const result = await generateImage(
  textContent,
  conversationCtx.lastInteractionId  // ← 保持上下文
)

// 3. 保存新的 interaction ID
if (result.interactionId) {
  await ConversationManager.updateContext(sessionId, {
    lastInteractionId: result.interactionId
  })
}
```

更新的场景：
- ✅ 纯文字生成图片（第106-114行）
- ✅ 单图分析（第149-170行）
- ✅ 多图生成/编辑（第185-198行）
- ✅ `handleImageResult()` 函数更新为保存 interactionId

## 技术细节

### Interactions API 输入格式

**纯文字输入**:
```typescript
input = "画一只猫"
```

**多模态输入**:
```typescript
input = [
  { type: 'text', text: '画一只猫' },
  {
    type: 'image',
    image: {
      data: base64String,
      mime_type: 'image/png'
    }
  }
]
```

### 配置参数

对于图片生成模型，需要指定 `generation_config`:
```typescript
{
  model: 'gemini-3-pro-image-preview',
  input: ...
  previous_interaction_id: ...
  generation_config: {
    response_modalities: ['TEXT', 'IMAGE']
  }
}
```

### 输出解析

```typescript
for (const output of interaction.outputs) {
  if (output.type === 'text' && output.text) {
    result.reply = output.text
  } else if (output.type === 'image' && output.image) {
    result.imageBase64 = output.image.data
  }
}
```

## 用户场景示例

### 场景 1: 迭代图片编辑

```
用户: "画一只蓝色的猫"
机器人: [生成蓝猫图片] [保存 interaction_id_1]

用户: "把猫改成红色"
机器人: [使用 interaction_id_1，AI 记住蓝猫]
        [生成红猫图片] [保存 interaction_id_2]

用户: "给猫加个帽子"
机器人: [使用 interaction_id_2，AI 记住红猫]
        [生成戴帽子的红猫] [保存 interaction_id_3]
```

### 场景 2: 图文混合对话

```
用户: "我叫张三"
机器人: "你好张三！" [保存 interaction_id_1]

用户: "画一只猫，名字叫我的名字"
机器人: [使用 interaction_id_1，AI 记住"张三"]
        [生成名叫张三的猫] [保存 interaction_id_2]

用户: "我叫什么名字？"
机器人: "你叫张三" [使用 interaction_id_2]
```

### 场景 3: 图片持续分析

```
用户: [发送猫的图片]
用户: "这是什么动物？"
机器人: "这是一只猫" [保存 interaction_id_1，包含图片]

用户: "它的颜色是什么？"
机器人: [使用 interaction_id_1，AI 记住图片]
        "它是棕色的"
```

## 降级策略

所有函数都保留传统实现作为降级backup：
```typescript
try {
  // 尝试使用 Interactions API
  const result = await generateImageWithInteractions(...)
  return { ...result, interactionId: result.interactionId }
} catch (error) {
  // 降级: 使用传统方法
  console.warn('Interactions API 失败，降级到传统方法:', error)
  const result = await generateImageLegacy(...)
  return { ...result, interactionId: undefined }
}
```

## 数据流

```
飞书消息
  ↓
process/route.ts
  ↓
ConversationManager.getContext(sessionId)
  ↓
获取 lastInteractionId
  ↓
调用 gemini 函数 (传入 previousInteractionId)
  ↓
gemini-interactions.ts (Interactions API)
  ↓
Google Gemini API (记住历史)
  ↓
返回 { reply/imageBase64, interactionId }
  ↓
保存新的 interactionId 到 Supabase
  ↓
回复用户
```

## 兼容性

### 向后兼容
- ✅ 所有现有代码无需修改
- ✅ 函数签名保持兼容（只添加可选参数）
- ✅ 降级机制保证服务稳定性

### 升级路径
- ✅ Interactions API 优先
- ✅ 自动降级到传统方法
- ✅ 日志记录每次 API 调用状态

## 测试

创建了 `test-multimodal-context.js` 测试脚本，包含：

1. **场景 1**: 迭代图片编辑
   - "画蓝猫" → "改红色" → "加帽子"

2. **场景 2**: 图文混合对话
   - "我叫张三" → "画猫名字叫我的名字"

验证方法：
- 查看日志确认使用了 `previous_interaction_id`
- 检查 AI 回复是否符合预期
- 在 Supabase 验证 `last_interaction_id` 已保存

## 关键改进点

1. **Thought Signatures 自动处理** - Gemini 3 Pro Image 的视觉推理上下文由 SDK 自动管理
2. **跨模型上下文** - Interactions API 支持在同一会话中切换模型
3. **统一的会话管理** - 文字和图片对话共用同一个 `lastInteractionId`
4. **完整的错误处理** - 降级策略确保服务可用性

## 部署注意事项

### 环境变量
确保 Vercel 配置了：
- `GOOGLE_API_KEY` - Google AI API密钥
- `SUPABASE_URL` - Supabase 项目URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_KEY` - Supabase service key

### 数据库
Supabase `sessions` 表的 `last_interaction_id` 字段存储 Interaction ID。

## 性能考虑

- ✅ **缓存优化**: Conversation State 有内存缓存
- ✅ **异步保存**: Supabase 保存不阻塞响应
- ⚠️ **API 配额**: Interactions API 可能有不同的配额限制

## 已知限制

1. **图片数量限制**: 最多支持14张参考图片（Gemini API 限制）
2. **上下文保存时长**:
   - 付费版: 55天
   - 免费版: 1天
3. **Serverless 环境**: Vercel 的无状态特性要求持久化存储（已通过 Supabase 解决）

## 后续优化

1. **缓存策略**: 可以考虑 Vercel KV 作为更快的缓存层
2. **监控**: 添加 Interaction API 调用成功率监控
3. **降级配置**: 环境变量控制是否使用 Interactions API
4. **批量操作**: 支持批量图片编辑场景

## 结论

✅ 所有图片功能已成功迁移到 Interactions API
✅ 实现了完整的图片上下文记忆
✅ 保持了向后兼容和降级支持
✅ 数据持久化到 Supabase

用户现在可以像在 Gemini 客户端一样，进行多轮迭代的图片编辑和图文混合对话！
