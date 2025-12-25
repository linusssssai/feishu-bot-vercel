/**
 * 使用 SQL 直接测试 Supabase 连接
 */

const { createClient } = require('@supabase/supabase-js')

async function testSupabaseDirect() {
  console.log('=== 使用 SQL 直接测试 Supabase ===\n')

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 环境变量未配置')
    return
  }

  console.log('✓ 环境变量已配置\n')

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  })

  // 1. 使用 RPC 查询表是否存在
  console.log('1. 检查 sessions 表是否存在...')
  try {
    const { data, error } = await supabase.rpc('execute_sql', {
      query: "SELECT COUNT(*) FROM public.sessions"
    })

    if (error) {
      console.log(`   尝试直接查询...`)
    }
  } catch (e) {
    // 忽略，继续其他测试
  }

  // 2. 尝试插入测试数据
  console.log('\n2. 测试插入数据...')
  const testSessionId = `test_${Date.now()}`

  try {
    const { error } = await supabase
      .from('sessions')
      .insert({
        session_id: testSessionId,
        conversation_context: { test: true },
        last_interaction_id: 'test_123',
        expires_at: new Date(Date.now() + 86400000).toISOString()
      })

    if (error) {
      console.error(`   ❌ 插入失败: ${error.message}`)
      console.error(`   错误详情: ${JSON.stringify(error, null, 2)}`)
    } else {
      console.log(`   ✓ 插入成功！`)

      // 3. 尝试查询刚插入的数据
      console.log('\n3. 测试查询数据...')
      const { data: selectData, error: selectError } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_id', testSessionId)
        .single()

      if (selectError) {
        console.error(`   ❌ 查询失败: ${selectError.message}`)
      } else {
        console.log(`   ✓ 查询成功！`)
        console.log(`   数据: ${JSON.stringify(selectData, null, 2)}`)

        // 4. 清理测试数据
        console.log('\n4. 清理测试数据...')
        const { error: deleteError } = await supabase
          .from('sessions')
          .delete()
          .eq('session_id', testSessionId)

        if (deleteError) {
          console.error(`   ❌ 删除失败: ${deleteError.message}`)
        } else {
          console.log(`   ✓ 删除成功！`)
        }
      }
    }
  } catch (error) {
    console.error(`   ❌ 测试失败: ${error.message}`)
  }

  console.log('\n=== 测试完成 ===')
}

testSupabaseDirect().catch(console.error)
