/**
 * 测试多模态（图文混合）的上下文记忆功能
 * 验证 Interactions API 能否记住之前的图片
 */

const API_URL = process.env.API_URL || 'http://localhost:3002/api/process'

// 模拟延迟
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function sendMessage(chatId, textContent, imageKeys = []) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messageId: `test_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      msgType: imageKeys.length > 0 ? 'post' : 'text',
      textContent,
      imageKeys,
      chatId
    })
  })

  const result = await response.json()
  console.log(`✅ 消息已发送: "${textContent}"`)
  return result
}

async function main() {
  const chatId = `test_multimodal_${Date.now()}`

  console.log('=== 测试多模态上下文记忆（迭代图片编辑）===')
  console.log(`会话 ID: ${chatId}\n`)

  // 场景 1: 纯文字生成图片
  console.log('📝 场景 1: 纯文字生成图片')
  console.log('➡️  轮1: "画一只蓝色的猫"')
  await sendMessage(chatId, '画一只蓝色的猫')
  console.log('⏳ 等待 15 秒让 AI 生成图片...\n')
  await sleep(15000)

  console.log('➡️  轮2: "把猫改成红色"')
  console.log('💡 预期: AI 应该记住之前的蓝猫，生成红猫\n')
  await sendMessage(chatId, '把猫改成红色')
  console.log('⏳ 等待 15 秒...\n')
  await sleep(15000)

  console.log('➡️  轮3: "给猫加个帽子"')
  console.log('💡 预期: AI 应该记住红猫，生成戴帽子的红猫\n')
  await sendMessage(chatId, '给猫加个帽子')
  console.log('⏳ 等待 15 秒...\n')
  await sleep(15000)

  // 场景 2: 图文混合对话
  const chatId2 = `test_multimodal_2_${Date.now()}`
  console.log('\n📝 场景 2: 图文混合对话（文字 + 图片生成）')
  console.log(`新会话 ID: ${chatId2}\n`)

  console.log('➡️  轮1: "我叫张三"')
  await sendMessage(chatId2, '我叫张三')
  console.log('⏳ 等待 5 秒...\n')
  await sleep(5000)

  console.log('➡️  轮2: "画一只猫，名字叫我的名字"')
  console.log('💡 预期: AI 应该记住"我叫张三"，生成名叫张三的猫\n')
  await sendMessage(chatId2, '画一只猫，名字叫我的名字')
  console.log('⏳ 等待 15 秒...\n')
  await sleep(15000)

  console.log('➡️  轮3: "我叫什么名字？"')
  console.log('💡 预期: AI 应该回答"张三"\n')
  await sendMessage(chatId2, '我叫什么名字？')
  console.log('⏳ 等待 5 秒...\n')
  await sleep(5000)

  console.log('\n✅ 测试脚本执行完成！')
  console.log('\n📊 验证方法:')
  console.log('1. 查看开发服务器日志，确认每次对话都使用了 previous_interaction_id')
  console.log('2. 检查 AI 的回复是否符合预期（记住了之前的图片/对话）')
  console.log('3. 在 Supabase 中查看 sessions 表，确认 last_interaction_id 已保存')
  console.log('\n预期日志关键词:')
  console.log('  ✓ [Gemini Interactions] 使用上一次 interaction ID: v1_...')
  console.log('  ✓ [Process] 已保存图片生成 interaction ID: v1_...')
  console.log('  ✓ [SessionStore] Saved session to Supabase')
}

main().catch(console.error)
