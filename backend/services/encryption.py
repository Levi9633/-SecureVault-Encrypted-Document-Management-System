import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import padding, hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# SERVER-ASSISTED KEY DERIVATION (PEPPER)
# This secret never leaves the server. It prevents offline dictionary attacks
# even if the Supabase database (containing the salt and ciphertext) is fully compromised.
SERVER_SECRET = b"V@ultSync_0nly_S3rv3r_Kn0ws_77!"

def derive_key(password: str, salt: bytes) -> bytes:
    """Derive a secure 32-byte AES key from (password + server_secret) and salt using PBKDF2."""
    
    # Combine user password with the server secret
    combined_material = password.encode() + SERVER_SECRET
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=390000,
        backend=default_backend()
    )
    return kdf.derive(combined_material)

def encrypt_file(data: bytes, password: str) -> bytes:
    """
    Zero-Knowledge Encrypt:
    1. Generate 16-byte random salt.
    2. Derive 32-byte AES key from password + salt.
    3. Generate 16-byte IV.
    4. Encrypt data with AES-256-CBC and PKCS7 padding.
    5. Return: salt (16) + iv (16) + ciphertext
    """
    salt = os.urandom(16)
    key = derive_key(password, salt)
    iv = os.urandom(16)

    padder = padding.PKCS7(128).padder()
    padded = padder.update(data) + padder.finalize()

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    enc = cipher.encryptor()
    ciphertext = enc.update(padded) + enc.finalize()

    # The file now contains everything needed to decrypt EXCEPT the password!
    return salt + iv + ciphertext

def decrypt_file(encrypted_data: bytes, password: str) -> bytes:
    """
    Zero-Knowledge Decrypt:
    1. Extract salt (first 16 bytes) and iv (next 16 bytes).
    2. Re-derive the exact same 32-byte AES key using password + salt.
    3. Decrypt ciphertext (rest of the file).
    4. Remove padding.
    """
    if len(encrypted_data) < 32:
        raise ValueError("File is too small or corrupted.")

    salt = encrypted_data[:16]
    iv = encrypted_data[16:32]
    ciphertext = encrypted_data[32:]

    key = derive_key(password, salt)

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    dec = cipher.decryptor()
    try:
        padded = dec.update(ciphertext) + dec.finalize()
    except Exception as e:
        raise ValueError("Invalid password or corrupted file (decryption failed).")

    unpadder = padding.PKCS7(128).unpadder()
    try:
        return unpadder.update(padded) + unpadder.finalize()
    except Exception as e:
        raise ValueError("Invalid password or corrupted file (unpadding failed).")
