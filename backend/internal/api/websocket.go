package api

import (
	"crypto/sha1"
	"encoding/base64"
)

const wsGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// webSocketAcceptKey 计算 Sec-WebSocket-Accept 值（RFC 6455）
func webSocketAcceptKey(key string) string {
	h := sha1.New()
	h.Write([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}
