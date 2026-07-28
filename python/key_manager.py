"""
密钥管理模块
- 默认密钥：WelcomeToUse888!（公开，不加密）
- 随机密钥：16 字节随机串（大小写字母+数字+符号），用于 AES-256-GCM 加密
"""

import secrets
import string

# 默认密钥（公开，向后兼容）
DEFAULT_KEY = "WelcomeToUse888!"

# 随机密钥字符集
KEY_CHARSET = string.ascii_letters + string.digits + "!@#$%^&*()_+-=[]{}|;:,.<>?"

# AES 参数
AES_KEY_SIZE = 32       # AES-256 → 32 字节
AES_IV_SIZE = 12        # GCM 推荐 12 字节 IV
PBKDF2_ITERATIONS = 100000
PBKDF2_SALT_SIZE = 16


def generate_random_key(length: int = 16) -> str:
    """
    生成指定长度的随机密钥字符串
    字符集：大小写字母 + 数字 + 符号
    使用 secrets 模块保证密码学安全性
    """
    return ''.join(secrets.choice(KEY_CHARSET) for _ in range(length))


def is_default_key(key: str) -> bool:
    """判断是否为默认密钥"""
    return key == DEFAULT_KEY


# --- 向后兼容别名 ---
get_default_key = lambda: DEFAULT_KEY
