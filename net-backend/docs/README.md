# WifiMaster Documentation

This directory contains all technical documentation for the WifiMaster project.

## Table of Contents

- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Architecture](#architecture)

---

## API Documentation

### Base Path
All API endpoints are prefixed with `/api/v1/`.
```
localhost:3000/api/v1/
```

### Standard Response Format
All API responses follow a standardized JSON format:
```json
{
    "statusCode": 200,
    "data": { ... },
    "message": "Descriptive message"
}
```

### OpenAPI Specifications
Complete API specifications are available in the [openapi/](./openapi/) directory:
- [Authentication API](./openapi/auth.yaml) - User authentication and token generation

## Database Schema

Database schema and migrations are available in the [database/](./database/) directory:
- [Authentication Schema](./database/auth.sql) - Users table with role-based access control

### User Roles
- `superadmin` - Full system access
- `mitra_teknisi` - Technician partner
- `admin` - Administrative access

## Architecture

System architecture diagrams and design documents are available in the [architecture/](./architecture/) directory:
- [System Schema](./architecture/schema.uml) - Component architecture with service layers, workers, and external systems

### Architecture Overview
The system consists of:
- **Frontend**: Remix.js real-time dashboard
- **API Gateway**: Go REST API with WebSocket support
- **Service Layer**: Device, Monitoring, and Alert services
- **Worker Layer**: MikroTik and GenieACS collectors
- **External Systems**: MikroTik RouterOS and GenieACS Server
- **Data Layer**: Redis cache/queue and PostgreSQL database
