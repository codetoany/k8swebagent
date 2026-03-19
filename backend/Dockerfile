FROM golang:1.26-alpine AS builder

WORKDIR /app

ENV GOPROXY=https://goproxy.cn,direct
ENV GOSUMDB=sum.golang.google.cn

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/k8s-agent-api ./cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates kubectl

WORKDIR /app

COPY --from=builder /out/k8s-agent-api ./k8s-agent-api

EXPOSE 8080

CMD ["./k8s-agent-api"]
