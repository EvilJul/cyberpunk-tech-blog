#!/bin/bash
# deploy.sh - Bolg 快速重新部署脚本（远程构建版）
# 使用 setup.sh 生成的 deploy.config 进行快速部署

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}[信息]${NC} $1"; }
success() { echo -e "${GREEN}[成功]${NC} $1"; }
warning() { echo -e "${YELLOW}[警告]${NC} $1"; }
error() { echo -e "${RED}[错误]${NC} $1"; exit 1; }

# 检查配置文件
if [ ! -f "deploy.config" ]; then
    error "未找到 deploy.config，请先运行 ./setup.sh 进行初始部署"
fi

# 加载配置
source deploy.config

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Bolg 快速重新部署${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  服务器: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PORT"
echo "  部署目录: $REMOTE_DIR"
echo ""

read -p "确认开始部署？[Y/n]: " CONFIRM
[ "$CONFIRM" = "n" ] || [ "$CONFIRM" = "N" ] && echo "部署已取消" && exit 0

echo ""
info "开始部署..."
echo ""

# SSH 命令封装
ssh_cmd() {
    ssh -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$@"
}

rsync_cmd() {
    rsync -avz -e "ssh -p $REMOTE_PORT -o StrictHostKeyChecking=no" "$@"
}

# 1. 上传源代码
info "步骤 1/4: 上传源代码..."
RELEASE_DIR="$REMOTE_DIR/releases/$(date +%Y%m%d_%H%M%S)"

rsync_cmd \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='dist' \
    --exclude='server/data' \
    ./ \
    "$REMOTE_USER@$REMOTE_HOST:$RELEASE_DIR/"
success "源代码上传完成"
echo ""

# 2. 远程构建
info "步骤 2/4: 在服务器上构建..."
ssh_cmd << REMOTE_SCRIPT
set -e
cd $RELEASE_DIR

# 安装依赖
npm install

# 构建前端（使用之前配置的 VITE_BASE_PATH）
source .env 2>/dev/null || true
VITE_BASE_PATH=\${VITE_BASE_PATH:-/} npm run build

# 安装生产依赖
npm install --production
REMOTE_SCRIPT
success "构建完成"
echo ""

# 3. 更新符号链接
info "步骤 3/4: 更新符号链接..."
ssh_cmd "
ln -sfn $REMOTE_DIR/shared/data $RELEASE_DIR/server/data
ln -sfn $RELEASE_DIR $REMOTE_DIR/current

# 清理旧版本
cd $REMOTE_DIR/releases
ls -t | tail -n +$((KEEP_RELEASES + 1)) | xargs rm -rf 2>/dev/null || true
"
success "符号链接更新完成"
echo ""

# 4. 重启服务
info "步骤 4/4: 重启服务..."
ssh_cmd "systemctl restart $SERVICE_NAME"
success "服务重启完成"
echo ""

# 完成
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
