@echo off
chcp 65001 >nul
title Bolg 博客系统 - 一键部署脚本

setlocal enabledelayedexpansion

echo.
echo ═══════════════════════════════════════════════════════════════
echo            Bolg 博客系统 - Windows 一键部署脚本
echo ═══════════════════════════════════════════════════════════════
echo.
echo   本脚本将引导您完成以下配置：
echo   1. 服务器连接信息
echo   2. 项目部署配置
echo   3. 管理员账号设置
echo   4. Nginx 反向代理（可选）
echo   5. SSL/HTTPS 配置（可选）
echo.
echo   注意：所有编译构建将在远程服务器上执行
echo.
echo ═══════════════════════════════════════════════════════════════
echo.

REM 检查是否安装了 OpenSSH
where ssh >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 SSH 客户端
    echo 请安装 OpenSSH: 设置 ^> 应用 ^> 可选功能 ^> 添加功能 ^> OpenSSH 客户端
    echo 或访问: https://docs.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse
    pause
    exit /b 1
)

echo [信息] 检测到 SSH 客户端
echo.

REM 第一步：服务器连接配置
echo ═══════════════════════════════════════════════════════════════
echo   第一步：服务器连接配置
echo ═══════════════════════════════════════════════════════════════
echo.

set /p REMOTE_HOST="服务器 IP 地址: "
if "%REMOTE_HOST%"=="" (
    echo [错误] 服务器 IP 不能为空
    pause
    exit /b 1
)

set /p REMOTE_PORT="SSH 端口 [22]: "
if "%REMOTE_PORT%"=="" set REMOTE_PORT=22

set /p REMOTE_USER="SSH 用户名 [root]: "
if "%REMOTE_USER%"=="" set REMOTE_USER=root

echo.
echo 选择认证方式：
echo   1) SSH 密钥认证（推荐）
echo   2) 密码认证
set /p AUTH_METHOD="请选择 [1]: "
if "%AUTH_METHOD%"=="" set AUTH_METHOD=1

if "%AUTH_METHOD%"=="2" (
    set /p SSH_PASSWORD="SSH 密码: "
    if "%SSH_PASSWORD%"=="" (
        echo [错误] 密码不能为空
        pause
        exit /b 1
    )
) else (
    set /p SSH_KEY="SSH 密钥路径 [%USERPROFILE%\.ssh\id_rsa]: "
    if "%SSH_KEY%"=="" set SSH_KEY=%USERPROFILE%\.ssh\id_rsa
    if not exist "%SSH_KEY%" (
        echo [错误] 密钥文件不存在: %SSH_KEY%
        pause
        exit /b 1
    )
)

echo.
echo [信息] 测试服务器连接...

if "%AUTH_METHOD%"=="2" (
    echo [警告] 密码认证需要安装 sshpass 或使用密钥认证
    echo 建议使用 SSH 密钥认证
) else (
    ssh -p %REMOTE_PORT% -i "%SSH_KEY%" -o StrictHostKeyChecking=no %REMOTE_USER%@%REMOTE_HOST% "echo ok" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [错误] 无法连接到服务器
        pause
        exit /b 1
    )
)

echo [成功] 服务器连接成功
echo.

REM 第二步：项目部署配置
echo ═══════════════════════════════════════════════════════════════
echo   第二步：项目部署配置
echo ═══════════════════════════════════════════════════════════════
echo.

set /p DEPLOY_DIR="部署目录 [/opt/bolg]: "
if "%DEPLOY_DIR%"=="" set DEPLOY_DIR=/opt/bolg

set /p PUBLIC_PORT="公开服务器端口 [9098]: "
if "%PUBLIC_PORT%"=="" set PUBLIC_PORT=9098

set /p ADMIN_PORT="管理后台端口 [3033]: "
if "%ADMIN_PORT%"=="" set ADMIN_PORT=3033

set /p DOMAIN="域名（留空则使用 IP 访问）: "

if not "%DOMAIN%"=="" (
    set /p BASE_PATH="子路径（如 /blog/，留空则为根路径） [/]: "
    if "%BASE_PATH%"=="" set BASE_PATH=/
) else (
    set BASE_PATH=/
)

