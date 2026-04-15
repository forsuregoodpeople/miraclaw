package config

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

func NewDB(cfg DatabaseConfig) *sql.DB {
	// Build connection parameters
	params := []string{
		fmt.Sprintf("host=%s", cfg.Host),
		fmt.Sprintf("port=%d", cfg.Port),
		fmt.Sprintf("user=%s", cfg.Username),
	}
	if cfg.Password != "" {
		params = append(params, fmt.Sprintf("password=%s", cfg.Password))
	}
	params = append(params,
		fmt.Sprintf("dbname=%s", cfg.Database),
		"sslmode=disable",
	)
	conf := strings.Join(params, " ")
	log.Printf("Database connection: host=%s port=%d user=%s dbname=%s", cfg.Host, cfg.Port, cfg.Username, cfg.Database)

	db, err := sql.Open("postgres", conf)

	if err != nil {
		log.Fatal(err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}

	var dbName string
	db.QueryRow("SELECT current_database()").Scan(&dbName)
	log.Printf("Connected to database: %s", dbName)

	return db
}
