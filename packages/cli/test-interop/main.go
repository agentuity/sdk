package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"

	"github.com/agentuity/go-common/crypto"
)

type KeyPair struct {
	PublicPEM  string `json:"publicPEM"`
	PrivatePEM string `json:"privatePEM"`
}

func generateKeyPair() (*ecdsa.PrivateKey, error) {
	return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
}

func exportKeyPair(priv *ecdsa.PrivateKey) (*KeyPair, error) {
	privBytes, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return nil, err
	}
	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "EC PRIVATE KEY",
		Bytes: privBytes,
	})

	pubBytes, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		return nil, err
	}
	pubPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubBytes,
	})

	return &KeyPair{
		PublicPEM:  string(pubPEM),
		PrivatePEM: string(privPEM),
	}, nil
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "Usage: %s <command>\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "Commands:\n")
		fmt.Fprintf(os.Stderr, "  keygen              - Generate P-256 key pair (JSON output)\n")
		fmt.Fprintf(os.Stderr, "  encrypt <pubkey>    - Encrypt stdin to stdout using base64 public key PEM\n")
		fmt.Fprintf(os.Stderr, "  decrypt <privkey>   - Decrypt stdin to stdout using base64 private key PEM\n")
		os.Exit(1)
	}

	cmd := os.Args[1]

	switch cmd {
	case "keygen":
		priv, err := generateKeyPair()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to generate key: %v\n", err)
			os.Exit(1)
		}

		kp, err := exportKeyPair(priv)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to export key: %v\n", err)
			os.Exit(1)
		}

		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(kp); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to encode JSON: %v\n", err)
			os.Exit(1)
		}

	case "encrypt":
		if len(os.Args) < 3 {
			fmt.Fprintf(os.Stderr, "Usage: %s encrypt <base64-pubkey-pem>\n", os.Args[0])
			os.Exit(1)
		}

		pubPEM, err := base64.StdEncoding.DecodeString(os.Args[2])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to decode public key: %v\n", err)
			os.Exit(1)
		}

		block, _ := pem.Decode(pubPEM)
		if block == nil {
			fmt.Fprintf(os.Stderr, "Failed to parse PEM block\n")
			os.Exit(1)
		}

		pubKey, err := x509.ParsePKIXPublicKey(block.Bytes)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to parse public key: %v\n", err)
			os.Exit(1)
		}

		ecPub, ok := pubKey.(*ecdsa.PublicKey)
		if !ok {
			fmt.Fprintf(os.Stderr, "Not an ECDSA public key\n")
			os.Exit(1)
		}

		if ecPub.Curve != elliptic.P256() {
			curveName := ecPub.Curve.Params().Name
			fmt.Fprintf(os.Stderr, "Invalid key curve: expected P-256, got %s\n", curveName)
			os.Exit(1)
		}

		_, err = crypto.EncryptFIPSKEMDEMStream(ecPub, os.Stdin, os.Stdout)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Encryption failed: %v\n", err)
			os.Exit(1)
		}

	case "decrypt":
		if len(os.Args) < 3 {
			fmt.Fprintf(os.Stderr, "Usage: %s decrypt <base64-privkey-pem>\n", os.Args[0])
			os.Exit(1)
		}

		privPEM, err := base64.StdEncoding.DecodeString(os.Args[2])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to decode private key: %v\n", err)
			os.Exit(1)
		}

		block, _ := pem.Decode(privPEM)
		if block == nil {
			fmt.Fprintf(os.Stderr, "Failed to parse PEM block\n")
			os.Exit(1)
		}

		privKey, err := x509.ParseECPrivateKey(block.Bytes)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to parse private key: %v\n", err)
			os.Exit(1)
		}

		if privKey.Curve != elliptic.P256() {
			curveName := privKey.Curve.Params().Name
			fmt.Fprintf(os.Stderr, "Invalid key curve: expected P-256, got %s\n", curveName)
			os.Exit(1)
		}

		_, err = crypto.DecryptFIPSKEMDEMStream(privKey, os.Stdin, os.Stdout)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Decryption failed: %v\n", err)
			os.Exit(1)
		}

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
		os.Exit(1)
	}
}