set /p KEEP_RELEASES="保留历史版本数量 [3]: "
if "%KEEP_RELEASES%"=="" set KEEP_RELEASES=3

set SERVICE_NAME=bolg.service

echo.

REM 第三步：管理员配置
echo ═══════════════════════════════════════════════════════════════
echo   第三步：管理员账号配置
echo ═══════════════════════════════════════════════════════════════
echo.

set /p ADMIN_USERNAME="管理员用户名 [admin]: "
if "%ADMIN_USERNAME%"=="" set ADMIN_USERNAME=admin

set /p ADMIN_PASSWORD="管理员密码: "
if "%ADMIN_PASSWORD%"=="" (
    echo [错误] 密码不能为空
    pause
    exit /b 1
)

set /p ADMIN_PASSWORD_CONFIRM="确认密码: "
if not "%ADMIN_PASSWORD%"=="%ADMIN_PASSWORD_CONFIRM%" (
    echo [错误] 两次密码不一致
    pause
    exit /b 1
)

REM 生成 JWT 密钥
for /f "delims=" %%i in ('powershell -Command "[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))"') do set JWT_SECRET=%%i

echo [成功] 已生成安全的 JWT 密钥
echo.

REM 第四步：Nginx 配置
echo ═══════════════════════════════════════════════════════════════
echo   第四步：Nginx 配置（可选）
echo ═══════════════════════════════════════════════════════════════
echo.

set /p ENABLE_NGINX="是否配置 Nginx 反向代理？[Y/n]: "
if "%ENABLE_NGINX%"=="" set ENABLE_NGINX=Y

if /i not "%ENABLE_NGINX%"=="n" (
    set /p ENABLE_SSL="是否配置 SSL/HTTPS？[Y/n]: "
    if "%ENABLE_SSL%"=="" set ENABLE_SSL=Y
    
    if /i not "%ENABLE_SSL%"=="n" (
        set /p SSL_EMAIL="邮箱地址（用于 Let's Encrypt）: "
        if "%SSL_EMAIL%"=="" set SSL_EMAIL=admin@%DOMAIN%
    )
) else (
    set ENABLE_SSL=n
)

echo.

REM 第五步：确认配置
echo ═══════════════════════════════════════════════════════════════
echo   配置确认
echo ═══════════════════════════════════════════════════════════════
echo.
echo   服务器: %REMOTE_USER%@%REMOTE_HOST%:%REMOTE_PORT%
echo   部署目录: %DEPLOY_DIR%
echo   公开端口: %PUBLIC_PORT%
echo   管理端口: %ADMIN_PORT%
echo   域名: %DOMAIN%
echo   子路径: %BASE_PATH%
echo   管理员: %ADMIN_USERNAME%
echo   Nginx: %ENABLE_NGINX%
echo   SSL: %ENABLE_SSL%
echo.
echo ═══════════════════════════════════════════════════════════════
echo.

set /p CONFIRM="确认以上配置并开始部署？[Y/n]: "
if /i "%CONFIRM%"=="n" (
    echo 部署已取消
    pause
    exit /b 0
)

echo.
echo [信息] 开始部署...
echo.

REM 计算 RELEASE_DIR（用于 rsync/scp/ssh 命令）
for /f "delims=" %%i in ('powershell -Command "[DateTime]::Now.ToString('yyyyMMdd_HHmmss')"') do set TIMESTAMP=%%i
set RELEASE_DIR=%DEPLOY_DIR%/releases/%TIMESTAMP%

REM 生成部署脚本
echo [信息] 生成远程部署脚本...

