#!/bin/bash
# setup.sh - Bolg 傻瓜式一键部署脚本
# 用户只需根据引导输入配置，脚本自动完成所有部署工作

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 工具函数
info() { echo -e "${BLUE}[信息]${NC} $1"; }
success() { echo -e "${GREEN}[成功]${NC} $1"; }
warning() { echo -e "${YELLOW}[警告]${NC} $1"; }
error() { echo -e "${RED}[错误]${NC} $1"; exit 1; }
ask() { echo -e "${CYAN}$1${NC}"; }

# 生成随机字符串
generate_secret() {
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || openssl rand -hex 32
}

# 检查命令是否存在
check_command() {
    command -v "$1" &> /dev/null
}

# 分割线
divider() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# 清屏并显示欢迎信息
clear
echo ""
divider
echo -e "${CYAN}  Bolg 博客系统 - 一键部署脚本${NC}"
divider
echo ""
echo "  本脚本将引导您完成以下配置："
echo "  1. 服务器连接信息"
echo "  2. 项目部署配置"
echo "  3. 管理员账号设置"
echo "  4. Nginx 反向代理（可选）"
echo "  5. SSL/HTTPS 配置（可选）"
echo ""
divider
echo ""

# ============================================================
# 第一部分：检查本地环境
# ============================================================
info "检查本地环境..."

if ! check_command node; then
    error "未检测到 Node.js，请先安装 Node.js 18+"
fi

if ! check_command npm; then
    error "未检测到 npm，请先安装 npm"
fi

if ! check_command rsync; then
    error "未检测到 rsync，请先安装 rsync"
fi

if ! check_command ssh; then
    error "未检测到 ssh，请先安装 ssh"
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js 版本过低，需要 18+，当前版本: $(node -v)"
fi

success "本地环境检查通过"
echo ""

# ============================================================
# 第二部分：服务器连接配置
# ============================================================
divider
echo -e "${CYAN}  第一步：服务器连接配置${NC}"
divider
echo ""

read -p "服务器 IP 地址: " REMOTE_HOST
[ -z "$REMOTE_HOST" ] && error "服务器 IP 不能为空"

read -p "SSH 端口 [22]: " REMOTE_PORT
REMOTE_PORT=${REMOTE_PORT:-22}

read -p "SSH 用户名 [root]: " REMOTE_USER
REMOTE_USER=${REMOTE_USER:-root}

ask "选择认证方式："
echo "  1) SSH 密钥认证（推荐）"
echo "  2) 密码认证"
read -p "请选择 [1]: " AUTH_METHOD
AUTH_METHOD=${AUTH_METHOD:-1}

if [ "$AUTH_METHOD" = "2" ]; then
    # 检查 sshpass
    if ! check_command sshpass; then
        warning "未检测到 sshpass，尝试安装..."
        if check_command apt-get; then
            sudo apt-get install -y sshpass
        elif check_command brew; then
            brew install sshpass
        else
            error "请先安装 sshpass: brew install sshpass 或 apt-get install sshpass"
        fi
    fi
    
    read -s -p "SSH 密码: " SSH_PASSWORD
    echo ""
    [ -z "$SSH_PASSWORD" ] && error "密码不能为空"
else
    read -p "SSH 密钥路径 [~/.ssh/id_rsa]: " SSH_KEY
    SSH_KEY=${SSH_KEY:-~/.ssh/id_rsa}
    [ ! -f "$SSH_KEY" ] && error "密钥文件不存在: $SSH_KEY"
fi

info "测试服务器连接..."
if [ "$AUTH_METHOD" = "2" ]; then
    sshpass -p "$SSH_PASSWORD" ssh -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "echo ok" &>/dev/null || error "无法连接到服务器"
else
    ssh -p "$REMOTE_PORT" -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "echo ok" &>/dev/null || error "无法连接到服务器"
fi
success "服务器连接成功"
echo ""

