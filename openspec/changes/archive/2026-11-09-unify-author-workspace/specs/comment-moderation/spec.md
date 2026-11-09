## ADDED Requirements

### Requirement: 管理员评论审核

系统 SHALL 提供会话+CSRF保护的分页评论管理，筛选pending/approved/rejected并审核或删除；状态白名单校验；拒绝父评论后公开隐藏整棵回复子树，重新批准祖先后已批准后代可恢复；删除提示并级联后代。

#### Scenario: 审核公开
- **WHEN** 站长批准待审评论
- **THEN** 访客刷新后可见且无邮箱；其他pending仍不可见

#### Scenario: 拒绝祖先
- **WHEN** 已批准评论的父评论被拒绝
- **THEN** 整棵子树不出现在公开接口或界面，后台仍可审核

#### Scenario: 未授权审核
- **WHEN** 匿名或非管理员修改状态
- **THEN** 401或403且状态不变化
