"""
核心隐写模块
- 将字节数据写入 PNG 像素（每像素 3 字节 RGB）
- 从像素中读取字节数据
- 自动计算最小正方形尺寸
- 载体图支持（写入现有图片像素）

数据格式：
  FA CE + 密钥标识(1字节) + 数据长度(4字节大端) + 数据(N字节) + 随机填充
"""

import io
import math
import struct
import secrets

from PIL import Image

from key_manager import DEFAULT_KEY, is_default_key
from crypto_utils import encrypt_text, decrypt_text

# === 常量 ===

MAGIC_HEADER = b'\xFA\xCE'          # 魔数，标识本工具生成的隐写图片
KEY_ID_DEFAULT = 0x00                # 默认密钥标识
KEY_ID_RANDOM = 0x01                 # 随机密钥标识
LENGTH_HEADER_SIZE = 4               # 数据长度字段（4 字节大端）
HEADER_SIZE = len(MAGIC_HEADER) + 1 + LENGTH_HEADER_SIZE  # 7 字节头部

# === 像素读写工具 ===

def bytes_needed_for_capacity(pixel_count: int) -> int:
    """给定像素数，返回可存储的字节数（减去头部）"""
    return pixel_count * 3 - HEADER_SIZE

def capacity_for_dimensions(width: int, height: int) -> int:
    """给定宽高，返回可存储的数据字节数（减去头部）"""
    pixel_count = width * height
    return bytes_needed_for_capacity(pixel_count)

def calc_min_square_dimensions(data_size: int) -> int:
    """
    计算能容纳 data_size 字节数据的最小正方形边长
    data_size 是加密后/明文数据的实际大小
    """
    total_needed = HEADER_SIZE + data_size  # 头部 + 数据
    # 每个像素 3 字节
    pixel_count = math.ceil(total_needed / 3)
    # 正方形：side^2 >= pixel_count
    side = math.ceil(math.sqrt(pixel_count))
    return side

def pixels_to_bytes(image: Image.Image) -> bytes:
    """
    从 PIL Image 中提取所有像素的 RGB 值，拼接为字节流
    顺序：行优先，从左到右，从上到下
    """
    img = image.convert('RGB')
    pixels = img.load()
    w, h = img.size

    byte_list = []
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            byte_list.append(r)
            byte_list.append(g)
            byte_list.append(b)

    return bytes(byte_list)

def bytes_to_image(data: bytes, width: int, height: int) -> Image.Image:
    """
    将字节流写入新图像的 RGB 像素
    顺序：行优先，从左到右，从上到下
    如果数据不够填满所有像素，剩余部分用随机字节填充
    """
    required = width * height * 3
    if len(data) < required:
        # 随机填充剩余空间
        padding = secrets.token_bytes(required - len(data))
        data = data + padding
    elif len(data) > required:
        raise ValueError(f"数据过大：{len(data)} 字节，但图像只能容纳 {required} 字节")

    img = Image.new('RGB', (width, height))
    pixels = img.load()

    idx = 0
    for y in range(height):
        for x in range(width):
            r = data[idx]
            g = data[idx + 1]
            b = data[idx + 2]
            pixels[x, y] = (r, g, b)
            idx += 3

    return img

def write_bytes_into_image(data: bytes, image: Image.Image) -> Image.Image:
    """
    将字节流写入已有图像的像素（就地覆盖 RGB 值）
    用于载体图模式
    顺序：行优先
    如果数据不够填满，剩余像素用随机字节填充
    """
    img = image.convert('RGB')
    pixels = img.load()
    w, h = img.size

    total_pixels = w * h
    required = total_pixels * 3
    if len(data) < required:
        padding = secrets.token_bytes(required - len(data))
        data = data + padding
    elif len(data) > required:
        raise ValueError(f"数据过大：{len(data)} 字节，但载体图只能容纳 {required} 字节")

    idx = 0
    for y in range(h):
        for x in range(w):
            r = data[idx]
            g = data[idx + 1]
            b = data[idx + 2]
            pixels[x, y] = (r, g, b)
            idx += 3

    return img

# === 核心编码 ===

