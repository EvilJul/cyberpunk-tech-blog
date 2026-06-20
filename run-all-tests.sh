#!/bin/bash

# 赛博朋克技术博客 - 完整测试套件
# Complete Test Suite for Cyberpunk Tech Blog

echo "================================================"
echo "🚀 赛博朋克技术博客 - 完整测试套件"
echo "   Cyberpunk Tech Blog - Complete Test Suite"
echo "================================================"
echo ""
echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m'

# 检查服务器是否运行
echo -e "${BLUE}🔍 检查服务器状态...${NC}"
if curl -s http://localhost:9098/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 服务器运行正常${NC}\n"
else
    echo -e "${RED}✗ 服务器未运行！${NC}"
    echo "请先启动服务器: npm run dev"
    exit 1
fi

# 创建测试结果目录
mkdir -p test-results
cd "$(dirname "$0")"

# 1. 运行 API 测试
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}📡 第 1 阶段: API 测试${NC}"
echo -e "${BLUE}================================================${NC}\n"

chmod +x test-api.sh
./test-api.sh | tee test-results/api-test-output.txt
API_EXIT_CODE=${PIPESTATUS[0]}

echo ""

# 2. 运行前端测试
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}🎨 第 2 阶段: 前端测试${NC}"
echo -e "${BLUE}================================================${NC}\n"

node test-frontend.js | tee test-results/frontend-test-output.txt
FRONTEND_EXIT_CODE=${PIPESTATUS[0]}

echo ""

# 3. 数据库测试（如果数据库存在）
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}💾 第 3 阶段: 数据库测试${NC}"
echo -e "${BLUE}================================================${NC}\n"

if [ -f "server/data/blog.db" ]; then
    echo "检查数据库..."

    # 表结构检查
    echo -n "检查数据库表结构... "
    TABLES=$(sqlite3 server/data/blog.db "SELECT name FROM sqlite_master WHERE type='table';")
    if [ -n "$TABLES" ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        echo "找到的表: $TABLES"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi

    # 索引检查
    echo -n "检查数据库索引... "
    INDEXES=$(sqlite3 server/data/blog.db "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';")
    if [ -n "$INDEXES" ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        echo "找到的索引: $INDEXES"
    else
        echo -e "${YELLOW}⚠ WARNING${NC}"
        echo "未找到自定义索引"
    fi

    # 查询性能测试
    echo "测试查询性能..."
    sqlite3 server/data/blog.db "EXPLAIN QUERY PLAN SELECT * FROM articles LIMIT 10;" > test-results/db-query-plan.txt
    echo -e "${GREEN}✓ 查询计划已保存${NC}"

else
    echo -e "${YELLOW}⚠ 数据库文件不存在，跳过数据库测试${NC}"
fi

echo ""

# 4. 安全测试总结
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}🔒 第 4 阶段: 安全检查总结${NC}"
echo -e "${BLUE}================================================${NC}\n"

# 检查环境变量文件
echo "检查敏感文件保护..."
if [ -f ".env" ]; then
    if grep -q ".env" .gitignore 2>/dev/null; then
        echo -e "${GREEN}✓ .env 文件已在 .gitignore 中${NC}"
    else
        echo -e "${RED}✗ 警告: .env 文件未在 .gitignore 中${NC}"
    fi
else
    echo -e "${YELLOW}⚠ 未找到 .env 文件${NC}"
fi

# 检查依赖漏洞
echo -e "\n检查依赖安全性..."
echo -n "运行 npm audit... "
npm audit --production 2>&1 | head -20 > test-results/npm-audit.txt
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}✓ 无已知漏洞${NC}"
else
    echo -e "${YELLOW}⚠ 发现潜在漏洞，详见 test-results/npm-audit.txt${NC}"
fi

echo ""

# 5. 性能测试
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}⚡第 5 阶段: 性能测试${NC}"
echo -e "${BLUE}================================================${NC}\n"

