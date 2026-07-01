import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Network } from '@/network'
import { FileUp, Plus, List, Trash2, RefreshCw, Image as ImageIcon, Settings } from 'lucide-react-taro'
import JSZip from 'jszip'

interface ImportTask {
  taskId: string
  status: 'processing' | 'completed' | 'failed'
  progress: number
  total: number
  successCount: number
  failedCount: number
  seriesName: string
  items: string[]
  processedItems: number
}

interface ShoeItem {
  id: number
  name: string
  productCode?: string
  sizeRange?: string
  seriesName?: string
  imageUrl?: string
  imageKey?: string
  created_at: string
}

interface AiSettings {
  apiKeyMasked: string
  apiKeyConfigured: boolean
  source: 'runtime' | 'env' | 'none'
  sourceLabel: string
  hasRuntimeOverride: boolean
  hasRuntimeKeyOverride: boolean
  hasRuntimeLlmOverride: boolean
  hasRuntimeEmbeddingOverride: boolean
  modelBaseUrl: string
  llmModel: string
  llmModelSource: 'runtime' | 'env' | 'default'
  llmModelSourceLabel: string
  embeddingModel: string
  embeddingModelSource: 'runtime' | 'env' | 'default'
  embeddingModelSourceLabel: string
  embeddingDimensions: number
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('zip-import')
  const [loading, setLoading] = useState(false)
  const [shoes, setShoes] = useState<ShoeItem[]>([])
  const [zipImporting, setZipImporting] = useState(false)
  const [importTasks, setImportTasks] = useState<ImportTask[]>([])
  const [manualForm, setManualForm] = useState({
    imageUrl: '',
    productCode: '',
    sizeRange: '',
    seriesName: '',
    name: ''
  })
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null)
  const [aiApiKeyInput, setAiApiKeyInput] = useState('')
  const [aiLlmModelInput, setAiLlmModelInput] = useState('')
  const [aiEmbeddingModelInput, setAiEmbeddingModelInput] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)

  useEffect(() => {
    loadShoes()
    loadAiSettings()
  }, [])

  const loadAiSettings = async () => {
    try {
      const res = await Network.request<{ code: number; data: AiSettings }>({
        url: '/api/settings/ai',
        method: 'GET',
      })
      if (res.data?.code === 200 && res.data.data) {
        setAiSettings(res.data.data)
        setAiLlmModelInput(res.data.data.llmModel)
        setAiEmbeddingModelInput(res.data.data.embeddingModel)
      }
    } catch (err) {
      console.error('加载 AI 配置失败:', err)
    }
  }

  const handleSaveAiSettings = async () => {
    const trimmedKey = aiApiKeyInput.trim()
    const trimmedLlm = aiLlmModelInput.trim()
    const trimmedEmbedding = aiEmbeddingModelInput.trim()

    if (trimmedKey && !trimmedKey.startsWith('ark-')) {
      Taro.showToast({ title: 'Key 通常以 ark- 开头', icon: 'none' })
      return
    }
    if (!trimmedLlm) {
      Taro.showToast({ title: '请填写 LLM 模型或接入点', icon: 'none' })
      return
    }
    if (!trimmedEmbedding) {
      Taro.showToast({ title: '请填写 Embedding 接入点 ep-xxx', icon: 'none' })
      return
    }

    setAiSaving(true)
    try {
      const payload: Record<string, string> = {
        llmModel: trimmedLlm,
        embeddingModel: trimmedEmbedding,
      }
      if (trimmedKey) {
        payload.apiKey = trimmedKey
      }

      const res = await Network.request<{ code: number; msg: string; data: AiSettings }>({
        url: '/api/settings/ai',
        method: 'PUT',
        data: payload,
      })
      if (res.data?.code === 200) {
        setAiSettings(res.data.data)
        setAiApiKeyInput('')
        setAiLlmModelInput(res.data.data.llmModel)
        setAiEmbeddingModelInput(res.data.data.embeddingModel)
        Taro.showToast({ title: '已保存并生效', icon: 'success' })
      } else {
        Taro.showToast({ title: res.data?.msg || '保存失败', icon: 'none' })
      }
    } catch (err) {
      console.error('保存 AI 配置失败:', err)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setAiSaving(false)
    }
  }

  const handleClearAiSettings = async () => {
    const { confirm } = await Taro.showModal({
      title: '清除页面配置',
      content: '清除后将回退到 server/.env 中的 AI 相关配置',
    })
    if (!confirm) return

    setAiSaving(true)
    try {
      const res = await Network.request<{ code: number; data: AiSettings }>({
        url: '/api/settings/ai',
        method: 'PUT',
        data: { clearRuntime: true },
      })
      if (res.data?.code === 200 && res.data.data) {
        setAiSettings(res.data.data)
        setAiApiKeyInput('')
        setAiLlmModelInput(res.data.data.llmModel)
        setAiEmbeddingModelInput(res.data.data.embeddingModel)
        Taro.showToast({ title: '已清除', icon: 'success' })
      }
    } catch (err) {
      console.error('清除 AI 配置失败:', err)
      Taro.showToast({ title: '清除失败', icon: 'none' })
    } finally {
      setAiSaving(false)
    }
  }

  const handleTestAiKey = async () => {
    setAiTesting(true)
    try {
      const res = await Network.request<{ code: number; msg: string }>({
        url: '/api/settings/ai/test',
        method: 'POST',
      })
      if (res.data?.code === 200) {
        Taro.showToast({ title: '连接成功', icon: 'success' })
      } else {
        Taro.showModal({ title: '连接失败', content: res.data?.msg || '未知错误', showCancel: false })
      }
    } catch (err) {
      console.error('测试 AI 连接失败:', err)
      Taro.showToast({ title: '测试失败', icon: 'none' })
    } finally {
      setAiTesting(false)
    }
  }

  const loadShoes = async () => {
    setLoading(true)
    try {
      const res = await Network.request({
        url: '/api/shoes/list',
        method: 'GET'
      })
      console.log('鞋款列表响应:', res.data)
      if (res.data?.code === 200) {
        setShoes(res.data.data?.shoes || [])
      }
    } catch (err) {
      console.error('加载鞋款列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  // ZIP 批量导入（前端解压，避免上传大文件超时）
  const handleZipImport = async () => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
      // 微信小程序端：从聊天记录选择 ZIP 文件
      try {
        const res = await Taro.chooseMessageFile({
          count: 1,
          type: 'file',
          extension: ['zip']
        })
        
        if (!res.tempFiles || res.tempFiles.length === 0) {
          console.log('未选择文件')
          return
        }
        
        const file = res.tempFiles[0]
        console.log('选择ZIP文件:', file.name, file.size)
        
        if (file.size > 50 * 1024 * 1024) {
          Taro.showModal({
            title: '文件过大',
            content: 'ZIP文件不能超过50MB',
            showCancel: false
          })
          return
        }
        
        setZipImporting(true)
        Taro.showLoading({ title: '读取ZIP文件...' })
        
        // 读取 ZIP 文件内容为 ArrayBuffer（微信小程序需要 Promise 包装）
        const fileData = await new Promise<ArrayBuffer>((resolve, reject) => {
          Taro.getFileSystemManager().readFile({
            filePath: file.path,
            success: (result) => resolve(result.data as ArrayBuffer),
            fail: (err) => reject(err)
          })
        })
        
        Taro.hideLoading()
        Taro.showLoading({ title: '解压ZIP文件...' })
        
        // 使用 JSZip 解压
        const jszip = new JSZip()
        const zipContent = await jszip.loadAsync(fileData)
        
        Taro.hideLoading()
        
        // 分析目录结构，提取货号信息
        // 支持两种结构：
        // 1. 系列名/码段/货号/图片.jpg
        // 2. 系列名/码段/图片.jpg（图片文件名作为货号）
        const productCodes: string[] = []
        const seriesNames: string[] = []
        const sizeRanges: string[] = []
        const imagePaths: Record<string, string> = {} // 货号 -> 图片路径
        
        // 遍历 ZIP 中的文件
        for (const relativePath in zipContent.files) {
          const pathParts = relativePath.split('/').filter(p => p)
          const fileName = pathParts[pathParts.length - 1]
          
          // 只处理图片文件
          if (!fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) continue
          
          if (pathParts.length >= 4) {
            // 结构：系列名/码段/货号/图片.jpg
            const seriesName = pathParts[0]
            const sizeRange = pathParts[1]
            const productCode = pathParts[2]
            
            if (!seriesNames.includes(seriesName)) seriesNames.push(seriesName)
            if (!sizeRanges.includes(sizeRange)) sizeRanges.push(sizeRange)
            if (!productCodes.includes(productCode)) {
              productCodes.push(productCode)
              imagePaths[productCode] = relativePath
            }
          } else if (pathParts.length === 3) {
            // 结构：系列名/码段/图片.jpg（图片文件名作为货号）
            const seriesName = pathParts[0]
            const sizeRange = pathParts[1]
            // 从文件名提取货号（去掉扩展名）
            const productCode = fileName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '')
            
            if (!seriesNames.includes(seriesName)) seriesNames.push(seriesName)
            if (!sizeRanges.includes(sizeRange)) sizeRanges.push(sizeRange)
            if (!productCodes.includes(productCode)) {
              productCodes.push(productCode)
              imagePaths[productCode] = relativePath
            }
          }
        }
        
        console.log('ZIP目录结构:', { seriesNames, sizeRanges, productCodes, imagePaths })
        
        if (productCodes.length === 0) {
          Taro.hideLoading()
          Taro.showModal({
            title: '目录结构错误',
            content: 'ZIP文件目录结构应为：系列名/码段/货号/图片.jpg 或 系列名/码段/图片.jpg',
            showCancel: false
          })
          setZipImporting(false)
          return
        }
        
        const seriesName = seriesNames[0] || '未知系列'
        const sizeRange = sizeRanges[0] || '未知码段'
        
        // 创建导入任务
        const taskId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        const newTask: ImportTask = {
          taskId,
          status: 'processing',
          progress: 0,
          total: productCodes.length,
          successCount: 0,
          failedCount: 0,
          seriesName,
          items: productCodes,
          processedItems: 0
        }
        setImportTasks(prev => [...prev, newTask])
        
        Taro.hideLoading()
        
        // 处理每个货号
        for (let i = 0; i < productCodes.length; i++) {
          const productCode = productCodes[i]
          const currentProgress = i + 1
          
          // 更新进度
          setImportTasks(prev => prev.map(t => 
            t.taskId === taskId ? { ...t, progress: currentProgress, processedItems: currentProgress } : t
          ))
          
          Taro.showLoading({ title: `处理 ${productCode} (${currentProgress}/${productCodes.length})` })
          
          try {
            // 使用已保存的图片路径
            const imagePath = imagePaths[productCode]
            
            if (!imagePath) {
              console.log(`${productCode}: 未找到图片`)
              setImportTasks(prev => prev.map(t => 
                t.taskId === taskId ? { ...t, failedCount: t.failedCount + 1 } : t
              ))
              continue
            }
            
            // 获取图片数据（base64格式）
            const imageFile = zipContent.files[imagePath]
            // JSZip 支持 base64 但类型定义不完整，使用类型断言
            const imageBase64 = await (imageFile.async as (type: string) => Promise<string>)('base64')
            
            // 上传图片
            const uploadRes = await Network.request({
              url: '/api/shoes/upload-base64',
              method: 'POST',
              data: {
                base64Data: imageBase64,
                fileName: `${productCode}.jpg`
              }
            })
            
            const uploadData = uploadRes.data?.data
            if (!uploadData?.imageKey) {
              console.log(`${productCode}: 上传失败`)
              setImportTasks(prev => prev.map(t => 
                t.taskId === taskId ? { ...t, failedCount: t.failedCount + 1 } : t
              ))
              continue
            }
            
            // 入库
            const addRes = await Network.request({
              url: '/api/shoes/add',
              method: 'POST',
              data: {
                imageKey: uploadData.imageKey,
                seriesName,
                sizeRange,
                productCode,
                name: `${seriesName} - ${productCode}`
              }
            })
            
            if (addRes.data?.code === 200) {
              console.log(`${productCode}: 入库成功`)
              setImportTasks(prev => prev.map(t => 
                t.taskId === taskId ? { ...t, successCount: t.successCount + 1 } : t
              ))
            } else {
              console.log(`${productCode}: 入库失败`, addRes.data?.msg)
              setImportTasks(prev => prev.map(t => 
                t.taskId === taskId ? { ...t, failedCount: t.failedCount + 1 } : t
              ))
            }
            
          } catch (err) {
            console.log(`${productCode}: 处理失败`, err)
            setImportTasks(prev => prev.map(t => 
              t.taskId === taskId ? { ...t, failedCount: t.failedCount + 1 } : t
            ))
          }
        }
        
        Taro.hideLoading()
        
        // 更新任务状态为完成
        setImportTasks(prev => prev.map(t => 
          t.taskId === taskId ? { ...t, status: 'completed' } : t
        ))
        
        // 显示结果
        const finalTask = importTasks.find(t => t.taskId === taskId)
        Taro.showToast({ title: `导入完成，成功${finalTask?.successCount || 0}条`, icon: 'success' })
        
        // 刷新列表
        loadShoes()
        setZipImporting(false)
        
      } catch (err) {
        console.log('ZIP导入失败:', err)
        Taro.hideLoading()
        Taro.showModal({
          title: 'ZIP导入失败',
          content: String(err),
          showCancel: false
        })
        setZipImporting(false)
      }
    } else {
      // 其他环境暂不支持
      Taro.showModal({
        title: '提示',
        content: 'ZIP导入功能仅支持微信小程序端',
        showCancel: false
      })
    }
  }

  // 手动入库
  const handleManualAdd = async () => {
    if (!manualForm.imageUrl) {
      Taro.showToast({ title: '请输入图片URL', icon: 'none' })
      return
    }
    
    if (!manualForm.productCode) {
      Taro.showToast({ title: '请输入货号', icon: 'none' })
      return
    }
    
    setLoading(true)
    try {
      const res = await Network.request({
        url: '/api/shoes/add-async',
        method: 'POST',
        data: {
          imageUrl: manualForm.imageUrl,
          productCode: manualForm.productCode,
          sizeRange: manualForm.sizeRange,
          seriesName: manualForm.seriesName,
          name: manualForm.name || `${manualForm.seriesName} - ${manualForm.productCode}`
        }
      })
      
      if (res.data?.code === 200) {
        Taro.showToast({ title: '入库任务已创建', icon: 'success' })
        setManualForm({
          imageUrl: '',
          productCode: '',
          sizeRange: '',
          seriesName: '',
          name: ''
        })
        loadShoes()
      } else {
        Taro.showToast({ title: res.data?.msg || '入库失败', icon: 'none' })
      }
    } catch (err) {
      console.error('手动入库失败:', err)
      Taro.showToast({ title: '入库失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await Network.request({
        url: `/api/shoes/${id}`,
        method: 'DELETE'
      })
      if (res.data?.code === 200) {
        Taro.showToast({ title: '删除成功', icon: 'success' })
        loadShoes()
      } else {
        Taro.showToast({ title: res.data?.msg || '删除失败', icon: 'none' })
      }
    } catch (err) {
      console.error('删除失败:', err)
      Taro.showToast({ title: '删除失败', icon: 'none' })
    }
  }

  return (
    <View className="min-h-screen bg-gray-50 p-4">
      <View className="mb-4">
        <Text className="block text-2xl font-bold text-gray-800">鞋款管理后台</Text>
        <Text className="block text-sm text-gray-500 mt-1">批量导入、手动入库、列表管理、AI 计费配置</Text>
      </View>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 w-full mb-4">
          <TabsTrigger value="zip-import">
            <FileUp size={16} color="#1890ff" className="mr-1" />
            <Text>ZIP导入</Text>
          </TabsTrigger>
          <TabsTrigger value="manual-add">
            <Plus size={16} color="#1890ff" className="mr-1" />
            <Text>手动入库</Text>
          </TabsTrigger>
          <TabsTrigger value="list">
            <List size={16} color="#1890ff" className="mr-1" />
            <Text>鞋款列表</Text>
          </TabsTrigger>
          <TabsTrigger value="ai-settings">
            <Settings size={16} color="#1890ff" className="mr-1" />
            <Text>AI配置</Text>
          </TabsTrigger>
        </TabsList>
        
        {/* ZIP 批量导入 */}
        <TabsContent value="zip-import" className="space-y-4">
          <Card>
            <CardHeader>
              <Text className="block text-lg font-semibold">ZIP 批量导入</Text>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-blue-50 border-blue-200">
                <Text className="block text-sm text-blue-700">
                  ZIP 文件目录结构要求：{'\n'}
                  系列名/码段/货号/图片.jpg{'\n'}
                  每个货号取第一张图片入库
                </Text>
              </Alert>
              
              <Button 
                onClick={handleZipImport}
                disabled={zipImporting}
                className="w-full"
              >
                <FileUp size={18} color="#fff" className="mr-2" />
                <Text className="text-white">{zipImporting ? '正在处理...' : '选择ZIP文件导入'}</Text>
              </Button>
              
              {/* 导入任务列表 */}
              {importTasks.length > 0 && (
                <View className="space-y-2 mt-4">
                  <Text className="block text-sm font-semibold text-gray-700">导入任务</Text>
                  {importTasks.map(task => (
                    <Card key={task.taskId} className="p-3">
                      <View className="flex justify-between items-center">
                        <Text className="block text-sm">{task.seriesName}</Text>
                        <Badge variant={task.status === 'completed' ? 'default' : 'secondary'}>
                          {task.status === 'completed' ? '已完成' : '处理中'}
                        </Badge>
                      </View>
                      <View className="mt-2">
                        <Progress value={(task.progress / task.total) * 100} />
                        <Text className="block text-xs text-gray-500 mt-1">
                          {task.progress}/{task.total} - 成功: {task.successCount}, 失败: {task.failedCount}
                        </Text>
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* 手动入库 */}
        <TabsContent value="manual-add" className="space-y-4">
          <Card>
            <CardHeader>
              <Text className="block text-lg font-semibold">手动入库</Text>
            </CardHeader>
            <CardContent className="space-y-4">
              <View>
                <Text className="block text-sm text-gray-600 mb-1">图片 URL（必填）</Text>
                <Input
                  value={manualForm.imageUrl}
                  onInput={(e) => setManualForm(prev => ({ ...prev, imageUrl: e.detail.value }))}
                  placeholder="输入已上传的图片URL"
                />
              </View>
              
              <View>
                <Text className="block text-sm text-gray-600 mb-1">货号（必填）</Text>
                <Input
                  value={manualForm.productCode}
                  onInput={(e) => setManualForm(prev => ({ ...prev, productCode: e.detail.value }))}
                  placeholder="如: 933C-6"
                />
              </View>
              
              <View>
                <Text className="block text-sm text-gray-600 mb-1">码段（可选）</Text>
                <Input
                  value={manualForm.sizeRange}
                  onInput={(e) => setManualForm(prev => ({ ...prev, sizeRange: e.detail.value }))}
                  placeholder="如: 40-45"
                />
              </View>
              
              <View>
                <Text className="block text-sm text-gray-600 mb-1">系列名（可选）</Text>
                <Input
                  value={manualForm.seriesName}
                  onInput={(e) => setManualForm(prev => ({ ...prev, seriesName: e.detail.value }))}
                  placeholder="如: 双层系列"
                />
              </View>
              
              <View>
                <Text className="block text-sm text-gray-600 mb-1">名称（可选）</Text>
                <Input
                  value={manualForm.name}
                  onInput={(e) => setManualForm(prev => ({ ...prev, name: e.detail.value }))}
                  placeholder="自动生成或手动输入"
                />
              </View>
              
              <Button onClick={handleManualAdd} disabled={loading} className="w-full">
                <Plus size={18} color="#fff" className="mr-2" />
                <Text className="text-white">{loading ? '正在入库...' : '确认入库'}</Text>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* 鞋款列表 */}
        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardHeader className="flex justify-between items-center">
              <Text className="block text-lg font-semibold">鞋款列表 ({shoes.length})</Text>
              <Button variant="outline" size="sm" onClick={loadShoes}>
                <RefreshCw size={16} color="#1890ff" />
              </Button>
            </CardHeader>
            <CardContent>
              {shoes.length === 0 ? (
                <View className="text-center py-8">
                  <Text className="block text-gray-500">暂无数据</Text>
                </View>
              ) : (
                <View className="space-y-2">
                  {shoes.map(shoe => (
                    <View key={shoe.id} className="flex items-center justify-between p-2 bg-white rounded-lg border">
                      <View className="flex items-center gap-2">
                        {shoe.imageUrl ? (
                          <ImageIcon size={40} color="#ccc" />
                        ) : (
                          <View className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                            <ImageIcon size={20} color="#999" />
                          </View>
                        )}
                        <View>
                          <Text className="block text-sm font-medium">{shoe.name}</Text>
                          {shoe.productCode && (
                            <Badge variant="outline" className="mt-1">{shoe.productCode}</Badge>
                          )}
                          {shoe.seriesName && (
                            <Badge variant="secondary" className="mt-1 ml-1">{shoe.seriesName}</Badge>
                          )}
                        </View>
                      </View>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(shoe.id)}>
                        <Trash2 size={16} color="#fff" />
                      </Button>
                    </View>
                  ))}
                </View>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 火山方舟 AI 计费配置 */}
        <TabsContent value="ai-settings" className="space-y-4">
          <Card>
            <CardHeader>
              <Text className="block text-lg font-semibold">火山方舟 AI 配置</Text>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-amber-50 border-amber-200">
                <Text className="block text-sm text-amber-800">
                  换火山账号时在此填写 Key、LLM 与 Embedding 接入点，保存后立即生效。{'\n'}
                  页面配置优先于 server/.env。
                </Text>
              </Alert>

              {aiSettings && (
                <View className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <Text className="block text-sm text-gray-600">
                    API Key：{aiSettings.apiKeyMasked || '未配置'}（{aiSettings.sourceLabel}）
                  </Text>
                  <Text className="block text-xs text-gray-500">
                    LLM：{aiSettings.llmModel}（{aiSettings.llmModelSourceLabel}）
                  </Text>
                  <Text className="block text-xs text-gray-500">
                    Embedding：{aiSettings.embeddingModel}（{aiSettings.embeddingModelSourceLabel}）
                  </Text>
                </View>
              )}

              <View>
                <Text className="block text-sm text-gray-600 mb-1">API Key（留空则不修改）</Text>
                <Input
                  value={aiApiKeyInput}
                  onInput={(e) => setAiApiKeyInput(e.detail.value)}
                  placeholder="ark-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  password
                />
              </View>

              <View>
                <Text className="block text-sm text-gray-600 mb-1">LLM 模型 / 接入点</Text>
                <Input
                  value={aiLlmModelInput}
                  onInput={(e) => setAiLlmModelInput(e.detail.value)}
                  placeholder="doubao-seed-2-0-pro-260215 或 ep-m-xxx"
                />
              </View>

              <View>
                <Text className="block text-sm text-gray-600 mb-1">Embedding 接入点</Text>
                <Input
                  value={aiEmbeddingModelInput}
                  onInput={(e) => setAiEmbeddingModelInput(e.detail.value)}
                  placeholder="ep-xxxxxxxx-xxxxx"
                />
              </View>

              <Button onClick={handleSaveAiSettings} disabled={aiSaving} className="w-full">
                <Text className="text-white">{aiSaving ? '保存中...' : '保存并立即生效'}</Text>
              </Button>

              <View className="flex flex-row gap-2">
                <View className="flex-1">
                  <Button
                    variant="outline"
                    onClick={handleTestAiKey}
                    disabled={aiTesting || !aiSettings?.apiKeyConfigured}
                    className="w-full"
                  >
                    <Text>{aiTesting ? '测试中...' : '测试连接'}</Text>
                  </Button>
                </View>
                {aiSettings?.hasRuntimeOverride && (
                  <View className="flex-1">
                    <Button
                      variant="outline"
                      onClick={handleClearAiSettings}
                      disabled={aiSaving}
                      className="w-full"
                    >
                      <Text>清除页面配置</Text>
                    </Button>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </View>
  )
}