# Mobile API Reference

## Base URL

```
http://<server_ip>:3003
```

---

## Autentikasi

Backend menggunakan **session cookie** (`session_id`), bukan Bearer token. Untuk mobile ada 2 cara:

1. **Cookie** — simpan `session_id` dari response login, kirim di setiap request sebagai cookie header
2. **Query param** — `?session_id=<value>` (fallback, cocok untuk koneksi WebSocket)

### Login

```
POST /v1/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

Response akan set cookie `session_id`. Simpan nilai ini untuk semua request berikutnya.

---

## Endpoints

> Semua endpoint di bawah memerlukan autentikasi (`session_id`).

### Auth & Profile

| Method | URL | Keterangan |
|--------|-----|-----------|
| `POST` | `/v1/login` | Login, dapat `session_id` |
| `POST` | `/v1/logout` | Logout |
| `GET` | `/v1/profile` | Profil user sendiri |
| `PUT` | `/v1/profile` | Update profil |

---

### Users

| Method | URL | Role |
|--------|-----|------|
| `GET` | `/v1/users/` | superadmin, admin, mitra |
| `POST` | `/v1/users/` | superadmin, mitra |
| `GET` | `/v1/users/:id` | superadmin, admin, mitra |
| `PUT` | `/v1/users/:id` | superadmin, mitra |
| `DELETE` | `/v1/users/:id` | superadmin, mitra |

---

### Router (MikroTik)

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/v1/mikrotik/` | List semua router |
| `POST` | `/v1/mikrotik/` | Tambah router |
| `PUT` | `/v1/mikrotik/:id` | Update router |
| `DELETE` | `/v1/mikrotik/:id` | Hapus router |
| `GET` | `/v1/mikrotik/:id/resources` | CPU, memory, uptime |
| `GET` | `/v1/mikrotik/:id/interfaces` | Status interface |
| `GET` | `/v1/mikrotik/:id/ping` | Cek koneksi router |
| `PUT` | `/v1/mikrotik/:id/status` | Update status router |
| `PUT` | `/v1/mikrotik/:id/active` | Toggle aktif/nonaktif |
| `PATCH` | `/v1/mikrotik/:id/coordinates` | Update koordinat peta |
| `POST` | `/v1/mikrotik/:id/force-ping` | Force ping update |
| `POST` | `/v1/mikrotik/terminal` | Eksekusi perintah terminal |

---

### PPPoE *(per router)*

Base path: `/v1/mikrotik/:router_id/pppoe`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/` | List PPPoE secrets |
| `POST` | `/` | Buat secret baru |
| `GET` | `/:id` | Detail secret |
| `PUT` | `/:id` | Update secret |
| `DELETE` | `/:id` | Hapus secret |
| `GET` | `/sessions` | Sesi aktif |
| `GET` | `/profiles` | List profile PPPoE |
| `POST` | `/disconnect` | Putus sesi aktif |

---

### DHCP Lease *(per router)*

Base path: `/v1/mikrotik/:router_id/dhcp`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/` | List lease |
| `POST` | `/` | Buat lease |
| `GET` | `/:id` | Detail lease |
| `PUT` | `/:id` | Update lease |
| `DELETE` | `/:id` | Hapus lease |
| `GET` | `/servers` | List DHCP server |
| `POST` | `/servers` | Buat DHCP server |
| `POST` | `/:id/disable` | Nonaktifkan lease |
| `POST` | `/:id/enable` | Aktifkan lease |
| `POST` | `/:id/make-static` | Jadikan statis |
| `POST` | `/:id/make-dynamic` | Jadikan dinamis |

---

### Static Binding *(per router)*

Base path: `/v1/mikrotik/:router_id/static`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/` | List binding |
| `POST` | `/` | Buat binding |
| `GET` | `/:id` | Detail binding |
| `PUT` | `/:id` | Update binding |
| `DELETE` | `/:id` | Hapus binding |
| `POST` | `/sync` | Sync dari MikroTik |
| `GET` | `/hotspot-servers` | List hotspot server |
| `POST` | `/hotspot-servers` | Buat hotspot server |
| `POST` | `/:id/block` | Blokir user |
| `POST` | `/:id/unblock` | Buka blokir user |

---

### Pelanggan *(per router)*

Base path: `/v1/mikrotik/:router_id/pelanggan`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/` | List pelanggan |
| `POST` | `/:type/:id/isolir` | Isolir pelanggan |
| `POST` | `/:type/:id/unisolir` | Lepas isolir |

> `:type` = `pppoe` / `dhcp` / `static`

---

### Customers

Base path: `/v1/customers`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/` | List customer |
| `POST` | `/` | Buat customer |
| `GET` | `/:id` | Detail customer |
| `PUT` | `/:id` | Update customer |
| `DELETE` | `/:id` | Hapus customer |
| `POST` | `/import` | Import bulk |
| `POST` | `/sync/:router_id` | Sync dari router |
| `PATCH` | `/:id/coordinates` | Update koordinat |
| `POST` | `/:id/photo` | Upload foto |

---

### Packages

Base path: `/v1/packages`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/` | List paket |
| `POST` | `/` | Buat paket |
| `GET` | `/:id` | Detail paket |
| `PUT` | `/:id` | Update paket |
| `DELETE` | `/:id` | Hapus paket |
| `POST` | `/:id/assign/:customer_id` | Assign ke customer |
| `DELETE` | `/unassign/:customer_id` | Lepas paket dari customer |
| `POST` | `/sync/:router_id` | Sync ke router |
| `POST` | `/sync-import/:router_id` | Sync + import |
| `GET` | `/:id/sync-logs` | Log sinkronisasi |