def encode(text: str, key_mode: str = 'default', passphrase: str = None,
           carrier_image: Image.Image = None) -> tuple[Image.Image, str, dict]:
    """
    将文本编码为隐写图片

    参数:
        text: 要隐藏的文本内容
        key_mode: 'default' 或 'random'
        passphrase: 随机密钥模式时的口令（明文），默认模式可为 None
        carrier_image: 可选载体图 PIL Image

    返回:
        (PIL.Image, 使用的密钥字符串, 信息字典)
    """
    # 1. 确定密钥
    if key_mode == 'default':
        key_id = KEY_ID_DEFAULT
        used_key = DEFAULT_KEY
        passphrase_used = None
    elif key_mode == 'random':
        key_id = KEY_ID_RANDOM
        used_key = passphrase  # 前端传入的随机密钥字符串
        passphrase_used = passphrase
    else:
        raise ValueError(f"未知密钥模式: {key_mode}")

    # 2. 准备数据（加密或明文）
    text_bytes = text.encode('utf-8')

    if key_id == KEY_ID_RANDOM:
        # AES-256-GCM 加密（密文 blob 包含 salt+iv+ciphertext+tag）
        encrypted_blob = encrypt_text(text, used_key)
        payload = encrypted_blob
    else:
        # 默认密钥，明文存储
        payload = text_bytes

    # 3. 组装数据：魔数 + 密钥标识 + 长度 + 数据
    length_bytes = struct.pack('>I', len(payload))  # 4 字节大端
    key_id_bytes = bytes([key_id])
    full_data = MAGIC_HEADER + key_id_bytes + length_bytes + payload

    # 4. 计算尺寸 / 写入像素
    if carrier_image is not None:
        # 载体图模式：检查容量
        img = carrier_image
        w, h = img.size
        available = capacity_for_dimensions(w, h)
        if len(payload) > available:
            raise ValueError(
                f"载体图容量不足：需要至少 {math.ceil(math.sqrt(math.ceil((HEADER_SIZE + len(payload)) / 3)))}×"
                f"{math.ceil(math.sqrt(math.ceil((HEADER_SIZE + len(payload)) / 3)))} 像素的正方形空间，"
                f"当前载体图 {w}×{h}，可用 {available} 字节，需要 {len(payload)} 字节"
            )
        result_img = write_bytes_into_image(full_data, img)
        info = {
            'mode': 'carrier',
            'dimensions': f'{w}x{h}',
            'payload_size': len(payload),
            'available': available,
        }
    else:
        # 自动计算最小正方形
        side = calc_min_square_dimensions(len(payload))
        result_img = bytes_to_image(full_data, side, side)
        info = {
            'mode': 'generated',
            'dimensions': f'{side}x{side}',
            'payload_size': len(payload),
            'total_pixels': side * side,
            'raw_capacity': side * side * 3,
            'utilization': f"{(len(full_data) / (side * side * 3) * 100):.1f}%",
        }

    return result_img, used_key, info

# === 核心解码 ===

class DecodeError(Exception):
    """解码错误，携带错误类型"""
    def __init__(self, error_type: str, message: str):
        self.error_type = error_type  # 'magic_mismatch' | 'wrong_key' | 'corrupted'
        self.message = message
        super().__init__(message)

def decode(image: Image.Image, passphrase: str = None) -> str:
    """
    从隐写图片中解码文本

    参数:
        image: PIL Image
        passphrase: 可选密钥（随机密钥时必须提供）

    返回:
        解码后的文本字符串

    抛出:
        DecodeError: 解码失败时
    """
    # 1. 提取所有字节
    raw_bytes = pixels_to_bytes(image)

    # 2. 校验魔数
    if len(raw_bytes) < 2 or raw_bytes[:2] != MAGIC_HEADER:
        raise DecodeError(
            'magic_mismatch',
            '这不是本工具生成的图片（魔数校验失败）'
        )

    # 3. 读取密钥标识
    key_id = raw_bytes[2]

    # 4. 读取数据长度
    length_bytes = raw_bytes[3:7]
    data_length = struct.unpack('>I', length_bytes)[0]

    # 5. 提取数据部分
    data_start = 7
    data_end = data_start + data_length
    payload = raw_bytes[data_start:data_end]

    # 6. 根据密钥标识处理
    if key_id == KEY_ID_DEFAULT:
        # 默认密钥：明文直接解码
        try:
            text = payload.decode('utf-8')
        except UnicodeDecodeError:
            raise DecodeError('corrupted', '数据已损坏，无法解码为文本')
        return text

    elif key_id == KEY_ID_RANDOM:
        # 随机密钥：需要用户提供密钥
        if passphrase is None or passphrase == '':
            raise DecodeError('wrong_key', '请输入密钥')

        # 尝试解密
        try:
            text = decrypt_text(payload, passphrase)
        except ValueError:
            # GCM 验证失败 → 密钥错误或数据损坏
            raise DecodeError('wrong_key', '密钥不正确，拒绝解析')
        except Exception:
            raise DecodeError('corrupted', '数据已损坏或已被篡改')

        return text

    else:
        raise DecodeError('corrupted', f'未知的密钥标识: 0x{key_id:02X}')

# === 便捷函数 ===

def encode_to_bytes(text: str, key_mode: str = 'default',
                    passphrase: str = None) -> bytes:
    """编码为 PNG 字节数据（无载体图，自动生成正方形 PNG）"""
    img, _, info = encode(text, key_mode, passphrase, carrier_image=None)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf.read()

def encode_carrier_to_bytes(text: str, carrier_bytes: bytes,
                           key_mode: str = 'default',
                           passphrase: str = None) -> bytes:
    """编码到载体图，返回处理后的图片字节"""
    img = Image.open(io.BytesIO(carrier_bytes))
    result_img, _, info = encode(text, key_mode, passphrase, carrier_image=img)

    buf = io.BytesIO()
    # 保持原格式（如果能确定）
    fmt = result_img.format or 'PNG'
    result_img.save(buf, format=fmt)
    buf.seek(0)
    return buf.read()
