/**
 * 飞书 API 封装
 */

const BASE_URL = 'https://open.feishu.cn/open-apis'

// Token 缓存
let tokenCache: { token: string; expireAt: number } | null = null

/**
 * 获取 tenant_access_token
 */
export async function getTenantAccessToken(): Promise<string> {
  // 检查缓存
  if (tokenCache && tokenCache.expireAt > Date.now()) {
    return tokenCache.token
  }

  const response = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }),
  })

  const data = await response.json()

  if (data.code === 0) {
    tokenCache = {
      token: data.tenant_access_token,
      expireAt: Date.now() + (data.expire - 300) * 1000, // 提前5分钟过期
    }
    return data.tenant_access_token
  }

  throw new Error(`获取token失败: ${JSON.stringify(data)}`)
}

/**
 * 回复消息
 */
export async function replyMessage(messageId: string, content: string): Promise<boolean> {
  const token = await getTenantAccessToken()

  const response = await fetch(`${BASE_URL}/im/v1/messages/${messageId}/reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: JSON.stringify({ text: content }),
    }),
  })

  const data = await response.json()
  return data.code === 0
}

/**
 * 发送消息到会话
 */
export async function sendMessage(
  receiveId: string,
  content: string,
  receiveIdType: 'open_id' | 'chat_id' = 'chat_id'
): Promise<boolean> {
  const token = await getTenantAccessToken()

  const response = await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: 'text',
      content: JSON.stringify({ text: content }),
    }),
  })

  const data = await response.json()
  return data.code === 0
}

/**
 * 获取图片资源
 */
export async function getImageResource(messageId: string, fileKey: string): Promise<ArrayBuffer | null> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/im/v1/messages/${messageId}/resources/${fileKey}?type=image`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  )

  if (response.ok) {
    return await response.arrayBuffer()
  }
  return null
}

/**
 * 多维表格 - 查询记录
 */
export async function getBitableRecords(
  appToken: string,
  tableId: string,
  filter?: string
): Promise<any[]> {
  const token = await getTenantAccessToken()

  let url = `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records`
  if (filter) {
    url += `?filter=${encodeURIComponent(filter)}`
  }

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  })

  const data = await response.json()

  if (data.code === 0) {
    return data.data?.items || []
  }
  return []
}

/**
 * 多维表格 - 创建记录
 */
export async function createBitableRecord(
  appToken: string,
  tableId: string,
  fields: Record<string, any>
): Promise<string | null> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  )

  const data = await response.json()

  if (data.code === 0) {
    return data.data?.record?.record_id || null
  }
  return null
}

/**
 * 多维表格 - 更新记录
 */
export async function updateBitableRecord(
  appToken: string,
  tableId: string,
  recordId: string,
  fields: Record<string, any>
): Promise<boolean> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    }
  )

  const data = await response.json()
  return data.code === 0
}