---

### Finance

Base path: `/v1/finance`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/payments` | List pembayaran |
| `POST` | `/payments` | Catat pembayaran |
| `PUT` | `/payments/:id` | Update pembayaran |
| `DELETE` | `/payments/:id` | Hapus pembayaran |
| `GET` | `/invoices` | List invoice |
| `POST` | `/invoices` | Buat invoice |
| `POST` | `/invoices/bulk` | Buat invoice bulk |
| `PUT` | `/invoices/:id` | Update invoice |
| `DELETE` | `/invoices/:id` | Hapus invoice |
| `PUT` | `/invoices/:id/paid` | Tandai lunas |
| `GET` | `/summary` | Ringkasan keuangan |
| `GET` | `/tariff` | Ambil tarif |
| `PUT` | `/tariff` | Update tarif |

---

### Tickets

Base path: `/v1/tickets`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/` | List tiket |
| `POST` | `/` | Buat tiket |
| `GET` | `/:id` | Detail tiket |
| `PUT` | `/:id` | Update tiket |
| `DELETE` | `/:id` | Hapus tiket |
| `PUT` | `/:id/assign` | Assign teknisi |
| `PUT` | `/:id/status` | Update status |
| `POST` | `/:id/comments` | Tambah komentar |
| `GET` | `/:id/timeline` | Riwayat tiket |
| `GET` | `/overdue` | Tiket terlambat |
| `POST` | `/check-duplicate` | Cek duplikat |

---

### Optical (OLT / ONU / ODP)

Base path: `/v1/optical`

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/olt` | List OLT |
| `POST` | `/olt` | Buat OLT |
| `GET` | `/olt/:id` | Detail OLT |
| `PUT` | `/olt/:id` | Update OLT |
| `DELETE` | `/olt/:id` | Hapus OLT |
| `GET` | `/odp` | List ODP |
| `POST` | `/odp` | Buat ODP |
| `GET/PUT/DELETE` | `/odp/:id` | Detail/Update/Hapus ODP |
| `POST` | `/odp/:id/ports` | Atur port ODP |
| `POST` | `/odp/:id/photo` | Upload foto ODP |
| `GET` | `/onu` | List ONU |
| `POST` | `/onu` | Buat ONU |
| `GET/PUT/DELETE` | `/onu/:id` | Detail/Update/Hapus ONU |
| `GET` | `/onu/:id/history` | Riwayat status ONU |
| `GET` | `/alerts` | List alert |
| `PUT` | `/alerts/:id/resolve` | Resolve alert |
| `GET` | `/cables` | List kabel fiber |
| `POST` | `/cables` | Buat kabel fiber |
| `PUT/DELETE` | `/cables/:id` | Update/Hapus kabel fiber |
| `GET` | `/genieacs/devices` | List perangkat GenieACS |
| `GET/PUT` | `/genieacs/settings` | Pengaturan GenieACS |

---

## WebSocket (Realtime)

Gunakan `?session_id=<value>` karena WebSocket tidak mendukung custom header.

```
ws://<server_ip>:3003/v1/ws/resources/:router_id?session_id=<value>
ws://<server_ip>:3003/v1/ws/interfaces/:router_id?session_id=<value>
ws://<server_ip>:3003/v1/ws/pppoe/:router_id?session_id=<value>
ws://<server_ip>:3003/v1/ws/dhcp/:router_id?session_id=<value>
ws://<server_ip>:3003/v1/ws/static/:router_id?session_id=<value>
```

### Channel Redis yang dipush ke WebSocket

| Channel | Data |
|---------|------|
| `router:{id}:resources` | CPU, memory, disk |
| `router:{id}:interfaces` | Status interface |
| `router:{id}:pppoe` | Sesi PPPoE aktif |
| `router:{id}:dhcp` | Lease DHCP |
| `router:{id}:static` | Static binding |
| `optical:device:{id}:status` | Status perangkat optik |

---

## Catatan untuk Flutter

Backend hanya mendukung **session cookie**, bukan Bearer token. Gunakan salah satu cara berikut:

### Opsi 1 — Manual Cookie Header

```dart
// Setelah login, ekstrak session_id dari Set-Cookie header
final response = await dio.post('/v1/login', data: {...});
final setCookie = response.headers['set-cookie'];
final sessionId = // parse session_id dari setCookie

// Kirim di setiap request
dio.options.headers['Cookie'] = 'session_id=$sessionId';
```

### Opsi 2 — Cookie Jar (Otomatis)

```yaml
# pubspec.yaml
dependencies:
  dio: ^5.x
  cookie_jar: ^4.x
  dio_cookie_manager: ^3.x
```

```dart
final dio = Dio(BaseOptions(baseUrl: 'http://<server>:3003'));
final cookieJar = CookieJar();
dio.interceptors.add(CookieManager(cookieJar));
// Cookie session_id otomatis tersimpan dan dikirim
```

### Opsi 3 — Query Param (khusus WebSocket)

```dart
final channel = WebSocketChannel.connect(
  Uri.parse('ws://<server>:3003/v1/ws/resources/1?session_id=$sessionId'),
);
```
