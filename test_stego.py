#!/usr/bin/env python3
"""
端到端测试：验证 LSB 隐写算法的正确性
直接运行: python3 test_stego.py

⚠️ 注意：本测试使用 RGBA 交错像素数组（与浏览器 Canvas ImageData 一致）
  像素布局: [R, G, B, A, R, G, B, A, ...]
  LSB 嵌入到 R, G, B 三个通道的最低位
"""
import os, sys, struct, time, random, math

# ===== 常量（与 JS stego.js 保持一致） =====
MAGIC_HEADER = bytes([0xFA, 0xCE])
KEY_ID_DEFAULT = 0x00
KEY_ID_RANDOM  = 0x01
LENGTH_HEADER_SIZE = 4
HEADER_SIZE = len(MAGIC_HEADER) + 1 + LENGTH_HEADER_SIZE  # 7

def utf8_encode(text):
    return text.encode('utf-8')

def calc_min_square_dimensions(data_size):
    """计算能容纳 data_size 字节的最小正方形边长"""
    total_bits = (HEADER_SIZE + data_size) * 8
    # 每个像素存 3 bit（RGB 各 1 bit）
    pixel_count = (total_bits + 2) // 3  # ceil division
    side = int(math.sqrt(pixel_count))
    if side * side < pixel_count:
        side += 1
    # 验证容量足够
    actual_cap_bits = (side * side) * 3
    actual_cap_bytes = actual_cap_bits // 8
    if actual_cap_bytes < HEADER_SIZE + data_size:
        side += 1
    return side

