import React from 'react'

/**
 * 工作台统一页头：页面标题、简短说明与右侧操作区。
 * 每页只放一个主视觉按钮（studio-button--primary），其余用次级/幽灵按钮。
 * 标题渲染为 h1，供各页面作为唯一一级标题使用。
 */
export default function StudioPageHeader({ title, description, actions }) {
  return (
    <header className="studio-page-header">
      <div className="studio-page-header-title">
        <h1>{title}</h1>
        {description && <p className="studio-page-header-description">{description}</p>}
      </div>
      {actions && <div className="studio-page-header-actions">{actions}</div>}
    </header>
  )
}
