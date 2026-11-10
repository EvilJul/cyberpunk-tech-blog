import { useEffect, useState } from 'react'

/** 统一移动读者断点，组件卸载时移除监听器。 */
export function useMobileReader() {
  const [mobile, setMobile] = useState(/* 初次渲染采用当前视口，避免先出现桌面布局。 */ () => window.matchMedia('(max-width: 760px)').matches)
  useEffect(/* 订阅断点变化，不依赖用户代理或设备名称。 */ () => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = /* 将真实媒体查询结果同步到组件。 */ () => setMobile(media.matches)
    media.addEventListener('change', update)
    update()
    return /* 卸载时清理媒体查询监听。 */ () => media.removeEventListener('change', update)
  }, [])
  return mobile
}