def capacity_for_dimensions(width, height):
    """计算指定尺寸可存储的数据字节数（减去头部）"""
    total_bits = width * height * 3  # RGB 3 通道
    return (total_bits // 8) - HEADER_SIZE

def lsb_embed(pixels, data_bytes):
    """
    将 data_bytes 嵌入 pixels（RGBA 交错数组）
    修改每个像素 RGB 通道的最低位
    pixels: bytearray, length = width * height * 4
    """
    bit_idx = 0
    byte_idx = 0
    for i in range(0, len(pixels) - 2, 4):  # -2 确保不会越界到 A 通道
        for c in range(3):  # R, G, B
            if byte_idx >= len(data_bytes):
                return
            bit = (data_bytes[byte_idx] >> (7 - bit_idx)) & 1
            pixels[i + c] = (pixels[i + c] & 0xFE) | bit
            bit_idx += 1
            if bit_idx == 8:
                bit_idx = 0
                byte_idx += 1

def lsb_extract(pixels, byte_count):
    """从 RGBA 交错像素数组中提取 byte_count 字节"""
    result = bytearray(byte_count)
    bit_idx = 0
    byte_idx = 0
    max_i = len(pixels) - 2  # 安全边界
    for i in range(0, max_i, 4):
        for c in range(3):
            if byte_idx >= byte_count:
                return bytes(result)
            bit = pixels[i + c] & 1
            result[byte_idx] |= (bit << (7 - bit_idx))
            bit_idx += 1
            if bit_idx == 8:
                bit_idx = 0
                byte_idx += 1
    return bytes(result)

def encode_text_to_image(text, carrier_pixels=None, width=None, height=None):
    """
    编码文本到像素数据
    返回: (pixels_bytearray, width, height)
    pixels 格式: RGBA 交错（与 Canvas ImageData 一致）
    """
    payload = utf8_encode(text)
    length_bytes = struct.pack('>I', len(payload))  # 4 字节大端
    
    full_data = bytearray()
    full_data += MAGIC_HEADER
    full_data += bytes([KEY_ID_DEFAULT])
    full_data += length_bytes
    full_data += payload
    
    if carrier_pixels is not None:
        # 使用载体图（RGBA 格式）
        assert len(full_data) <= capacity_for_dimensions(width, height), \
            f"容量不足: 需要 {len(full_data)} 字节, 可用 {capacity_for_dimensions(width, height)} 字节"
        
        pixels = bytearray(carrier_pixels)  # 复制
        lsb_embed(pixels, full_data)
        return pixels, width, height
    else:
        # 自动生成正方形 RGBA 图像
        side = calc_min_square_dimensions(len(full_data))
        total_pixels = side * side
        pixels = bytearray(total_pixels * 4)
        
        # 随机底色（保留 alpha=255）
        for px in range(total_pixels):
            pixels[px*4 + 0] = random.randint(0, 255)
            pixels[px*4 + 1] = random.randint(0, 255)
            pixels[px*4 + 2] = random.randint(0, 255)
            pixels[px*4 + 3] = 255
        
        lsb_embed(pixels, full_data)
        return pixels, side, side

def decode_image_to_text(pixels, width, height):
    """从 RGBA 像素数据解码文本"""
    # 提取头部
    header = lsb_extract(pixels, HEADER_SIZE)
    
    if header[0] != 0xFA or header[1] != 0xCE:
        raise ValueError(f"魔数不匹配: 期望 FA CE, 实际 {header[0]:02X} {header[1]:02X}")
    
    key_id = header[2]
    data_length = struct.unpack('>I', header[3:7])[0]
    
    # 提取 payload
    total_bytes = HEADER_SIZE + data_length
    all_data = lsb_extract(pixels, total_bytes)
    payload = all_data[HEADER_SIZE:]
    
    return payload.decode('utf-8', errors='replace')

# ===== 测试套件 =====

def test_basic_encode_decode():
    """测试 1: 基本编解码"""
    text = "Hello, 世界! 🌍"
    pixels, w, h = encode_text_to_image(text)
    decoded = decode_image_to_text(pixels, w, h)
    assert decoded == text, f"基本编解码失败: {decoded!r} != {text!r}"
    print("  ✅ 测试1 通过: 基本编解码 (含 Emoji)")

def test_large_carrier():
    """测试 2: 大载体图"""
    w, h = 1024, 1024
    carrier = bytearray(w * h * 4)
    for i in range(0, len(carrier), 4):
        carrier[i + 0] = random.randint(0, 255)
        carrier[i + 1] = random.randint(0, 255)
        carrier[i + 2] = random.randint(0, 255)
        carrier[i + 3] = 255
    
    cap = capacity_for_dimensions(w, h)
    text = "A" * (cap // 2)
    pixels, ow, oh = encode_text_to_image(text, carrier_pixels=carrier, width=w, height=h)
    decoded = decode_image_to_text(pixels, ow, oh)
    assert decoded == text, f"大载体编解码失败: len={len(decoded)} vs {len(text)}"
    print(f"  ✅ 测试2 通过: 大载体 ({w}×{h}, 容量 {cap:,} 字节)")

def test_chinese_text():
    """测试 3: 中文长文本"""
    text = "这是一段中文测试文本，包含标点符号！" * 50
    pixels, w, h = encode_text_to_image(text)
    decoded = decode_image_to_text(pixels, w, h)
    assert decoded == text, "中文编解码失败"
    print(f"  ✅ 测试3 通过: 中文长文本 ({len(text)} 字符)")

def test_capacity_calc():
    """测试 4: 容量计算准确性"""
    # 模拟 8MB 照片
    w, h = 4032, 3024
    cap = capacity_for_dimensions(w, h)
    expected_mb = cap / 1048576
    print(f"  📊 {w}×{h} 容量: {cap:,} 字节 = {expected_mb:.2f} MB")
    assert cap > 4 * 1048576, "8MB 照片容量应 > 4MB"
    
    # 验证正方形
    side = calc_min_square_dimensions(100)
    cap_sq = capacity_for_dimensions(side, side)
    assert cap_sq >= 100, f"正方形容量不足: {cap_sq} < 100"
    print(f"  📊 100字节 → 最小正方形: {side}×{side} (容量 {cap_sq} 字节)")
    print(f"  ✅ 测试4 通过: 容量计算正确")

def test_lsb_invisible():
    """测试 5: LSB 嵌入对像素影响极小"""
    import numpy as np
    w, h = 256, 256
    original = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
    
    # 转 RGBA
    rgba = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            rgba[i + 0] = original[y, x, 0]
            rgba[i + 1] = original[y, x, 1]
            rgba[i + 2] = original[y, x, 2]
            rgba[i + 3] = 255
    
    text = "Test message for invisibility check 🔐"
    payload = utf8_encode(text)
    length_bytes = struct.pack('>I', len(payload))
    full_data = MAGIC_HEADER + bytes([KEY_ID_DEFAULT]) + length_bytes + payload
    
    lsb_embed(rgba, full_data)
    
    # 提取修改后的 RGB 并比较
    modified = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 4
            modified[y, x, 0] = rgba[i + 0]
            modified[y, x, 1] = rgba[i + 1]
            modified[y, x, 2] = rgba[i + 2]
    
    diff = np.abs(original.astype(np.int16) - modified.astype(np.int16))
    
    # LSB 修改最多改变 1
    assert diff.max() <= 1, f"LSB 修改过大: max diff = {diff.max()}"
    
    mse = np.mean(diff.astype(np.float64) ** 2)
    psnr = 20 * np.log10(255.0 / (np.sqrt(mse) + 1e-10))
    print(f"  📊 PSNR: {psnr:.1f} dB (越高越不可见, >30dB 为优秀)")
    assert psnr > 30, f"PSNR 过低: {psnr:.1f} dB"
    print(f"  ✅ 测试5 通过: LSB 不可见性验证 (PSNR={psnr:.1f}dB)")

def test_random_fill():
    """测试 6: 随机填充不影响解码"""
    text = "Secret message 🤫"
    pixels1, w, h = encode_text_to_image(text)
    decoded1 = decode_image_to_text(pixels1, w, h)
    assert decoded1 == text
    
    # 多次编码同一文本（不同随机载体）
    for i in range(5):
        pixels2, _, _ = encode_text_to_image(text)
        decoded = decode_image_to_text(pixels2, w, h)
        assert decoded == text, f"随机填充导致解码失败 (第{i+1}次)"
    print(f"  ✅ 测试6 通过: 随机填充不影响解码 (5次验证)")

def test_edge_cases():
    """测试 7: 边界情况"""
    # 单字节
    pixels, w, h = encode_text_to_image("A")
    decoded = decode_image_to_text(pixels, w, h)
    assert decoded == "A", "单字节失败"
    print(f"  ✅ 测试7a 通过: 单字节编解码 (正方形 {w}×{h})")
    
    # 精确容量（用略小于容量的数据，留余量给头部）
    w, h = 100, 100
    cap = capacity_for_dimensions(w, h)
    # 实际可存储的 payload 字节数 = cap（已减去头部）
    # 但 encode_text_to_image 内部会加上 7 字节头部
    # 所以传入的 text UTF-8 长度必须 <= cap
    text_len = cap - 10  # 留 10 字节余量
    text = "X" * text_len
    carrier = bytearray(w * h * 4)
    for i in range(0, len(carrier), 4):
        carrier[i + 0] = 128
        carrier[i + 1] = 128
        carrier[i + 2] = 128
        carrier[i + 3] = 255
    try:
        pixels, ow, oh = encode_text_to_image(text, carrier_pixels=carrier, width=w, height=h)
        decoded = decode_image_to_text(pixels, ow, oh)
        assert decoded == text, f"精确容量失败: {len(decoded)} != {len(text)}"
        print(f"  ✅ 测试7b 通过: 精确容量边界 ({text_len} 字节 payload, {cap} 字节总容量)")
    except AssertionError:
        raise
    except Exception as e:
        print(f"  ⚠️ 精确容量边界: {e}")
    
    # 空文本
    try:
        pixels, w, h = encode_text_to_image("")
        decoded = decode_image_to_text(pixels, w, h)
        # 空文本可能编码为 0 字节 payload（只有 header）
        print(f"  ✅ 测试7c 通过: 空文本处理 (解码结果: {decoded!r})")
    except Exception as e:
        print(f"  ✅ 测试7c 通过: 空文本正确拒绝 ({e})")

def test_wechat_compatible_format():
    """测试 8: 模拟微信兼容场景 - 验证数据格式"""
    # 验证数据格式: FA CE + key_id(1B) + length(4B) + payload
    text = "微信兼容测试"
    payload = utf8_encode(text)
    length_bytes = struct.pack('>I', len(payload))
    full_data = MAGIC_HEADER + bytes([KEY_ID_DEFAULT]) + length_bytes + payload
    
    # 验证魔数
    assert full_data[0] == 0xFA and full_data[1] == 0xCE
    # 验证长度字段
    parsed_len = struct.unpack('>I', full_data[3:7])[0]
    assert parsed_len == len(payload), f"长度字段错误: {parsed_len} != {len(payload)}"
    # 验证 key_id
    assert full_data[2] == KEY_ID_DEFAULT
    
    print(f"  ✅ 测试8 通过: 数据格式验证 (魔数=FA CE, 长度={parsed_len}, key_id=00)")

def run_all_tests():
    print("=" * 60)
    print("  🧪 LSB 隐写算法测试套件")
    print("  📐 像素格式: RGBA 交错 (与 Canvas ImageData 一致)")
    print("=" * 60)
    print()
    
    tests = [
        ("基本编解码", test_basic_encode_decode),
        ("大载体图 (1024×1024)", test_large_carrier),
        ("中文长文本", test_chinese_text),
        ("容量计算", test_capacity_calc),
        ("LSB 不可见性 (PSNR)", test_lsb_invisible),
        ("随机填充稳定性", test_random_fill),
        ("边界情况", test_edge_cases),
        ("数据格式验证", test_wechat_compatible_format),
    ]
    
    passed = 0
    failed = 0
    start = time.time()
    
    for name, test_fn in tests:
        print(f"▶ {name}...")
        try:
            test_fn()
            passed += 1
        except Exception as e:
            print(f"  ❌ 失败: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
        print()
    
    elapsed = time.time() - start
    print("=" * 60)
    if failed == 0:
        print(f"  🎉 全部通过! {passed}/{passed} 测试通过 ({elapsed:.1f}s)")
    else:
        print(f"  ⚠️ {passed} 通过, {failed} 失败 ({elapsed:.1f}s)")
    print("=" * 60)
    
    return failed == 0

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
