export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '鞋面识别系统' })
  : { navigationBarTitleText: '鞋面识别系统' }