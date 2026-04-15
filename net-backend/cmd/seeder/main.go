package main

import (
	"context"
	"fmt"
	"log"

	"github.com/net-backend/internal/config"
	"github.com/net-backend/internal/users"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	serverCfg, dbCfg, _, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Error loading config: %v", err)
	}
	_ = serverCfg

	fmt.Printf("Seeder Config: Host=%s Port=%d User=%s Name=%s\n", dbCfg.Host, dbCfg.Port, dbCfg.Username, dbCfg.Database)

	db := config.NewDB(*dbCfg)

	rows, err := db.Query("SELECT id, username FROM users")
	if err != nil {
		fmt.Printf("Error listing users: %v\n", err)
	} else {
		defer rows.Close()
		fmt.Println("Users in DB (seen by seeder):")
		count := 0
		for rows.Next() {
			var id int
			var u string
			rows.Scan(&id, &u)
			fmt.Printf("- %d: %s\n", id, u)
			count++
		}
		fmt.Printf("Total: %d\n", count)
	}

	userRepo := users.NewUserRepository(db)

	ctx := context.Background()

	superAdmin := &users.Users{
		Username: "admin",
		Name:     "Super Admin",
		Email:    "admin@net-backend.com",
		Password: "password",
		Role:     users.RoleSuperAdmin,
	}

	createIfNotExists(ctx, userRepo, superAdmin)

	developer := &users.Users{
		Username: "developer",
		Name:     "Developer",
		Email:    "developer@app.com",
		Password: "password",
		Role:     users.RoleSuperAdmin,
	}

	createIfNotExists(ctx, userRepo, developer)

	mitra := &users.Users{
		Username: "mitra1",
		Name:     "Mitra Satu",
		Email:    "mitra1@net-backend.com",
		Password: "password",
		Role:     users.RoleMitra,
	}
	createdMitra := createIfNotExists(ctx, userRepo, mitra)

	if createdMitra != nil {
		teknisi := &users.Users{
			Username: "teknisi1",
			Name:     "Teknisi Satu",
			Email:    "teknisi1@net-backend.com",
			Password: "password",
			Role:     users.RoleTeknisi,
			ParentID: &createdMitra.ID,
		}
		createIfNotExists(ctx, userRepo, teknisi)

		admin := &users.Users{
			Username: "admin1",
			Name:     "Admin Satu",
			Email:    "admin1@net-backend.com",
			Password: "password",
			Role:     users.RoleAdmin,
			ParentID: &createdMitra.ID,
		}
		createIfNotExists(ctx, userRepo, admin)
	}

	fmt.Println("Seeding completed successfully.")
}

func createIfNotExists(ctx context.Context, repo users.IUserRepository, user *users.Users) *users.Users {
	existing, _ := repo.FindByUsernameOrEmail(ctx, user.Username, user.Email)
	if existing != nil {
		fmt.Printf("User %s already exists. Skipping.\n", user.Username)
		return existing
	}

	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	user.Password = string(hashedPassword)

	err := repo.Create(ctx, user)
	if err != nil {
		log.Printf("Failed to create user %s: %v\n", user.Username, err)
		return nil
	}

	fmt.Printf("User %s created. ID: %d\n", user.Username, user.ID)
	return user
}
