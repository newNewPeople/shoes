import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { View, Text, Image, ScrollView } from '@tarojs/components'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Camera, Search, Plus, Upload, ImageUp, Settings } from 'lucide-react-taro'

/** 鞋子数据类型 */
interface ShoeItem {
  id: string
  name: string
  imageUrl: string
  description: string
  similarity?: number
  createdAt?: string
  // 新增字段
  productCode?: string
  sizeRange?: string
  seriesName?: string
}

interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

export default function Index() {
  // ---- 通用 ----
  const [activeTab, setActiveTab] = useState('search')

  // ---- 搜索 ----
  const [searchImage, setSearchImage] = useState<string>('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<ShoeItem[]>([])
  const [searched, setSearched] = useState(false)
  const [searchSeriesName, setSearchSeriesName] = useState('')  // 搜索时的系列筛选

  // ---- 入库 ----
  const [addImage, setAddImage] = useState<string>('')
  const [shoeName, setShoeName] = useState('')
  const [productCode, setProductCode] = useState('')
  const [sizeRange, setSizeRange] = useState('')
  const [seriesName, setSeriesName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  // ---- 鞋库列表 ----
  const [shoeList, setShoeList] = useState<ShoeItem[]>([])
  const [loadingList, setLoadingList] = useState(false)

  // 加载鞋库列表
  useEffect(() => {
    fetchShoeList()
  }, [])

  const fetchShoeList = async () => {
    setLoadingList(true)
    try {
      const res = await Network.request<ApiResponse<{ shoes: any[]; total: number }>>({ url: '/api/shoes/list' })
      console.log('鞋库列表:', res.data)
      if (res.data?.code === 200) {
        const listData = res.data.data as unknown as { shoes: ShoeItem[]; total: number }
        setShoeList(listData?.shoes || [])
      }
    } catch (err) {
      console.error('获取鞋库失败', err)
    } finally {
      setLoadingList(false)
    }
  }

  // ---- 选择图片 ----
  const handleChooseImage = async (mode: 'camera' | 'album'): Promise<string | null> => {
    try {
      const sourceType: ('camera' | 'album')[] = [mode]
      const res = await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType,
      })
      console.log('选择图片结果:', res.tempFilePaths[0])
      return res.tempFilePaths[0]
    } catch (err) {
      console.error('选择图片失败', err)
      return null
    }
  }

  // ---- 搜索 ----
  const handleSearch = async (mode: 'camera' | 'album') => {
    const imgPath = await handleChooseImage(mode)
    if (!imgPath) return

    setSearchImage(imgPath)
    setSearching(true)
    setSearchResults([])
    setSearched(false)
    setUploadProgress('正在上传图片...')

    try {
      setUploadProgress('正在上传图片...')
      const uploadRes = await Network.uploadFile({
        url: '/api/shoes/upload-temp',
        filePath: imgPath,
        name: 'file',
      })
      console.log('上传响应:', uploadRes.data)

      const uploadData = typeof uploadRes.data === 'string'
        ? JSON.parse(uploadRes.data)
        : uploadRes.data

      if (uploadData.code !== 200) {
        Taro.showToast({ title: uploadData.msg || '上传失败', icon: 'none' })
        return
      }

      const imageUrl = uploadData.data.imageUrl

      setUploadProgress('正在分析鞋面特征...')
      // 构建搜索请求参数，如果有系列筛选则传递
      const searchParams: { imageUrl: string; topK?: number; seriesName?: string } = { imageUrl }
      if (searchSeriesName.trim()) {
        searchParams.seriesName = searchSeriesName.trim()
      }
      
      const searchRes = await Network.request<ApiResponse<ShoeItem[]>>({
        url: '/api/shoes/search',
        method: 'POST',
        data: searchParams,
      })
      console.log('搜索结果:', searchRes.data)

      if (searchRes.data?.code === 200) {
        setSearchResults(searchRes.data.data || [])
      } else {
        Taro.showToast({ title: searchRes.data?.msg || '搜索失败', icon: 'none' })
      }
    } catch (err) {
      console.error('搜索失败', err)
      Taro.showToast({ title: '搜索失败，请重试', icon: 'none' })
    } finally {
      setSearching(false)
      setSearched(true)
      setUploadProgress('')
    }
  }

  // ---- 入库 ----
  const handleAdd = async (mode: 'camera' | 'album') => {
    const imgPath = await handleChooseImage(mode)
    if (!imgPath) return

    setAddImage(imgPath)
  }

  const handleConfirmAdd = async () => {
    if (!addImage) {
      Taro.showToast({ title: '请先拍照或选择图片', icon: 'none' })
      return
    }
    if (!shoeName.trim()) {
      Taro.showToast({ title: '请输入鞋款名称', icon: 'none' })
      return
    }

    setAdding(true)
    setUploadProgress('正在上传图片...')

    try {
      setUploadProgress('正在上传图片...')
      const uploadRes = await Network.uploadFile({
        url: '/api/shoes/upload-temp',
        filePath: addImage,
        name: 'file',
      })
      console.log('上传响应:', uploadRes.data)

      const uploadData = typeof uploadRes.data === 'string'
        ? JSON.parse(uploadRes.data)
        : uploadRes.data

      if (uploadData.code !== 200) {
        Taro.showToast({ title: uploadData.msg || '上传失败', icon: 'none' })
        return
      }

      const imageKey = uploadData.data?.imageKey

      setUploadProgress('正在分析鞋面特征并入库...')
      const addRes = await Network.request<ApiResponse<ShoeItem>>({
        url: '/api/shoes/add',
        method: 'POST',
        data: { 
          imageKey, 
          name: shoeName.trim(),
          seriesName: seriesName.trim() || undefined,
          productCode: productCode.trim() || undefined,
          sizeRange: sizeRange.trim() || undefined
        },
      })
      console.log('入库结果:', addRes.data)

      if (addRes.data?.code === 200) {
        setAddSuccess(true)
        Taro.showToast({ title: '入库成功！', icon: 'success' })
        fetchShoeList()
        // 重置表单
        setTimeout(() => {
          setAddImage('')
          setShoeName('')
          setSeriesName('')
          setAddSuccess(false)
        }, 2000)
      } else {
        Taro.showToast({ title: addRes.data?.msg || '入库失败', icon: 'none' })
      }
    } catch (err) {
      console.error('入库失败', err)
      Taro.showToast({ title: '入库失败，请重试', icon: 'none' })
    } finally {
      setAdding(false)
      setUploadProgress('')
    }
  }

  // ---- 删除鞋子 ----
  const handleDeleteShoe = async (id: string) => {
    try {
      const res = await Network.request<ApiResponse<null>>({
        url: `/api/shoes/${id}`,
        method: 'DELETE',
      })
      console.log('删除结果:', res.data)
      if (res.data?.code === 200) {
        Taro.showToast({ title: '删除成功', icon: 'success' })
        fetchShoeList()
      }
    } catch (err) {
      console.error('删除失败', err)
    }
  }


  // ---- 渲染搜索结果 ----
  const renderSearchResults = () => {
    if (searching) {
      return (
        <View className="px-4 mt-4">
          <View className="flex items-center justify-center py-8">
            <Text className="block text-gray-500">{uploadProgress || '正在搜索...'}</Text>
          </View>
          {[1, 2, 3].map(i => (
            <Card key={i} className="mb-3">
              <CardContent className="p-3">
                <View className="flex flex-row gap-3">
                  <Skeleton className="w-20 h-20 rounded-lg" />
                  <View className="flex-1 gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </View>
                </View>
              </CardContent>
            </Card>
          ))}
        </View>
      )
    }

    if (!searched) {
      return (
        <View className="flex items-center justify-center py-20 px-4">
          <Search size={48} color="#d1d5db" />
          <Text className="block text-gray-400 mt-4 text-center">
            拍照或从相册选择鞋面照片{'\n'}系统将自动匹配相似款式
          </Text>
        </View>
      )
    }

    if (searchResults.length === 0) {
      return (
        <View className="flex items-center justify-center py-20 px-4">
          <ImageUp size={48} color="#d1d5db" />
          <Text className="block text-gray-400 mt-4 text-center">
            未找到相似款式{'\n'}试试入库新鞋款吧
          </Text>
        </View>
      )
    }

    return (
      <View className="px-4 mt-4">
        <Text className="block text-sm text-gray-500 mb-3">
          找到 {searchResults.length} 个相似款式
        </Text>
        {searchResults.map(item => (
          <Card key={item.id} className="mb-3">
            <CardContent className="p-3">
              <View className="flex flex-row gap-3">
                <Image
                  src={item.imageUrl}
                  className="w-20 h-20 rounded-lg flex-shrink-0"
                  mode="aspectFill"
                />
                <View className="flex-1 gap-1">
                  <Text className="block text-base font-semibold">
                    {item.productCode || item.name}
                  </Text>
                  {/* 新增：显示系列名和码段 */}
                  <View className="flex flex-row gap-2 mt-1">
                    {item.seriesName && (
                      <Badge variant="secondary" className="text-xs">
                        {item.seriesName}
                      </Badge>
                    )}
                    {item.sizeRange && (
                      <Badge variant="outline" className="text-xs">
                        码段: {item.sizeRange}
                      </Badge>
                    )}
                  </View>
                  <Badge className="self-start mt-1">
                    {Math.round((item.similarity || 0) * 100)}% 相似
                  </Badge>
                  <Text className="block text-xs text-gray-500 mt-1 line-clamp-2">
                    {item.description}
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        ))}
      </View>
    )
  }

  // ---- 渲染鞋库列表 ----
  const renderShoeList = () => {
    if (loadingList) {
      return (
        <View className="px-4 mt-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="mb-3">
              <CardContent className="p-3">
                <View className="flex flex-row gap-3">
                  <Skeleton className="w-16 h-16 rounded-lg" />
                  <View className="flex-1 gap-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                  </View>
                </View>
              </CardContent>
            </Card>
          ))}
        </View>
      )
    }

    if (shoeList.length === 0) {
      return (
        <View className="flex items-center justify-center py-20 px-4">
          <Plus size={48} color="#d1d5db" />
          <Text className="block text-gray-400 mt-4 text-center">
            鞋库为空{'\n'}快去入库你的第一款鞋吧！
          </Text>
        </View>
      )
    }

    return (
      <View className="px-4 mt-4">
        <Text className="block text-sm text-gray-500 mb-3">
          共 {shoeList.length} 款鞋
        </Text>
        {shoeList.map(item => (
          <Card key={item.id} className="mb-3">
            <CardContent className="p-3">
              <View className="flex flex-row gap-3">
                <Image
                  src={item.imageUrl}
                  className="w-16 h-16 rounded-lg flex-shrink-0"
                  mode="aspectFill"
                />
                <View className="flex-1 gap-1">
                  <Text className="block text-base font-semibold">
                    {item.productCode || item.name}
                  </Text>
                  {/* 新增：显示系列名和码段 */}
                  <View className="flex flex-row gap-2 mt-1">
                    {item.seriesName && (
                      <Badge variant="secondary" className="text-xs">
                        {item.seriesName}
                      </Badge>
                    )}
                    {item.sizeRange && (
                      <Badge variant="outline" className="text-xs">
                        码段: {item.sizeRange}
                      </Badge>
                    )}
                  </View>
                  <Text className="block text-xs text-gray-500 line-clamp-2 mt-1">
                    {item.description}
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0"
                  onClick={() => handleDeleteShoe(item.id)}
                >
                  删除
                </Button>
              </View>
            </CardContent>
          </Card>
        ))}
      </View>
    )
  }

  // ---- 渲染入库区域 ----
  const renderAddSection = () => {
    return (
      <View className="px-4 pt-4">
        {/* 图片选择区 */}
        <View className="mb-4">
          {addImage ? (
            <View className="relative">
              <Image
                src={addImage}
                className="w-full h-64 rounded-xl"
                mode="aspectFill"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => setAddImage('')}
              >
                重新选择
              </Button>
            </View>
          ) : (
            <View className="flex flex-row gap-3">
              <View style={{ flex: 1 }}>
                <Button
                  className="w-full h-24"
                  variant="outline"
                  onClick={() => handleAdd('camera')}
                >
                  <View className="flex flex-col items-center gap-1">
                    <Camera size={24} color="#666" />
                    <Text className="block text-xs text-gray-500">拍照</Text>
                  </View>
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  className="w-full h-24"
                  variant="outline"
                  onClick={() => handleAdd('album')}
                >
                  <View className="flex flex-col items-center gap-1">
                    <ImageUp size={24} color="#666" />
                    <Text className="block text-xs text-gray-500">相册</Text>
                  </View>
                </Button>
              </View>
            </View>
          )}
        </View>

        {/* 名称输入 */}
        <View className="mb-4">
          <Text className="block text-sm font-medium mb-2">鞋款名称</Text>
          <Input
            placeholder="如：经典款运动鞋 A-001"
            value={shoeName}
            onInput={(e) => setShoeName(e.detail.value)}
          />
        </View>

        {/* 系列名输入 */}
        <View className="mb-4">
          <Text className="block text-sm font-medium mb-2">系列名称（可选）</Text>
          <Input
            placeholder="如：双层系列、三层系列"
            value={seriesName}
            onInput={(e) => setSeriesName(e.detail.value)}
          />
        </View>

        {/* 货号输入 */}
        <View className="mb-4">
          <Text className="block text-sm font-medium mb-2">货号（可选）</Text>
          <Input
            placeholder="如：933C-6"
            value={productCode}
            onInput={(e) => setProductCode(e.detail.value)}
          />
        </View>

        {/* 码段输入 */}
        <View className="mb-4">
          <Text className="block text-sm font-medium mb-2">码段（可选）</Text>
          <Input
            placeholder="如：40-45"
            value={sizeRange}
            onInput={(e) => setSizeRange(e.detail.value)}
          />
        </View>

        {/* 确认入库 */}
        {addImage && (
          <Button
            className="w-full mb-4"
            disabled={adding}
            onClick={handleConfirmAdd}
          >
            {adding ? (
              <Text className="block">{uploadProgress || '入库中...'}</Text>
            ) : (
              <View className="flex flex-row items-center gap-2">
                <Upload size={18} color="#fff" />
                <Text className="block text-white">确认入库</Text>
              </View>
            )}
          </Button>
        )}

        {addSuccess && (
          <Card className="mb-4 border-green-300">
            <CardContent className="p-3">
              <Text className="block text-green-600 text-center">
                ✓ 入库成功！该鞋款已加入鞋库
              </Text>
            </CardContent>
          </Card>
        )}
      </View>
    )
  }

  // ---- 主渲染 ----
  return (
    <View className="flex flex-col h-full bg-gray-50">
      {/* 顶部按钮区域 - 搜索模式 */}
      {activeTab === 'search' && (
        <View className="px-4 pt-4">
          <View className="flex flex-row gap-3 mb-4">
            <View style={{ flex: 1 }}>
              <Button
                className="w-full h-20"
                onClick={() => handleSearch('camera')}
              >
                <View className="flex flex-col items-center gap-1">
                  <Camera size={28} color="#fff" />
                  <Text className="block text-xs text-white">拍照搜索</Text>
                </View>
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                className="w-full h-20"
                variant="secondary"
                onClick={() => handleSearch('album')}
              >
                <View className="flex flex-col items-center gap-1">
                  <ImageUp size={28} color="#fff" />
                  <Text className="block text-xs text-white">相册选择</Text>
                </View>
              </Button>
            </View>
          </View>
          {/* 系列筛选输入框 */}
          <View className="mb-4">
            <Text className="block text-sm text-gray-500 mb-2">系列筛选（可选）</Text>
            <View className="bg-gray-100 rounded-xl px-4 py-3">
              <Input
                className="w-full bg-transparent text-sm"
                placeholder="输入系列名筛选搜索结果"
                value={searchSeriesName}
                onInput={(e) => setSearchSeriesName(e.detail.value)}
              />
            </View>
          </View>
        </View>
      )}

      {/* Tabs */}
      <Tabs defaultValue="search" value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearched(false) }}>
        <View className="px-4">
          <TabsList className="w-full">
            <TabsTrigger value="search" className="flex-1">
              <Search size={16} color="#666666" />
              <Text className="block ml-1">搜索</Text>
            </TabsTrigger>
            <TabsTrigger value="add" className="flex-1">
              <Plus size={16} color="#666666" />
              <Text className="block ml-1">入库</Text>
            </TabsTrigger>
            <TabsTrigger value="list" className="flex-1">
              <Text className="block">鞋库</Text>
            </TabsTrigger>
          </TabsList>
        </View>

        <TabsContent value="search" className="flex-1">
          <ScrollView className="h-full" scrollY>
            {/* 预览区 */}
            {searchImage && (
              <View className="px-4 mt-2">
                <Image
                  src={searchImage}
                  className="w-full h-40 rounded-xl"
                  mode="aspectFill"
                />
              </View>
            )}
            {renderSearchResults()}
          </ScrollView>
        </TabsContent>

        <TabsContent value="add" className="flex-1">
          <ScrollView className="h-full" scrollY>
            {renderAddSection()}
          </ScrollView>
        </TabsContent>

        <TabsContent value="list" className="flex-1">
          <ScrollView className="h-full" scrollY>
            {renderShoeList()}
          </ScrollView>
        </TabsContent>
      </Tabs>

      {/* 管理入口按钮 */}
      <View
        style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100 }}
        onClick={() => Taro.navigateTo({ url: '/pages/admin/index' })}
      >
        <View className="flex items-center justify-center w-12 h-12 bg-gray-700 rounded-full shadow-lg">
          <Settings size={24} color="#fff" />
        </View>
      </View>
    </View>
  )
}