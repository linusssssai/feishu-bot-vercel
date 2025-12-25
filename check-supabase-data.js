/**
 * 检查 Supabase 中的会话数据
 */
const { createClient } = require('@supabase/supabase-js')

async function checkData() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://tokqbehzolscfipmhjff.supabase.co'
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRva3FiZWh6b2xzY2ZpcG1oamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTIwNzQ4MiwiZXhwIjoyMDc0NzgzNDgyfQ.ccmtXYMXXoTdRuwCcc2kde_SaAYMgqv1gwpnEvGytJQ'

  const supabase = createClient(supabaseUrl, supabaseKey)

  console.log('=== 查询 Supabase sessions 表 ===\n')

  const { data, error } = await supabase
    .from('sessions')
    .select('session_id, last_interaction_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('❌ 查询失败:', error.message)
    return
  }

  console.log(`✅ 找到 ${data.length} 条会话记录:\n`)

  data.forEach((session, index) => {
    console.log(`${index + 1}. Session ID: ${session.session_id}`)
    console.log(`   Interaction ID: ${session.last_interaction_id}`)
    console.log(`   创建时间: ${session.created_at}`)
    console.log('')
  })

  if (data.length === 0) {
    console.log('⚠️  表是空的，还没有会话数据')
  }
}

checkData()