# SSH 命令封装
ssh_cmd() {
    if [ "$AUTH_METHOD" = "2" ]; then
        sshpass -p "$SSH_PASSWORD" ssh -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$@"
    else
        ssh -p "$REMOTE_PORT" -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$@"
    fi
}

rsync_cmd() {
    if [ "$AUTH_METHOD" = "2" ]; then
        sshpass -p "$SSH_PASSWORD" rsync -avz -e "ssh -p $REMOTE_PORT -o StrictHostKeyChecking=no" "$@"
    else
        rsync -avz -e "ssh -p $REMOTE_PORT -i $SSH_KEY -o StrictHostKeyChecking=no" "$@"
    fi
}

# ============================================================
# 第三部分：项目部署配置
# ============================================================
divider
echo -e "${CYAN}  第二步：项目部署配置${NC}"
divider
echo ""

read -p "部署目录 [/opt/bolg]: " DEPLOY_DIR
DEPLOY_DIR=${DEPLOY_DIR:-/opt/bolg}

read -p "公开服务器端口 [9098]: " PUBLIC_PORT
PUBLIC_PORT=${PUBLIC_PORT:-9098}

read -p "管理后台端口 [3033]: " ADMIN_PORT
ADMIN_PORT=${ADMIN_PORT:-3033}

read -p "域名（留空则使用 IP 访问）: " DOMAIN

if [ -n "$DOMAIN" ]; then
    read -p "子路径（如 /blog/，留空则为根路径） [/]: " BASE_PATH
    BASE_PATH=${BASE_PATH:-/}
else
    BASE_PATH="/"
fi

read -p "保留历史版本数量 [3]: " KEEP_RELEASES
KEEP_RELEASES=${KEEP_RELEASES:-3}

SERVICE_NAME="bolg.service"

echo ""

# ============================================================
# 第四部分：管理员配置
# ============================================================
divider
echo -e "${CYAN}  第三步：管理员账号配置${NC}"
divider
echo ""

read -p "管理员用户名 [admin]: " ADMIN_USERNAME
ADMIN_USERNAME=${ADMIN_USERNAME:-admin}

read -s -p "管理员密码: " ADMIN_PASSWORD
echo ""
[ -z "$ADMIN_PASSWORD" ] && error "密码不能为空"

read -s -p "确认密码: " ADMIN_PASSWORD_CONFIRM
echo ""
[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ] && error "两次密码不一致"

JWT_SECRET=$(generate_secret)
success "已生成安全的 JWT密钥"
echo ""

# ============================================================
# 第五部分：Nginx 配置
# ============================================================
divider
echo -e "${CYAN}  第四步：Nginx 配置（可选）${NC}"
divider
echo ""

read -p "是否配置 Nginx 反向代理？[Y/n]: " ENABLE_NGINX
ENABLE_NGINX=${ENABLE_NGINX:-Y}

if [[ ! "$ENABLE_NGINX" =~ ^[Nn]$ ]]; then
    read -p "是否配置 SSL/HTTPS？[Y/n]: " ENABLE_SSL
    ENABLE_SSL=${ENABLE_SSL:-Y}
    
    if [[ ! "$ENABLE_SSL" =~ ^[Nn]$ ]]; then
        read -p "邮箱地址（用于 Let's Encrypt）: " SSL_EMAIL
        [ -z "$SSL_EMAIL" ] && SSL_EMAIL="admin@$DOMAIN"
    fi
else
    ENABLE_SSL="n"
fi

echo ""

# ============================================================
# 第六部分：确认配置
# ============================================================
divider
echo -e "${CYAN}  配置确认${NC}"
divider
echo ""
echo "  服务器: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PORT"
echo "  部署目录: $DEPLOY_DIR"
echo "  公开端口: $PUBLIC_PORT"
echo "  管理端口: $ADMIN_PORT"
echo "  域名: ${DOMAIN:-使用 IP 访问}"
echo "  子路径: $BASE_PATH"
echo "  管理员: $ADMIN_USERNAME"
echo "  Nginx: $([ "$ENABLE_NGINX" = "n" ] && echo "否" || echo "是")"
echo "  SSL: $([ "$ENABLE_SSL" = "n" ] && echo "否" || echo "是")"
echo ""
divider
echo ""

