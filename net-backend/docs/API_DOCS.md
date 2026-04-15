# WifiMaster API Documentation

Base URL: `http://localhost:3000/v1`

## Authentication

### Login
Generate a JWT token for authentication.

- **URL**: `/login`
- **Method**: `POST`
- **Auth Required**: No
- **Body**:
  ```json
  {
    "username": "admin",
    "password": "password"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "status_code": 200,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
  ```

---

## User Management
Requires `Authorization: Bearer <token>`

### Create User
Create a new user. 
- **SuperAdmin** can create **Mitra**.
- **Mitra** can create **Admin** or **Teknisi**.

- **URL**: `/users`
- **Method**: `POST`
- **Auth Required**: Yes (SuperAdmin, Mitra)
- **Body**:
  ```json
  {
    "username": "mitra_baru",
    "name": "Mitra Baru",
    "email": "mitra@example.com",
    "password": "password123",
    "role": "mitra" 
    // Role must be 'mitra' if creator is SuperAdmin
    // Role must be 'admin' or 'teknisi' if creator is Mitra
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "status_code": 201,
    "data": {
      "id": 5,
      "username": "mitra_baru",
      "role": "mitra",
      "parent_id": 1,
      ...
    }
  }
  ```

### List Users
Get a list of users.
- **SuperAdmin**: See all users.
- **Mitra**: See all users (currently, filter logic pending/not strictly enforced in `FindAll` yet, seeing all for now based on RBAC middleware).

- **URL**: `/users`
- **Method**: `GET`
- **Auth Required**: Yes (SuperAdmin, Admin, Mitra)
- **Response (200 OK)**:
  ```json
  {
    "status_code": 200,
    "data": [ ... ]
  }
  ```

---

## Mikrotik Module
Requires `Authorization: Bearer <token>`

### Create Router
Add a new Mikrotik router.
- **SuperAdmin** or **Mitra** only.

- **URL**: `/mikrotik`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "name": "Router Utama",
    "host": "192.168.88.1",
    "port": 8728,
    "username": "admin",
    "password": "password"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "status_code": 201,
    "data": {
      "id": 1,
      "name": "Router Utama",
      "mitra_id": 2, // ID of the creator (Mitra)
      ...
    }
  }
  ```

### List Routers
Get list of routers.
- **SuperAdmin**: See all routers.
- **Mitra**: See only their own routers.
- **Teknisi/Admin**: See routers owned by their parent Mitra.

- **URL**: `/mikrotik`
- **Method**: `GET`
- **Response (200 OK)**:
  ```json
  {
    "status_code": 200,
    "data": [ ... ]
  }
  ```
