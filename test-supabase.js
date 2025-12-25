/**
 * 测试 Supabase 连接和会话存储
 */

const { createClient } = require('@supabase/supabase-js')

async function testSupabase() {
  console.log('=== 测试 Supabase 连接 ===\n')

  // 1. 检查环境变量
  console.log('1. 检查环境变量:')
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY

  console.log(`   SUPABASE_URL: ${supabaseUrl ? '✓ 已设置' : '✗ 未设置'}`)
  console.log(`   SUPABASE_SERVICE_KEY: ${supabaseKey ? '✓ 已设置' : '✗ 未设置'}\n`)

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase 环境变量未配置！')
    return
  }

  // 2. 创建客户端
  console.log('2. 创建 Supabase 客户端...')
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  })
  console.log('   ✓ 客户端创建成功\n')

  // 3. 测试连接 - 查询 sessions 表
  console.log('3. 测试数据库连接（查询 sessions 表）...')
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .limit(5)

    if (error) {
      console.error(`   ❌ 查询失败: ${error.message}`)
      if (error.code === '42P01') {
        console.error(`   ⚠️  sessions 表不存在！请在 Supabase Dashboard 创建表。`)
      }
      return
    }

    console.log(`   ✓ 查询成功`)
    console.log(`   ✓ 当前有 ${data.length} 条会话记录\n`)

    if (data.length > 0) {
      console.log('   最近的会话记录:')
      data.forEach((session, i) => {
        console.log(`   ${i + 1}. session_id: ${session.session_id}`)
        console.log(`      last_interaction_id: ${session.last_interaction_id || '(空)'}`)
        console.log(`      last_updated_at: ${session.last_updated_at}`)
      })
      console.log()
    }

  } catch (error) {
    console.error(`   ❌ 连接失败: ${error.message}\n`)
    return
  }

  // 4. 测试写入
  console.log('4. 测试写入数据...')
  const testSessionId = `test_${Date.now()}`
  const testContext = {
    lastInteractionId: 'test_interaction_123',
    lastUpdateTime: Date.now()
  }

  try {
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const { error } = await supabase
      .from('sessions')
      .upsert({
        session_id: testSessionId,
        conversation_context: testContext,
        last_interaction_id: testContext.lastInteractionId,
        last_updated_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'session_id'
      })

    if (error) {
      console.error(`   ❌ 写入失败: ${error.message}\n`)
      return
    }

    console.log(`   ✓ 写入成功 (session_id: ${testSessionId})\n`)

  } catch (error) {
    console.error(`   ❌ 写入失败: ${error.message}\n`)
    return
  }

  // 5. 测试读取
  console.log('5. 测试读取刚写入的数据...')
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_id', testSessionId)
      .single()

    if (error) {
      console.error(`   ❌ 读取失败: ${error.message}\n`)
      return
    }

    console.log(`   ✓ 读取成功`)
    console.log(`   ✓ conversation_context: ${JSON.stringify(data.conversation_context)}`)
    console.log(`   ✓ last_interaction_id: ${data.last_interaction_id}\n`)

  } catch (error) {
    console.error(`   ❌ 读取失败: ${error.message}\n`)
    return
  }

  // 6. 清理测试数据
  console.log('6. 清理测试数据...')
  try {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('session_id', testSessionId)

    if (error) {
      console.error(`   ❌ 删除失败: ${error.message}\n`)
    } else {
      console.log(`   ✓ 测试数据已清理\n`)
    }

  } catch (error) {
    console.error(`   ❌ 删除失败: ${error.message}\n`)
  }

  console.log('=== 测试完成 ===')
  console.log('\n✅ Supabase 连接正常！会话存储功能应该可以工作。')
  console.log('\n⚠️  如果飞书对话仍然不记忆，请检查：')
  console.log('   1. Vercel 环境变量是否配置了 SUPABASE_URL 和 SUPABASE_SERVICE_KEY')
  console.log('   2. Vercel 日志中是否有 "[SessionStore] Saved session" 的日志')
  console.log('   3. Supabase sessions 表中是否有真实的会话数据')
}

testSupabase().catch(console.error)
