package main

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/lincaiyong/arg"
	"github.com/lincaiyong/log"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path"
	"strings"
	"syscall"
	"time"
)

//go:embed res/res.zip
var resZip []byte

func readZip(b []byte) (map[string][]byte, error) {
	ret := make(map[string][]byte)
	zipr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return nil, err
	}

	for _, z := range zipr.File {
		rr, openErr := z.Open()
		if openErr != nil {
			return nil, openErr
		}

		b, readErr := io.ReadAll(rr)
		if readErr != nil {
			return nil, readErr
		}
		_ = rr.Close()
		if !strings.HasSuffix(z.Name, "/") {
			ret[z.Name] = b
		}
	}
	return ret, nil
}

func cacheMiddleware(lastModifiedDateTime string) gin.HandlerFunc {
	if lastModifiedDateTime == "" {
		lastModifiedDateTime = "2025-01-01 00:00:00"
	}
	return func(c *gin.Context) {
		t, _ := time.Parse("2006-01-02 15:04:05", lastModifiedDateTime)
		lastModified := t.UTC().Format(http.TimeFormat)
		c.Header("Last-Modified", lastModified)
		c.Next()
	}
}

func noCacheMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.Next()
	}
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

var resFileMap map[string][]byte

func handler(c *gin.Context) {
	filePath := c.Param("filepath")[1:]
	if !strings.HasPrefix(filePath, "svg/") && !strings.HasPrefix(filePath, "vs/") {
		b, err := os.ReadFile(path.Join("res/", path.Base(filePath)))
		if err != nil {
			log.ErrorLog("fail to read index.js: %v", err)
			c.String(http.StatusNotFound, "file not found")
			return
		}
		content := strings.ReplaceAll(string(b), "<base_url>", "https://goodfun.cc")
		if strings.HasSuffix(filePath, ".html") {
			c.Data(http.StatusOK, "text/html", []byte(content))
		} else {
			c.Data(http.StatusOK, "application/javascript", []byte(content))
		}
		return
	}
	if resFileMap == nil {
		resFileMap, _ = readZip(resZip)
	}
	b, ok := resFileMap[filePath]
	if !ok {
		c.String(http.StatusNotFound, "resource not found")
	}
	ext := path.Ext(filePath)
	contentType := "text/plain"
	if ext == ".css" {
		contentType = "text/css"
	} else if ext == ".js" {
		contentType = "application/javascript"
	} else if ext == ".svg" {
		contentType = "image/svg+xml"
	}
	c.Data(http.StatusOK, contentType, b)
}

//go:embed version
var version string

func main() {
	arg.Parse()
	if arg.BoolArg("version") {
		fmt.Println(version)
		return
	}
	port := arg.KeyValueArg("port", "9123")
	logPath := arg.KeyValueArg("logpath", "/tmp/public.log")
	if err := log.SetLogPath(logPath); err != nil {
		log.ErrorLog("fail to set log file path: %v", err)
		os.Exit(1)
	}
	log.InfoLog("cmd line: %s", strings.Join(os.Args, " "))
	log.InfoLog("log path: %v", logPath)
	log.InfoLog("port: %s", port)
	log.InfoLog("pid: %d", os.Getpid())
	wd, _ := os.Getwd()
	log.InfoLog("work dir: %s", wd)

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigs
		log.InfoLog("receive quit signal")
		os.Exit(0)
	}()

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		start := time.Now()
		log.InfoLog(" %s | %s", c.Request.URL.Path, c.ClientIP())
		c.Next()
		log.InfoLog(" %s | %s | %v | %d", c.Request.URL.Path, c.ClientIP(), time.Since(start), c.Writer.Status())
	})
	router.Use(corsMiddleware())
	//router.Use(NoCacheMiddleware())
	router.Use(cacheMiddleware(""))
	router.GET("/static/*filepath", handler)

	log.InfoLog("starting server at 127.0.0.1:%s", port)
	err := router.Run(fmt.Sprintf("127.0.0.1:%s", port))
	if err != nil {
		log.ErrorLog("fail to run http server: %v", err)
		os.Exit(1)
	}
}