(
echo #!/bin/bash
echo set -e
echo.
echo RELEASE_DIR="%DEPLOY_DIR%/releases/$(date +%%Y%%m%%d_%%H%%M%%S)"
echo.
echo echo "创建目录结构..."
echo mkdir -p %DEPLOY_DIR%/{releases,shared/data/uploads,shared/backups}
echo.
echo echo "安装 Node.js..."
echo if ! command -v node ^&^> /dev/null; then
echo     echo "安装 Node.js 20..."
echo     if command -v apt-get ^&^> /dev/null; then
echo         curl -fsSL https://deb.nodesource.com/setup_20.x ^| bash -
echo         apt-get install -y nodejs
echo     elif command -v dnf ^&^> /dev/null; then
echo         dnf install -y nodejs
echo     elif command -v yum ^&^> /dev/null; then
echo         curl -fsSL https://rpm.nodesource.com/setup_20.x ^| bash -
echo         yum install -y nodejs
echo     else
echo         echo "错误: 不支持的包管理器，请手动安装 Node.js 20+"
echo         exit 1
echo     fi
echo fi
echo.
echo echo "安装依赖..."
echo cd $RELEASE_DIR
echo npm install
echo.
echo echo "构建前端..."
echo VITE_BASE_PATH=%BASE_PATH% npm run build
echo.
echo echo "安装生产依赖..."
echo npm install --production
echo.
echo echo "创建环境配置..."
echo cat > .env ^<^< EOF
echo JWT_SECRET=%JWT_SECRET%
echo JWT_EXPIRES_IN=24h
echo NODE_ENV=production
echo PUBLIC_PORT=%PUBLIC_PORT%
echo ADMIN_PORT=%ADMIN_PORT%
echo CORS_ORIGIN=http://localhost:%PUBLIC_PORT%
echo VITE_BASE_PATH=%BASE_PATH%
echo EOF
echo.
echo echo "创建符号链接..."
echo ln -sfn %DEPLOY_DIR%/shared/data server/data
echo ln -sfn $RELEASE_DIR %DEPLOY_DIR%/current
echo.
echo echo "清理旧版本..."
echo cd %DEPLOY_DIR%/releases
echo ls -t ^| tail -n +$((%KEEP_RELEASES% + 1)) ^| xargs rm -rf 2^>/dev/null ^|^| true
echo.
echo echo "创建 systemd 服务..."
echo cat > /etc/systemd/system/%SERVICE_NAME% ^<^< EOF
echo [Unit]
echo Description=Bolg Blog Service
echo After=network.target
echo.
echo [Service]
echo Type=simple
echo User=root
echo WorkingDirectory=%DEPLOY_DIR%/current
echo ExecStart=/usr/bin/node %DEPLOY_DIR%/current/server/index.js
echo Restart=on-failure
echo RestartSec=10
echo Environment=NODE_ENV=production
echo Environment=PUBLIC_PORT=%PUBLIC_PORT%
echo Environment=ADMIN_PORT=%ADMIN_PORT%
echo.
echo [Install]
echo WantedBy=multi-user.target
echo EOF
echo.
echo systemctl daemon-reload
echo systemctl enable %SERVICE_NAME%
echo systemctl restart %SERVICE_NAME%
echo.
echo if [ "%ENABLE_NGINX%" != "n" ]; then
echo     echo "配置 Nginx..."
echo     if ! command -v nginx ^&^> /dev/null; then
echo         if command -v apt-get ^&^> /dev/null; then
echo             apt-get update
echo             apt-get install -y nginx
echo         elif command -v dnf ^&^> /dev/null; then
echo             dnf install -y nginx
echo         elif command -v yum ^&^> /dev/null; then
echo             yum install -y nginx
echo         else
echo             echo "错误: 不支持的包管理器，请手动安装 Nginx"
echo             exit 1
echo         fi
echo     fi
echo     cat > /etc/nginx/sites-available/bolg ^<^< NGINX_EOF
echo     server {
echo         listen 80;
echo         server_name %DOMAIN% _;
echo         location %BASE_PATH% {
echo             proxy_pass http://127.0.0.1:%PUBLIC_PORT%;
echo             proxy_http_version 1.1;
echo             proxy_set_header Host \$host;
echo             proxy_set_header X-Real-IP \$remote_addr;
echo             proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
echo             proxy_set_header X-Forwarded-Proto \$scheme;
echo         }
echo         location ^~ %BASE_PATH%admin/ {
echo             proxy_pass http://127.0.0.1:%ADMIN_PORT%/admin/;
echo             proxy_http_version 1.1;
echo             proxy_set_header Host \$host;
echo             proxy_set_header X-Real-IP \$remote_addr;
echo             proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
echo             proxy_set_header X-Forwarded-Proto \$scheme;
echo         }
echo         location /uploads/ {
echo             alias %DEPLOY_DIR%/shared/data/uploads/;
echo             expires 30d;
echo         }
echo     }
echo     NGINX_EOF
echo     ln -sf /etc/nginx/sites-available/bolg /etc/nginx/sites-enabled/
echo     rm -f /etc/nginx/sites-enabled/default
echo     nginx -t ^&^& systemctl reload nginx
echo fi
echo.
echo if [ "%ENABLE_SSL%" != "n" ] && [ -n "%DOMAIN%" ]; then
echo     echo "配置 SSL/HTTPS..."
echo     if command -v apt-get ^&^> /dev/null; then
echo         apt-get install -y certbot python3-certbot-nginx
echo     elif command -v dnf ^&^> /dev/null; then
echo         dnf install -y certbot python3-certbot-nginx
echo     elif command -v yum ^&^> /dev/null; then
echo         yum install -y certbot python3-certbot-nginx
echo     fi
echo     certbot --nginx -d %DOMAIN% --non-interactive --agree-tos --email %SSL_EMAIL%
echo     systemctl enable certbot.timer
echo     systemctl start certbot.timer
echo fi
echo.
echo echo "初始化管理员..."
echo cd %DEPLOY_DIR%/current
echo ADMIN_PASSWORD="%ADMIN_PASSWORD%" node scripts/init-admin.js --username %ADMIN_USERNAME% --non-interactive
echo.
echo echo "部署完成！"
) > deploy_remote.sh

