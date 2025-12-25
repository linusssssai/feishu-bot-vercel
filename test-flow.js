/**
 * 测试完整的会话记忆流程
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

async function testCompleteFlow() {
  console.log('=== 测试完整会话记忆流程 ===\n')

  // 检查环境变量
  console.log('环境变量检查:')
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? '✓' : '✗'}`)
  console.log(`  SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? '✓' : '✗'}`)
  console.log(`  GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? '✓' : '✗'}\n`)

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Supabase 环境变量未配置\n')
    return
  }

  // 测试 Supabase 表访问（使用 upsert，更宽松）
  console.log('测试 Supabase 访问...')
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )

  const testSession = {
    session_id: `test_${Date.now()}`,
    conversation_context: { lastInteractionId: 'test_id_123' },
    last_interaction_id: 'test_id_123',
    expires_at: new Date(Date.now() + 86400000).toISOString()
  }

  try {
    // 尝试 upsert
    const { data, error } = await supabase
      .from('sessions')
      .upsert(testSession, { onConflict: 'session_id' })
      .select()

    if (error) {
      console.error(`  ❌ Supabase 访问失败: ${error.message}`)
      console.error(`  错误代码: ${error.code}`)
      console.error(`  \n可能的原因:`)
      console.error(`  1. sessions 表不存在或 schema cache 未刷新`)
      console.error(`  2. RLS 策略阻止了访问`)
      console.error(`  3. 权限未正确配置\n`)

      console.log(`  尝试解决方案：在 Supabase SQL Editor 执行:`)
      console.log(`  \n  -- 禁用 RLS（简化测试）`)
      console.log(`  ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;\n`)

      return
    }

    console.log(`  ✓ Supabase 写入成功！`)
    console.log(`  ✓ 写入数据: ${JSON.stringify(data, null, 2)}\n`)

    // 尝试读取
    const { data: readData, error: readError } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_id', testSession.session_id)
      .single()

    if (readError) {
      console.error(`  ❌ 读取失败: ${readError.message}\n`)
    } else {
      console.log(`  ✓ Supabase 读取成功！`)
      console.log(`  ✓ 读取数据: ${JSON.stringify(readData, null, 2)}\n`)
    }

    // 清理
    await supabase
      .from('sessions')
      .delete()
      .eq('session_id', testSession.session_id)

    console.log('✅ Supabase 集成测试通过！\n')
    console.log('下一步: 检查 Vercel 环境变量配置')
    console.log('  1. 登录 Vercel Dashboard')
    console.log('  2. 进入项目 Settings → Environment Variables')
    console.log('  3. 确认已添加:')
    console.log('     - SUPABASE_URL')
    console.log('     - SUPABASE_SERVICE_KEY')
    console.log('  4. 重新部署项目\n')

  } catch (error) {
    console.error(`  ❌ 测试失败: ${error.message}\n`)
  }
}

testCompleteFlow().catch(console.error)
