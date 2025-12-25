#!/bin/bash

# 测试会话上下文管理和多轮对话
# 使用相同的 chatId 来模拟同一个会话

API_URL="http://localhost:3000/api/process"
CHAT_ID="test_chat_$(date +%s)"  # 使用时间戳创建唯一的 chatId

echo "================================================"
echo "测试会话 ID: $CHAT_ID"
echo "================================================"
echo ""

echo "测试 1: 发送多维表格链接"
echo "----------------------------------------"
curl -s -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"msg_001\",
    \"msgType\": \"text\",
    \"textContent\": \"https://feishu.cn/base/${BITABLE_APP_TOKEN}?table=${BITABLE_TABLE_ID}\",
    \"imageKeys\": [],
    \"chatId\": \"$CHAT_ID\"
  }" | jq -r '.success'

echo ""
sleep 2

echo "测试 2: 第一次查询（建立会话上下文）"
echo "----------------------------------------"
curl -s -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"msg_002\",
    \"msgType\": \"text\",
    \"textContent\": \"查询所有记录\",
    \"imageKeys\": [],
    \"chatId\": \"$CHAT_ID\"
  }" | jq -r '.success'

echo ""
sleep 2

echo "测试 3: 第二次操作（使用会话上下文）"
echo "----------------------------------------"
echo "注意：这次请求会使用上一次的 interaction ID"
curl -s -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"msg_003\",
    \"msgType\": \"text\",
    \"textContent\": \"再添加一条记录，姓名测试用户\",
    \"imageKeys\": [],
    \"chatId\": \"$CHAT_ID\"
  }" | jq -r '.success'

echo ""
sleep 2

echo "测试 4: 第三次操作（延续上下文）"
echo "----------------------------------------"
curl -s -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d "{
    \"messageId\": \"msg_004\",
    \"msgType\": \"text\",
    \"textContent\": \"再查一次\",
    \"imageKeys\": [],
    \"chatId\": \"$CHAT_ID\"
  }" | jq -r '.success'

echo ""
echo "================================================"
echo "测试完成！"
echo ""
echo "检查开发服务器日志，你应该看到："
echo "1. [ConversationManager] 会话状态更新"
echo "2. [Gemini Interactions] 使用 previous_interaction_id"
echo "3. [Process] 已保存 interaction ID"
echo "================================================"