read -p "确认以上配置并开始部署？[Y/n]: " CONFIRM
[ "$CONFIRM" = "n" ] || [ "$CONFIRM" = "N" ] && echo "部署已取消" && exit 0

# ============================================================
# 第七部分：开始部署
# ============================================================
echo ""
info "开始部署..."
echo ""

# 7.1 本地构建
info "步骤 1/8: 构建前端项目..."
VITE_BASE_PATH=$BASE_PATH npm run build
success "前端构建完成"
echo ""

# 7.2 创建远程目录结构
info "步骤 2/8: 创建远程目录结构..."
ssh_cmd "mkdir -p $DEPLOY_DIR/{releases,shared/data,shared/backups}"
success "远程目录创建完成"
echo ""

# 7.3 上传文件
info "步骤 3/8: 上传文件到服务器..."
RELEASE_DIR="$DEPLOY_DIR/releases/$(date +%Y%m%d_%H%M%S)"
rsync_cmd \
    dist/ \
    server/ \
    package.json \
    package-lock.json \
    "$REMOTE_USER@$REMOTE_HOST:$RELEASE_DIR/"
success "文件上传完成"
echo ""

# 7.4 服务器环境配置
info "步骤 4/8: 配置服务器环境..."
ssh_cmd << REMOTE_SCRIPT
set -e

# 安装 Node.js (如果需要)
if ! command -v node &> /dev/null; then
    echo "安装 Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

cd $RELEASE_DIR

# 安装依赖
echo "安装项目依赖..."
npm install --production

# 创建 .env 文件
echo "创建环境配置..."
cat > .env << EOF
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=24h
NODE_ENV=production
PUBLIC_PORT=$PUBLIC_PORT
ADMIN_PORT=$ADMIN_PORT
CORS_ORIGIN=http://localhost:$PUBLIC_PORT
VITE_BASE_PATH=$BASE_PATH
EOF

# 数据目录符号链接
if [ ! -d "$DEPLOY_DIR/shared/data" ] || [ ! "$(ls -A $DEPLOY_DIR/shared/data 2>/dev/null)" ]; then
    echo "初始化数据目录..."
    mkdir -p $DEPLOY_DIR/shared/data/uploads
fi
ln -sfn $DEPLOY_DIR/shared/data server/data

# 当前版本符号链接
ln -sfn $RELEASE_DIR $DEPLOY_DIR/current

# 清理旧版本
cd $DEPLOY_DIR/releases
ls -t | tail -n +$((KEEP_RELEASES + 1)) | xargs rm -rf 2>/dev/null || true

echo "服务器环境配置完成"
REMOTE_SCRIPT
success "服务器环境配置完成"
echo ""

# 7.5 创建 systemd 服务
info "步骤 5/8: 创建 systemd 服务..."
ssh_cmd "cat > /etc/systemd/system/$SERVICE_NAME << EOF
[Unit]
Description=Bolg Blog Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$DEPLOY_DIR/current
ExecStart=/usr/bin/node $DEPLOY_DIR/current/server/index.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=bolg
Environment=NODE_ENV=production
Environment=PUBLIC_PORT=$PUBLIC_PORT
Environment=ADMIN_PORT=$ADMIN_PORT

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME"
success "systemd 服务创建完成"
echo ""

# 7.6 配置 Nginx
if [[ ! "$ENABLE_NGINX" =~ ^[Nn]$ ]]; then
    info "步骤 6/8: 配置 Nginx..."
    ssh_cmd "
    # 安装 Nginx (如果需要)
    if ! command -v nginx &> /dev/null; then
        apt-get update
        apt-get install -y nginx
    fi
    
    # 创建 Nginx 配置
    cat > /etc/nginx/sites-available/bolg << 'NGINX_EOF'
