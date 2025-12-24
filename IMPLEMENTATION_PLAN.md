# Interactions API 多模态支持 - 实现计划

## 目标

将所有图片相关功能迁移到 Interactions API，实现跨轮次的图片上下文记忆，让用户可以像在 Gemini 客户端一样持续修改图片。

## 背景

### 当前状态

1. ✅ **文字对话** - 已使用 Interactions API，支持会话记忆
2. ❌ **图片生成** - 使用传统 `generateContent()` API，无上下文记忆
3. ❌ **图片编辑** - 使用传统 API，无法迭代修改
4. ❌ **图片理解** - 使用传统 API，无上下文记忆

### 问题

用户场景：
```
用户: [发送猫的图片]
用户: 帮我给这只猫加个帽子
机器人: [生成图片] ✅ 能看到原图

用户: 再把帽子改成红色的
机器人: ❌ 不记得之前的图片！需要重新上传
```

### 目标状态

改进后：
```
用户: [发送猫的图片]
用户: 帮我给这只猫加个帽子
机器人: [生成图片] [保存 interaction_id_1，包含原图]

用户: 再把帽子改成红色的
机器人: ✅ 记得之前的图片和修改！直接生成红帽子版本
       [使用 interaction_id_1，自动加载原图上下文]

用户: 现在加个项圈
机器人: ✅ 继续基于之前的图片修改
       [使用 interaction_id_2]
```

## 技术方案

### 核心改动

1. **新增统一的多模态接口**
   - `chatWithInteractions()` - 支持纯文字、纯图片、图文混合
   - 自动处理 `previous_interaction_id`
   - 自动处理 `responseModalities` 配置

2. **迁移现有功能**
   - `generateImage()` → 使用 Interactions API
   - `generateImageWithReferences()` → 使用 Interactions API
   - `chatWithImage()` → 使用 Interactions API

3. **保持降级兼容**
   - 所有函数保持现有签名
   - 内部调用新的 Interactions API 实现
   - 失败时自动降级到传统 API

## 实现步骤

### Phase 1: 设计统一接口 (30分钟)

**文件**: `lib/gemini-interactions.ts`

新增函数：
```typescript
/**
 * 统一的多模态对话接口
 * 支持：纯文字、纯图片、图文混合
 */
export async function chatWithInteractions(options: {
  prompt: string
  images?: ArrayBuffer[]  // 可选的图片数组
  previousInteractionId?: string
  responseModalities?: ('TEXT' | 'IMAGE')[]  // 期望的响应类型
  model?: string  // 默认 'gemini-3-flash-preview'
}): Promise<{
  reply?: string
  imageBase64?: string
  interactionId: string
}>
```

### Phase 2: 实现核心函数 (45分钟)

**文件**: `lib/gemini-interactions.ts`

1. **实现 `chatWithInteractions()`**
   - 构建多模态 `input` 数组
   - 处理 `previous_interaction_id`
   - 解析 TEXT/IMAGE 响应
   - 支持 Gemini 3 Pro Image 的 thought signatures（自动）

2. **实现 `generateImageWithInteractions()`**
   ```typescript
   export async function generateImageWithInteractions(
     prompt: string,
     previousInteractionId?: string
   ): Promise<{ text?: string; imageBase64?: string; interactionId: string }>
   ```

3. **实现 `editImageWithInteractions()`**
   ```typescript
   export async function editImageWithInteractions(
     images: ArrayBuffer[],
     prompt: string,
     previousInteractionId?: string
   ): Promise<{ text?: string; imageBase64?: string; interactionId: string }>
   ```

### Phase 3: 迁移现有函数 (30分钟)

**文件**: `lib/gemini.ts`

更新以下函数，内部调用 Interactions API，保持降级：

1. **`generateImage()`**
   ```typescript
   export async function generateImage(prompt: string) {
     try {
       const { generateImageWithInteractions } = await import('./gemini-interactions')
       return await generateImageWithInteractions(prompt)
     } catch (error) {
       // 降级：使用传统方法
       console.warn('[Gemini] Interactions API 失败，降级到传统方法')
       return await generateImageLegacy(prompt)
     }
   }
   ```

2. **`generateImageWithReferences()`**
   ```typescript
   export async function generateImageWithReferences(
     imageBuffers: ArrayBuffer[],
     prompt: string
   ) {
     try {
       const { editImageWithInteractions } = await import('./gemini-interactions')
       return await editImageWithInteractions(imageBuffers, prompt)
     } catch (error) {
       // 降级
       return await generateImageWithReferencesLegacy(imageBuffers, prompt)
     }
   }
   ```

3. **`chatWithImage()`**
   ```typescript
   export async function chatWithImage(
     prompt: string,
     imageData: ArrayBuffer,
     mimeType?: string
   ) {
     try {
       const { chatWithInteractions } = await import('./gemini-interactions')
       const result = await chatWithInteractions({
         prompt,
         images: [imageData],
         responseModalities: ['TEXT']
       })
       return result.reply || ''
     } catch (error) {
       // 降级
       return await chatWithImageLegacy(prompt, imageData, mimeType)
     }
   }
   ```

### Phase 4: 更新业务逻辑 (20分钟)

**文件**: `app/api/process/route.ts`

更新图片生成和编辑的处理流程：

1. **纯文字 → 图片生成**
   ```typescript
   // 获取上一次的 interaction ID
   const context = await ConversationManager.getContext(chatId)
   const previousInteractionId = context.lastInteractionId

   // 调用生成函数（现在支持上下文）
   const result = await generateImage(prompt)

   // 保存新的 interaction ID
   if (result.interactionId) {
     await ConversationManager.updateContext(chatId, {
       lastInteractionId: result.interactionId
     })
   }
   ```

