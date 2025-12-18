export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>飞书智能机器人</h1>
      <p>Webhook 端点: <code>/api/webhook</code></p>
      <hr />
      <h3>功能</h3>
      <ul>
        <li>接收飞书消息并智能回复（基于Gemini）</li>
        <li>支持图片识别和分析</li>
        <li>支持多维表格数据操作</li>
      </ul>
      <h3>状态</h3>
      <p>服务运行中...</p>
    </main>
  )
}
