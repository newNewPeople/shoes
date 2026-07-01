#!/usr/bin/env python3
"""
批量导入鞋款数据脚本
目录结构：系列名/码段/货号/图片.jpg
"""

import os
import base64
import requests
import json
from pathlib import Path

# 配置
BASE_DIR = '/tmp/shoes_import/双层系列'
API_BASE = 'http://localhost:3000/api'

def get_first_image(product_dir):
    """获取货号目录下的第一张图片（按文件名排序）"""
    images = sorted([f for f in os.listdir(product_dir) if f.endswith('.jpg')])
    if images:
        return os.path.join(product_dir, images[0])
    return None

def image_to_base64(image_path):
    """将图片转为 base64"""
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def upload_image(image_path):
    """上传图片到 TOS"""
    b64 = image_to_base64(image_path)
    resp = requests.post(f'{API_BASE}/shoes/upload-base64', json={
        'base64Data': b64,
        'fileName': os.path.basename(image_path)
    })
    print(f"  上传响应: {resp.status_code}")
    data = resp.json()
    if data.get('code') == 200:
        result = data.get('data', {})
        return result.get('imageKey'), result.get('imageUrl')
    else:
        print(f"  上传失败: {data.get('msg')}")
        return None, None

def add_shoe(image_key, series_name, size_range, product_code):
    """添加鞋款到数据库"""
    resp = requests.post(f'{API_BASE}/shoes/add', json={
        'imageKey': image_key,
        'seriesName': series_name,
        'sizeRange': size_range,
        'productCode': product_code,
        'name': f'{series_name} - {product_code}'
    })
    if resp.status_code == 200:
        return resp.json()
    else:
        print(f"入库失败: {resp.text}")
        return None

def main():
    # 系列名：双层系列
    series_name = '双层系列'
    
    # 遍历码段目录
    for size_dir in os.listdir(BASE_DIR):
        size_path = os.path.join(BASE_DIR, size_dir)
        if not os.path.isdir(size_path) or size_dir.startswith('.'):
            continue
        
        size_range = size_dir  # 如 40-45
        
        # 遍历货号目录
        for product_dir in os.listdir(size_path):
            product_path = os.path.join(size_path, product_dir)
            if not os.path.isdir(product_path) or product_dir.startswith('.'):
                continue
            
            product_code = product_dir  # 如 933C-6
            
            # 获取第一张图片
            image_path = get_first_image(product_path)
            if not image_path:
                print(f"⚠️ {product_code} 没有图片")
                continue
            
            print(f"\n处理: {series_name}/{size_range}/{product_code}")
            print(f"  图片: {os.path.basename(image_path)}")
            
            # 上传图片
            print("  上传图片...")
            image_key, image_url = upload_image(image_path)
            if not image_key:
                print(f"  ❌ 上传失败")
                continue
            print(f"  ✅ 图片Key: {image_key}")
            
            # 入库
            print("  AI分析并入库...")
            result = add_shoe(image_key, series_name, size_range, product_code)
            if result:
                print(f"  ✅ 入库成功: {result.get('data', {}).get('id')}")
            else:
                print(f"  ❌ 入库失败")

if __name__ == '__main__':
    main()