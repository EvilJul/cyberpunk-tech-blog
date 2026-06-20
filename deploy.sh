#!/bin/bash
# deploy.sh - 博客部署脚本

set -e

source deploy.config

echo "开始部署 TechBlog..."

echo "构建项目..."
VITE_BASE_PATH=$VITE_BASE_PATH npm run build

echo "上传文件..."
rsync -avz --delete \
  dist/ \
  server/ \
  src/data/ \
  package.json \
  package-lock.json \
  $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/releases/$(date +%Y%m%d_%H%M%S)/

echo "配置服务器..."
ssh $REMOTE_USER@$REMOTE_HOST << 'EOF'
cd /opt/blog

NEW_RELEASE=$(ls -t releases | head -1)
cd releases/$NEW_RELEASE

npm install --production

if [ ! -d "../shared/data" ]; then
  mkdir -p ../shared/data
  cp -r src/data/* ../shared/data/
fi

ln -sfn /opt/blog/shared/data server/data
ln -sfn /opt/blog/releases/$NEW_RELEASE ../current

sudo systemctl restart tech-blog.service
EOF

echo "部署完成！"
echo "访问地址: https://$REMOTE_HOST$VITE_BASE_PATH"