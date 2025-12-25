/**
 * 测试 Gemini Interactions API 的会话记忆功能
 * 不依赖 Supabase，只测试 Google API 本身
 */
const { GoogleGenAI } = require('@google/genai')

async function testInteractionsAPI() {
  console.log('=== 测试 Gemini Interactions API ===\n')

  const apiKey = process.env.GOOGLE_API_KEY || 'AIzaSyAz7T8ShgBMVl7A8JIHLs-ThFoHOoVebeo'
  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY 未配置')
    return
  }

  console.log('✓ API Key 已配置\n')

  const client = new GoogleGenAI({ apiKey })

  try {
    // 第一轮对话
    console.log('📝 第一轮对话: "我叫张三"')
    const interaction1 = await client.interactions.create({
      model: 'gemini-3-flash-preview',
      input: '你是智能助手。用户说: 我叫张三。请简短回复。',
    })

    const output1 = interaction1.outputs?.[interaction1.outputs.length - 1]
    if (!output1 || output1.type !== 'text') {
      console.error('❌ 第一轮对话失败: 输出格式错误')
      console.log('Interaction:', JSON.stringify(interaction1, null, 2))
      return
    }

    const interactionId = interaction1.id
    console.log(`✓ 回复: ${output1.text}`)
    console.log(`✓ Interaction ID: ${interactionId}\n`)

    // 第二轮对话 - 使用 previous_interaction_id
    console.log('📝 第二轮对话: "我叫什么名字？"')
    console.log(`  (使用 previous_interaction_id: ${interactionId})`)

    const interaction2 = await client.interactions.create({
      model: 'gemini-3-flash-preview',
      input: '我叫什么名字？',
      previous_interaction_id: interactionId,  // 关键！
    })

    const output2 = interaction2.outputs?.[interaction2.outputs.length - 1]
    if (!output2 || output2.type !== 'text') {
      console.error('❌ 第二轮对话失败: 输出格式错误')
      console.log('Interaction:', JSON.stringify(interaction2, null, 2))
      return
    }

    console.log(`✓ 回复: ${output2.text}`)
    console.log(`✓ Interaction ID: ${interaction2.id}\n`)

    // 验证结果
    const hasMemory = output2.text.includes('张三') || output2.text.includes('你叫')
    console.log('\n=== 测试结果 ===')
    if (hasMemory) {
      console.log('✅ 会话记忆功能正常！AI 记住了第一轮对话中的名字。')
      console.log('\n🎉 Interactions API 工作正常！')
      console.log('问题不在 Interactions API 本身，可能是：')
      console.log('  1. Vercel 环境变量未配置 GOOGLE_API_KEY')
      console.log('  2. 代码中的错误处理导致降级到传统 API')
      console.log('  3. Supabase 连接问题导致无法保存/读取 interaction ID')
    } else {
      console.log('⚠️  AI 没有记住之前的对话')
      console.log('这可能是因为：')
      console.log('  1. previous_interaction_id 参数没有正确传递')
      console.log('  2. Google 服务器端问题')
      console.log('  3. 模型版本不支持会话记忆')
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    if (error.response) {
      console.error('Response:', error.response)
    }
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
  }
}

testInteractionsAPI()