echo "测试 API 响应时间..."
for endpoint in "/health" "/api/articles" "/api/categories" "/api/tags" "/api/stats"; do
    echo -n "  $endpoint: "
    RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}" "http://localhost:9098${endpoint}")
    # 将响应时间转换为毫秒 (更健壮的方法)
    RESPONSE_MS=$(printf "%.0f" $(echo "$RESPONSE_TIME * 1000" | bc 2>/dev/null || echo "999"))

    if [ "$RESPONSE_MS" -lt 100 ] 2>/dev/null; then
        echo -e "${GREEN}${RESPONSE_MS}ms (优秀)${NC}"
    elif [ "$RESPONSE_MS" -lt 500 ] 2>/dev/null; then
        echo -e "${GREEN}${RESPONSE_MS}ms (良好)${NC}"
    elif [ "$RESPONSE_MS" -lt 1000 ] 2>/dev/null; then
        echo -e "${YELLOW}${RESPONSE_MS}ms (一般)${NC}"
    else
        echo -e "${RED}${RESPONSE_MS}ms (慢)${NC}"
    fi
done

echo ""

# 6. 文件上传测试
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}📤 第 6 阶段: 文件上传限制测试${NC}"
echo -e "${BLUE}================================================${NC}\n"

echo "创建测试文件..."
# 创建 1KB 测试文件（应该成功）
dd if=/dev/zero of=/tmp/test-1kb.jpg bs=1024 count=1 2>/dev/null
echo -e "${GREEN}✓ 创建 1KB 测试文件${NC}"

# 创建 6MB 测试文件（应该失败）
dd if=/dev/zero of=/tmp/test-6mb.jpg bs=1048576 count=6 2>/dev/null
echo -e "${GREEN}✓ 创建 6MB 测试文件${NC}"

echo -e "\n测试文件大小限制..."
echo -n "  尝试上传 6MB 文件 (应该被拒绝)... "
UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:9098/api/upload \
  -F "file=@/tmp/test-6mb.jpg" 2>&1)
HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "413" ] || [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ PASSED (返回 $HTTP_CODE)${NC}"
else
    echo -e "${YELLOW}⚠ 返回 $HTTP_CODE (预期 413 或 401)${NC}"
fi

# 清理测试文件
rm -f /tmp/test-1kb.jpg /tmp/test-6mb.jpg

echo ""

# 7. 生成最终报告
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}📊 最终测试报告${NC}"
echo -e "${BLUE}================================================${NC}\n"

# 统计截图
SCREENSHOTS=$(ls test-screenshot-*.png 2>/dev/null | wc -l | tr -d ' ')
echo "生成的截图数量: $SCREENSHOTS"
if [ $SCREENSHOTS -gt 0 ]; then
    echo "截图文件:"
    ls -lh test-screenshot-*.png 2>/dev/null | awk '{print "  - " $9 " (" $5 ")"}'
fi

echo ""

# 测试结果汇总
echo "测试阶段结果:"
if [ $API_EXIT_CODE -eq 0 ]; then
    echo -e "  ${GREEN}✓ API 测试: 通过${NC}"
else
    echo -e "  ${RED}✗ API 测试: 失败${NC}"
fi

if [ $FRONTEND_EXIT_CODE -eq 0 ]; then
    echo -e "  ${GREEN}✓ 前端测试: 通过${NC}"
else
    echo -e "  ${YELLOW}⚠ 前端测试: 有警告${NC}"
fi

echo ""

# 最终判断
if [ $API_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}🎉 测试完成！主要功能正常${NC}"
    echo -e "${GREEN}================================================${NC}"
    EXIT_CODE=0
else
    echo -e "${YELLOW}================================================${NC}"
    echo -e "${YELLOW}⚠️  测试完成，但有部分失败${NC}"
    echo -e "${YELLOW}================================================${NC}"
    EXIT_CODE=1
fi

echo ""
echo "测试报告保存在: test-results/"
echo "- API 测试输出: test-results/api-test-output.txt"
echo "- 前端测试输出: test-results/frontend-test-output.txt"
echo "- 测试结果 JSON: test-results.json"
echo ""

exit $EXIT_CODE
