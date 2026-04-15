package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"path/filepath"
	"sort"
	"strings"

	"github.com/net-backend/internal/config"
)

func main() {
	_, dbCfg, _, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}
	db := config.NewDB(*dbCfg)
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}

	files, err := filepath.Glob("migrations/*.up.sql")
	if err != nil {
		log.Fatalf("Error finding migration files: %v", err)
	}

	sort.Strings(files)

	for _, file := range files {
		fmt.Printf("Applying migration: %s\n", file)
		content, err := ioutil.ReadFile(file)
		if err != nil {
			log.Fatalf("Error reading file %s: %v", file, err)
		}

		_, err = db.Exec(string(content))
		if err != nil {
			if strings.Contains(err.Error(), "already exists") {
				fmt.Printf("Migration %s might have already been applied (error: %v). Continuing...\n", file, err)
			} else {
				log.Fatalf("Error executing migration %s: %v", file, err)
			}
		} else {
			fmt.Printf("Migration %s applied successfully.\n", file)
		}
	}

	fmt.Println("All migrations applied.")
}