server {
    listen 80;
    server_name $DOMAIN _;
    
    location $BASE_PATH {
        proxy_pass http://127.0.0.1:$PUBLIC_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
    }
    
    location ${BASE_PATH}admin/ {
        proxy_pass http://127.0.0.1:$ADMIN_PORT/admin/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    location /uploads/ {
        alias $DEPLOY_DIR/shared/data/uploads/;
        expires 30d;
        add_header Cache-Control \"public, immutable\";
    }
}
NGINX_EOF
    
    # 启用站点
    ln -sf /etc/nginx/sites-available/bolg /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    nginx -t && systemctl reload nginx
    "
    success "Nginx 配置完成"
    echo ""
    
    # 配置 SSL
    if [[ ! "$ENABLE_SSL" =~ ^[Nn]$ ]] && [ -n "$DOMAIN" ]; then
        info "步骤 7/8: 配置 SSL/HTTPS..."
        ssh_cmd "
        # 安装 Certbot
        apt-get install -y certbot python3-certbot-nginx
        
        # 获取证书
        certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $SSL_EMAIL
        
        # 设置自动续期
        systemctl enable certbot.timer
        systemctl start certbot.timer
        "
        success "SSL 配置完成"
        echo ""
    else
        info "步骤 7/8: 跳过 SSL 配置"
        echo ""
    fi
else
    info "步骤 6/8: 跳过 Nginx 配置"
    info "步骤 7/8: 跳过 SSL 配置"
    echo ""
fi

# 7.7 初始化数据库和管理员
info "步骤 8/8: 初始化数据库和管理员账号..."
ssh_cmd "cd $DEPLOY_DIR/current && node scripts/init-admin.js --username $ADMIN_USERNAME --password $ADMIN_PASSWORD --non-interactive"
success "数据库和管理员初始化完成"
echo ""

# ============================================================
# 第八部分：完成
# ============================================================
divider
echo -e "${GREEN}  部署完成！${NC}"
divider
echo ""

# 输出访问地址
if [ -n "$DOMAIN" ]; then
    if [[ ! "$ENABLE_SSL" =~ ^[Nn]$ ]]; then
        echo "  访问地址: https://$DOMAIN$BASE_PATH"
        echo "  管理后台: https://$DOMAIN${BASE_PATH}admin/"
    else
        echo "  访问地址: http://$DOMAIN$BASE_PATH"
        echo "  管理后台: http://$DOMAIN${BASE_PATH}admin/"
    fi
else
    echo "  访问地址: http://$REMOTE_HOST:$PUBLIC_PORT$BASE_PATH"
    echo "  管理后台: http://$REMOTE_HOST:$ADMIN_PORT/admin/"
fi

echo ""
echo "  管理员账号: $ADMIN_USERNAME"
echo ""

divider
echo ""
echo "  常用命令："
echo "  ─────────────────────────────────────────"
echo "  查看服务状态:  ssh $REMOTE_USER@$REMOTE_HOST 'systemctl status $SERVICE_NAME'"
echo "  查看日志:      ssh $REMOTE_USER@$REMOTE_HOST 'tail -f $DEPLOY_DIR/current/server/logs/combined.log'"
echo "  重启服务:      ssh $REMOTE_USER@$REMOTE_HOST 'systemctl restart $SERVICE_NAME'"
echo "  重新部署:      ./deploy.sh"
echo ""
divider
echo ""

# 保存部署配置
cat > deploy.config << EOF
REMOTE_HOST="$REMOTE_HOST"
REMOTE_USER="$REMOTE_USER"
REMOTE_PORT="$REMOTE_PORT"
REMOTE_DIR="$DEPLOY_DIR"
PUBLIC_PORT="$PUBLIC_PORT"
ADMIN_PORT="$ADMIN_PORT"
VITE_BASE_PATH="$BASE_PATH"
KEEP_RELEASES="$KEEP_RELEASES"
SERVICE_NAME="$SERVICE_NAME"
EOF

info "部署配置已保存到 deploy.config"
success "祝您使用愉快！"
