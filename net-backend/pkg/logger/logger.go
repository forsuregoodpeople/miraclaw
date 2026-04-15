package logger

import (
	"os"

	"github.com/sirupsen/logrus"
)

var Log *logrus.Logger

func Init(level string, format string, colors bool) {
	Log = logrus.New()

	switch level {
	case "debug":
		Log.SetLevel(logrus.DebugLevel)
	case "warn":
		Log.SetLevel(logrus.WarnLevel)
	case "error":
		Log.SetLevel(logrus.ErrorLevel)
	default:
		Log.SetLevel(logrus.InfoLevel)
	}

	if format == "json" {
		Log.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: "2006-01-02 15:04:05",
		})
	} else {
		Log.SetFormatter(&logrus.TextFormatter{
			FullTimestamp:   true,
			TimestampFormat: "2006-01-02 15:04:05",
			ForceColors:     colors,
			DisableColors:   !colors,
		})
	}

	Log.SetOutput(os.Stdout)
}

func WithComponent(component string) *logrus.Entry {
	return Log.WithField("component", component)
}

func WithRequestID(requestID string) *logrus.Entry {
	return Log.WithField("request_id", requestID)
}

func WithRouterID(routerID int) *logrus.Entry {
	return Log.WithField("router_id", routerID)
}

func WithUsername(username string) *logrus.Entry {
	return Log.WithField("username", username)
}
