# 🎉 REXAL BOT - YENİ ÖZELLİKLER

## 📋 Yapılan Değişiklikler

### ✅ 1. Kapasite Sistemi Güncellendi
- **Ücretsiz kapasite** artık **5 yerine 2 token**
- Her rol verdiğinde **+2 kapasite** (2 → 4'e çıkar)
- Kapasite kontrolü geliştirildi ve otomatik sınır koruması eklendi

### ✅ 2. `/rolver` Komutu İyileştirildi
**Özellikler:**
- Kullanıcı **sunucuda otomatik register** olur (rol verilirken)
- Kullanıcı sunucuda değilse hata verir
- Süre belirlenebilir: `1 hafta`, `3 gün`, `infinite` gibi
- Rol otomatik Discord'dan verilir
- Guild ID kaydedilir (otomatik rol alma için)

**Kullanım:**
```
!rolver
→ Kullanıcı seç
→ Rol seç (sunucudaki rollerden)
→ Süre gir (örn: "1 hafta", "infinite")
→ Sistem otomatik rol verir ve kapasiteyi 4'e çıkarır
```

### ✅ 3. `/rolal` Komutu Güncellendi
**Özellikler:**
- Kullanıcıdan rolü alır
- **Tüm tokenlerini otomatik scan eder**
- Geçersiz tokenleri siler
- Kapasiteyi otomatik 2'ye düşürür
- Kullanıcıya bildirim gönderir

**Kullanım:**
```
!rolal
→ Kullanıcı seç
→ Eğer rolü varsa gösterir
→ Onayla butonuna tıkla
→ Sistem: Rol alır, tokenleri scan eder, geçersizleri siler
```

### ✅ 4. `/vaultsettings` Komutu Geliştirildi
**Yeni Özellikler:**
- ✅ Token göster (decrypt edilmiş hali)
- ✅ Token scan et (geçerli/geçersiz kontrol)
- ✅ Sistemleri manuel durdur
- ✅ Vault'tan hesap sil
- ✅ Manuel token ekle

**Kullanım:**
```
!vaultsettings
→ Kullanıcı seç
→ Hesap seç
→ İşlem seç (Token göster / Scan / Sil / Durdur / Ekle)
```

### ✅ 5. `!hesaplarim` Embed Güncellendi
**Değişiklikler:**
- Artık "Ücretsiz" yerine **verilen rol adı** gösteriliyor
- Süre bilgisi gösteriliyor (infinite ise "Sınırsız ∞")
- Kapasite 2/4 şeklinde dinamik gösteriliyor

**Görünüm:**
```
📦 Vault Güncellendi ⬜ `Premium VIP`
🟢 Eklenen: `2` • 🔴 Başarısız: `0` • 📊 Toplam: `3/4`
⏰ Süre: `Sınırsız ∞` veya <t:1234567890:R>
```

### ✅ 6. Otomatik Süre Kontrolü (SubscriptionChecker)
**Özellikler:**
- Her 1 saatte bir otomatik çalışır
- Süresi dolan kullanıcıları bulur
- Otomatik **token scan** yapar
- Geçersiz tokenleri siler
- Discord'dan rolü otomatik alır
- Kapasiteyi 2'ye düşürür
- Kullanıcıya bildirim gönderir

**Log Örnekleri:**
```
⏰ [SubscriptionChecker] Kullanıcı 123456789 için süre doldu, scan ediliyor...
🗑️ [RolAl] Kullanıcı 123456789 → Rol silindi: Premium VIP
🗑️ [RolAl] Kullanıcı 123456789 → Ücretsiz'e düşürüldü → Geçerli: 2, Silinen: 1
```

### ✅ 7. TokenStore Güncellemeleri
**Yeni Fonksiyonlar:**
- `checkCapacityOverflow(userId)` - Kapasite aşımını kontrol eder
- `guildId` her abonelikte saklanır (otomatik rol alma için)
- Süre dolduğunda otomatik scan ve temizlik

---

## 🔧 Yapılandırma

### Admin ID'leri Ayarla
Aşağıdaki 3 dosyada **AUTHORIZED_ADMINS** dizisini düzenle:

**1. `src/commands/vaultsettings.js`**
```javascript
const AUTHORIZED_ADMINS = [
  'SENIN_ID_BURAYA',    // Admin 1
  'DIGER_ADMIN_ID',     // Admin 2
];
```

**2. `src/commands/rolver.js`**
```javascript
const AUTHORIZED_ADMINS = [
  'SENIN_ID_BURAYA',    // Admin 1
  'DIGER_ADMIN_ID',     // Admin 2
];
```

**3. `src/commands/rolal.js`**
```javascript
const AUTHORIZED_ADMINS = [
  'SENIN_ID_BURAYA',    // Admin 1
  'DIGER_ADMIN_ID',     // Admin 2
];
```

---

## 📖 Komut Kullanımı

### 👑 Admin Komutları

#### `/rolver` - Rol Ver
```
!rolver
```
1. Kullanıcı seç
2. Rol seç (sunucudaki rollerden)
3. Süre gir: `1 hafta`, `3 gün`, `infinite`
4. Sistem otomatik:
   - Kullanıcıya rolü Discord'da verir
   - Kapasiteyi 4'e çıkarır
   - Süreyi başlatır
   - Kullanıcıya bildirim gönderir

#### `/rolal` - Rol Al
```
!rolal
```
1. Kullanıcı seç
2. Eğer rolü varsa onay iste
3. Onayla:
   - Discord'dan rol alınır
   - Tüm tokenler scan edilir
   - Geçersizler silinir
   - Kapasite 2'ye düşer
   - Kullanıcıya bildirim gider

#### `/vaultsettings` - Vault Admin
```
!vaultsettings
```
1. Kullanıcı listesinden seç
2. Hesap seç
3. İşlemler:
   - 🗑️ Vault'tan Sil
   - ⛔ Sistemleri Durdur
   - ➕ Manuel Token Ekle
   - 🔐 Token Göster
   - 🔍 Token Scan Et

---

## 🎯 Önemli Notlar

### ⚠️ Dikkat Edilmesi Gerekenler
1. **Admin ID'leri mutlaka güncelle** (3 dosyada)
2. Rol verirken kullanıcı **sunucuda olmalı**
3. Süre `infinite` yazılırsa hiçbir zaman dolmaz
4. Otomatik süre kontrolü **her 1 saatte** çalışır
5. Bot kapandığında süre sayılmaz (kalıcı kayıt)

### 🔒 Güvenlik
- Tüm tokenler AES-256-GCM ile şifrelenmiş
- `/vaultsettings` sadece 2 yetkili admin kullanabilir
- Token gösterme işlemi ephemeral (sadece admin görür)

### 📊 Log Sistemі
Tüm işlemler console'da loglanır:
```
👑 [RolVer] Kullanıcı 123456789 → Rol: Premium VIP → Kapasite: 4 → Süre: Sınırsız
🗑️ [RolAl] Kullanıcı 123456789 → Ücretsiz'e düşürüldü → Geçerli: 2, Silinen: 1
⏰ [SubscriptionChecker] 1 kullanıcı ücretsiz'e çevrildi, 3 geçersiz token temizlendi
```

---

## 🚀 Başlatma

```bash
cd discord-bot
npm install
node src/index.js
```

---

## 📝 Güncellemeler Özeti

| Özellik | Önceki | Yeni |
|---------|----|------|
| **Ücretsiz Kapasite** | 5 token | **2 token** |
| **Premium Kapasite** | - | **4 token** (+2 her rol) |
| **Rol Sistemi** | Manuel | **Otomatik (auto-register)** |
| **Token Scan** | Manuel | **Otomatik (süre dolunca)** |
| **Süre Kontrolü** | Yok | **Otomatik (1 saatte bir)** |
| **Embed** | "Ücretsiz" | **Rol adı gösterir** |
| **VaultSettings** | Basit | **Token göster/scan eklendi** |

---

## ✨ Öne Çıkan Özellikler

### 🎯 Akıllı Kapasite Yönetimi
- Süre dolunca **otomatik 2'ye düşer**
- Geçersiz tokenler **otomatik silinir**
- Her rol **+2 kapasite** ekler

### 🤖 Tam Otomatik Sistem
- Rol verme otomatik (Discord'a kayıt)
- Süre takibi otomatik (1 saatte bir)
- Token temizleme otomatik (scan + sil)
- Bildirimler otomatik (kullanıcıya DM)

### 🔐 Gelişmiş Admin Paneli
- Tüm kullanıcıları yönet
- Tokenlerini görüntüle/scan et
- Manuel müdahale et
- Sistemleri durdur

---

**🎉 Tüm özellikler hazır ve test edildi! Sadece Admin ID'lerini güncelle ve başlat! 🚀**
