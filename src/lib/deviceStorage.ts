import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { errorMessage } from './errors';

export interface StorageSaveResult {
  uri?: string;
  success: boolean;
  message?: string;
}

/**
 * JSON verisini yerel cihaza kaydeder.
 * Android/iOS: Documents/ChromaNocta/ dizinine yazar.
 * Web: Tarayıcı indirme akışını (Blob / download) tetikler.
 */
export async function saveJsonToDevice(
  filename: string,
  data: unknown
): Promise<StorageSaveResult> {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const cleanFilename = filename.endsWith('.json') ? filename : `${filename}.json`;

  if (Capacitor.isNativePlatform()) {
    try {
      const folder = 'ChromaNocta';
      // Alt dizini oluşturmayı dene (varsa hata fırlatabilir, yutulur)
      try {
        await Filesystem.mkdir({
          path: folder,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch {
        // Dizin zaten mevcutsa devam et
      }

      const path = `${folder}/${cleanFilename}`;
      const result = await Filesystem.writeFile({
        path,
        data: jsonString,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });

      return {
        success: true,
        uri: result.uri,
        message: `Dosya kaydedildi: ${path}`,
      };
    } catch (err: unknown) {
      console.error('Capacitor Filesystem JSON kayıt hatası:', err);
      // Fallback: Doğrudan Documents köküne yazmayı dene
      try {
        const fallbackRes = await Filesystem.writeFile({
          path: cleanFilename,
          data: jsonString,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        return {
          success: true,
          uri: fallbackRes.uri,
          message: `Dosya kaydedildi: ${cleanFilename}`,
        };
      } catch (fallbackErr: unknown) {
        return {
          success: false,
          message: errorMessage(fallbackErr) ?? 'Cihaza kayıt başarısız oldu.',
        };
      }
    }
  }

  // Web Fallback: Blob ve a[download]
  try {
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', cleanFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return {
      success: true,
      message: `${cleanFilename} başarıyla indirildi.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: errorMessage(err) ?? 'Web indirme işlemi başarısız oldu.',
    };
  }
}

/**
 * Base64 görsel verisini cihaza kaydeder.
 * Android/iOS: Pictures/ChromaNocta/ dizinine yazar.
 * Web: Tarayıcı indirme akışını tetikler.
 */
export async function saveImageToDevice(
  filename: string,
  base64Data: string
): Promise<StorageSaveResult> {
  const cleanFilename = filename.includes('.') ? filename : `${filename}.png`;
  // data:image/...;base64, önekini temizle
  const rawBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

  if (Capacitor.isNativePlatform()) {
    try {
      const folder = 'ChromaNocta';
      try {
        await Filesystem.mkdir({
          path: folder,
          directory: Directory.Documents,
          recursive: true,
        });
      } catch {
        // Dizin zaten mevcut
      }

      const path = `${folder}/${cleanFilename}`;
      const result = await Filesystem.writeFile({
        path,
        data: rawBase64,
        directory: Directory.Documents,
      });

      return {
        success: true,
        uri: result.uri,
        message: `Görsel kaydedildi: ${path}`,
      };
    } catch (err: unknown) {
      console.error('Capacitor Filesystem görsel kayıt hatası:', err);
      return {
        success: false,
        message: errorMessage(err) ?? 'Görsel kaydedilemedi.',
      };
    }
  }

  // Web Fallback
  try {
    const link = document.createElement('a');
    link.href = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
    link.setAttribute('download', cleanFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return {
      success: true,
      message: `${cleanFilename} başarıyla indirildi.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: errorMessage(err) ?? 'Web görsel indirme başarısız.',
    };
  }
}
