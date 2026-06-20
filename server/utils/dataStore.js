import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 数据存储类 - 提供安全的文件读写操作
 * 特性：
 * - 原子性写入（临时文件 + 重命名）
 * - 自动备份
 * - 备份清理策略
 * - 异步 I/O
 */
export class DataStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath
    this.backupDir = options.backupDir || path.join(path.dirname(filePath), 'backups')
    this.maxBackups = options.maxBackups || 10
    this.defaultData = options.defaultData || {}
  }

  /**
   * 读取数据
   */
  async read() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回默认数据
        return this.defaultData
      }
      throw new Error(`读取文件失败 ${this.filePath}: ${error.message}`)
    }
  }

  /**
   * 写入数据（带备份和原子性保证）
   */
  async write(data) {
    try {
      // 1. 如果文件存在，先备份
      if (fsSync.existsSync(this.filePath)) {
        await this.backup()
      }

      // 2. 确保目录存在
      await fs.mkdir(path.dirname(this.filePath), { recursive: true })

      // 3. 写入临时文件
      const tempFile = `${this.filePath}.tmp`
      await fs.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8')

      // 4. 原子性重命名（覆盖原文件）
      await fs.rename(tempFile, this.filePath)

      return true
    } catch (error) {
      throw new Error(`写入文件失败 ${this.filePath}: ${error.message}`)
    }
  }

  /**
   * 备份当前文件
   */
  async backup() {
    try {
      // 确保备份目录存在
      await fs.mkdir(this.backupDir, { recursive: true })

      // 生成备份文件名
      const timestamp = Date.now()
      const basename = path.basename(this.filePath)
      const backupFile = path.join(this.backupDir, `${basename}.${timestamp}`)

      // 复制文件
      await fs.copyFile(this.filePath, backupFile)

      // 清理旧备份
      await this.cleanOldBackups()

      return backupFile
    } catch (error) {
      // 备份失败不应影响主流程
      console.error(`备份失败 ${this.filePath}:`, error.message)
    }
  }

  /**
   * 清理旧备份文件，只保留最近的 N 个
   */
  async cleanOldBackups() {
    try {
      const basename = path.basename(this.filePath)
      const files = await fs.readdir(this.backupDir)

      // 筛选出当前文件的备份
      const backups = files
        .filter(f => f.startsWith(basename + '.'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          timestamp: parseInt(f.split('.').pop())
        }))
        .sort((a, b) => b.timestamp - a.timestamp) // 按时间倒序

      // 删除多余的备份
      if (backups.length > this.maxBackups) {
        const toDelete = backups.slice(this.maxBackups)
        await Promise.all(toDelete.map(backup =>
          fs.unlink(backup.path).catch(err =>
            console.error(`删除备份失败 ${backup.path}:`, err.message)
          )
        ))
      }
    } catch (error) {
      console.error('清理备份失败:', error.message)
    }
  }

  /**
   * 列出所有备份
   */
  async listBackups() {
    try {
      const basename = path.basename(this.filePath)
      const files = await fs.readdir(this.backupDir)

      return files
        .filter(f => f.startsWith(basename + '.'))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          timestamp: parseInt(f.split('.').pop()),
          date: new Date(parseInt(f.split('.').pop()))
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
    } catch (error) {
      return []
    }
  }

  /**
   * 从备份恢复
   */
  async restoreFromBackup(backupFile) {
    try {
      await fs.copyFile(backupFile, this.filePath)
      return true
    } catch (error) {
      throw new Error(`恢复备份失败: ${error.message}`)
    }
  }
}