2. **图片 + 文字 → 编辑图片**
   ```typescript
   const context = await ConversationManager.getContext(chatId)
   const result = await generateImageWithReferences(
     imageBuffers,
     prompt,
     context.lastInteractionId  // ✅ 传入上下文！
   )

   // 保存 interaction ID
   await ConversationManager.updateContext(chatId, {
     lastInteractionId: result.interactionId
   })
   ```

### Phase 5: 测试 (30分钟)

#### 测试场景

1. **迭代图片编辑**
   ```
   轮1: "画一只蓝色的猫"
   轮2: "把猫改成红色" ← 应该记住之前的猫
   轮3: "加个帽子" ← 应该记住红色的猫
   ```

2. **图文混合对话**
   ```
   轮1: "我叫张三"
   轮2: "画一只猫"
   轮3: "把猫的名字改成我的名字" ← 应该记住名字是"张三"
   ```

3. **多图编辑**
   ```
   轮1: [图片A] [图片B] "融合这两张图"
   轮2: "把颜色调亮一点" ← 应该记住融合后的图
   ```

#### 测试脚本

创建 `test-multimodal-interactions.js`:
```javascript
// 测试迭代图片编辑
async function testIterativeImageEditing() {
  const chatId = `test_multimodal_${Date.now()}`

  // 轮1: 生成初始图片
  await sendMessage(chatId, "画一只蓝色的猫")
  await sleep(10000)

  // 轮2: 修改颜色
  await sendMessage(chatId, "把猫改成红色")
  await sleep(10000)

  // 轮3: 添加元素
  await sendMessage(chatId, "给猫加个帽子")
  await sleep(10000)

  console.log('✅ 如果AI记住了之前的图片，测试通过！')
}
```

### Phase 6: 部署 (15分钟)

1. **提交代码**
   ```bash
   git add .
   git commit -m "feat: 将图片功能迁移到 Interactions API，支持跨轮次图片上下文记忆"
   git push
   ```

2. **验证 Vercel 环境变量**
   - 确认 GOOGLE_API_KEY 已配置
   - 确认 SUPABASE_* 变量正确

3. **飞书测试**
   - 完整走一遍迭代编辑流程
   - 验证图片上下文记忆

## 关键技术点

### 1. Thought Signatures

Gemini 3 Pro Image 使用 "thought signatures" 来保持视觉推理上下文。

- ✅ 官方 SDK 会自动处理
- ✅ 使用 `previous_interaction_id` 时自动传递
- ✅ 无需手动管理

### 2. ResponseModalities

配置期望的响应类型：

```typescript
// 只要文字
responseModalities: ['TEXT']

// 只要图片
responseModalities: ['IMAGE']

// 图文都要
responseModalities: ['TEXT', 'IMAGE']
```

### 3. 跨模型上下文

Interactions API 支持在同一会话中切换模型：

```typescript
// 轮1: 使用 gemini-3-flash-preview
const interaction1 = await client.interactions.create({
  model: 'gemini-3-flash-preview',
  input: '我叫张三'
})

// 轮2: 切换到 gemini-3-pro-image-preview，仍然记得"张三"
const interaction2 = await client.interactions.create({
  model: 'gemini-3-pro-image-preview',
  input: '画一只猫，名字叫我的名字',
  previous_interaction_id: interaction1.id  // ✅ 跨模型上下文
})
```

## 风险和降级

### 潜在风险

1. **API 配额** - Interactions API 可能有不同的配额限制
2. **响应速度** - 多模态处理可能比纯文字慢
3. **图片大小** - 需要验证 Interactions API 的图片大小限制

### 降级策略

1. **自动降级** - 所有函数都保留传统实现作为 fallback
2. **日志监控** - 记录每次 API 调用的成功/失败
3. **配置开关** - 可以通过环境变量强制使用传统方法

```typescript
const USE_INTERACTIONS_FOR_IMAGES = process.env.USE_INTERACTIONS_FOR_IMAGES !== 'false'

if (USE_INTERACTIONS_FOR_IMAGES) {
  // 使用新方法
} else {
  // 使用旧方法
}
```

## 成功标准

- ✅ 用户可以多轮迭代修改图片，无需重新上传
- ✅ 图文对话可以无缝切换（聊天 → 画图 → 聊天）
- ✅ 图片上下文保存到 Supabase（通过 lastInteractionId）
- ✅ 降级方案工作正常（Interactions API 失败时不影响功能）
- ✅ 本地和生产环境都通过测试

## 时间估算

| 阶段 | 预计时间 | 说明 |
|------|---------|------|
| Phase 1 | 30分钟 | 设计接口 |
| Phase 2 | 45分钟 | 实现核心函数 |
| Phase 3 | 30分钟 | 迁移现有函数 |
| Phase 4 | 20分钟 | 更新业务逻辑 |
| Phase 5 | 30分钟 | 测试 |
| Phase 6 | 15分钟 | 部署 |
| **总计** | **~3小时** | 包含测试和调试 |

## 参考资料

- [Interactions API 官方文档](https://ai.google.dev/gemini-api/docs/interactions)
- [Thought Signatures 文档](https://ai.google.dev/gemini-api/docs/thought-signatures)
- [图片生成文档](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini 3 文档](https://ai.google.dev/gemini-api/docs/gemini-3)
