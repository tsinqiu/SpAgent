export const workspaceNavigation = Object.freeze([
  {
    label: '训练',
    items: [
      { label: '今日', to: '/today', icon: 'today' },
      { label: '训练计划', to: '/training-plans', icon: 'plans' },
      { label: '训练周报', to: '/explore/weekly-report', icon: 'report' },
    ],
  },
  {
    label: '数据',
    items: [
      { label: '我的运动', to: '/activities', icon: 'activities' },
      { label: '记录运动', to: '/record', icon: 'record' },
      { label: '状态分析', to: '/status', icon: 'status' },
    ],
  },
  {
    label: '发现',
    items: [
      { label: '跑步赛事', to: '/explore/events', icon: 'events' },
      { label: '课程与路线', to: '/explore', icon: 'explore' },
      { label: '运动圈', to: '/community', icon: 'community' },
    ],
  },
  {
    label: '账号',
    items: [
      { label: '个人中心', to: '/me', icon: 'profile' },
    ],
  },
])
