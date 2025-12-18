export const metadata = {
  title: '飞书智能机器人',
  description: '基于Gemini的飞书智能助手',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
