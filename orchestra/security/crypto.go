package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"

	"golang.org/x/crypto/scrypt"
)

const (
	ScryptN      = 32768
	ScryptR      = 8
	ScryptP      = 1
	ScryptKeyLen = 32 // AES-256
	saltLen      = 16
	nonceLen     = 12 // GCM standard
)

// Encryptor holds a derived AES-256 key. Create one per session or passphrase.
type Encryptor struct {
	key  []byte
	salt []byte // non-nil only when built from passphrase; prepended to output
}

// NewEncryptorFromPassphrase derives a 256-bit key from passphrase using scrypt.
func NewEncryptorFromPassphrase(passphrase string) (*Encryptor, error) {
	salt := make([]byte, saltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("crypto: generate salt: %w", err)
	}
	key, err := deriveKey(passphrase, salt)
	if err != nil {
		return nil, err
	}
	return &Encryptor{key: key, salt: salt}, nil
}

// NewEncryptorFromKey accepts a raw 32-byte AES-256 key directly.
func NewEncryptorFromKey(key []byte) (*Encryptor, error) {
	if len(key) != ScryptKeyLen {
		return nil, fmt.Errorf("crypto: key must be exactly %d bytes, got %d", ScryptKeyLen, len(key))
	}
	keyCopy := make([]byte, ScryptKeyLen)
	copy(keyCopy, key)
	return &Encryptor{key: keyCopy}, nil
}

// Encrypt returns base64(salt? + nonce + ciphertext).
// When built from a passphrase, salt is prepended so Decrypt can re-derive the key.
func (e *Encryptor) Encrypt(plaintext string) (string, error) {
	sealed, err := gcmSeal(e.key, []byte(plaintext))
	if err != nil {
		return "", err
	}
	var blob []byte
	if len(e.salt) > 0 {
		blob = append(e.salt, sealed...)
	} else {
		blob = sealed
	}
	return base64.StdEncoding.EncodeToString(blob), nil
}

// Decrypt reverses Encrypt and returns the original plaintext.
func (e *Encryptor) Decrypt(ciphertext string) (string, error) {
	blob, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", fmt.Errorf("crypto: base64 decode: %w", err)
	}

	key := e.key
	data := blob
	if len(e.salt) > 0 {
		if len(blob) < saltLen {
			return "", fmt.Errorf("crypto: ciphertext too short")
		}
		salt := blob[:saltLen]
		data = blob[saltLen:]
		key, err = deriveKey(string(e.key), salt) // key field holds passphrase bytes
		if err != nil {
			return "", err
		}
	}

	plain, err := gcmOpen(key, data)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func deriveKey(passphrase string, salt []byte) ([]byte, error) {
	key, err := scrypt.Key([]byte(passphrase), salt, ScryptN, ScryptR, ScryptP, ScryptKeyLen)
	if err != nil {
		return nil, fmt.Errorf("crypto: scrypt: %w", err)
	}
	return key, nil
}

func gcmSeal(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new GCM: %w", err)
	}
	nonce := make([]byte, nonceLen)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("crypto: generate nonce: %w", err)
	}
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	return sealed, nil
}

func gcmOpen(key, data []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("crypto: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: new GCM: %w", err)
	}
	if len(data) < nonceLen {
		return nil, fmt.Errorf("crypto: data too short")
	}
	nonce, ciphertext := data[:nonceLen], data[nonceLen:]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("crypto: decrypt: %w", err)
	}
	return plain, nil
}
