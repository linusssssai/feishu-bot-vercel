/**
 * 测试图片编辑的完整流程
 * 验证 Interactions API 的图片上下文记忆
 */

const API_URL = process.env.API_URL || 'http://localhost:3003/api/process'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function sendMessage(chatId, textContent) {
  console.log(`\n📤 发送消息: "${textContent}"`)

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messageId: `test_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      msgType: 'text',
      textContent,
      imageKeys: [],
      chatId
    })
  })

  const result = await response.json()
  console.log(`✅ 响应: ${result.success ? '成功' : '失败'}`)
  return result
}

async function main() {
  const chatId = `test_image_edit_${Date.now()}`

  console.log('=== 测试图片迭代编辑功能 ===')
  console.log(`会话 ID: ${chatId}`)
  console.log('\n目标：验证 AI 能否记住之前生成的图片并持续编辑\n')

  // 第1轮：生成初始图片
  console.log('🎨 第1轮：生成初始图片')
  await sendMessage(chatId, '画一只可爱的小猫咪')
  console.log('⏳ 等待 20 秒让 AI 生成图片...')
  await sleep(20000)

  // 第2轮：编辑图片 - 改颜色
  console.log('\n🎨 第2轮：编辑图片（改颜色）')
  console.log('💡 关键测试：AI 应该记住第1轮生成的猫，不需要重新上传图片')
  await sendMessage(chatId, '把这只猫改成橙色的')
  console.log('⏳ 等待 20 秒...')
  await sleep(20000)

  // 第3轮：继续编辑 - 添加元素
  console.log('\n🎨 第3轮：继续编辑（添加元素）')
  console.log('💡 关键测试：AI 应该记住第2轮的橙色猫')
  await sendMessage(chatId, '给它戴个蓝色的小帽子')
  console.log('⏳ 等待 20 秒...')
  await sleep(20000)

  // 第4轮：最后编辑 - 场景修改
  console.log('\n🎨 第4轮：场景修改')
  console.log('💡 关键测试：AI 应该记住戴帽子的橙色猫')
  await sendMessage(chatId, '把背景改成花园')
  console.log('⏳ 等待 20 秒...')
  await sleep(20000)

  console.log('\n\n✅ 测试脚本执行完成！')
  console.log('\n📊 验证方法：')
  console.log('1. 查看开发服务器日志')
  console.log('2. 检查每轮对话是否都有：')
  console.log('   - [Gemini Interactions] 使用上一次 interaction ID: v1_...')
  console.log('   - [Process] 已保存图片生成 interaction ID: v1_...')
  console.log('   - [Gemini Interactions] 图片生成成功')
  console.log('3. 如果 AI 每次都能基于之前的图片编辑，说明上下文记忆工作正常！')
  console.log('\n预期结果：')
  console.log('  第1轮: 生成可爱的小猫')
  console.log('  第2轮: 橙色的猫（基于第1轮）')
  console.log('  第3轮: 戴蓝色帽子的橙色猫（基于第2轮）')
  console.log('  第4轮: 在花园里的戴帽子橙色猫（基于第3轮）')
}

main().catch(error => {
  console.error('\n❌ 测试失败:', error)
  process.exit(1)
})
