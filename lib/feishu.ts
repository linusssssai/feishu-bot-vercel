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

// ============ 图片消息功能 ============

/**
 * 上传图片到飞书
 * @param imageBuffer - 图片数据 (Buffer)
 * @returns image_key 或 null
 */
export async function uploadImage(imageBuffer: Buffer): Promise<string | null> {
  const token = await getTenantAccessToken()

  // 创建 FormData - 将 Buffer 转为 Uint8Array 以兼容 Blob
  const formData = new FormData()
  formData.append('image_type', 'message')
  const uint8Array = new Uint8Array(imageBuffer)
  formData.append('image', new Blob([uint8Array], { type: 'image/png' }), 'generated.png')

  const response = await fetch(`${BASE_URL}/im/v1/images`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  })

  const data = await response.json()

  if (data.code === 0) {
    console.log(`[Feishu] 图片上传成功: ${data.data?.image_key}`)
    return data.data?.image_key || null
  }

  console.error('[Feishu] 上传图片失败:', data)
  return null
}

/**
 * 回复图片消息
 */
export async function replyImageMessage(messageId: string, imageKey: string): Promise<boolean> {
  const token = await getTenantAccessToken()

  const response = await fetch(`${BASE_URL}/im/v1/messages/${messageId}/reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'image',
      content: JSON.stringify({ image_key: imageKey }),
    }),
  })

  const data = await response.json()

  if (data.code === 0) {
    console.log('[Feishu] 图片消息发送成功')
    return true
  }

  console.error('[Feishu] 图片消息发送失败:', data)
  return false
}

/**
 * 发送图片消息到会话
 */
export async function sendImageMessage(
  receiveId: string,
  imageKey: string,
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
      msg_type: 'image',
      content: JSON.stringify({ image_key: imageKey }),
    }),
  })

  const data = await response.json()
  return data.code === 0
}

// ============ 多维表格扩展功能 ============

/**
 * 解析多维表格 URL
 * 支持格式: https://feishu.cn/base/{app_token}?table={table_id}
 *          https://xxx.feishu.cn/base/{app_token}?table={table_id}
 */
export function parseBitableUrl(url: string): { appToken: string; tableId: string } | null {
  // 匹配多种飞书域名格式
  const regex = /(?:feishu\.cn|larksuite\.com)\/base\/([a-zA-Z0-9_-]+)(?:\?.*table=([a-zA-Z0-9_]+))?/
  const match = url.match(regex)

  if (match) {
    return {
      appToken: match[1],
      tableId: match[2] || '',
    }
  }
  return null
}

/**
 * 多维表格 - 删除记录
 */
export async function deleteBitableRecord(
  appToken: string,
  tableId: string,
  recordId: string
): Promise<boolean> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }
  )

  const data = await response.json()
  console.log(`[Feishu] 删除记录 ${recordId}: ${data.code === 0 ? '成功' : '失败'}`)
  return data.code === 0
}

/**
 * 多维表格 - 获取表格字段列表
 */
export async function getBitableFields(
  appToken: string,
  tableId: string
): Promise<any[]> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  )

  const data = await response.json()

  if (data.code === 0) {
    return data.data?.items || []
  }
  console.error('[Feishu] 获取字段失败:', data)
  return []
}

/**
 * 多维表格 - 获取所有数据表
 */
export async function listBitableTables(appToken: string): Promise<any[]> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  )

  const data = await response.json()

  if (data.code === 0) {
    return data.data?.items || []
  }
  console.error('[Feishu] 获取表格列表失败:', data)
  return []
}

/**
 * 多维表格 - 创建新数据表
 */
export async function createBitableTable(
  appToken: string,
  tableName: string,
  fields: Array<{ field_name: string; type: number; description?: string }>
): Promise<string | null> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: {
          name: tableName,
          default_view_name: '默认视图',
          fields: fields,
        },
      }),
    }
  )

  const data = await response.json()

  if (data.code === 0) {
    console.log(`[Feishu] 创建表格成功: ${data.data?.table_id}`)
    return data.data?.table_id || null
  }
  console.error('[Feishu] 创建表格失败:', data)
  return null
}

/**
 * 多维表格 - 批量创建记录 (最多500条)
 */
export async function batchCreateBitableRecords(
  appToken: string,
  tableId: string,
  records: Array<{ fields: Record<string, any> }>
): Promise<string[]> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: records.slice(0, 500) }),
    }
  )

  const data = await response.json()

  if (data.code === 0) {
    const ids = data.data?.records?.map((r: any) => r.record_id) || []
    console.log(`[Feishu] 批量创建 ${ids.length} 条记录`)
    return ids
  }
  console.error('[Feishu] 批量创建失败:', data)
  return []
}

/**
 * 多维表格 - 批量删除记录 (最多500条)
 */
export async function batchDeleteBitableRecords(
  appToken: string,
  tableId: string,
  recordIds: string[]
): Promise<boolean> {
  const token = await getTenantAccessToken()

  const response = await fetch(
    `${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_delete`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: recordIds.slice(0, 500) }),
    }
  )

  const data = await response.json()
  console.log(`[Feishu] 批量删除: ${data.code === 0 ? '成功' : '失败'}`)
  return data.code === 0
}

// 字段类型常量
export const BITABLE_FIELD_TYPES = {
  TEXT: 1,           // 文本
  NUMBER: 2,         // 数字
  SINGLE_SELECT: 3,  // 单选
  MULTI_SELECT: 4,   // 多选
  DATE: 5,           // 日期
  CHECKBOX: 7,       // 复选框
  PERSON: 11,        // 人员
  URL: 15,           // 超链接
  ATTACHMENT: 17,    // 附件
  CREATED_TIME: 1001, // 创建时间
  MODIFIED_TIME: 1002, // 修改时间
}
