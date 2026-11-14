// src/utils/timeParser.js

export function parseDuration(durationText) {
  const text = durationText.trim().toLowerCase();
  
  if (text === 'infinite' || text === 'sınırsız') {
    return 'infinite';
  }

  const now = new Date();

  // Özel Saat Formatı (Örn: "3 gün 20:00" veya "1 hafta 15:30")
  const exactTimeMatch = text.match(/(\d+)\s*(gün|hafta|ay|yıl)\s+(\d{1,2}):(\d{2})/i);
  if (exactTimeMatch) {
    const amount = parseInt(exactTimeMatch[1]);
    const unit = exactTimeMatch[2];
    const hour = parseInt(exactTimeMatch[3]);
    const minute = parseInt(exactTimeMatch[4]);

    let targetDate = new Date(now);
    
    if (unit === 'gün') targetDate.setDate(targetDate.getDate() + amount);
    else if (unit === 'hafta') targetDate.setDate(targetDate.getDate() + (amount * 7));
    else if (unit === 'ay') targetDate.setMonth(targetDate.getMonth() + amount);
    else if (unit === 'yıl') targetDate.setFullYear(targetDate.getFullYear() + amount);

    targetDate.setHours(hour, minute, 0, 0);
    return targetDate.toISOString();
  }

  // Standart Format (Örn: "4 hafta 3 gün 0 saat 0 dakika")
  let totalMs = 0;
  const regex = /(\d+)\s*(yıl|ay|hafta|gün|saat|dakika)/gi;
  let match;
  let found = false;

  while ((match = regex.exec(text)) !== null) {
    found = true;
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'dakika': totalMs += amount * 60 * 1000; break;
      case 'saat': totalMs += amount * 60 * 60 * 1000; break;
      case 'gün': totalMs += amount * 24 * 60 * 60 * 1000; break;
      case 'hafta': totalMs += amount * 7 * 24 * 60 * 60 * 1000; break;
      case 'ay': totalMs += amount * 30 * 24 * 60 * 60 * 1000; break;
      case 'yıl': totalMs += amount * 365 * 24 * 60 * 60 * 1000; break;
    }
  }

  if (!found) throw new Error("Geçersiz süre formatı! Örnek: '3 gün 20:00' veya '4 hafta 3 gün'");
  
  return new Date(now.getTime() + totalMs).toISOString();
}
