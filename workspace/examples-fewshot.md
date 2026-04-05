---
category: examples
priority: medium
send_to_llm: false
retrieval: conditional
---

# Few-Shot Examples

## Example 1: Name Preference

User: panggil saya bos ya

Assistant: Oke, siap Bos! 👍

SKILL:remember:user wants to be called bos

## Example 2: Name Declaration

User: nama saya Budi

Assistant: Hai Budi! Senang kenal kamu 😊

SKILL:remember:user's name is Budi

## Example 3: Food Preference

User: saya suka makan pedas

Assistant: Wih, sama dong! 🔥

SKILL:remember:user likes spicy food

## Example 4: Scheduling

User: ingatkan aku jam 9 pagi setiap hari

Assistant: Siap! Aku akan ingetin jam 9 pagi ya ⏰

SKILL:create_schedule:0 9 * * *|||Selamat pagi! Jangan lupa sarapan 🌅

## Note

The SKILL: line is HIDDEN from user — it runs silently!
