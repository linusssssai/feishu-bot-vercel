# 飞书智能机器人 - 项目文档

## 项目概述

基于 Next.js + Vercel 部署的飞书机器人，集成 Google Gemini AI，支持：
- 智能文字对话
- AI 图片生成 (Gemini 3 Pro Image)
- 多图+文字混合生成
- 多维表格 CRUD 操作

## 技术栈

- **框架**: Next.js 14 (App Router)
- **部署**: Vercel (Serverless)
- **AI**: Google Gemini API
  - `gemini-2.0-flash-exp` - 文字对话/意图分析
  - `gemini-3-pro-image-preview` - 图片生成
- **飞书 API**: 消息收发、图片上传、多维表格

## 项目结构

```
feishu-bot-vercel/
├── app/
│   ├── api/
│   │   ├── webhook/route.ts    # 飞书事件订阅入口
│   │   └── process/route.ts    # 异步消息处理
│   └── page.tsx                # 首页
├── lib/
│   ├── feishu.ts               # 飞书 API 封装
│   └── gemini.ts               # Gemini AI 封装
├── .env                        # 环境变量 (本地)
└── package.json
```

## 环境变量

```env
# 飞书应用凭证
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx

# Google AI
GOOGLE_API_KEY=xxx

# 可选：默认多维表格
DEFAULT_BITABLE_APP_TOKEN=xxx
DEFAULT_BITABLE_TABLE_ID=xxx
```

## 核心功能

### 1. 文字对话

用户发送文本消息，Gemini 分析意图后回复。

```
用户: 今天天气怎么样？
机器人: [AI 生成的回复]
```

### 2. 图片生成

AI 自动识别图片生成意图，使用 `gemini-3-pro-image-preview` 生成。

```
用户: 画一只可爱的猫咪
机器人: [生成的图片] + 描述文字
```

### 3. 多图+文字生成

发送富文本消息（post）包含多张图片 + 文字提示，生成融合图片。

```
用户: [图片1] [图片2] 把这两张图片融合成一张
机器人: [生成的融合图片]
```

### 4. 多维表格 CRUD

通过自然语言操作飞书多维表格。

**使用方式:**

1. 发送多维表格链接，机器人识别并显示字段
2. 发送操作命令

**支持的操作:**
- 查询: "查询所有记录"、"搜索姓名张三"
- 添加: "添加一条记录，姓名张三，年龄25"
- 修改: "修改第一条记录的年龄为30"
- 删除: "删除第一条记录"
- 创建表格: "创建员工表，包含姓名、部门、入职日期"

**示例对话:**
```
用户: https://feishu.cn/base/abc?table=tbl123
机器人: ✅ 已识别多维表格链接
        📊 表格字段:
          • 姓名 (文本)
          • 年龄 (数字)

用户: 查询所有记录
机器人: 共 5 条记录:
        1. 张三, 25
        2. 李四, 30
        ...

用户: 添加一条记录，姓名王五，年龄28
机器人: ✅ 记录添加成功
```

## API 端点

### POST /api/webhook

飞书事件订阅回调地址。

- 接收飞书消息事件
- 10ms 内返回 200
- 使用 `waitUntil` 触发异步处理

### POST /api/process

异步消息处理。

请求体:
```json
{
  "messageId": "om_xxx",
  "msgType": "text|image|post",
  "textContent": "用户消息",
  "imageKeys": ["img_xxx"],
  "chatId": "oc_xxx"
}
```

## 关键文件说明

### lib/feishu.ts

飞书 API 封装:
- `getTenantAccessToken()` - 获取 token (带缓存)
- `replyMessage()` - 回复文本消息
- `replyImageMessage()` - 回复图片消息
- `uploadImage()` - 上传图片
- `getImageResource()` - 获取图片资源
- `parseBitableUrl()` - 解析多维表格 URL
- `getBitableRecords()` - 查询记录
- `createBitableRecord()` - 创建记录
- `updateBitableRecord()` - 更新记录
- `deleteBitableRecord()` - 删除记录
- `getBitableFields()` - 获取字段列表
- `listBitableTables()` - 获取表格列表
- `createBitableTable()` - 创建新表格
- `batchCreateBitableRecords()` - 批量创建
- `batchDeleteBitableRecords()` - 批量删除

### lib/gemini.ts

Gemini AI 封装:
- `chatWithText()` - 纯文字对话
- `chatWithImage()` - 图片+文字对话
- `generateAssistantReply()` - 智能回复
- `analyzeImage()` - 图片分析
- `analyzeUserIntent()` - 意图分析 (text/image_generation)
- `generateImage()` - 纯文字生成图片
- `generateImageWithReferences()` - 多图+文字生成图片
- `analyzeBitableIntent()` - 多维表格操作意图分析
- `generateBitableResponse()` - 生成操作结果回复

## 部署

1. 推送到 GitHub
2. Vercel 自动部署
3. 配置环境变量
4. 飞书开放平台配置 Webhook URL: `https://your-domain.vercel.app/api/webhook`

## 飞书权限配置

需要的权限:
- `im:message` - 消息读写
- `im:resource` - 资源读取
- `bitable:app` - 多维表格读写

## 注意事项

1. **Webhook 响应时间**: 必须在 3 秒内返回 200，否则飞书会重试
2. **图片大小限制**: 飞书图片上传限制 10MB
3. **多维表格上下文**: 基于 chatId 存储，Serverless 环境下会话可能丢失
4. **Gemini 配额**: 注意 API 调用频率限制

## 本地开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build
```

## 更新日志

- **2024-12**: 初始版本，支持文字对话
- **2024-12**: 添加图片生成功能 (Gemini 3 Pro Image)
- **2024-12**: 添加多图+文字生成功能
- **2024-12**: 添加多维表格 CRUD 功能
