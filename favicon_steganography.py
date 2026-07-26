#!/usr/bin/env python3
"""
Favicon / Image Steganography - 在图片中隐藏和提取文本数据

原理：
- 每个像素有 R, G, B 三个通道，每个通道 0-255（1 字节）
- 把文本转为 UTF-8 字节后，依次写入像素的 RGB 通道
- 在数据前加 4 字节长度头 + 2 字节标记头（固定值 0xFA 0xCE），用于解码时验证
- 支持将数据嵌入任意已有图片，或创建新的纯色小图

这是一个防御性安全实验，用于理解隐写术的基本原理。
"""

import struct
from PIL import Image
import os
import sys


def encode_text_to_image(text: str, output_path: str = "stego_output.png",
                         base_image_path: str = None, size: int = 16) -> dict:
    """
    将文本隐藏到图片中
    
    Args:
        text: 要隐藏的文本
        output_path: 输出图片路径
        base_image_path: 可选，基础图片路径。如果提供，则在此图片上嵌入数据；否则创建新图
        size: 如果创建新图时的尺寸（正方形），默认 16x16
    
    Returns:
        包含编码信息的字典
    """
    # 1. 文本转 UTF-8 字节
    data_bytes = text.encode('utf-8')
    data_len = len(data_bytes)
    
    # 2. 计算总需求：2 字节标记 + 4 字节长度 + 数据 + 填充(最少 1 字节)
    total_needed = 2 + 4 + data_len + 1
    marker = b'\xFA\xCE'  # 魔数，用于验证是否为 encoded 图片
    
    if base_image_path:
        # 使用已有图片
        img = Image.open(base_image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        width, height = img.size
        pixel_capacity = width * height * 3
        print(f"[编码] 使用基础图片: {base_image_path} ({width}x{height})")
    else:
        # 创建新图片
        img = Image.new('RGB', (size, size), color=(128, 128, 128))
        width, height = img.size
        pixel_capacity = width * height * 3
        print(f"[编码] 创建新图片: {size}x{size}")
    
    if total_needed > pixel_capacity:
        raise ValueError(f"容量不足！需要 {total_needed} 字节，但 {width}x{height} 图片最多只能存 {pixel_capacity} 字节")
    
    print(f"[编码] 文本长度: {data_len} 字节")
    print(f"[编码] 总需要: {total_needed} 字节（含 2 字节标记 + 4 字节长度头 + 数据 + 1 字节填充）")
    print(f"[编码] 图片容量: {pixel_capacity} 字节")
    print(f"[编码] 利用率: {(total_needed/pixel_capacity)*100:.1f}%")
    
    # 3. 准备 payload
    payload = marker + struct.pack('>I', data_len) + data_bytes + b'\x00'  # 末尾填充
    
    pixels = img.load()
    
    # 逐字节写入像素 RGB 通道
    byte_index = 0
    for y in range(height):
        for x in range(width):
            if byte_index >= len(payload):
                break
            r, g, b = pixels[x, y]  # 保留原有颜色值作为基底
            
            # 只修改前几个字节为数据（LSB 级别：这里直接覆盖以简化）
            if byte_index < len(payload):
                r = payload[byte_index]
                byte_index += 1
            if byte_index < len(payload):
                g = payload[byte_index]
                byte_index += 1
            if byte_index < len(payload):
                b = payload[byte_index]
                byte_index += 1
            
            pixels[x, y] = (r, g, b)
        
        if byte_index >= len(payload):
            break
    
    # 4. 保存图片
    img.save(output_path, 'PNG')
    
    file_size = os.path.getsize(output_path)
    print(f"\n[结果] 图片已保存到: {output_path}")
    print(f"[结果] 文件大小: {file_size} 字节")
    print(f"[结果] 隐藏文本: {text[:60]}{'...' if len(text)>60 else ''}")
    
    return {
        'output_path': output_path,
        'original_text_len': data_len,
        'image_size': f"{width}x{height}",
        'utilization': f"{(total_needed/pixel_capacity)*100:.1f}%"
    }


def decode_text_from_image(image_path: str) -> str:
    """
    从图片中提取隐藏的文本
    
    Args:
        image_path: 输入图片路径
    
    Returns:
        提取的文本
    """
    # 1. 加载图片
    img = Image.open(image_path)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    width, height = img.size
    pixels = img.load()
    
    print(f"[解码] 加载图片: {image_path}")
    print(f"[解码] 图片尺寸: {width}x{height}")
    print(f"[解码] 总容量: {width * height * 3} 字节")
    
    # 2. 读取所有像素的 RGB 值，转成字节流
    all_bytes = []
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            all_bytes.append(r)
            all_bytes.append(g)
            all_bytes.append(b)
    
    # 3. 检查最小容量
    if len(all_bytes) < 7:  # 2 字节标记 + 4 字节长度 + 至少 1 字节填充
        raise ValueError("图片太小，无法包含隐写数据")
    
    # 4. 读取 2 字节标记（验证魔数）
    read_marker = bytes(all_bytes[:2])
    if read_marker != b'\xFA\xCE':
        raise ValueError(f"不是有效的隐写图片！标记不匹配：期望 \\xFA\\xCE，实际 {read_marker.hex()}")
    print(f"[解码] 标记验证通过: {read_marker.hex()}")
    
    # 5. 读取 4 字节长度头
    data_length = struct.unpack('>I', bytes(all_bytes[2:6]))[0]
    print(f"[解码] 声明数据长度: {data_length} 字节")
    
    # 6. 提取数据部分（跳过 2 标记 + 4 长度头）
    expected_total = 2 + 4 + data_length + 1  # +1 为填充
    if expected_total > len(all_bytes):
        raise ValueError(f"数据超出图片容量：需要 {expected_total} 字节，仅有 {len(all_bytes)} 字节")
    
    data_bytes = bytes(all_bytes[6:6+data_length])
    
    # 7. UTF-8 解码
    try:
        text = data_bytes.decode('utf-8')
        print(f"[解码] 成功提取文本 ({data_length} 字节)")
        print(f"[解码] 内容: {text[:200]}{'...' if len(text)>200 else ''}")
        return text
    except UnicodeDecodeError as e:
        raise ValueError(f"解码失败，图片可能不是用此工具编码的: {e}")


def demo():
    """运行演示"""
    test_text = "Hello from the pixels! 你好世界！这是隐写术实验。"
    
    # --- 演示 1: 创建新小图标 ---
    print("=" * 60)
    print("演示 1: 创建 16x16 新图片并编码")
    print("=" * 60)
    result1 = encode_text_to_image(test_text, "demo_stego_16x16.png")
    
    # 验证解码
    print("\n" + "=" * 60)
    print("验证解码:")
    print("=" * 60)
    decoded1 = decode_text_from_image("demo_stego_16x16.png")
    print(f"匹配: {test_text == decoded1}")
    
    # --- 演示 2: 在现有图片上编码 ---
    # 先创建一个示例彩色图片
    print("\n" + "=" * 60)
    print("演示 2: 在彩色图片上编码")
    print("=" * 60)
    
    # 生成一个渐变彩色图片作为基础
    gradient = Image.new('RGB', (32, 32))
    px = gradient.load()
    for y in range(32):
        for x in range(32):
            px[x, y] = (int(x * 255/32), int(y * 255/32), (x+y) * 255 // 64)
    gradient.save("gradient_base.png", 'PNG')
    print("已生成渐变底色图片: gradient_base.png (32x32)")
    
    # 在渐变图上编码
    result2 = encode_text_to_image(
        test_text, 
        "demo_stego_on_gradient.png", 
        base_image_path="gradient_base.png"
    )
    
    # 验证解码
    print("\n" + "=" * 60)
    print("验证解码（渐变底图上的隐写）:")
    print("=" * 60)
    decoded2 = decode_text_from_image("demo_stego_on_gradient.png")
    print(f"匹配: {test_text == decoded2}")
    
    # --- 总结 ---
    print("\n" + "=" * 60)
    print("演示总结")
    print("=" * 60)
    print(f"原始文本: {test_text}")
    print(f"编码 1 (纯创建):  {'✅ 匹配' if test_text == decoded1 else '❌ 不匹配'}")
    print(f"编码 2 (渐变图):  {'✅ 匹配' if test_text == decoded2 else '❌ 不匹配'}")
    print("\n生成的文件:")
    print("  gradient_base.png       - 32x32 渐变底色图")
    print("  demo_stego_16x16.png    - 16x16 隐写图")
    print("  demo_stego_on_gradient.png - 渐变图上的隐写图")


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'decode':
        img_path = sys.argv[2] if len(sys.argv) > 2 else 'stego_output.png'
        decode_text_from_image(img_path)
    elif len(sys.argv) > 1 and sys.argv[1] == 'encode':
        # encode <text> [output] [base_image]
        text = sys.argv[2] if len(sys.argv) > 2 else ""
        output = sys.argv[3] if len(sys.argv) > 3 else "stego_output.png"
        base = sys.argv[4] if len(sys.argv) > 4 else None
        encode_text_to_image(text, output, base_image_path=base)
    else:
        demo()
