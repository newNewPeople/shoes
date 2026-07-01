export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '鞋款管理后台' })
  : { navigationBarTitleText: '鞋款管理后台' }