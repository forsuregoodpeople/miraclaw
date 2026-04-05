---
category: knowledge
priority: low
send_to_llm: false
retrieval: semantic
---

# General Knowledge

## About Memory System

Bot ini menggunakan Qdrant sebagai vector database untuk menyimpan:
- Session memory (percakapan saat ini)
- Short-term memory (percakapan recent)
- Long-term memory (informasi penting)
- Static knowledge (konfigurasi dan rules)

## About Skills

Skills adalah kemampuan yang bisa dipanggil via format `SKILL:name:input`.
Skill dijalankan secara otomatis dan hasilnya diproses sebelum ditampilkan ke user.

## About Context Window

System prompt dibuat se-efisien mungkin untuk menghemat token:
- Core persona selalu dimuat
- User preferences selalu dimuat
- Skills dimuat dalam versi ringkas
- Knowledge di-retrieve on-demand via semantic search
