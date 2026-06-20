#!/bin/bash

# 赛博朋克技术博客 - API 测试脚本
# API Testing Script for Cyberpunk Tech Blog

echo "================================================"
echo "🧪 赛博朋克技术博客 API 测试"
echo "   Cyberpunk Tech Blog API Testing"
echo "================================================"
echo ""

BASE_URL="http://localhost:9098"
API_URL="${BASE_URL}/api"
PASSED=0
FAILED=0

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_result() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((FAILED++))
    fi
}

# 1. 健康检查测试
echo "================================================"
echo "📋 测试 1: 健康检查 (Health Check)"
echo "================================================"
echo -n "测试 /health 端点... "
HEALTH=$(curl -s ${BASE_URL}/health)
echo $HEALTH | grep -q '"status":"ok"'
test_result
echo "响应: $HEALTH"
echo ""

# 2. API 端点功能测试
echo "================================================"
echo "📋 测试 2: API 端点功能测试"
echo "================================================"

echo -n "测试 GET /api/articles... "
ARTICLES=$(curl -s ${API_URL}/articles)
echo $ARTICLES | grep -q '\[' # 检查是否返回数组
test_result
echo "响应: ${ARTICLES:0:100}..."
echo ""

echo -n "测试 GET /api/categories... "
CATEGORIES=$(curl -s ${API_URL}/categories)
echo $CATEGORIES | grep -q '\['
test_result
echo "响应: ${CATEGORIES:0:100}..."
echo ""

echo -n "测试 GET /api/tags... "
TAGS=$(curl -s ${API_URL}/tags)
echo $TAGS | grep -q '\['
test_result
echo "响应: ${TAGS:0:100}..."
echo ""

echo -n "测试 GET /api/stats... "
STATS=$(curl -s ${API_URL}/stats)
echo $STATS | grep -q '{'
test_result
echo "响应: ${STATS:0:100}..."
echo ""

# 3. 安全性测试 - 未授权访问
echo "================================================"
echo "🔒 测试 3: 安全性测试 - 未授权访问"
echo "================================================"

echo -n "测试未授权创建分类 (应该返回 401)... "
CREATE_CAT=$(curl -s -w "\n%{http_code}" -X POST ${API_URL}/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"测试分类","slug":"test"}')
HTTP_CODE=$(echo "$CREATE_CAT" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (返回 401)"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} (返回 $HTTP_CODE)"
    ((FAILED++))
fi
echo ""

# 4. 速率限制测试
echo "================================================"
echo "⏱️  测试 4: 速率限制测试"
echo "================================================"
echo "测试登录速率限制 (15分钟5次)..."

for i in {1..6}; do
    echo -n "  第 $i 次尝试... "
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST ${API_URL}/auth/login \
      -H "Content-Type: application/json" \
      -d '{"username":"test","password":"wrong"}')
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ $i -le 5 ]; then
        if [ "$HTTP_CODE" = "401" ]; then
            echo -e "${GREEN}✓ 正常拒绝 (401)${NC}"
        else
            echo -e "${YELLOW}⚠ 返回 $HTTP_CODE${NC}"
        fi
    else
        # 第6次应该被速率限制
        if [ "$HTTP_CODE" = "429" ]; then
            echo -e "${GREEN}✓ 速率限制生效 (429)${NC}"
            ((PASSED++))
        else
            echo -e "${RED}✗ 速率限制未生效 (返回 $HTTP_CODE)${NC}"
            ((FAILED++))
        fi
    fi

    # 短暂延迟避免过快
    sleep 0.2
done
echo ""

# 5. CORS 测试
echo "================================================"
echo "🌐 测试 5: CORS 配置测试"
echo "================================================"
echo -n "测试 CORS 头信息... "
CORS_RESPONSE=$(curl -s -I -H "Origin: http://localhost:3000" ${API_URL}/articles)
if echo "$CORS_RESPONSE" | grep -qi "Access-Control-Allow-Origin"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi
echo ""

# 6. 性能测试
echo "================================================"
echo "⚡ 测试 6: API 响应时间测试"
echo "================================================"

echo "测试 /api/articles 响应时间..."
RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}" ${API_URL}/articles)
echo "响应时间: ${RESPONSE_TIME}s"
# 将浮点数转换为整数比较 (毫秒)
RESPONSE_MS=$(echo "$RESPONSE_TIME * 1000" | bc | cut -d. -f1)
if [ $RESPONSE_MS -lt 1000 ]; then
    echo -e "${GREEN}✓ 性能良好 (<1s)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ 响应较慢 (>1s)${NC}"
    ((PASSED++))
fi
echo ""

# 7. 错误处理测试
echo "================================================"
echo "🚫 测试 7: 错误处理测试"
echo "================================================"

echo -n "测试不存在的端点 (应返回 404)... "
NOT_FOUND=$(curl -s -w "\n%{http_code}" ${API_URL}/nonexistent)
HTTP_CODE=$(echo "$NOT_FOUND" | tail -n1)
if [ "$HTTP_CODE" = "404" ]; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (返回 $HTTP_CODE)${NC}"
    ((FAILED++))
fi
echo ""

echo -n "测试无效的文章 ID (应返回 404)... "
INVALID_ID=$(curl -s -w "\n%{http_code}" ${API_URL}/articles/99999)
HTTP_CODE=$(echo "$INVALID_ID" | tail -n1)
if [ "$HTTP_CODE" = "404" ]; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED (返回 $HTTP_CODE)${NC}"
    ((FAILED++))
fi
echo ""

# 测试总结
echo "================================================"
echo "📊 测试总结 (Test Summary)"
echo "================================================"
TOTAL=$((PASSED + FAILED))
echo "总测试数 (Total): $TOTAL"
echo -e "${GREEN}通过 (Passed): $PASSED${NC}"
echo -e "${RED}失败 (Failed): $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 所有测试通过！${NC}"
    exit 0
else
    echo -e "\n${YELLOW}⚠️  部分测试失败${NC}"
    exit 1
fi
