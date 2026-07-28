"""
加密工具模块
- AES-256-GCM 加密 / 解密
- PBKDF2-HMAC-SHA256 密钥派生
"""

import os
from base64 import b64encode, b64decode

from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA256

from key_manager import (
    DEFAULT_KEY,
    AES_KEY_SIZE,
    AES_IV_SIZE,
    PBKDF2_ITERATIONS,
    PBKDF2_SALT_SIZE,
)


def derive_key_and_iv(passphrase: str, salt: bytes) -> tuple[bytes, bytes]:
    """
    从口令派生 AES key 和 IV
    使用 PBKDF2-HMAC-SHA256，迭代 100,000 次
    输出总长度 = AES_KEY_SIZE + AES_IV_SIZE = 44 字节
    """
    derived = PBKDF2(
        passphrase.encode('utf-8'),
        salt,
        dkLen=AES_KEY_SIZE + AES_IV_SIZE,
        count=PBKDF2_ITERATIONS,
        hmac_hash_module=SHA256,
    )
    key = derived[:AES_KEY_SIZE]
    iv = derived[AES_KEY_SIZE:]
    return key, iv


def encrypt_data(plaintext: bytes, passphrase: str) -> bytes:
    """
    AES-256-GCM 加密
    输出格式：salt(16) + nonce(12) + ciphertext + tag(16)
    """
    salt = os.urandom(PBKDF2_SALT_SIZE)
    key, iv = derive_key_and_iv(passphrase, salt)

    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)

    # 组装：salt + iv + ciphertext + tag
    return salt + iv + ciphertext + tag


def decrypt_data(ciphertext_blob: bytes, passphrase: str) -> bytes:
    """
    AES-256-GCM 解密
    输入格式：salt(16) + nonce(12) + ciphertext + tag(16)
    验证失败抛出 ValueError
    """
    # 解析各部分
    salt = ciphertext_blob[:PBKDF2_SALT_SIZE]
    iv = ciphertext_blob[PBKDF2_SALT_SIZE:PBKDF2_SALT_SIZE + AES_IV_SIZE]
    encrypted = ciphertext_blob[PBKDF2_SALT_SIZE + AES_IV_SIZE:-16]
    tag = ciphertext_blob[-16:]

    key, _ = derive_key_and_iv(passphrase, salt)

    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    plaintext = cipher.decrypt_and_verify(encrypted, tag)

    return plaintext


def encrypt_text(text: str, passphrase: str) -> bytes:
    """加密文本，返回完整密文 blob"""
    return encrypt_data(text.encode('utf-8'), passphrase)


def decrypt_text(ciphertext_blob: bytes, passphrase: str) -> str:
    """解密密文 blob，返回文本"""
    plaintext = decrypt_data(ciphertext_blob, passphrase)
    return plaintext.decode('utf-8')
