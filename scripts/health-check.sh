#!/bin/bash
max_attempts=30
attempt=1

echo "开始健康检查..."

while [ $attempt -le $max_attempts ]; do
  response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9098/health)

  if [ "$response" = "200" ]; then
    echo "✓ 健康检查通过 (HTTP $response)"
    exit 0
  fi

  echo "尝试 $attempt/$max_attempts: HTTP $response - 等待服务启动..."
  sleep 2
  attempt=$((attempt + 1))
done

echo "✗ 健康检查失败 - 服务未能在 60 秒内启动"
exit 1
