#!/bin/bash

# 配置
BACKUP_DIR="server/data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_FILE="server/data/blog.db"
BACKUP_FILE="$BACKUP_DIR/blog_${TIMESTAMP}.db"

# 检查数据库文件是否存在
if [ ! -f "$DB_FILE" ]; then
  echo "✗ 错误: 数据库文件不存在: $DB_FILE"
  exit 1
fi

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 执行备份
echo "开始备份数据库..."
cp "$DB_FILE" "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✓ 备份成功: $BACKUP_FILE"

  # 清理旧备份，保留最近 10 个
  backup_count=$(ls -1 "$BACKUP_DIR"/blog_*.db 2>/dev/null | wc -l)
  if [ $backup_count -gt 10 ]; then
    echo "清理旧备份（保留最近 10 个）..."
    ls -t "$BACKUP_DIR"/blog_*.db | tail -n +11 | xargs rm -f
    echo "✓ 清理完成"
  fi

  # 显示备份列表
  echo ""
  echo "当前备份列表:"
  ls -lh "$BACKUP_DIR"/blog_*.db
else
  echo "✗ 备份失败"
  exit 1
fi