echo [信息] 上传源代码和部署脚本...

if "%AUTH_METHOD%"=="2" (
    echo [警告] Windows 下密码认证需要额外工具
    echo 请使用 SSH 密钥认证或手动执行部署
) else (
    rsync -avz --exclude="node_modules" --exclude=".git" --exclude="dist" --exclude="server/data" ./ -e "ssh -p %REMOTE_PORT% -i \"%SSH_KEY%\" -o StrictHostKeyChecking=no" %REMOTE_USER%@%REMOTE_HOST:%RELEASE_DIR%/
    scp -P %REMOTE_PORT% -i "%SSH_KEY%" -o StrictHostKeyChecking=no deploy_remote.sh %REMOTE_USER%@%REMOTE_HOST:%RELEASE_DIR%/
    ssh -p %REMOTE_PORT% -i "%SSH_KEY%" -o StrictHostKeyChecking=no %REMOTE_USER%@%REMOTE_HOST% "chmod +x %RELEASE_DIR%/deploy_remote.sh && bash %RELEASE_DIR%/deploy_remote.sh"
)

del deploy_remote.sh 2>nul

echo.
echo ═══════════════════════════════════════════════════════════════
echo                    部署完成！
echo ═══════════════════════════════════════════════════════════════
echo.

if not "%DOMAIN%"=="" (
    if /i not "%ENABLE_SSL%"=="n" (
        echo   访问地址: https://%DOMAIN%%BASE_PATH%
        echo   管理后台: https://%DOMAIN%%BASE_PATH%admin/
    ) else (
        echo   访问地址: http://%DOMAIN%%BASE_PATH%
        echo   管理后台: http://%DOMAIN%%BASE_PATH%admin/
    )
) else (
    echo   访问地址: http://%REMOTE_HOST%:%PUBLIC_PORT%%BASE_PATH%
    echo   管理后台: http://%REMOTE_HOST%:%ADMIN_PORT%/admin/
)

echo.
echo   管理员账号: %ADMIN_USERNAME%
echo.
echo ═══════════════════════════════════════════════════════════════
echo.

REM 保存部署配置
(
echo REMOTE_HOST="%REMOTE_HOST%"
echo REMOTE_USER="%REMOTE_USER%"
echo REMOTE_PORT="%REMOTE_PORT%"
echo REMOTE_DIR="%DEPLOY_DIR%"
echo PUBLIC_PORT="%PUBLIC_PORT%"
echo ADMIN_PORT="%ADMIN_PORT%"
echo VITE_BASE_PATH="%BASE_PATH%"
echo KEEP_RELEASES="%KEEP_RELEASES%"
echo SERVICE_NAME="%SERVICE_NAME%"
) > deploy.config

echo [信息] 部署配置已保存到 deploy.config
echo [成功] 祝您使用愉快！
echo.
pause
