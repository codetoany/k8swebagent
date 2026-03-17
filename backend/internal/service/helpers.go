package service

import "time"

// 公共辅助函数，供新增 service 文件使用

func timeNowUTC() time.Time {
	return time.Now().UTC()
}
